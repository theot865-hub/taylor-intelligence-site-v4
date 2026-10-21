import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createWorker } from '../worker/checkout.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const origin = 'https://taylorintelligence.ai';
const ID = 'cs_live_abcdefghijklm123456789';
const env = {
  AI_INTENSIVE_RETIRED: 'true',
  STRIPE_SECRET_KEY: 'rk_live_dummyfixture123456789',
  STRIPE_COMPANY_PRICE_ID: 'price_companyFixture',
  STRIPE_EMPLOYEE_PRICE_ID: 'price_employeeFixture',
  ASSETS: { fetch: async request => new Response(`asset:${new URL(request.url).pathname}`) },
};

test('retirement blocks both stale payment forms and legacy lead capture without upstream writes', async () => {
  const worker = createWorker(() => { throw new Error('No Stripe call permitted'); });
  for (const path of ['/api/checkout', '/api/ai-intensive/leads', '/api/ai-intensive/leads/']) {
    const response = await worker.fetch(new Request(origin + path, { method: 'POST', body: 'stale form' }), env);
    assert.equal(response.status, 410, path);
    assert.equal((await response.json()).retired, true);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('deployed retirement reports checkout closed even with configured Stripe prices', async () => {
  assert.match(read('wrangler.jsonc'), /"AI_INTENSIVE_RETIRED": "true"/);
  const result = await createWorker().fetch(new Request(origin + '/api/checkout/status'), env);
  assert.deepEqual(await result.json(), { ready: false, retired: true });
});

test('historical owned paid receipts remain readable after retirement', async () => {
  const calls = [];
  const worker = createWorker(async url => {
    calls.push(url);
    return Response.json({ id: ID, mode: 'payment', currency: 'cad', livemode: true,
      status: 'complete', payment_status: 'paid', amount_subtotal: 120000, amount_total: 120000,
      metadata: { offer: 'ti-company-ai-intensive-v2', extra_employees: '0',
        company_price_id: env.STRIPE_COMPANY_PRICE_ID, employee_price_id: env.STRIPE_EMPLOYEE_PRICE_ID },
      line_items: { data: [{ price: { id: env.STRIPE_COMPANY_PRICE_ID }, quantity: 1 }] },
    });
  });
  const response = await worker.fetch(new Request(`${origin}/api/checkout/confirmation?session_id=${ID}`, {
    headers: { 'Sec-Fetch-Site': 'same-origin' },
  }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).paymentStatus, 'paid');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /checkout\/sessions\/cs_live_/);
});

test('unrelated service pages and private receipt endpoints keep their existing routing', async () => {
  const worker = createWorker(() => { throw new Error('No Stripe call permitted'); });
  for (const path of ['/websites/', '/marketing/', '/software/']) {
    assert.equal(await (await worker.fetch(new Request(origin + path), env)).text(), `asset:${path}`);
  }
  const response = await worker.fetch(new Request(origin + '/api/ai-intensive/booking-receipts'), env);
  assert.notEqual(response.status, 410, 'Private receipt handler remains responsible for authentication');
});

test('all former campaign entry pages close bookings, payments and ad tracking', () => {
  for (const path of ['ai-intensive/index.html', 'ai-intensive/book/index.html', 'ai-intensive/thank-you/index.html']) {
    const html = read(path);
    assert.match(html, /This programme has ended/);
    assert.match(html, /no longer taking bookings or payments/);
    assert.match(html, /name="robots" content="noindex, nofollow"/);
    assert.match(html, /mailto:theo@taylorintelligence.ai/);
    assert.doesNotMatch(html, /<form\b|<iframe\b|calendly.com|calendar.google.com|tracking\.js|checkout\.js|booking\.js/);
  }
  assert.doesNotMatch(read('sitemap.xml'), /<loc>https:\/\/taylorintelligence.ai\/ai-intensive\//);
});

test('homepage and Education cannot sell the retired package and preserve general agency services', () => {
  for (const path of ['index.html', 'education/index.html']) {
    const html = read(path);
    assert.doesNotMatch(html, /company-checkout|extra-employees|Four live group calls|\$1,200|href="\/ai-intensive\/(?:"|book)/);
    assert.match(html, /The AI Intensive has ended/);
    assert.match(html, /href="\/software\/"/);
    assert.match(html, /data-lead-form/);
  }
  assert.match(read('index.html'), /buy\.stripe\.com\/aFa14pa10ffO1LLgcdeIw01/, 'Website purchase remains separate');
});

async function receiptFixture(query, result, fail = false) {
  let location = origin + '/education/' + query;
  const status = { hidden: true, textContent: '' };
  const requests = [];
  const context = vm.createContext({
    URL, encodeURIComponent,
    document: { querySelector: () => status },
    window: { location: { href: location }, history: { state: null, replaceState(_s, _t, url) { location = url; } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (fail) throw Error('Network unavailable');
      return { ok: true, json: async () => result };
    },
  });
  vm.runInContext(read('ai-intensive/retirement-receipt.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  return { status, requests, location };
}

test('return pages verify previous payments without reopening purchase controls', async () => {
  for (const path of ['education/index.html', 'ai-intensive/index.html', 'ai-intensive/thank-you/index.html']) {
    assert.match(read(path), /id="payment-confirmation"/);
    assert.match(read(path), /src="\/ai-intensive\/retirement-receipt.js"/);
  }
  const paid = await receiptFixture(`?checkout=success&session_id=${ID}`, { paymentStatus: 'paid', status: 'complete' });
  assert.match(paid.status.textContent, /previous payment is confirmed/);
  assert.equal(paid.location, origin + '/education/');
  assert.equal(paid.requests.length, 1);
  assert.equal(paid.requests[0].url, `/api/checkout/confirmation?session_id=${ID}`);
  assert.equal(paid.requests[0].options.cache, 'no-store');
  const unpaid = await receiptFixture(`?checkout=success&session_id=${ID}`, { paymentStatus: 'unpaid', status: 'open' });
  assert.match(unpaid.status.textContent, /not confirmed as complete/);
});

test('a plain or forged return URL is not a payment confirmation; failures direct to help', async () => {
  for (const query of ['', '?checkout=success', '?session_id=bad']) {
    const result = await receiptFixture(query, { paymentStatus: 'paid', status: 'complete' });
    assert.equal(result.requests.length, 0);
    assert.equal(result.status.hidden, true);
  }
  const failed = await receiptFixture(`?session_id=${ID}`, null, true);
  assert.match(failed.status.textContent, /could not check this payment/);
});
