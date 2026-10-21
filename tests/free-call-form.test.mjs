import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = readFileSync(new URL('../ai-intensive/book/booking.js', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../ai-intensive/book/calendly-session.js', import.meta.url), 'utf8');
const eventUrl = 'https://calendly.com/theo-taylor/free-ai-call';
const destination = '/ai-intensive/thank-you/';
const now = Date.UTC(2026, 9, 15, 20);
const eventUUID = '935046f0-e9ea-4841-92c2-a78c2b718a89';
const inviteeUUID = 'f6d9b2fe-166e-4dc2-b841-184859ecaf0c';
const eventURI = `https://api.calendly.com/scheduled_events/${eventUUID}`;
const inviteeURI = `${eventURI}/invitees/${inviteeUUID}`;
const markerID = `ti-schedule-${'a'.repeat(64)}`;

function fixture(options = {}) {
  const scripts = [];
  const redirects = [];
  const calls = [];
  const messages = [];
  const storage = options.storage || new Map();
  const storageWrites = [];
  const frameWindow = {};
  const frame = { contentWindow: frameWindow };
  const widget = {
    hidden: true, dataset: {}, style: {},
    querySelector(selector) { return selector === 'iframe' && !options.noFrame ? frame : null; }
  };
  const status = { dataset: {}, hidden: true, textContent: '' };
  const fallback = { href: 'mailto:theo@taylorintelligence.ai', hidden: false, textContent: '' };
  const nodes = { '#calendly-widget': widget, '#call-status': status, '#calendar-fallback': fallback };
  const DateAtTest = class extends Date { static now() { return now; } };
  const sessionStorage = {
    getItem(key) {
      if (options.storageThrows || options.readThrows) throw new Error('Storage unavailable');
      return storage.get(key) ?? null;
    },
    setItem(key, value) {
      if (options.storageThrows || options.writeThrows) throw new Error('Storage unavailable');
      storageWrites.push({ key, value });
      storage.set(key, value);
    },
    removeItem(key) {
      if (options.storageThrows || options.removeThrows) throw new Error('Storage unavailable');
      storage.delete(key);
    }
  };
  const initInlineWidget = args => {
    calls.push(args);
    assert.ok(messages.length, 'Completion listener is installed before widget initialization');
    if (options.initThrows) throw new Error('Embed blocked');
  };
  const document = {
    querySelector(selector) { return nodes[selector] || null; },
    createElement(tag) {
      assert.equal(tag, 'script', 'Only the Calendly script is created dynamically');
      return { tagName: 'SCRIPT' };
    },
    head: { appendChild(script) { scripts.push(script); } }
  };
  const window = {
    TICalendlyConfig: Object.hasOwn(options, 'config') ? options.config : { eventUrl },
    sessionStorage,
    localStorage: new Proxy({}, { get() { throw new Error('Completion must not use persistent localStorage'); } }),
    crypto: options.noCrypto ? undefined : options.crypto || webcrypto,
    location: { href: 'https://taylorintelligence.ai/ai-intensive/book/', assign(url) { redirects.push(url); } },
    addEventListener: options.noMessages ? undefined : (type, handler) => {
      if (type === 'message') messages.push(handler);
    },
    Calendly: options.existingWidget ? { initInlineWidget } : undefined
  };
  const context = vm.createContext({
    window, document, URL, Date: DateAtTest, TextEncoder: options.noEncoder ? undefined : TextEncoder,
    Uint8Array, console,
    fetch() { throw new Error('Tests must not issue network requests'); }
  });
  if (!options.noHelper) vm.runInContext(helperSource, context);
  if (options.runBooking !== false) vm.runInContext(source, context);
  return {
    scripts, redirects, calls, messages, storage, storageWrites, window, status, widget, fallback,
    session: window.TICalendlySession,
    load() {
      window.Calendly = { initInlineWidget };
      for (const script of scripts) script.onload?.();
    },
    async message(patch = {}) {
      const message = {
        origin: 'https://calendly.com', source: frameWindow,
        data: { event: 'calendly.event_scheduled', payload: { event: { uri: eventURI }, invitee: { uri: inviteeURI } } },
        ...patch
      };
      await Promise.all([...messages].map(handler => handler(message)));
    }
  };
}


test('repeat widget script readiness initializes the explicit embed only once', () => {
  const f = fixture();
  f.load(); f.load(); f.load();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].parentElement, f.widget);
});

