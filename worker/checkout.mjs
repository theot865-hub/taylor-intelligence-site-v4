// Server-only Stripe Checkout integration. This directory is excluded from assets.
// Configure secrets/bindings in Cloudflare, never in public source:
// STRIPE_SECRET_KEY, STRIPE_COMPANY_PRICE_ID, STRIPE_EMPLOYEE_PRICE_ID.
// The company price must be a one-time CAD 2,000 price; employee price CAD 100.
// Capacity is not enforced here: 99 is only the technical purchase cap.
const SITE_ORIGIN = "https://taylorintelligence.ai";
const OFFER = "ti-company-ai-intensive-v2";
const STRIPE_VERSION = "2026-09-30.endive";
const MAX_EXTRA_EMPLOYEES = 99;
const MAX_REQUEST_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID = /^cs_(?:live|test)_[A-Za-z0-9]{10,200}$/;

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}

function configuration(env, url) {
  const key = typeof env.STRIPE_SECRET_KEY === "string" ? env.STRIPE_SECRET_KEY.trim() : "";
  const companyPrice = env.STRIPE_COMPANY_PRICE_ID;
  const employeePrice = env.STRIPE_EMPLOYEE_PRICE_ID;
  if (!/^(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}$/.test(key)
      || !/^price_[A-Za-z0-9]+$/.test(companyPrice ?? "")
      || !/^price_[A-Za-z0-9]+$/.test(employeePrice ?? "")
      || companyPrice === employeePrice) return null;
  const live = /^(?:sk|rk)_live_/.test(key);
  // Sandbox keys are useful locally or on an explicitly approved preview, but
  // must never present a test-mode purchase as a paid production enrollment.
  if ([SITE_ORIGIN, "https://www.taylorintelligence.ai"].includes(url.origin) && !live) return null;
  return { key, companyPrice, employeePrice, live };
}

function allowedOrigin(url, env) {
  if ([SITE_ORIGIN, "https://www.taylorintelligence.ai"].includes(url.origin)) return true;
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && ["http:", "https:"].includes(url.protocol)) return true;
  // Optional, server-configured exact HTTPS origins for known preview hosts.
  // No wildcard or client-supplied origins, prices, or redirect URLs.
  const previews = typeof env.CHECKOUT_ALLOWED_ORIGINS === "string" ? env.CHECKOUT_ALLOWED_ORIGINS.split(",") : [];
  return previews.some(value => {
    try {
      const preview = new URL(value.trim());
      return preview.protocol === "https:" && !preview.username && !preview.password && preview.origin === url.origin;
    } catch { return false; }
  });
}

function checkSameOrigin(request, env, requireEvidence = true) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if (!allowedOrigin(url, env) || (origin && origin !== url.origin)
      || (site && site !== "same-origin" && site !== "none")
      || (requireEvidence && !origin && site !== "same-origin")) {
    throw new RequestError(403, "Please start checkout from the Taylor Intelligence page.");
  }
}

async function readLimitedText(body, limit) {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RequestError(413, "The checkout request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

function employeeCount(value) {
  if (typeof value === "string" && /^(?:0|[1-9][0-9]?)$/.test(value)) return Number(value);
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_EXTRA_EMPLOYEES) return value;
  throw new RequestError(400, `Choose between 0 and ${MAX_EXTRA_EMPLOYEES} additional employees.`);
}

async function checkoutInput(request) {
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new RequestError(413, "The checkout request is too large.");
  }
  const type = (request.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (type !== "application/json" && type !== "application/x-www-form-urlencoded") {
    throw new RequestError(415, "Use a JSON or form checkout request.");
  }
  let body;
  try {
    const text = await readLimitedText(request.body, MAX_REQUEST_BYTES);
    if (type === "application/json") {
      body = JSON.parse(text);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid object");
    } else {
      const fields = new URLSearchParams(text);
      if (fields.getAll("extraEmployees").length !== 1 || fields.getAll("checkoutAttempt").length > 1) {
        throw new Error("Duplicate or missing field");
      }
      body = Object.fromEntries(fields);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "The checkout request is invalid.");
  }
  const extras = employeeCount(body.extraEmployees);
  // Browsers retain this UUID for retries of one purchase, and replace it when
  // starting a new purchase. No-JS forms get a server token for upstream retries.
  const attempt = body.checkoutAttempt === undefined || (type === "application/x-www-form-urlencoded" && body.checkoutAttempt === "")
    ? request.headers.get("Idempotency-Key") ?? crypto.randomUUID()
    : body.checkoutAttempt;
  if (typeof attempt !== "string" || !UUID.test(attempt)) {
    throw new RequestError(400, "Please refresh the page and try checkout again.");
  }
  return { extras, attempt: attempt.toLowerCase(), wantsJSON: type === "application/json" };
}

async function idempotencyKey(config, extras, attempt) {
  // Namespace by offer and both prices so later configuration changes cannot
  // accidentally return an earlier purchase's Checkout Session.
  const data = new TextEncoder().encode(JSON.stringify([OFFER, config.companyPrice, config.employeePrice, extras, attempt]));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return `ti-checkout-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function stripeRequest(config, path, { body, idempotency } = {}, fetchStripe = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchStripe(`https://api.stripe.com/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Stripe-Version": STRIPE_VERSION,
          ...(body ? { "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotency } : {}),
        },
        ...(body ? { body: body.toString() } : {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        // Never relay Stripe error payloads, request headers or customer data.
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await response.body?.cancel();
          continue;
        }
        await response.body?.cancel();
        throw new RequestError(503, "Checkout is temporarily unavailable. Please try again shortly.");
      }
      return JSON.parse(await readLimitedText(response.body, 65536));
    } catch (error) {
      if (error instanceof RequestError) throw error;
      if (attempt === 1) throw new RequestError(503, "Checkout is temporarily unavailable. Please try again shortly.");
    } finally { clearTimeout(timeout); }
  }
}

