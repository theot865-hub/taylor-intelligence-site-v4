import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../ai-intensive/thank-you/thank-you.js', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../ai-intensive/book/calendly-session.js', import.meta.url), 'utf8');
const eventId = `ti-schedule-${'a'.repeat(64)}`;
const confirmed = { leadSaved: true, bookingStatus: 'confirmed', eventId };

function fixture(options = {}) {
  let now = 1000;
  let nextTimer = 0;
  const timers = new Map();
  const requests = [];
  const schedules = [];
  const receipts = [];
  const calendlySchedules = [];
  const sessionStorage = new Map();
  if (options.marker) sessionStorage.set('ti-calendly-completion-v1', JSON.stringify(options.marker));
  if (Object.hasOwn(options, 'rawMarker')) sessionStorage.set('ti-calendly-completion-v1', options.rawMarker);
  const cookieReads = [];
  const nodes = Object.fromEntries(['thank-you-card', 'thanks-title', 'thanks-intro', 'thanks-note', 'choose-call', 'booking-confirmation-status', 'refresh-confirmation', 'check-legacy-booking', 'calendar-booking', 'calendar-frame'].map(id => [id, {
    textContent: '', hidden: id === 'refresh-confirmation' || id === 'booking-confirmation-status', disabled: false,
    attributes: new Map(), listeners: new Map(),
    addEventListener(name, handler) { this.listeners.set(name, handler); },
    setAttribute(name, value) { this.attributes.set(name, value); }, removeAttribute(name) { this.attributes.delete(name); }, getAttribute(name) { return this.attributes.get(name) ?? null; },
  }]));
  nodes['thanks-title'].textContent = 'Thanks for your interest';
  const listeners = new Map();
  const window = {
    location: { href: options.href || 'https://taylorintelligence.ai/ai-intensive/thank-you/' }, history: { state: {}, replaceState() {} }, AbortController,
    sessionStorage: {
      getItem(key) { if (options.storageThrows) throw new Error('Storage blocked'); return sessionStorage.get(key) ?? null; },
      setItem(key, value) { if (options.storageThrows) throw new Error('Storage blocked'); sessionStorage.set(key, value); },
      removeItem(key) { if (options.storageThrows) throw new Error('Storage blocked'); sessionStorage.delete(key); },
    },
    addEventListener(name, handler) { listeners.set(name, handler); },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if (options.respond) return options.respond(requests.length, init);
      return { ok: true, json: async () => options.record ?? confirmed };
    },
    ...(!options.noMeta ? { TIAds: { observedCalendlySchedule(record) {
      calendlySchedules.push(JSON.parse(JSON.stringify(record)));
      if (options.metaThrows) throw new Error('Meta unavailable');
    }, confirmedSchedule(record) {
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
  Object.defineProperty(document, 'cookie', { get() {
    cookieReads.push(true);
    if (options.cookieThrows) throw new Error('Cookie access blocked');
    return 'ti_ai_call_receipt=opaque-existing-legacy-receipt';
  } });
  const context = vm.createContext({
    window, URL, Date: { now: () => now },
    document,
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  if (!options.noHelper) vm.runInContext(helperSource, context);
  if (options.markerReadThrows) window.TICalendlySession = { read() { throw new Error('Storage blocked'); } };
  vm.runInContext(source, context);
  if (options.autoLegacy !== false) nodes['check-legacy-booking'].listeners.get('click')?.();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {
    nodes, requests, schedules, receipts, calendlySchedules, timers, listeners, settle, document, cookieReads, sessionStorage,
    async advance() {
      const [id, timer] = [...timers.entries()].sort((a, b) => a[1].delay - b[1].delay)[0] ?? [];
      if (!timer) return false;
      timers.delete(id); now += timer.delay; timer.fn(); await settle(); return true;
    },
    async refresh() { nodes['refresh-confirmation'].listeners.get('click')?.(); await settle(); },
    async checkLegacy() { nodes['check-legacy-booking'].listeners.get('click')?.(); await settle(); },
    now: () => now,
  };
}

test('explicit legacy Google check: only a valid server-confirmed receipt changes the page to booked and supplies a sanitized Schedule record', async () => {
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

test('explicit legacy Google check: pending receipt polls until confirmation; a saved lead alone never triggers Schedule', async () => {
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

test('explicit legacy Google check: expired or unknown receipt keeps conditional copy and never claims a lead or appointment', async () => {
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

test('explicit legacy Google check: cancelled receipt shows rebooking without a Schedule conversion', async () => {
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

test('explicit legacy Google check: malformed or contradictory receipts and unreadable/API error responses never show booked or send Schedule', async () => {
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

test('explicit legacy Google check: API errors and pending receipts stop within fifteen minutes with bounded reads and a manual refresh', async () => {
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

test('explicit legacy Google check: a confirmation arriving after the five-minute mail collector interval is still picked up automatically', async () => {
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

test('explicit legacy Google check: hidden pages stop polling and a visible/focused page resumes the bounded confirmation window', async () => {
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

test('explicit legacy Google check: HTTP429 pauses status reads and manual/focus retries respect the server Retry-After', async () => {
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

test('explicit legacy Google check: a hung status read aborts after eight seconds and duplicate refresh clicks do not create parallel requests', async () => {
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

test('explicit legacy Google check: missing or throwing Meta hooks cannot prevent verified booking confirmation', async () => {
  for (const options of [{ noMeta: true }, { metaThrows: true }]) {
    const f = fixture(options);
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
    assert.equal(f.nodes['choose-call'].hidden, true);
    assert.match(f.nodes['booking-confirmation-status'].textContent, /confirmed by Google Calendar/);
    assert.equal(f.timers.size, 0);
  }
});

test('explicit legacy Google check: leaving the page aborts a pending receipt check and prevents delayed conversion or continued polling', async () => {
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

test('default visit stays generic and never checks an old Google receipt or loads its iframe', async () => {
  for (const bookingStatus of ['pending', 'confirmed', 'cancelled']) {
    const f = fixture({ autoLegacy: false, record: { ...confirmed, bookingStatus } });
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
    assert.match(f.nodes['thanks-intro'].textContent, /If you’ve chosen a time/);
    assert.match(f.nodes['thanks-note'].textContent, /Already booked\? There’s no need to book again/);
    assert.equal(f.nodes['choose-call'].href, '/ai-intensive/book/');
    assert.equal(f.nodes['calendar-booking'].hidden, true);
    assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
    assert.equal(f.nodes['check-legacy-booking'].hidden, false);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.receipts, []);
    assert.deepEqual(f.schedules, []);
    assert.deepEqual(f.calendlySchedules, []);
    assert.equal(f.timers.size, 0);
    await f.refresh();
    f.listeners.get('focus')();
    f.listeners.get('document:visibilitychange')();
    f.listeners.get('pageshow')({ persisted: true });
    await f.settle();
    assert.equal(f.requests.length, 0, 'Focus, visibility, history restore and refresh do not opt into legacy checks');
    assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
  }
});

test('the explicitly labelled legacy button starts old receipt verification only after its click', async () => {
  const f = fixture({ autoLegacy: false, record: { leadSaved: true, bookingStatus: 'pending' } });
  await f.settle();
  assert.equal(f.requests.length, 0);
  await f.checkLegacy();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, '/api/ai-intensive/booking-status');
  assert.equal(f.requests[0].init.credentials, 'same-origin');
  assert.equal(f.nodes['check-legacy-booking'].hidden, true);
  assert.equal(f.nodes['calendar-booking'].hidden, false);
  assert.match(f.nodes['calendar-frame'].getAttribute('src'), /^https:\/\/calendar\.google\.com\//);
  assert.deepEqual(f.schedules, []);
  assert.deepEqual(f.calendlySchedules, []);
});

test('a fresh Calendly marker renders provider confirmation without inventing a server lead receipt', async () => {
  const marker = { version: 1, source: 'calendly-embed', eventId, completedAt: 1000 };
  const f = fixture({ autoLegacy: false, marker, record: { leadSaved: true, bookingStatus: 'pending' } });
  await f.settle();
  assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
  assert.match(f.nodes['thanks-intro'].textContent, /Your Calendly confirmation email/);
  assert.match(f.nodes['thanks-note'].textContent, /link in your Calendly confirmation email/);
  assert.match(f.nodes['booking-confirmation-status'].textContent, /completed in Calendly/);
  assert.equal(f.nodes['choose-call'].hidden, true);
  assert.equal(f.nodes['check-legacy-booking'].hidden, true);
  assert.equal(f.nodes['calendar-booking'].hidden, true);
  assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
  assert.equal(f.nodes['refresh-confirmation'].hidden, true);
  assert.deepEqual(f.calendlySchedules, [marker]);
  assert.equal(Object.hasOwn(f.calendlySchedules[0], 'leadSaved'), false);
  assert.equal(Object.hasOwn(f.calendlySchedules[0], 'bookingStatus'), false);
  assert.deepEqual(f.receipts, []);
  assert.deepEqual(f.schedules, []);
  assert.equal(f.requests.length, 0);
  assert.equal(f.timers.size, 0);
  await f.checkLegacy();
  await f.refresh();
  f.listeners.get('focus')();
  f.listeners.get('document:visibilitychange')();
  f.listeners.get('pageshow')({ persisted: true });
  await f.settle();
  assert.equal(f.requests.length, 0, 'Confirmed Calendly branch stays terminal even if legacy actions are invoked');
  assert.deepEqual(f.calendlySchedules, [marker]);
});

test('missing, stale, future and malformed markers cannot claim a Calendly completion', async () => {
  const valid = { version: 1, source: 'calendly-embed', eventId, completedAt: 1000 };
  for (const marker of [undefined, {}, [],
    { ...valid, completedAt: 1000 - 900000 }, { ...valid, completedAt: 1001 },
    { ...valid, completedAt: '1000' }, { ...valid, completedAt: null },
    { ...valid, eventId: 'ti-schedule-123' }, { ...valid, source: 'url' },
    { ...valid, version: 2 }, { ...valid, email: 'private@example.invalid' }
  ]) {
    const f = fixture({ autoLegacy: false, marker,
      href: 'https://taylorintelligence.ai/ai-intensive/thank-you/?booked=true&leadSaved=true#calendly.event_scheduled' });
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest', JSON.stringify(marker));
    assert.doesNotMatch(f.nodes['thanks-intro'].textContent, /Your Calendly confirmation|Your details are saved/);
    assert.equal(f.nodes['calendar-booking'].hidden, true);
    assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.calendlySchedules, []);
    assert.deepEqual(f.receipts, []);
    assert.deepEqual(f.schedules, []);
  }
  for (const rawMarker of ['not JSON', 'x'.repeat(513), 'null']) {
    const f = fixture({ autoLegacy: false, rawMarker });
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
    assert.deepEqual(f.calendlySchedules, []);
    assert.equal(f.requests.length, 0);
  }
});

test('blocked marker storage, missing helper and inaccessible cookies leave default visits generic', async () => {
  const marker = { version: 1, source: 'calendly-embed', eventId, completedAt: 1000 };
  for (const options of [{ storageThrows: true }, { noHelper: true }, { markerReadThrows: true }]) {
    const f = fixture({ ...options, autoLegacy: false, marker, cookieThrows: true });
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
    assert.match(f.nodes['thanks-note'].textContent, /no need to book again/);
    assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.cookieReads, [], 'HttpOnly legacy receipt is never read by client JavaScript');
    assert.deepEqual(f.receipts, []);
    assert.deepEqual(f.calendlySchedules, []);
    assert.equal(f.timers.size, 0);
  }
});

test('fresh Calendly confirmation survives missing or throwing Meta hooks and blocked cookie access', async () => {
  const marker = { version: 1, source: 'calendly-embed', eventId, completedAt: 1000 };
  for (const options of [{ noMeta: true }, { metaThrows: true }]) {
    const f = fixture({ ...options, autoLegacy: false, marker, cookieThrows: true });
    await f.settle();
    assert.equal(f.nodes['thanks-title'].textContent, 'Thanks—your call is booked');
    assert.match(f.nodes['thanks-intro'].textContent, /Your Calendly confirmation email/);
    assert.equal(f.nodes['choose-call'].hidden, true);
    assert.equal(f.nodes['check-legacy-booking'].hidden, true);
    assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.cookieReads, []);
    assert.equal(f.timers.size, 0);
  }
});

test('explicit legacy check with absent or expired server cookie cannot fabricate a saved lead or booking', async () => {
  const f = fixture({ autoLegacy: false, cookieThrows: true, record: { leadSaved: false, bookingStatus: 'unknown' } });
  await f.settle();
  assert.equal(f.requests.length, 0);
  await f.checkLegacy();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].init.credentials, 'same-origin');
  assert.equal(f.nodes['thanks-title'].textContent, 'Thanks for your interest');
  assert.doesNotMatch(f.nodes['thanks-intro'].textContent, /Your details are saved|Your Calendly confirmation/);
  assert.equal(f.nodes['calendar-frame'].getAttribute('src'), null);
  assert.deepEqual(f.receipts, [{ leadSaved: false, bookingStatus: 'unknown' }]);
  assert.deepEqual(f.schedules, []);
  assert.deepEqual(f.calendlySchedules, []);
  assert.deepEqual(f.cookieReads, []);
  assert.equal(f.timers.size, 0);
});
