import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createWorker } from "../worker/checkout.mjs";

const ORIGIN = "https://taylorintelligence.ai";
const ATTEMPT = "831fa0cb-9fbf-47a9-9a4f-784361d8700e";
const ID = "cs_live_abcdefghijklm123456789";
const CHECKOUT_URL = `https://checkout.stripe.com/c/pay/${ID}`;
const LEGACY_COMPANY_PRICE = "price_1UOoahPUw9hCFj9HxsHEVgWH";
const env = {
  STRIPE_SECRET_KEY: "rk_live_dummyfixture123456789",
  STRIPE_COMPANY_PRICE_ID: "price_companyFixture",
  STRIPE_EMPLOYEE_PRICE_ID: "price_employeeFixture",
  ASSETS: { fetch: async request => new Response(`asset:${new URL(request.url).pathname}`) },
};

function session(extras = 0, overrides = {}) {
  return {
    id: ID, url: CHECKOUT_URL, mode: "payment", currency: "cad", livemode: true,
    status: "open", payment_status: "unpaid",
    amount_subtotal: 120000 + extras * 10000,
    amount_total: 120000 + extras * 10000,
    metadata: {
      offer: "ti-company-ai-intensive-v2", extra_employees: String(extras),
      company_price_id: env.STRIPE_COMPANY_PRICE_ID,
      employee_price_id: env.STRIPE_EMPLOYEE_PRICE_ID,
    },
    customer_details: { email: "private@example.invalid", name: "Private Person" },
    ...overrides,
  };
}

function stripeStub(makeResponse = () => session()) {
  const calls = [];
  const worker = createWorker(async (url, options) => {
    calls.push({ url, options });
    const result = await makeResponse(url, options, calls.length);
    return result instanceof Response ? result : Response.json(result);
  });
  return { worker, calls };
}

