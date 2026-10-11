import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const TRACKING = readFileSync(new URL("../ai-intensive/tracking.js", import.meta.url), "utf8");
const CHECKOUT = readFileSync(new URL("../ai-intensive/checkout.js", import.meta.url), "utf8");
const ORIGIN = "https://taylorintelligence.ai";
const ATTEMPT = "831fa0cb-9fbf-47a9-9a4f-784361d8700e";
const OTHER_ATTEMPT = "bd3c3ff2-0c84-4b78-b825-a0f77c8f0d9b";
const SESSION = "cs_live_frontend_fixture_ABC123";
const DESTINATION = `https://checkout.stripe.com/c/pay/${SESSION}`;
const CONSENT_KEY = "ti-ad-consent-v1";
const PURCHASES_KEY = "ti-meta-purchases-v1";
const HASH_ID = `ti-purchase-${"a".repeat(64)}`;
const json = value => JSON.parse(JSON.stringify(value));
const storedConsent = value => new Map([[CONSENT_KEY, JSON.stringify({ value, at: Date.now() })]]);
const confirmed = (extras = 3, overrides = {}) => ({
  paymentStatus: "paid", status: "complete", extraEmployees: extras,
  amountTotal: 200000 + extras * 10000, currency: "cad", purchaseEventId: HASH_ID,
  ...overrides,
});

class Events {
  listeners = new Map();
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }
  async emit(name, values = {}) {
    const event = { type: name, preventDefault() { this.defaultPrevented = true; }, ...values };
    for (const listener of this.listeners.get(name) ?? []) await listener(event);
    return event;
  }
}