test('empty and unsafe configuration make no remote load or completion listener', () => {
  for (const config of [undefined, null, {}, { eventUrl: '' }, { eventUrl: '   ' },
    { eventUrl: 'http://calendly.com/theo/free-call' },
    { eventUrl: 'https://calendly.com.evil.test/theo/free-call' },
    { eventUrl: 'https://example.test/theo/free-call' },
    { eventUrl: 'https://calendly.com/theo' },
    { eventUrl: `${eventUrl}?email=person@example.test` },
    { eventUrl: `${eventUrl}#booked` },
    { eventUrl: 'https://person:secret@calendly.com/theo/free-call' },
    { eventUrl: 'https://calendly.com:8443/theo/free-call' }
  ]) {
    const f = fixture({ config });
    assert.equal(f.scripts.length, 0, JSON.stringify(config));
    assert.equal(f.calls.length, 0, JSON.stringify(config));
    assert.equal(f.messages.length, 0, JSON.stringify(config));
    assert.equal(f.fallback.href, 'mailto:theo@taylorintelligence.ai');
    assert.deepEqual(f.redirects, []);
  }
});

test('valid configuration loads only the official widget and initializes its own container', () => {
  const f = fixture();
  assert.equal(f.scripts.length, 1);
  assert.equal(f.scripts[0].src, 'https://assets.calendly.com/assets/external/widget.js');
  assert.equal(f.calls.length, 0);
  f.load();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, eventUrl);
  assert.equal(f.calls[0].parentElement, f.widget);
  assert.deepEqual(Object.keys(f.calls[0]).sort(), ['parentElement', 'url']);
  assert.equal(f.fallback.href, eventUrl);
  assert.equal(f.storageWrites.length, 0);
  assert.deepEqual(f.redirects, []);
});

test('an already available official widget is initialized without another remote script', () => {
  const f = fixture({ existingWidget: true });
  assert.equal(f.calls.length, 1);
  assert.equal(f.scripts.length, 0);
});

test('unsupported message API keeps the safe direct booking fallback without claiming completion', () => {
  const f = fixture({ noMessages: true });
  assert.equal(f.scripts.length, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.storageWrites.length, 0);
  assert.deepEqual(f.redirects, []);
  assert.equal(f.fallback.href, eventUrl);
});

test('script load or widget initialization failure retains the direct booking fallback', () => {
  const f = fixture();
  f.scripts[0].onerror();
  assert.equal(f.calls.length, 0);
  assert.equal(f.storageWrites.length, 0);
  assert.deepEqual(f.redirects, []);
  assert.equal(f.fallback.href, eventUrl);
  assert.equal(f.fallback.hidden, false);
  const g = fixture({ initThrows: true });
  g.load();
  assert.equal(g.widget.hidden, true);
  assert.equal(g.fallback.hidden, false);
  assert.deepEqual(g.redirects, []);
});

test('only exact completion from this widget and Calendly origin is accepted', async () => {
  for (const patch of [
    { origin: 'https://calendly.com.evil.test' },
    { origin: 'http://calendly.com' },
    { origin: 'https://sub.calendly.com' },
    { origin: 'null' },
    { source: {} },
    { source: null },
    { data: null },
    { data: 'calendly.event_scheduled' },
    ...['calendly.profile_page_viewed', 'calendly.event_type_viewed', 'calendly.date_and_time_selected',
      'calendly.event_scheduled.extra'].map(event => ({ data: { event, payload: { event: { uri: eventURI }, invitee: { uri: inviteeURI } } } }))
  ]) {
    const f = fixture(); f.load();
    await f.message(patch);
    assert.deepEqual(f.redirects, [], JSON.stringify(patch));
    assert.equal(f.storageWrites.length, 0);
  }
  const noFrame = fixture({ noFrame: true }); noFrame.load();
  await noFrame.message();
  assert.deepEqual(noFrame.redirects, []);
});

