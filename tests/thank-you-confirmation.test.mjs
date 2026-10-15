import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ai-intensive/thank-you/thank-you.js', import.meta.url), 'utf8');
const eventId = `ti-schedule-${'a'.repeat(64)}`;
const confirmed = { leadSaved: true, bookingStatus: 'confirmed', eventId };

function fixture(options = {}) {
  let now = 1000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const schedules = [];
  const receipts = [];
  const nodes = Object.fromEntries(['thank-you-card', 'thanks-title', 'thanks-intro', 'thanks-note', 'choose-call', 'booking-confirmation-status', 'refresh-confirmation', 'calendar-booking', 'calendar-frame'].map(id => [id, {
    textContent: '', hidden: id === 'refresh-confirmation' || id === 'booking-confirmation-status', disabled: false,
    attributes: new Map(), listeners: new Map(),
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    setAttribute(name, value) { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); }, getAttribute(name) { return this.attributes.get(name) ?? null; },
  }]));
  nodes['thanks-title'].textContent = 'Thanks for your interest';
  const listeners = new Map();
  const window = {
    location: { href: 'https://taylorintelligence.ai/ai-intensive/thank-you/' }, history: { state: {}, replaceState() {} }, AbortController,
    addEventListener(name, handler) { listeners.set(name, handler); },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.respond) return options.respond(requests.length, init);
      return { ok: true, json: async () => options.record ?? confirmed };
    },
    ...(!options.noMeta ? { TIAds: { confirmedSchedule(record) {
      receipts.push(JSON.parse(JSON.stringify(record)));
      if (record.leadSaved === true && record.bookingStatus === 'confirmed') schedules.push(JSON.parse(JSON.stringify(record)));
      if (options.metaThrows) throw new Error('Meta unavailable');
    } } } : {}),
  };
  const document = {
    readyState: 'complete', visibilityState: 'visible', documentElement: { dataset: {} },
    querySelector: selector => nodes[selector.slice(1)] ?? null,
    addEventListener(name, handler) { listeners.set(`document:${name}`, handler); },
  };
  vm.runInNewContext(source, {
    window, URL, Date: { now: () => now },
    document,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    nodes, requests, schedules, receipts, timers, listeners, settle, document,
    async advance() {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0] ?? [];
      if (!timer) return false;
      timers.delete(id); now += timer.delay; timer.fn(); await settle(); return true;
    },
    async refresh() { nodes['refresh-confirmation'].listeners.get('click')?.(); await settle(); },
    now: () => now,
  };
}

test('only a valid server-confirmed receipt changes the page to booked and supplies a sanitized Schedule record', async () => {
  const f = fixture({ record: { ...confirmed, name: 'Private Person', attendeeEmail: 'private@example.invalid', rawUid: 'private@google.com' } });
  await f.settle();
  assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
  assert.equal(f.nodes['choose-call'].hidden, true);
  assert.equal(f.nodes['calendar-booking'].hidden, true);
  assert.equal(f.nodes['refresh-confirmation'].hidden, true);
  assert.deepEqual(f.schedules, [confirmed]);
  assert.equal(f.timers.size, 0);
  assert.equal(f.requests[0].url, '/api/ai-intensive/booking-status');
  assert.equal(f.requests[0].init.method, 'GET');
  assert.equal(f.requests[0].init.credentials, 'same-origin');
  assert.equal(f.requests[0].init.cache, 'no-store');
  assert.equal(f.requests[0].init.body, undefined);
  assert.equal(JSON.stringify(f.nodes).includes('private@example.invalid'), false);
});