// Only the browser surfaces consumed by these scripts are provided. Meta's
// script is recorded, never downloaded; fetch is confined to fixture API data.
function browserFixture(options = {}) {
  let currentURL = new URL(options.url ?? `${ORIGIN}/ai-intensive/`);
  const storage = options.storage ?? new Map();
  const scripts = [];
  const cookieWrites = [];
  const requests = [];
  const redirects = [];
  const timers = [];
  const activeTimers = new Set();
  let nextTimer = 0;
  const sdkCalls = [];
  const lockRequests = [];
  const lockQueues = options.lockQueues ?? new Map();
  let loadSDK;
  let sdkLoaded = false;
  const windowEvents = new Events();
  const document = new Events();
  document.referrer = options.referrer ?? "";
  document.activeElement = null;
  const element = (id, value = "") => {
    const target = new Events();
    Object.assign(target, {
      id, value, textContent: "", hidden: false, disabled: false, open: false,
      focus() { document.activeElement = target; },
    });
    return target;
  };
  const elements = Object.fromEntries([
    "ad-notice", "ad-allow", "ad-decline", "ad-choice", "ad-notice-text",
    "ad-privacy-link", "ad-privacy", "order-total", "checkout-status",
  ].map(id => [id, element(id)]));
  const input = element("extra-employees", "0");
  const attempt = element("checkout-attempt");
  const submit = element("submit");
  const minus = element("minus");
  const plus = element("plus");
  minus.dataset = { seatStep: "-1" };
  plus.dataset = { seatStep: "1" };
  const form = element("company-checkout");
  form.action = `${ORIGIN}/api/checkout`;
  form.elements = { extraEmployees: input, checkoutAttempt: attempt };
  form.querySelector = selector => selector === '[type="submit"]' ? submit : null;
  form.querySelectorAll = selector => selector === "[data-seat-step]" ? [minus, plus] : [];
  elements[form.id] = form;
  elements[input.id] = input;
  document.querySelector = selector => elements[selector.slice(1)] ?? null;
  document.createElement = tag => Object.assign(new Events(), { tagName: tag.toUpperCase() });
  document.head = { appendChild(script) {
    script.pageURL = currentURL.href;
    script.referrer = document.referrer;
    scripts.push(script);
    if (options.autoSDK !== false) Promise.resolve().then(() => loadSDK());
  } };
  Object.defineProperty(document, "cookie", {
    get() { return ""; },
    set(value) { cookieWrites.push(value); },
  });
  const location = {
    get href() { return currentURL.href; },
    get protocol() { return currentURL.protocol; },
    get hostname() { return currentURL.hostname; },
    get search() { return currentURL.search; },
    assign(url) { redirects.push(url); },
  };
  const history = {
    state: options.historyState ?? null,
    replaceState(state, title, url) {
      if (options.historyFailure) throw new Error("Fixture history unavailable");
      this.state = state;
      currentURL = new URL(url, currentURL);
    },
  };
  const localStorage = {
    getItem(key) {
      if (options.storageFailure) throw new Error("Fixture storage unavailable");
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (options.storageFailure || options.storageWriteFailure) throw new Error("Fixture storage unavailable");
      storage.set(key, value);
    },
  };
  const fetch = async (url, init = {}) => {
    const request = { url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    requests.push(request);
    const pathname = new URL(request.url, ORIGIN).pathname;
    let body;
    let status = 200;
    if (pathname === "/api/checkout/status") body = { ready: options.ready ?? true };
    else if (pathname === "/api/checkout") {
      body = { url: options.destination ?? DESTINATION };
      status = options.checkoutStatus ?? 200;
    } else if (pathname === "/api/checkout/confirmation") {
      body = options.confirmation ?? confirmed(0, { paymentStatus: "unpaid", status: "open" });
      status = options.confirmationStatus ?? 200;
    } else throw new Error(`Unrecognized fixture fetch: ${request.url}`);
    return { ok: status >= 200 && status < 300, status, async json() { return body; } };
  };
  const context = {
    document, location, history, localStorage, fetch,
    navigator: {
      globalPrivacyControl: options.gpc ?? false, doNotTrack: options.dnt ?? null,
      locks: options.locks === false ? undefined : {
        request(name, settingsOrCallback, callback) {
          lockRequests.push(name);
          const run = callback ?? settingsOrCallback;
          const previous = lockQueues.get(name) ?? Promise.resolve();
          const next = previous.catch(() => {}).then(() => run({ name, mode: "exclusive" }));
          lockQueues.set(name, next);
          return next;
        },
      },
    },
    crypto: { randomUUID: () => ATTEMPT },
    URL, URLSearchParams, Intl, Date,
    setTimeout(callback, delay) {
      timers.push(delay);
      const timer = ++nextTimer;
      activeTimers.add(timer);
      Promise.resolve().then(() => { if (activeTimers.delete(timer)) callback(); });
      return timer;
    },
    clearTimeout(timer) { activeTimers.delete(timer); },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
  };
  context.window = context;
  if (options.fbq) context.fbq = options.fbq;
  vm.createContext(context);
  const runTracking = () => vm.runInContext(TRACKING, context, { filename: "tracking.js" });
  const runCheckout = () => vm.runInContext(CHECKOUT, context, { filename: "checkout.js" });
  const flush = async () => { for (let step = 0; step < 32; step++) await Promise.resolve(); };
  loadSDK = async () => {
    const script = scripts.at(-1);
    if (!script || sdkLoaded) return;
    sdkLoaded = true;
    const fbq = context.fbq;
    // A real SDK installs callMethod and drains any bootstrap queue before
    // firing the script load event. This exposes early queued-event bugs.
    if (fbq) {
      fbq.callMethod = (...args) => sdkCalls.push(json(args));
      for (const args of fbq.queue ?? []) fbq.callMethod(...Array.from(args));
      fbq.queue = [];
    }
    if (script.onload) await script.onload();
    await script.emit("load");
    await flush();
  };
  const calls = () => [...sdkCalls, ...Array.from(context.fbq?.queue ?? [], args => json(Array.from(args)))];
  const events = () => calls().filter(args => args[0] === "trackSingle").map(args => ({ name: args[2], data: args[3], eventId: args[4]?.eventID }));
  return {
    context, document, elements, form, input, attempt, submit, history, storage,
    scripts, requests, redirects, timers, cookieWrites, events, calls, runTracking, runCheckout, flush, loadSDK, lockRequests,
    async click(id) { await elements[id].emit("click"); await flush(); },
    async boot({ checkout = false } = {}) {
      runTracking();
      if (checkout) runCheckout();
      await document.emit("DOMContentLoaded");
      await flush();
    },
    async select(count) { input.value = String(count); await input.emit("input"); },
    async submitCheckout() { await form.emit("submit"); await flush(); },
    windowEvent: (name, value) => windowEvents.emit(name, value),
  };
}

test("Meta is absent before consent and after decline, including booking and paid results", async () => {
  const fixture = browserFixture();
  await fixture.boot();
  await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  assert.equal(fixture.elements["ad-notice"].hidden, false);
  assert.equal(fixture.scripts.length, 0);
  assert.equal(fixture.context.fbq, undefined);
  await fixture.click("ad-decline");
  await fixture.context.TIAds.checkoutStarted(3, OTHER_ATTEMPT);
  assert.equal(fixture.elements["ad-notice"].hidden, true);
  assert.equal(fixture.scripts.length, 0);
  assert.deepEqual(fixture.events(), []);
  assert.equal(JSON.parse(fixture.storage.get(CONSENT_KEY)).value, "denied");
});

test("GPC and DNT override saved consent and attempted acceptance", async () => {
  for (const signal of [{ gpc: true }, { dnt: "1" }]) {
    const fixture = browserFixture({ ...signal, storage: storedConsent("granted") });
    await fixture.boot();
    await fixture.click("ad-choice");
    assert.equal(fixture.elements["ad-allow"].disabled, true);
    await fixture.click("ad-allow");
    await fixture.context.TIAds.checkoutStarted(3, ATTEMPT);
    fixture.context.TIAds.confirmedPurchase(confirmed());
    await fixture.flush();
    assert.equal(fixture.scripts.length, 0);
    assert.deepEqual(fixture.events(), []);
    assert.equal(fixture.elements["ad-choice"].textContent, "Ad choices: off");
  }
});

test("localhost and nonproduction hosts never load Meta even after acceptance", async () => {
  for (const url of ["http://127.0.0.1:4183/ai-intensive/", "http://taylorintelligence.ai/ai-intensive/", "https://preview.example.invalid/ai-intensive/"]) {
    const fixture = browserFixture({ url });
    await fixture.boot();
    await fixture.click("ad-allow");
    await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
    fixture.context.TIAds.confirmedPurchase(confirmed());
    await fixture.flush();
    assert.equal(fixture.scripts.length, 0, url);
    assert.deepEqual(fixture.events(), []);
  }
});

test("accepting loads one SDK and emits PageView/ViewContent once across repeat decisions", async () => {
  const fixture = browserFixture();
  await fixture.boot();
  await fixture.click("ad-allow");
  await fixture.click("ad-allow");
  await fixture.click("ad-choice");
  await fixture.click("ad-allow");
  assert.deepEqual(fixture.scripts.map(script => script.src), ["https://connect.facebook.net/en_US/fbevents.js"]);
  assert.deepEqual(fixture.events().map(event => event.name), ["PageView", "ViewContent"]);
  assert.equal(fixture.calls().filter(args => args[0] === "init").length, 1);
  const view = fixture.events()[1].data;
  assert.equal(view.value, 2000);
  assert.equal(view.currency, "CAD");
  assert.deepEqual(view.content_ids, ["ti-company-intensive"]);
  assert.equal(fixture.elements["ad-choice"].textContent, "Ad choices: on");
});

test("expired consent prompts a new choice and sends no events", async () => {
  const storage = new Map([[CONSENT_KEY, JSON.stringify({ value: "granted", at: Date.now() - 181 * 24 * 60 * 60 * 1000 })]]);
  const fixture = browserFixture({ storage });
  await fixture.boot();
  assert.equal(fixture.elements["ad-notice"].hidden, false);
  assert.equal(fixture.scripts.length, 0);
  assert.deepEqual(fixture.events(), []);
});

test("revoking consent stops future checkout and purchase events", async () => {
  const fixture = browserFixture({ storage: storedConsent("granted") });
  await fixture.boot();
  await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
  const before = fixture.events();
  await fixture.click("ad-choice");
  await fixture.click("ad-decline");
  await fixture.context.TIAds.checkoutStarted(3, OTHER_ATTEMPT);
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  assert.deepEqual(fixture.events(), before);
  assert.ok(fixture.calls().some(args => args[0] === "consent" && args[1] === "revoke"));
  assert.ok(fixture.cookieWrites.some(cookie => cookie.startsWith("_fbp=") && cookie.includes("Max-Age=0")));
  assert.ok(fixture.cookieWrites.some(cookie => cookie.startsWith("_fbc=") && cookie.includes("Max-Age=0")));
});

test("an SDK that loads after denial cannot drain previously queued tracking events", async () => {
  const fixture = browserFixture({ autoSDK: false });
  await fixture.boot();
  await fixture.click("ad-allow");
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  assert.equal(fixture.scripts.length, 1);
  assert.deepEqual(fixture.events(), [], "Tracking events must not be queued before SDK readiness");
  assert.equal(fixture.storage.has(PURCHASES_KEY), false);
  await fixture.click("ad-decline");
  await fixture.loadSDK();
  assert.deepEqual(fixture.events(), [], "Late SDK initialization must recheck the current consent decision");
  assert.equal(fixture.storage.has(PURCHASES_KEY), false);
});

test("blocked SDK leaves no durable Purchase claim and cannot block checkout", async () => {
  const fixture = browserFixture({ autoSDK: false, storage: storedConsent("granted") });
  await fixture.boot({ checkout: true });
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  assert.deepEqual(fixture.events(), []);
  assert.equal(fixture.storage.has(PURCHASES_KEY), false);
  await fixture.submitCheckout();
  assert.deepEqual(fixture.redirects, [DESTINATION]);
  assert.deepEqual(fixture.events(), []);
  assert.equal(fixture.storage.has(PURCHASES_KEY), false);
});

test("InitiateCheckout uses exact CAD order totals and deduplicates the same attempt", async () => {
  const fixture = browserFixture({ storage: storedConsent("granted") });
  await fixture.boot();
  await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
  await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
  await fixture.context.TIAds.checkoutStarted(3, OTHER_ATTEMPT);
  await fixture.context.TIAds.checkoutStarted(3, OTHER_ATTEMPT);
  await fixture.context.TIAds.checkoutStarted(-1, "bad");
  const events = fixture.events().filter(event => event.name === "InitiateCheckout");
  assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => [event.data.value, event.data.currency, event.data.num_items]), [[2000, "CAD", 1], [2300, "CAD", 4]]);
  assert.deepEqual(events[0].data.contents, [{ id: "ti-company-intensive", quantity: 1, item_price: 2000 }]);
  assert.deepEqual(events[1].data.contents, [
    { id: "ti-company-intensive", quantity: 1, item_price: 2000 },
    { id: "ti-employee-observer", quantity: 3, item_price: 100 },
  ]);
  assert.deepEqual(events.map(event => event.eventId), [`ti-checkout-${ATTEMPT}`, `ti-checkout-${OTHER_ATTEMPT}`]);
  assert.ok(fixture.timers.every(delay => Number.isFinite(delay) && delay >= 0 && delay <= 1000));
});