test('malformed, untrusted and mismatched event/invitee URI pairs are ignored', async () => {
  const invalidPairs = [
    [undefined, inviteeURI], [eventURI, undefined],
    ['https://evil.test/scheduled_events/' + eventUUID, inviteeURI],
    [eventURI + '?email=owner@example.test', inviteeURI],
    [eventURI + '#fragment', inviteeURI],
    [eventURI + '/', inviteeURI],
    [eventURI.replace(eventUUID, 'not-a-uuid'), inviteeURI],
    [eventURI, inviteeURI.replace(inviteeUUID, 'not-a-uuid')],
    [eventURI, inviteeURI.replace(eventUUID, inviteeUUID)],
    [eventURI, inviteeURI + '?name=Somebody'],
    [eventURI, inviteeURI + '/extra'],
    [eventURI, inviteeURI.replace('https:', 'http:')],
    [eventURI, inviteeURI.replace('api.calendly.com', 'api.calendly.com.evil.test')]
  ];
  for (const [event, invitee] of invalidPairs) {
    const f = fixture(); f.load();
    await f.message({ data: { event: 'calendly.event_scheduled', payload: { event: { uri: event }, invitee: { uri: invitee } } } });
    assert.deepEqual(f.redirects, [], `${event} / ${invitee}`);
    assert.equal(f.storageWrites.length, 0);
  }
});

test('throwing or absent payload properties cannot break the completion listener', async () => {
  for (const payload of [null, [], {}, { event: null, invitee: null },
    Object.defineProperty({}, 'event', { get() { throw new Error('Malformed'); } })
  ]) {
    const f = fixture(); f.load();
    await assert.doesNotReject(f.message({ data: { event: 'calendly.event_scheduled', payload } }));
    assert.deepEqual(f.redirects, []);
    assert.equal(f.storageWrites.length, 0);
  }
});

test('widget completion saves only a short-lived opaque marker then navigates to a fixed clean URL', async () => {
  const f = fixture(); f.load();
  await f.message({ data: { event: 'calendly.event_scheduled', payload: {
    event: { uri: eventURI }, invitee: { uri: inviteeURI },
    email: 'owner@example.test', name: 'Private Name', answers: ['Private answer'],
    redirect: 'https://evil.test/collect?email=owner@example.test'
  } } });
  assert.deepEqual(f.redirects, [destination]);
  assert.equal(f.storageWrites.length, 1);
  const { key, value } = f.storageWrites[0];
  assert.equal(key, 'ti-calendly-completion-v1');
  const saved = JSON.parse(value);
  assert.deepEqual(Object.keys(saved).sort(), ['completedAt', 'eventId', 'source', 'version']);
  assert.deepEqual({ version: saved.version, source: saved.source, completedAt: saved.completedAt }, {
    version: 1, source: 'calendly-embed', completedAt: now
  });
  assert.match(saved.eventId, /^ti-schedule-[a-f0-9]{64}$/);
  assert.doesNotMatch(value, /api\.calendly|scheduled_events|invitees|email|name|@/);
  assert.doesNotMatch(value, /Private|evil\.test/);
});

test('repeated or simultaneous completion messages navigate and store only once', async () => {
  const f = fixture(); f.load();
  await Promise.all([f.message(), f.message(), f.message()]);
  await f.message();
  assert.deepEqual(f.redirects, [destination]);
  assert.equal(f.storageWrites.length, 1);
});

test('same booking produces a stable opaque ID while a different invitee produces another ID', async () => {
  const f = fixture(); f.load(); await f.message();
  const g = fixture(); g.load(); await g.message();
  const h = fixture(); h.load();
  await h.message({ data: { event: 'calendly.event_scheduled', payload: {
    event: { uri: eventURI }, invitee: { uri: inviteeURI.replace(inviteeUUID, eventUUID) }
  } } });
  const savedID = context => JSON.parse(context.storageWrites[0].value).eventId;
  assert.equal(savedID(f), savedID(g));
  assert.notEqual(savedID(f), savedID(h));
});

