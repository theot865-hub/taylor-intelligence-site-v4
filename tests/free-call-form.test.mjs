import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ai-intensive/book/booking.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../ai-intensive/book/index.html', import.meta.url), 'utf8');
const calendar = '/ai-intensive/thank-you/';
const id = '935046f0-e9ea-4841-92c2-a78c2b718a89';

function fixture(options = {}) {
  const requests = [];
  const redirects = [];
  const timers = new Map();
  const fields = new Map([['name', 'Sample Owner'], ['email', 'owner@example.test'], ['website', '']]);
  if (options.consent) fields.set('marketingConsent', 'true');
  let submit;
  const form = {
    attributes: new Map(),
    addEventListener(name, handler) { if (name === 'submit') submit = handler; },
    reportValidity() { return options.valid !== false; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    removeAttribute(name) { this.attributes.delete(name); }
  };
  const status = { dataset: {}, hidden: true, textContent: '' };
  const button = { disabled: false };
  const submission = { value: '' };
  const nodes = { '#free-call-form': form, '#call-status': status, '#call-submit': button, '#call-submission-id': submission };
  const FormData = class { get(name) { return fields.get(name); } };
  const fetch = async (url, init) => {
    requests.push({ url, ...init, payload: JSON.parse(init.body) });
    if (options.respond) return options.respond(requests.length, init);
    return { ok: true, status: 200, json: async () => ({ saved: true, redirect: calendar }) };
  };
  const window = {
    fetch, FormData, AbortController,
    crypto: options.noCrypto ? {} : { randomUUID: () => id },
    location: { assign(url) { redirects.push(url); } }
  };
  vm.runInNewContext(source, {
    window, fetch, FormData, AbortController,
    document: { querySelector: selector => nodes[selector] },
    setTimeout(fn, delay) { const token = timers.size + 1; timers.set(token, { fn, delay }); return token; },
    clearTimeout(token) { timers.delete(token); }
  });
  return {
    requests, redirects, status, button, submission, form, fields, timers,
    enhanced: Boolean(submit),
    submit: () => submit?.({ preventDefault() {} })
  };
}

test('lead details save before redirect, with optional tips off by default and no URL personal data', async () => {
  const f = fixture();
  await f.submit();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/api/ai-intensive/leads');
  assert.equal(f.requests[0].method, 'POST');
  assert.deepEqual(f.requests[0].payload, {
    name: 'Sample Owner', email: 'owner@example.test', marketingConsent: false,
    submissionId: id, website: ''
  });
  assert.deepEqual(f.redirects, [calendar]);
  assert.equal(f.status.dataset.state, 'saved');
  assert.equal(f.timers.size, 0);
});

test('a checked weekly tips choice is explicit and separate from booking', async () => {
  const f = fixture({ consent: true });
  await f.submit();
  assert.equal(f.requests[0].payload.marketingConsent, true);
  assert.deepEqual(f.redirects, [calendar]);
});

test('invalid form and duplicate concurrent submissions make no extra requests', async () => {
  const invalid = fixture({ valid: false });
  await invalid.submit();
  assert.equal(invalid.requests.length, 0);
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const f = fixture({ respond: () => pending });
  const first = f.submit();
  await f.submit();
  assert.equal(f.requests.length, 1);
  assert.equal(f.button.disabled, true);
  assert.deepEqual(f.redirects, []);
  complete({ ok: true, status: 200, json: async () => ({ saved: true, redirect: calendar }) });
  await first;
  assert.deepEqual(f.redirects, [calendar]);
});

test('database/API and unreadable response failures never redirect or claim success', async () => {
  for (const respond of [
    async () => ({ ok: false, status: 503, json: async () => ({ error: 'Storage unavailable' }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } }),
    async () => ({ ok: true, status: 200, json: async () => ({ saved: false, redirect: calendar }) }),
    async () => ({ ok: true, status: 200, json: async () => ({ saved: true, redirect: 'https://example.test/collect' }) })
  ]) {
    const f = fixture({ respond });
    await f.submit();
    assert.deepEqual(f.redirects, []);
    assert.equal(f.status.dataset.state, 'error');
    assert.equal(f.button.disabled, false);
    assert.equal(f.form.attributes.has('aria-busy'), false);
  }
});

test('network retry retains the request ID and shows server corrections safely', async () => {
  const f = fixture({ respond: async n => {
    if (n === 1) throw new Error('Disconnected after potential save');
    return { ok: false, status: 409, json: async () => ({ error: 'Refresh the page to start a new request.' }) };
  } });
  await f.submit();
  const firstID = f.requests[0].payload.submissionId;
  await f.submit();
  assert.equal(f.requests[1].payload.submissionId, firstID);
  assert.equal(f.status.textContent, 'Refresh the page to start a new request.');
  assert.deepEqual(f.redirects, []);
});

test('slow request aborts after a bounded wait and allows the same-ID retry', async () => {
  const f = fixture({ respond: (_, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('Aborted')));
  }) });
  const pending = f.submit();
  assert.equal(f.timers.size, 1);
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, 25000);
  timer.fn();
  await pending;
  assert.equal(f.status.dataset.state, 'error');
  assert.equal(f.button.disabled, false);
  assert.equal(f.submission.value, id);
  assert.deepEqual(f.redirects, []);
});

test('unsupported enhancement retains native POST and leaves tips optional and unchecked', () => {
  assert.equal(fixture({ noCrypto: true }).enhanced, false);
  assert.match(html, /<form[^>]+action="\/api\/ai-intensive\/leads"[^>]+method="post"/);
  const checkbox = html.match(/<input[^>]+name="marketingConsent"[^>]*>/)?.[0];
  assert.ok(checkbox);
  assert.doesNotMatch(checkbox, /\b(?:checked|required)\b/);
  assert.match(html, /Send me one practical AI tip each week for my business<\/span>/);
  assert.match(html, />Continue to pick a time<\/button>/);
  assert.doesNotMatch(html, /<script[^>]+(?:tracking|checkout)\.js/);
});