test("Purchase requires paid complete exact amount and a hashed event ID", async () => {
  const fixture = browserFixture({ storage: storedConsent("granted") });
  await fixture.boot();
  for (const invalid of [
    { paymentStatus: "unpaid" }, { status: "open" }, { status: "cancelled" },
    { amountTotal: 1 }, { currency: "usd" }, { extraEmployees: 100 },
    { purchaseEventId: SESSION }, { purchaseEventId: "ti-purchase-bad" },
  ]) fixture.context.TIAds.confirmedPurchase(confirmed(3, invalid));
  await fixture.flush();
  assert.equal(fixture.events().filter(event => event.name === "Purchase").length, 0);
  fixture.context.TIAds.confirmedPurchase(confirmed());
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  const purchases = fixture.events().filter(event => event.name === "Purchase");
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].eventId, HASH_ID);
  assert.equal(purchases[0].data.value, 2300);
  assert.equal(purchases[0].data.currency, "CAD");
  assert.equal(purchases[0].data.num_items, 4);
  assert.deepEqual(JSON.parse(fixture.storage.get(PURCHASES_KEY)), [HASH_ID]);
  assert.equal(JSON.stringify(purchases).includes(SESSION), false);
});

test("Purchase deduplication survives reload with shared local storage", async () => {
  const storage = storedConsent("granted");
  const first = browserFixture({ storage });
  await first.boot();
  first.context.TIAds.confirmedPurchase(confirmed(0));
  await first.flush();
  const second = browserFixture({ storage });
  await second.boot();
  second.context.TIAds.confirmedPurchase(confirmed(0));
  await second.flush();
  assert.equal(first.events().filter(event => event.name === "Purchase").length, 1);
  assert.equal(second.events().filter(event => event.name === "Purchase").length, 0);
});