function expectedTotal(extras) { return 200000 + 10000 * extras; }

function ownedSession(session, config) {
  const metadata = session.metadata;
  if (session.mode !== "payment" || session.currency !== "cad" || session.livemode !== config.live
      || metadata?.offer !== OFFER
      || metadata.company_price_id !== config.companyPrice
      || metadata.employee_price_id !== config.employeePrice) return null;
  let extras;
  try { extras = employeeCount(metadata.extra_employees); } catch { return null; }
  if (session.amount_subtotal !== expectedTotal(extras) || session.amount_total !== expectedTotal(extras)) return null;
  return extras;
}

async function createCheckout(request, config, fetchStripe) {
  const { extras, attempt, wantsJSON } = await checkoutInput(request);
  const params = new URLSearchParams({
    mode: "payment",
    ui_mode: "hosted_page",
    currency: "cad",
    "adaptive_pricing[enabled]": "false",
    "line_items[0][price]": config.companyPrice,
    "line_items[0][quantity]": "1",
    "name_collection[business][enabled]": "true",
    "name_collection[individual][enabled]": "true",
    "metadata[offer]": OFFER,
    "metadata[extra_employees]": String(extras),
    "metadata[company_price_id]": config.companyPrice,
    "metadata[employee_price_id]": config.employeePrice,
    success_url: `${SITE_ORIGIN}/ai-intensive/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_ORIGIN}/ai-intensive/?checkout=cancelled&employees=${extras}`,
    submit_type: "book",
  });
  if (extras > 0) {
    params.set("line_items[1][price]", config.employeePrice);
    params.set("line_items[1][quantity]", String(extras));
  }
  const session = await stripeRequest(config, "checkout/sessions", {
    body: params,
    idempotency: await idempotencyKey(config, extras, attempt),
  }, fetchStripe);
  let checkoutURL;
  try { checkoutURL = new URL(session.url); } catch { /* reject malformed Stripe response */ }
  if (ownedSession(session, config) !== extras || !SESSION_ID.test(session.id ?? "")
      || checkoutURL?.protocol !== "https:" || checkoutURL.hostname !== "checkout.stripe.com"
      || checkoutURL.username || checkoutURL.password
      || session.status !== "open") {
    throw new RequestError(503, "Checkout is temporarily unavailable. Please try again shortly.");
  }
  if (wantsJSON) return json({ url: checkoutURL.href });
  return new Response(null, { status: 303, headers: {
    Location: checkoutURL.href, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}

async function confirmation(request, config, fetchStripe) {
  const query = new URL(request.url).searchParams;
  const sessionID = query.get("session_id");
  if (query.getAll("session_id").length !== 1 || !SESSION_ID.test(sessionID ?? "")) {
    throw new RequestError(400, "The confirmation link is invalid.");
  }
  const session = await stripeRequest(config, `checkout/sessions/${sessionID}`, {}, fetchStripe);
  const extras = ownedSession(session, config);
  if (session.id !== sessionID || extras === null
      || !["paid", "unpaid", "no_payment_required"].includes(session.payment_status)
      || !["open", "complete", "expired"].includes(session.status)) {
    throw new RequestError(404, "This checkout could not be confirmed.");
  }
  // No names, emails, card details, metadata, or meeting URLs leave the server.
  return json({
    paymentStatus: session.payment_status,
    status: session.status,
    extraEmployees: extras,
    amountTotal: session.amount_total,
    currency: session.currency,
  });
}

// The injectable fetch is only for local tests; production uses native fetch.
export function createWorker(fetchStripe = fetch) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const path = url.pathname;
      if (!path.startsWith("/api/checkout")) return env.ASSETS.fetch(request);
      try {
        if (path === "/api/checkout/status" && request.method === "GET") {
          checkSameOrigin(request, env, false);
          return json({ ready: Boolean(configuration(env, url)) });
        }
        if (path !== "/api/checkout" && path !== "/api/checkout/confirmation") {
          return json({ error: "Not found." }, 404);
        }
        const method = path === "/api/checkout" ? "POST" : "GET";
        if (request.method !== method) return json({ error: "Method not allowed." }, 405, { Allow: method });
        checkSameOrigin(request, env);
        const config = configuration(env, url);
        if (!config) throw new RequestError(503, "Checkout is not available yet. Please contact Taylor Intelligence.");
        return path === "/api/checkout" ? await createCheckout(request, config, fetchStripe) : await confirmation(request, config, fetchStripe);
      } catch (error) {
        return json({ error: error instanceof RequestError ? error.message : "Checkout is temporarily unavailable. Please try again shortly." }, error instanceof RequestError ? error.status : 503);
      }
    },
  };
}

export default createWorker();
