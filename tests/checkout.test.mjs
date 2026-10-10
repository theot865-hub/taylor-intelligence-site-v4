import test from "node:test";
import assert from "node:assert/strict";
import { createWorker } from "../worker/checkout.mjs";

const ORIGIN = "https://taylorintelligence.ai";
const ATTEMPT = "831fa0cb-9fbf-47a9-9a4f-784361d8700e";
const ID = "cs_live_abcdefghijklm123456789";
const CHECKOUT_URL = `https://checkout.stripe.com/c/pay/${ID}`;
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
    amount_subtotal: 200000 + extras * 10000,
    amount_total: 200000 + extras * 10000,
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
  assert.equal(params.get("success_url"), `${ORIGIN}/ai-intensive/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(params.get("cancel_url"), `${ORIGIN}/ai-intensive/?checkout=cancelled&employees=0`);
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
  assert.equal(params.get("cancel_url"), `${ORIGIN}/ai-intensive/?checkout=cancelled&employees=3`);
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
  assert.deepEqual(await response.json(), { paymentStatus: "paid", status: "complete", extraEmployees: 2, amountTotal: 220000, currency: "cad" });
  assert.equal(calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${ID}`);
  assert.equal(calls[0].options.method, "GET");
});

test("unpaid asynchronous checkout remains unpaid in confirmation", async () => {
  const { worker } = stripeStub(() => session(0, { status: "complete", payment_status: "unpaid" }));
  const response = await worker.fetch(getRequest(`/api/checkout/confirmation?session_id=${ID}`), env);
  assert.equal((await response.json()).paymentStatus, "unpaid");
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