test("failed durable storage skips Purchase instead of producing reload duplicates", async () => {
  const storage = storedConsent("granted");
  const first = browserFixture({ storage, storageWriteFailure: true });
  await first.boot();
  first.context.TIAds.confirmedPurchase(confirmed());
  await first.flush();
  const second = browserFixture({ storage, storageWriteFailure: true });
  await second.boot();
  second.context.TIAds.confirmedPurchase(confirmed());
  await second.flush();
  assert.equal(first.events().filter(event => event.name === "Purchase").length, 0);
  assert.equal(second.events().filter(event => event.name === "Purchase").length, 0);
  assert.equal(storage.has(PURCHASES_KEY), false);
});

test("two tabs share an exclusive Purchase claim and send one event", async () => {
  const storage = storedConsent("granted");
  const lockQueues = new Map();
  const first = browserFixture({ storage, lockQueues });
  const second = browserFixture({ storage, lockQueues });
  await Promise.all([first.boot(), second.boot()]);
  first.context.TIAds.confirmedPurchase(confirmed());
  second.context.TIAds.confirmedPurchase(confirmed());
  await Promise.all([first.flush(), second.flush()]);
  const events = [...first.events(), ...second.events()].filter(event => event.name === "Purchase");
  assert.equal(events.length, 1);
  assert.deepEqual(JSON.parse(storage.get(PURCHASES_KEY)), [HASH_ID]);
  assert.ok(first.lockRequests.length + second.lockRequests.length >= 2);
});