function jsonRequest(body = { extraEmployees: 0, checkoutAttempt: ATTEMPT }, headers = {}) {
  return new Request(`${ORIGIN}/api/checkout`, {
    method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function getRequest(path, headers = { "Sec-Fetch-Site": "same-origin" }) {
  return new Request(`${ORIGIN}${path}`, { headers });
}

test("zero extras keeps exactly one CAD company seat and ignores client price/redirect fields", async () => {
  const { worker, calls } = stripeStub();
  const response = await worker.fetch(jsonRequest({
    extraEmployees: 0, checkoutAttempt: ATTEMPT,
    amount: 1, price: "price_attacker", success_url: "https://attacker.invalid/",
  }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: CHECKOUT_URL });
  const params = new URLSearchParams(calls[0].options.body);
  assert.equal(calls[0].url, "https://api.stripe.com/v1/checkout/sessions");
  assert.equal(params.get("line_items[0][price]"), env.STRIPE_COMPANY_PRICE_ID);
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.has("line_items[1][price]"), false);
  assert.equal(params.has("line_items[0][adjustable_quantity][enabled]"), false);
  assert.equal(params.get("mode"), "payment");
  assert.equal(params.get("currency"), "cad");
  assert.equal(params.get("adaptive_pricing[enabled]"), "false");
  assert.equal(params.get("success_url"), `${ORIGIN}/education/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(params.get("cancel_url"), `${ORIGIN}/education/?checkout=cancelled&employees=0`);
  assert.equal(calls[0].options.headers["Stripe-Version"], "2026-09-30.endive");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
});

test("native form with extras redirects 303 to exactly priced checkout", async () => {
  const { worker, calls } = stripeStub(() => session(3));
  const request = new Request(`${ORIGIN}/api/checkout`, {
    method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ extraEmployees: "3", checkoutAttempt: ATTEMPT }),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), CHECKOUT_URL);
  const params = new URLSearchParams(calls[0].options.body);
  assert.equal(params.get("line_items[0][quantity]"), "1");
  assert.equal(params.get("line_items[1][price]"), env.STRIPE_EMPLOYEE_PRICE_ID);
  assert.equal(params.get("line_items[1][quantity]"), "3");
  assert.equal(params.get("metadata[extra_employees]"), "3");
  assert.equal(params.get("cancel_url"), `${ORIGIN}/education/?checkout=cancelled&employees=3`);
});

test("new paid checkout returns to Education's actual confirmation handler and displays only the server-verified booking", { timeout: 2000 }, async () => {
  const html = readFileSync(new URL("../education/index.html", import.meta.url), "utf8");
  assert.match(html, /<form[^>]*id="company-checkout"[^>]*action="\/api\/checkout"/);
  for (const id of ["extra-employees", "checkout-attempt", "order-total", "checkout-status"]) assert.match(html, new RegExp(`id="${id}"`));
  const script = html.match(/<script\s+src="(\/ai-intensive\/checkout\.js)"[^>]*><\/script>/)?.[1];
  assert.ok(script, "the return page must actually load the payment confirmation script");
  const { worker, calls } = stripeStub(url => url.endsWith(`/sessions/${ID}`)
    ? session(3, { status: "complete", payment_status: "paid" }) : session(3));
  assert.equal((await worker.fetch(jsonRequest({ extraEmployees: 3, checkoutAttempt: ATTEMPT }), env)).status, 200);
  const params = new URLSearchParams(calls[0].options.body);
  let pageURL = new URL(params.get("success_url").replace("{CHECKOUT_SESSION_ID}", ID));
  assert.equal(pageURL.pathname, "/education/");

  const element = value => ({ value, textContent: "", hidden: false, disabled: false, addEventListener() {} });
  const input = element("0");
  const attempt = element("");
  const total = element("");
  const status = element("");
  const submit = element("");
  const form = {
    elements: { extraEmployees: input, checkoutAttempt: attempt },
    querySelector: () => submit, querySelectorAll: () => [], addEventListener() {},
  };
  const elements = { "#company-checkout": form, "#order-total": total, "#checkout-status": status };
  const requests = [];
  let readbackFinished;
  const readback = new Promise(resolve => { readbackFinished = resolve; });
  const history = { state: {}, replaceState(state, unused, destination) { this.state = state; pageURL = new URL(destination); } };
  const context = vm.createContext({
    document: { querySelector: selector => elements[selector] ?? null },
    location: { get href() { return pageURL.href; }, get search() { return pageURL.search; }, assign() { throw new Error("Confirmation must not start another payment"); } },
    history, window: { addEventListener() {} }, crypto: { randomUUID: () => ATTEMPT }, URL, URLSearchParams,
    fetch: async path => {
      requests.push(path);
      const response = await worker.fetch(new Request(`${ORIGIN}${path}`, { headers: { "Sec-Fetch-Site": "same-origin" } }), env);
      if (path.startsWith("/api/checkout/confirmation?")) readbackFinished();
      return response;
    },
  });
  vm.runInContext(readFileSync(new URL(`..${script}`, import.meta.url), "utf8"), context);
  await readback;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, ["/api/checkout/status", `/api/checkout/confirmation?session_id=${ID}`]);
  assert.equal(pageURL.searchParams.has("session_id"), false, "the return token is removed from the address bar");
  assert.equal(history.state.tiCheckoutSession, ID);
  assert.equal(total.value, "$1,500");
  assert.equal(input.value, "3");
  assert.equal(submit.textContent, "Company seat booked");
  assert.equal(submit.disabled, true);
  assert.match(status.textContent, /You’re booked/);
  assert.equal(calls.filter(call => call.options.method === "POST").length, 1, "confirmation does not create another Checkout Session");
});

test("99 additional employees is accepted as a technical cap", async () => {
  const { worker } = stripeStub(() => session(99));
  assert.equal((await worker.fetch(jsonRequest({ extraEmployees: 99 }), env)).status, 200);
});

test("same purchase retries use identical Stripe keys and parameters; different carts are independent", async () => {
  const { worker, calls } = stripeStub((url, options) => {
    const params = new URLSearchParams(options.body);
    return session(Number(params.get("metadata[extra_employees]")));
  });
  await worker.fetch(jsonRequest(), env);
  await worker.fetch(jsonRequest(), env);
  await worker.fetch(jsonRequest({ extraEmployees: 1, checkoutAttempt: ATTEMPT }), env);
  await worker.fetch(jsonRequest({ extraEmployees: 0, checkoutAttempt: "bd3c3ff2-0c84-4b78-b825-a0f77c8f0d9b" }), env);
  assert.equal(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.notEqual(calls[0].options.headers["Idempotency-Key"], calls[2].options.headers["Idempotency-Key"]);
  assert.notEqual(calls[0].options.headers["Idempotency-Key"], calls[3].options.headers["Idempotency-Key"]);
});

test("ambiguous network failure is retried once with the same idempotency key", async () => {
  const { worker, calls } = stripeStub((url, options, number) => {
    if (number === 1) throw new TypeError("private network details");
    return session();
  });
  assert.equal((await worker.fetch(jsonRequest(), env)).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["Idempotency-Key"], calls[1].options.headers["Idempotency-Key"]);
  assert.equal(calls[0].options.body, calls[1].options.body);
});

test("Stripe 429 retry is bounded and its error body stays private", async () => {
  const { worker, calls } = stripeStub(() => Response.json({ error: { message: env.STRIPE_SECRET_KEY, private: "private@example.invalid" } }, { status: 429 }));
  const response = await worker.fetch(jsonRequest(), env);
  const text = await response.text();
  assert.equal(response.status, 503);
  assert.equal(calls.length, 2);
  assert.equal(text.includes(env.STRIPE_SECRET_KEY), false);
  assert.equal(text.includes("private@example.invalid"), false);
});

test("configuration readiness exposes only a boolean and unconfigured purchases fail closed", async () => {
  const { worker, calls } = stripeStub();
  for (const config of [{}, { ...env, STRIPE_SECRET_KEY: "" }, { ...env, STRIPE_EMPLOYEE_PRICE_ID: env.STRIPE_COMPANY_PRICE_ID }]) {
    assert.deepEqual(await (await worker.fetch(getRequest("/api/checkout/status", {}), config)).json(), { ready: false });
    assert.equal((await worker.fetch(jsonRequest(), config)).status, 503);
  }
  assert.deepEqual(await (await worker.fetch(getRequest("/api/checkout/status", {}), env)).json(), { ready: true });
  assert.equal(calls.length, 0);
});

test("invalid counts cannot create a Checkout Session", async () => {
  const { worker, calls } = stripeStub();
  for (const value of [-1, 100, 1.5, null, true, false, {}, [], "-1", "100", "1.5", "1e1", "01", " 1", "1 ", "", undefined]) {
    const response = await worker.fetch(jsonRequest({ extraEmployees: value }), env);
    assert.equal(response.status, 400, `count ${JSON.stringify(value)}`);
  }
  assert.equal(calls.length, 0);
});

test("sandbox credentials are unavailable on production hosts but available for local testing", async () => {
  const { worker, calls } = stripeStub();
  const sandboxEnv = { ...env, STRIPE_SECRET_KEY: "rk_test_dummyfixture123456789" };
  assert.deepEqual(await (await worker.fetch(getRequest("/api/checkout/status", {}), sandboxEnv)).json(), { ready: false });
  assert.equal((await worker.fetch(jsonRequest(), sandboxEnv)).status, 503);
  const local = new Request("http://localhost:9047/api/checkout/status");
  assert.deepEqual(await (await worker.fetch(local, sandboxEnv)).json(), { ready: true });
  assert.equal(calls.length, 0);
});

test("invalid attempt IDs are rejected instead of reaching Stripe", async () => {
  const { worker, calls } = stripeStub();
  for (const checkoutAttempt of ["shared-global-token", "", null, false, 0, {}]) {
    assert.equal((await worker.fetch(jsonRequest({ extraEmployees: 0, checkoutAttempt }), env)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("only canonical, loopback or explicitly approved preview request hosts can use checkout", async () => {
  const { worker, calls } = stripeStub();
  const requestFor = origin => new Request(`${origin}/api/checkout/status`, { headers: { Origin: origin } });
  for (const origin of ["https://unapproved.example", "http://taylorintelligence.ai", "https://localhost.attacker.invalid", "https://taylorintelligence.ai.attacker.invalid"]) {
    assert.equal((await worker.fetch(requestFor(origin), env)).status, 403);
  }
  for (const origin of [ORIGIN, "https://www.taylorintelligence.ai", "http://localhost:9047", "http://127.0.0.1:9047", "http://[::1]:9047"]) {
    assert.equal((await worker.fetch(requestFor(origin), env)).status, 200);
  }
  const configured = { ...env, CHECKOUT_ALLOWED_ORIGINS: "https://preview.example.invalid" };
  assert.equal((await worker.fetch(requestFor("https://preview.example.invalid"), configured)).status, 200);
  assert.equal(calls.length, 0);
});

test("duplicate form fields, malformed JSON and unsupported encodings fail before Stripe", async () => {
  const { worker, calls } = stripeStub();
  for (const [type, body, status] of [
    ["application/x-www-form-urlencoded", "extraEmployees=1&extraEmployees=2", 400],
    ["application/json", "{", 400],
    ["application/json", "[]", 400],
    ["text/plain", "extraEmployees=0", 415],
  ]) {
    const request = new Request(`${ORIGIN}/api/checkout`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": type }, body });
    assert.equal((await worker.fetch(request, env)).status, status);
  }
  assert.equal(calls.length, 0);
});

test("request size is enforced against both Content-Length and streamed bytes", async () => {
  const { worker, calls } = stripeStub();
  assert.equal((await worker.fetch(jsonRequest({}, { "Content-Length": "4096" }), env)).status, 413);
  const request = new Request(`${ORIGIN}/api/checkout`, {
    method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(" ".repeat(2049))); controller.close(); } }),
    duplex: "half",
  });
  assert.equal((await worker.fetch(request, env)).status, 413);
  assert.equal(calls.length, 0);
});

test("same-origin evidence is mandatory for checkout and confirmation, with no open CORS", async () => {
  const { worker, calls } = stripeStub();
  for (const headers of [
    { Origin: "https://attacker.invalid" },
    { Origin: "null" },
    { "Sec-Fetch-Site": "cross-site" },
    { Origin: ORIGIN, "Sec-Fetch-Site": "same-site" },
  ]) {
    assert.equal((await worker.fetch(jsonRequest(undefined, headers), env)).status, 403);
  }
  const absent = new Request(`${ORIGIN}/api/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"extraEmployees":0}' });
  assert.equal((await worker.fetch(absent, env)).status, 403);
  assert.equal((await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`, {}), env)).status, 403);
  assert.equal((await worker.fetch(getRequest("/api/checkout/status", { Origin: "https://attacker.invalid" }), env)).status, 403);
  assert.equal(calls.length, 0);
});

test("paid confirmation returns only verified payment and public offer information", async () => {
  const { worker, calls } = stripeStub(() => session(2, { status: "complete", payment_status: "paid" }));
  const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.purchaseEventId, /^ti-purchase-[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes(ID), false, 'raw checkout token never becomes an ad event ID');
  assert.deepEqual(result, { paymentStatus: "paid", status: "complete", extraEmployees: 2, amountTotal: 140000, currency: "cad", purchaseEventId: result.purchaseEventId });
  const again = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
  assert.equal((await again.json()).purchaseEventId, result.purchaseEventId, 'refreshes share a stable deduplication ID');
  assert.equal(calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${ID}`);
  assert.equal(calls[0].options.method, "GET");
});

test("unpaid asynchronous checkout remains unpaid in confirmation", async () => {
  const { worker } = stripeStub(() => session(0, { status: "complete", payment_status: "unpaid" }));
  const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
  assert.equal((await response.json()).paymentStatus, "unpaid");
});

test("historical paid CAD 2000 company sessions retain their exact original totals", async () => {
  for (const extras of [0, 3]) {
    const oldSession = session(extras, {
      status: "complete", payment_status: "paid",
      amount_subtotal: 200000 + extras * 10000,
      amount_total: 200000 + extras * 10000,
      metadata: { ...session(extras).metadata, company_price_id: LEGACY_COMPANY_PRICE },
    });
    const { worker } = stripeStub(() => oldSession);
    const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.paymentStatus, "paid");
    assert.equal(result.amountTotal, 200000 + extras * 10000);
    assert.equal(result.extraEmployees, extras);
    assert.equal(result.currency, "cad");
    assert.match(result.purchaseEventId, /^ti-purchase-[a-f0-9]{64}$/);
  }
});

test("current and historical prices cannot borrow one another's totals or employee price", async () => {
  const oldMetadata = { ...session(3).metadata, company_price_id: LEGACY_COMPANY_PRICE };
  for (const overrides of [
    { amount_subtotal: 230000, amount_total: 230000 },
    { metadata: oldMetadata },
    { metadata: oldMetadata, amount_subtotal: 230000, amount_total: 150000 },
    { metadata: oldMetadata, amount_subtotal: 150000, amount_total: 230000 },
    { metadata: { ...oldMetadata, employee_price_id: "price_other" }, amount_subtotal: 230000, amount_total: 230000 },
  ]) {
    const { worker } = stripeStub(() => session(3, { status: "complete", payment_status: "paid", ...overrides }));
    const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
    assert.equal(response.status, 404);
  }
  const sandboxEnv = { ...env, STRIPE_SECRET_KEY: "rk_test_dummyfixture123456789" };
  const { worker } = stripeStub(() => session(3, {
    livemode: false, status: "complete", payment_status: "paid", metadata: oldMetadata,
    amount_subtotal: 230000, amount_total: 230000,
  }));
  const response = await worker.fetch(new Request(`http://127.0.0.1/api/checkout/confirmation?session_id=${ID}`, {
    headers: { "Sec-Fetch-Site": "same-origin" },
  }), sandboxEnv);
  assert.equal(response.status, 404, "the historical live price is never a sandbox price");
});

test("new checkout rejects historical CAD 2000 sessions even though confirmation supports them", async () => {
  for (const metadata of [session().metadata, { ...session().metadata, company_price_id: LEGACY_COMPANY_PRICE }]) {
    const { worker } = stripeStub(() => session(0, {
      metadata, amount_subtotal: 200000, amount_total: 200000,
    }));
    const response = await worker.fetch(jsonRequest(), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("Location"), false);
    assert.equal((await response.text()).includes('"url"'), false);
  }
});

test("foreign offers, wrong currency/prices/count/amount cannot appear paid", async () => {
  for (const overrides of [
    { metadata: { ...session().metadata, offer: "other-offer" } },
    { metadata: { ...session().metadata, company_price_id: "price_other" } },
    { metadata: { ...session().metadata, extra_employees: "100" } },
    { amount_total: 100 }, { amount_subtotal: 100 }, { currency: "usd" },
    { mode: "subscription" }, { id: "cs_test_otherID123456789" }, { livemode: false },
  ]) {
    const { worker } = stripeStub(() => session(0, { status: "complete", payment_status: "paid", ...overrides }));
    const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
    assert.equal(response.status, 404);
    assert.equal((await response.text()).includes('"paymentStatus":"paid"'), false);
  }
});

test("invalid or duplicate session IDs never reach Stripe", async () => {
  const { worker, calls } = stripeStub();
  for (const query of ["", "session_id=pi_other", "session_id=../customers", `session_id=${ID}&session_id=${ID}`]) {
    assert.equal((await worker.fetch(getRequest(`/api/checkout/confirmation?${query}`), env)).status, 400);
  }
  assert.equal(calls.length, 0);
});

test("wrong Stripe prices and unsafe upstream redirect URLs fail closed", async () => {
  for (const overrides of [
    { amount_total: 100 }, { amount_subtotal: 100 },
    { url: "https://attacker.invalid/pay" },
    { url: "http://checkout.stripe.com/pay" },
    { url: "https://checkout.stripe.com.attacker.invalid/pay" },
    { url: "https://user:secret@checkout.stripe.com/pay" },
    { url: null }, { status: "expired" },
  ]) {
    const { worker } = stripeStub(() => session(0, overrides));
    const response = await worker.fetch(jsonRequest(), env);
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("Location"), false);
    assert.equal((await response.text()).includes('"url"'), false);
  }
});

test("method guards and unknown API routes do not become SPA success responses", async () => {
  const { worker, calls } = stripeStub();
  const response = await worker.fetch(getRequest("/api/checkout"), env);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
  assert.equal((await worker.fetch(getRequest("/api/checkout/unknown"), env)).status, 404);
  assert.equal((await worker.fetch(new Request(`${ORIGIN}/api/checkout/confirmation`, { method: "POST", headers: { Origin: ORIGIN } }), env)).status, 405);
  assert.equal(calls.length, 0);
});

test("existing static assets and parent-site routes are forwarded unchanged", async () => {
  const { worker, calls } = stripeStub();
  for (const path of ["/", "/ai-intensive/", "/contact", "/services", "/ai-intensive/style.css"]) {
    assert.equal(await (await worker.fetch(new Request(`${ORIGIN}${path}`), env)).text(), `asset:${path}`);
  }
  assert.equal(calls.length, 0);
});