test('pending receipt polls until confirmation; a saved lead alone never triggers Schedule', async () => {
  const f = fixture({ respond: async count => ({ ok: true, json: async () => count === 1 ? { leadSaved: true, bookingStatus: 'pending' } : confirmed }) });
  await f.settle();
  assert.deepEqual(f.schedules, []);
  assert.match(f.nodes['booking-confirmation-status'].textContent, /Checking/);
  assert.equal(f.nodes['choose-call'].hidden, false);
  assert.equal(f.nodes['calendar-booking'].hidden, false);
  assert.match(f.nodes['thanks-intro'].textContent, /Use the same email address you entered on the previous page\./);
  assert.match(f.nodes['calendar-frame'].getAttribute('src'), /^https:\/\/calendar\.google\.com\/calendar\/appointments\/schedules\/AcZssZ2.*\?gv=true$/);
  assert.equal(f.nodes['refresh-confirmation'].hidden, false);
  assert.deepEqual(f.receipts, [{ leadSaved: true, bookingStatus: 'pending' }]);
  await f.advance();
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.schedules, [confirmed]);
  assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
});

test('direct visits and expired/unknown receipts keep conditional copy and never claim a lead or appointment', async () => {
  const f = fixture({ record: { leadSaved: false, bookingStatus: 'unknown' } });
  await f.settle();
  assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
  assert.match(f.nodes['thanks-intro'].textContent, /If you’ve chosen a time/);
  assert.equal(f.nodes['choose-call'].hidden, false);
  assert.equal(f.nodes['choose-call'].href, '/ai-intensive/book/');
  assert.equal(f.nodes['calendar-booking'].hidden, true);
  assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
  assert.deepEqual(f.schedules, []);
  assert.equal(f.requests.length, 1);
  assert.equal(f.timers.size, 0);
});

test('cancelled receipt shows rebooking without a Schedule conversion', async () => {
  const f = fixture({ record: { leadSaved: true, bookingStatus: 'cancelled', eventId } });
  await f.settle();
  assert.equal(f.nodes['thanks-title'].textContent, 'Your call was cancelled');
  assert.equal(f.nodes['choose-call'].hidden, false);
  assert.equal(f.nodes['choose-call'].href, '/ai-intensive/book/');
  assert.equal(f.nodes['calendar-booking'].hidden, true);
  assert.deepEqual(f.receipts, [{ leadSaved: true, bookingStatus: 'cancelled', eventId }]);
  assert.match(f.nodes['thanks-intro'].textContent, /choose a new time/);
  assert.deepEqual(f.schedules, []);
  assert.equal(f.timers.size, 0);
});

test('malformed or contradictory receipts and unreadable/API error responses never show booked or send Schedule', async () => {
  const records = [null, [], { leadSaved: false, bookingStatus: 'confirmed', eventId }, { leadSaved: true, bookingStatus: 'confirmed' },
    { ...confirmed, eventId: 'private@google.com' }, { ...confirmed, eventId: [eventId] }, { leadSaved: true, bookingStatus: 'pending', eventId },
    { leadSaved: false, bookingStatus: 'unknown', eventId }, { leadSaved: true, bookingStatus: 'other' }];
  for (const record of records) {
    const f = fixture({ respond: async () => ({ ok: true, json: async () => record }) });
    await f.settle();
    assert.deepEqual(f.schedules, []);
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
    assert.match(f.nodes['booking-confirmation-status'].textContent, /couldn’t check/);
  }
  for (const respond of [async () => ({ ok: false, json: async () => confirmed }), async () => ({ ok: true, json: async () => { throw new Error('Private parse failure'); } }), async () => { throw new Error('Private network failure'); }]) {
    const f = fixture({ respond });
    await f.settle();
    assert.deepEqual(f.schedules, []);
    assert.doesNotMatch(f.nodes['booking-confirmation-status'].textContent, /Private/);
  }
});

test('API errors and pending receipts stop within fifteen minutes with bounded reads and a manual refresh', async () => {
  for (const respond of [async () => ({ ok: false }), async () => ({ ok: true, json: async () => ({ leadSaved: true, bookingStatus: 'pending' }) })]) {
    const f = fixture({ respond });
    await f.settle();
    for (let index = 0; index < 50 && await f.advance(); index++) {}
    assert.ok(f.requests.length <= 45);
    assert.ok(f.now() <= 901000);
    assert.equal(f.nodes['refresh-confirmation'].hidden, false);
    assert.equal(f.nodes['refresh-confirmation'].disabled, false);
    assert.deepEqual(f.schedules, []);
    assert.equal(f.timers.size, 0);
    const count = f.requests.length;
    await f.refresh();
    assert.equal(f.requests.length, count + 1);
  }
});