test("missing Web Locks skips Purchase but leaves page and checkout measurement usable", async () => {
  const fixture = browserFixture({ locks: false, storage: storedConsent("granted") });
  await fixture.boot();
  fixture.context.TIAds.confirmedPurchase(confirmed());
  await fixture.flush();
  await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
  assert.deepEqual(fixture.events().map(event => event.name), ["PageView", "ViewContent", "InitiateCheckout"]);
  assert.equal(fixture.storage.has(PURCHASES_KEY), false);
});

test("token-bearing page URLs and incoming referrers prevent SDK load", async () => {
  const percentEncodedToken = Array.from(SESSION, character => `%${character.charCodeAt(0).toString(16)}`).join("");
  const doubleEncodedToken = percentEncodedToken.replaceAll("%", "%25");
  for (const unsafe of [
    { url: `${ORIGIN}/ai-intensive/?session_id=${SESSION}` },
    { url: `${ORIGIN}/ai-intensive/?note=cs_test_fixture` },
    { referrer: `https://checkout.stripe.com/c/pay/${SESSION}` },
    { referrer: `${ORIGIN}/ai-intensive/?session_id=fixture` },
    { url: `${ORIGIN}/ai-intensive/?return=${percentEncodedToken}` },
    { referrer: `https://checkout.stripe.com/pay?return=${percentEncodedToken}` },
    { referrer: `https://checkout.stripe.com/pay?return=${doubleEncodedToken}` },
    { referrer: "https://example.invalid/?return=%ZZ" },
  ]) {
    const fixture = browserFixture({ ...unsafe, storage: storedConsent("granted") });
    await fixture.boot();
    await fixture.context.TIAds.checkoutStarted(0, ATTEMPT);
    fixture.context.TIAds.confirmedPurchase(confirmed());
    await fixture.flush();
    assert.equal(fixture.scripts.length, 0);
    assert.deepEqual(fixture.events(), []);
  }
});

test("checkout redirects without consent and analytics failures cannot block payment navigation", async () => {
  for (const options of [
    {},
    { storage: storedConsent("granted"), fbq() { throw new Error("Fixture ad blocker"); } },
    { storageFailure: true },
  ]) {
    const fixture = browserFixture(options);
    await fixture.boot({ checkout: true });
    await fixture.select(3);
    await fixture.submitCheckout();
    assert.deepEqual(fixture.redirects, [DESTINATION]);
    const post = fixture.requests.find(request => request.method === "POST");
    assert.deepEqual(post.body, { extraEmployees: 3, checkoutAttempt: ATTEMPT });
    assert.equal(fixture.elements["checkout-status"].textContent, "Opening secure checkout…");
  }
});