test('optional storage, helper or crypto failures still reach generic thank-you without a marker', async () => {
  for (const options of [{ storageThrows: true }, { noHelper: true }, { noCrypto: true }, { noEncoder: true },
    { crypto: { subtle: { digest: async () => { throw new Error('Unavailable'); } } } }
  ]) {
    const f = fixture(options); f.load(); await f.message();
    assert.deepEqual(f.redirects, [destination]);
    assert.equal(f.storageWrites.length, 0);
  }
});

test('starting another embedded booking clears an old marker before later crypto or storage failure', async () => {
  for (const options of [{ noCrypto: true }, { writeThrows: true }]) {
    const storage = new Map([['ti-calendly-completion-v1', JSON.stringify({
      version: 1, source: 'calendly-embed', eventId: markerID, completedAt: now - 1000
    })]]);
    const f = fixture({ ...options, storage });
    assert.equal(f.session.read(), null, 'Old proof is cleared before initializing another booking');
    f.load(); await f.message();
    assert.deepEqual(f.redirects, [destination]);
    assert.equal(f.session.read(), null, 'The generic thank-you page cannot reuse the old completion');
    assert.equal(f.storage.has(f.session.KEY), false);
  }
});

test('readable old proof that cannot be cleared uses the external fallback without embedding', () => {
  const storage = new Map([['ti-calendly-completion-v1', JSON.stringify({
    version: 1, source: 'calendly-embed', eventId: markerID, completedAt: now - 1000
  })]]);
  const f = fixture({ storage, removeThrows: true });
  assert.equal(f.scripts.length, 0);
  assert.equal(f.calls.length, 0);
  assert.equal(f.messages.length, 0);
  assert.equal(f.fallback.href, eventUrl);
  assert.equal(f.fallback.hidden, false);
  assert.deepEqual(f.redirects, []);
});

test('completion helper accepts only its exact shape and current 15-minute same-tab records', () => {
  const f = fixture({ runBooking: false });
  assert.equal(f.session.KEY, 'ti-calendly-completion-v1');
  assert.equal(f.session.TTL_MS, 900000);
  const valid = { version: 1, source: 'calendly-embed', eventId: markerID, completedAt: now };
  assert.deepEqual(JSON.parse(JSON.stringify(f.session.normalize(valid))), valid);
  assert.ok(f.session.normalize({ ...valid, completedAt: now - 899999 }));
  for (const invalid of [null, [], {}, { ...valid, version: 2 }, { ...valid, source: 'redirect' },
    { ...valid, eventId: 'ti-schedule-123' }, { ...valid, completedAt: now + 1 },
    { ...valid, completedAt: now - 900000 }, { ...valid, completedAt: now - 900001 },
    { ...valid, completedAt: String(now) }, { ...valid, completedAt: NaN },
    { ...valid, email: 'owner@example.test' }
  ]) assert.equal(Boolean(f.session.normalize(invalid)), false, JSON.stringify(invalid));
});

test('completion helper uses sessionStorage only and safely handles corrupt or inaccessible storage', () => {
  const f = fixture({ runBooking: false });
  assert.equal(Boolean(f.session.read()), false);
  f.session.save(markerID);
  assert.equal(f.session.read().eventId, markerID);
  assert.equal(f.session.read().completedAt, now);
  assert.equal(f.session.clear(), true);
  assert.equal(f.session.read(), null);
  f.session.save(markerID);
  f.storage.set(f.session.KEY, '{broken');
  assert.equal(Boolean(f.session.read()), false);
  assert.doesNotThrow(() => fixture({ runBooking: false, storageThrows: true }).session.read());
  const g = fixture({ runBooking: false });
  assert.equal(Boolean(g.session.read()), false, 'An independent browsing session has no completion marker');
});
