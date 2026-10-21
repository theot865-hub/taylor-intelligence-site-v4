import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ai-intensive/thank-you/thank-you.js', import.meta.url), 'utf8');
const tracker = readFileSync(new URL('../ai-intensive/tracking.js', import.meta.url), 'utf8');
const calendar = 'https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C';
const key = 'ti-ad-consent-v1';

function fixture(options = {}) {
  let current = new URL(options.url ?? 'https://taylorintelligence.ai/ai-intensive/thank-you/');
  const storage = new Map(options.granted ? [[key, JSON.stringify({ value: 'granted', at: Date.now() })]] : []);
  const elements = Object.fromEntries(['ad-notice', 'ad-allow', 'ad-decline', 'ad-choice', 'ad-notice-text', 'ad-privacy-link', 'ad-privacy'].map(id => [id, {
    hidden: true, disabled: false, textContent: '', open: false, listeners: new Map(),
    addEventListener(name, handler) { this.listeners.set(name, handler); }, focus() {},
  }]));
  const root = { dataset: {} };
  const calls = [];
  let boot;
  const window = {
    get location() { return { href: current.href }; },
    history: { state: {}, replaceState(state, unused, url) { if (options.historyFailure) throw new Error('Blocked'); current = new URL(url); } },
    addEventListener() {},
    fbq(...args) { calls.push(args); },
  };
  window.fbq.callMethod = () => {};
  const context = vm.createContext({
    window, URL, Date, navigator: { globalPrivacyControl: options.gpc ?? false, doNotTrack: options.dnt ?? null },
    location: { get href() { return current.href; }, get protocol() { return current.protocol; }, get hostname() { return current.hostname; } },
    document: {
      documentElement: root, body: { dataset: { tiAdsPage: 'thank-you' } }, referrer: '', cookie: '',
      querySelector: selector => elements[selector.slice(1)] ?? null,
      addEventListener(name, handler) { if (name === 'DOMContentLoaded') boot = handler; },
      createElement() { throw new Error('No real third-party SDK requested by tests'); },
    },
    localStorage: { getItem(name) { return storage.get(name) ?? null; }, setItem(name, value) { storage.set(name, value); } },
  });
  vm.runInContext(source, context);
  if (options.tracker) { vm.runInContext(tracker, context); boot(); }
  return {
    elements, storage, root, calls, url: () => current.href,
    events: () => calls.filter(call => call[0] === 'trackSingle').map(call => ({ name: call[2], data: call[3] })),
    click: id => elements[id].listeners.get('click')?.(),
  };
}



test('a thank-you visit with ad permission emits only PageView and never revenue or a booking conversion', () => {
  const f = fixture({ tracker: true, granted: true });
  assert.deepEqual(f.events().map(event => event.name), ['PageView']);
  assert.equal(JSON.stringify(f.events()).includes('value'), false);
  assert.equal(JSON.stringify(f.events()).includes('currency'), false);
  assert.equal(JSON.stringify(f.events()).includes('1200'), false);
});

test('unknown or denied ad permission and browser privacy signals prevent measurement while the fixed calendar link remains usable', () => {
  const unknown = fixture({ tracker: true });
  assert.deepEqual(unknown.events(), []);
  unknown.click('ad-decline');
  assert.deepEqual(unknown.events(), []);
  for (const options of [{ gpc: true }, { dnt: '1' }]) {
    const f = fixture({ ...options, tracker: true, granted: true });
    assert.deepEqual(f.events(), []);
    f.click('ad-choice');
    assert.equal(f.elements['ad-allow'].disabled, true);
    assert.deepEqual(f.events(), []);
  }
});

test('arbitrary private URL data is removed before the shared tracker boots and cannot become lead or appointment proof', () => {
  const url = 'https://taylorintelligence.ai/ai-intensive/thank-you/?name=Private&email=private%40example.invalid&receipt=opaque#confirmed';
  const f = fixture({ url, tracker: true, granted: true });
  assert.equal(f.url(), 'https://taylorintelligence.ai/ai-intensive/thank-you/');
  assert.deepEqual(f.events().map(event => event.name), ['PageView']);
  assert.equal(JSON.stringify(f.calls).includes('private@example.invalid'), false);
  assert.equal(JSON.stringify(f.calls).includes('opaque'), false);
});

test('failed URL cleanup is marked and the shared tracker cannot transmit a token-bearing thank-you visit', () => {
  const f = fixture({ url: 'https://taylorintelligence.ai/ai-intensive/thank-you/?session_id=cs_live_private', historyFailure: true, tracker: true, granted: true });
  assert.equal(f.root.dataset.privateURLCleanup, 'failed');
  assert.deepEqual(f.events(), []);
});