test("throwing analytics hooks cannot block redirect or verified paid confirmation", async () => {
  const checkout = browserFixture();
  await checkout.boot({ checkout: true });
  checkout.context.TIAds.checkoutStarted = async () => { throw new Error("Fixture analytics hook failed"); };
  await checkout.submitCheckout();
  assert.deepEqual(checkout.redirects, [DESTINATION]);

  const paid = browserFixture({
    url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`,
    confirmation: confirmed(),
  });
  paid.runTracking();
  paid.context.TIAds.confirmedPurchase = () => { throw new Error("Fixture purchase hook failed"); };
  paid.runCheckout();
  await paid.document.emit("DOMContentLoaded");
  await paid.flush();
  assert.equal(paid.submit.textContent, "Company seat booked");
  assert.equal(paid.submit.disabled, true);
  assert.match(paid.elements["checkout-status"].textContent, /You’re booked/);
});

test("InitiateCheckout fires only after a valid accepted checkout destination", async () => {
  for (const options of [{ checkoutStatus: 503 }, { destination: "https://attacker.invalid/pay" }]) {
    const fixture = browserFixture({ ...options, storage: storedConsent("granted") });
    await fixture.boot({ checkout: true });
    await fixture.submitCheckout();
    assert.deepEqual(fixture.redirects, []);
    assert.equal(fixture.events().filter(event => event.name === "InitiateCheckout").length, 0);
    assert.equal(fixture.submit.disabled, false);
  }
  const fixture = browserFixture({ storage: storedConsent("granted") });
  await fixture.boot({ checkout: true });
  await fixture.select(3);
  await fixture.submitCheckout();
  assert.equal(fixture.events().filter(event => event.name === "InitiateCheckout")[0].data.value, 2300);
  assert.deepEqual(fixture.redirects, [DESTINATION]);
});

test("return-token cleanup precedes Meta load and history state keeps reload confirmation working", async () => {
  const storage = storedConsent("granted");
  const first = browserFixture({
    storage, url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`,
    historyState: { existingRouterState: "keep" }, confirmation: confirmed(),
  });
  await first.boot({ checkout: true });
  assert.equal(new URL(first.context.location.href).searchParams.has("session_id"), false);
  assert.equal(first.history.state.tiCheckoutSession, SESSION);
  assert.equal(first.history.state.existingRouterState, "keep");
  assert.ok(first.scripts.every(script => !script.pageURL.includes(SESSION) && !script.pageURL.includes("session_id")));
  assert.equal(first.submit.textContent, "Company seat booked");
  assert.equal(first.submit.disabled, true);
  assert.equal(first.events().filter(event => event.name === "Purchase").length, 1);
  assert.ok(first.requests.some(request => request.url.endsWith(`session_id=${SESSION}`)));
  const second = browserFixture({
    storage, url: first.context.location.href, historyState: first.history.state, confirmation: confirmed(),
  });
  await second.boot({ checkout: true });
  assert.equal(second.submit.textContent, "Company seat booked");
  assert.equal(second.submit.disabled, true);
  assert.ok(second.requests.some(request => request.url.endsWith(`session_id=${SESSION}`)));
  assert.equal(second.events().filter(event => event.name === "Purchase").length, 0);
  assert.match(second.elements["checkout-status"].textContent, /You’re booked/);
  assert.equal(JSON.stringify(first.events()).includes(SESSION), false);
});

test("cleanup failure keeps ads off while server-paid confirmation still works", async () => {
  const fixture = browserFixture({
    storage: storedConsent("granted"), historyFailure: true,
    url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`,
    confirmation: confirmed(),
  });
  await fixture.boot({ checkout: true });
  assert.equal(fixture.submit.textContent, "Company seat booked");
  assert.equal(fixture.scripts.length, 0);
  assert.deepEqual(fixture.events(), []);
});

test("cancelled, unpaid and forged-amount responses never emit Purchase", async () => {
  for (const options of [
    { url: `${ORIGIN}/ai-intensive/?checkout=cancelled&employees=3` },
    { url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`, confirmation: confirmed(3, { paymentStatus: "unpaid" }) },
    { url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`, confirmation: confirmed(3, { status: "open" }) },
    { url: `${ORIGIN}/ai-intensive/?checkout=success&session_id=${SESSION}`, confirmation: confirmed(3, { amountTotal: 1 }) },
  ]) {
    const fixture = browserFixture({ ...options, storage: storedConsent("granted") });
    await fixture.boot({ checkout: true });
    assert.equal(fixture.events().filter(event => event.name === "Purchase").length, 0);
  }
});