test('a confirmation arriving after the five-minute mail collector interval is still picked up automatically', async () => {
  const f = fixture({ respond: async count => ({ ok: true, json: async () => count <= 18 ? { leadSaved: true, bookingStatus: 'pending' } : confirmed }) });
  await f.settle();
  for (let index = 0; index < 18; index++) await f.advance();
  assert.ok(f.now() > 301000);
  assert.equal(f.requests.length, 19);
  assert.deepEqual(f.schedules, [confirmed]);
  assert.equal(f.nodes['calendar-booking'].hidden, true);
  assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
  assert.equal(f.timers.size, 0);
});

test('hidden pages stop polling and a visible/focused page resumes the bounded confirmation window', async () => {
  const f = fixture({ record: { leadSaved: true, bookingStatus: 'pending' } });
  await f.settle();
  f.document.visibilityState = 'hidden';
  f.listeners.get('document:visibilitychange')();
  assert.equal(f.timers.size, 0);
  const count = f.requests.length;
  f.listeners.get('focus')();
  await f.settle();
  assert.equal(f.requests.length, count);
  f.document.visibilityState = 'visible';
  f.listeners.get('document:visibilitychange')();
  await f.settle();
  assert.equal(f.requests.length, count + 1);
  assert.deepEqual(f.schedules, []);
  assert.equal(f.nodes['calendar-booking'].hidden, false);
});

test('HTTP429 pauses status reads and manual/focus retries respect the server Retry-After', async () => {
  const f = fixture({ respond: async count => count === 1
    ? { ok: true, json: async () => ({ leadSaved: true, bookingStatus: 'pending' }) }
    : count === 2 ? { ok: false, status: 429, headers: { get: () => '60' } }
      : { ok: true, json: async () => confirmed } });
  await f.settle();
  await f.advance();
  assert.equal(f.requests.length, 2);
  assert.equal(f.nodes['refresh-confirmation'].disabled, true);
  await f.refresh();
  f.listeners.get('focus')();
  await f.settle();
  assert.equal(f.requests.length, 2);
  await f.advance();
  assert.equal(f.nodes['refresh-confirmation'].disabled, false);
  await f.refresh();
  assert.equal(f.requests.length, 3);
  assert.deepEqual(f.schedules, [confirmed]);
});

test('a hung status read aborts after eight seconds and duplicate refresh clicks do not create parallel requests', async () => {
  const f = fixture({ respond: async (count, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('Aborted')))) });
  await f.settle();
  await f.refresh();
  await f.refresh();
  assert.equal(f.requests.length, 1);
  await f.advance();
  assert.equal(f.requests[0].init.signal.aborted, true);
  assert.equal(f.now(), 9000);
  assert.deepEqual(f.schedules, []);
  assert.match(f.nodes['booking-confirmation-status'].textContent, /try again automatically/);
});

test('missing or throwing Meta hooks cannot prevent verified booking confirmation', async () => {
  for (const options of [{ noMeta: true }, { metaThrows: true }]) {
    const f = fixture(options);
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
    assert.equal(f.nodes['choose-call'].hidden, true);
    assert.match(f.nodes['booking-confirmation-status'].textContent, /confirmed by Google Calendar/);
    assert.equal(f.timers.size, 0);
  }
});

test('leaving the page aborts a pending receipt check and prevents delayed conversion or continued polling', async () => {
  let finish;
  const f = fixture({ respond: async () => new Promise(resolve => { finish = resolve; }) });
  await f.settle();
  f.listeners.get('pagehide')();
  finish({ ok: true, json: async () => confirmed });
  await f.settle();
  assert.deepEqual(f.schedules, []);
  assert.equal(f.timers.size, 0);
  assert.equal(f.requests[0].init.signal.aborted, true);
});
