import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHmac, createHash } from 'node:crypto';
import { createWorker } from '../worker/checkout.mjs';
import { THANK_YOU_PATH, RECEIPT_COOKIE, RECEIPT_AGE_SECONDS, BOOKING_TITLES } from '../worker/ai-intensive-leads.mjs';

const origin = 'https://taylorintelligence.ai';
const secret = 'test-only-receipt-key-32-bytes-minimum-not-production';
const id = '831fa0cb-9fbf-47a9-9a4f-784361d8700e';
const lead = { name: 'Fixture Owner', email: 'owner@example.invalid', marketingConsent: false, submissionId: id, website: '' };
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();

function sqliteDatabase(t) {
  try { execFileSync('sqlite3', ['--version'], { stdio: 'ignore' }); }
  catch (error) { if (error.code === 'ENOENT') { t.skip('SQLite CLI unavailable'); return null; } throw error; }
  const directory = mkdtempSync(join(tmpdir(), 'ti-booking-receipt-tests-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'private-test.sqlite');
  const exec = sql => {
    const output = execFileSync('sqlite3', ['-json', file], { input: `.bail on\nPRAGMA foreign_keys=ON;\n${sql}`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return output ? JSON.parse(output) : [];
  };
  exec(['0001_ai_intensive_leads.sql', '0002_receipts_bookings.sql'].map(name => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8')).join('\n'));
  const queries = [];
  const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
  const database = {
    queries, exec,
    withSession() { return database; },
    prepare(sql) {
      return { bind(...values) {
        let index = 0;
        const bound = sql.replace(/\?/g, () => literal(values[index++]));
        assert.equal(index, values.length);
        queries.push({ sql, values });
        return {
          async run() {
            if (database.failReceipt && /INSERT INTO ai_intensive_receipts/.test(sql)) throw new Error('Private fixture failure');
            const rows = exec(`${bound}; SELECT changes() AS changes;`);
            return { success: true, meta: { changes: rows[0].changes } };
          },
          async first() {
            if (database.failRead) throw new Error('Private fixture details');
            return exec(`${bound};`)[0] ?? null;
          }
        };
      } };
    }
  };
  return database;
}

function setup(t) {
  const database = sqliteDatabase(t);
  if (!database) return null;
  const quotas = [];
  const env = {
    AI_INTENSIVE_LEADS: database, TI_BOOKING_RECEIPT_KEY: secret,
    AI_INTENSIVE_LEAD_LIMITER: { async limit({ key }) { quotas.push(key); return { success: true }; } },
    ASSETS: { async fetch() { return new Response('static'); } }
  };
  const worker = createWorker(async () => { throw new Error('Stripe is not part of booking receipts'); });
  const leadRequest = body => new Request(`${origin}/api/ai-intensive/leads`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
    body: JSON.stringify(body ?? lead)
  });
  const status = cookie => worker.fetch(new Request(`${origin}/api/ai-intensive/booking-status`, {
    headers: { 'Sec-Fetch-Site': 'same-origin', 'CF-Connecting-IP': '192.0.2.10', ...(cookie ? { Cookie: cookie } : {}) }
  }), env);
  return { database, env, worker, quotas, leadRequest, status };
}

function booking(overrides = {}) {
  const timestamp = Date.now();
  return {
    eventId: 'provider-event-fixture-123@google.com', attendeeEmail: lead.email,
    start: new Date(timestamp + 86400000).toISOString(), end: new Date(timestamp + 86400000 + 15 * 60000).toISOString(),
    status: 'confirmed', scheduleTitle: BOOKING_TITLES[0], confirmedAt: new Date(timestamp).toISOString(),
    ...overrides
  };
}

function signed(value, options = {}) {
  const raw = options.raw ?? JSON.stringify(value);
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = options.signature ?? createHmac('sha256', options.secret ?? secret).update(`${timestamp}.${raw}`).digest('hex');
  return new Request(`${options.origin ?? origin}/api/ai-intensive/booking-receipts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-TI-Timestamp': timestamp, 'X-TI-Signature': signature }, body: raw
  });
}

test('successful JSON/native lead saves issue an opaque, scoped cookie with only its hash in real SQLite', async t => {
  const f = setup(t); if (!f) return;
  for (const request of [f.leadRequest(), new Request(`${origin}/api/ai-intensive/leads`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '192.0.2.10' },
    body: new URLSearchParams({ name: lead.name, email: lead.email, submissionId: id })
  })]) {
    const result = await f.worker.fetch(request, f.env);
    assert.ok([200, 303].includes(result.status));
    const cookie = result.headers.get('Set-Cookie');
    assert.match(cookie, new RegExp(`^${RECEIPT_COOKIE}=[a-f0-9]{64}; Path=/api/ai-intensive/booking-status; Max-Age=${RECEIPT_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax$`));
    assert.equal(cookie.includes(lead.email), false);
    assert.equal(cookie.includes(id), false);
    const token = cookie.split(';')[0].split('=')[1];
    const [stored] = f.database.exec(`SELECT token_hash,submission_id,expires_at FROM ai_intensive_receipts WHERE token_hash='${hash(token)}';`);
    assert.equal(stored.token_hash, hash(token));
    assert.notEqual(stored.token_hash, token);
    assert.equal(stored.submission_id, id);
    assert.ok(stored.expires_at > Date.now());
    if (result.status === 200) assert.deepEqual(await result.json(), { saved: true, redirect: THANK_YOU_PATH });
    else assert.equal(result.headers.get('Location'), `${origin}${THANK_YOU_PATH}`);
    assert.deepEqual(await (await f.status(cookie.split(';')[0])).json(), { leadSaved: true, bookingStatus: 'pending' });
  }
  assert.equal(f.database.exec('SELECT count(*) AS n FROM ai_intensive_leads;')[0].n, 1);
  assert.equal(f.database.exec('SELECT count(*) AS n FROM ai_intensive_receipts;')[0].n, 2);
  assert.ok(f.quotas.some(key => key.startsWith('ti-ai-intensive-booking-status:v1:')));
});

test('arbitrary/expired/duplicated receipt cookies cannot claim a saved lead or confirmed booking', async t => {
  const f = setup(t); if (!f) return;
  for (const cookie of [undefined, `${RECEIPT_COOKIE}=not-valid`, `${RECEIPT_COOKIE}=${'a'.repeat(64)}`, `${RECEIPT_COOKIE}=${'a'.repeat(64)}; ${RECEIPT_COOKIE}=${'b'.repeat(64)}`]) {
    assert.deepEqual(await (await f.status(cookie)).json(), { leadSaved: false, bookingStatus: 'unknown' });
  }
  const saved = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = saved.headers.get('Set-Cookie').split(';')[0];
  f.database.exec('UPDATE ai_intensive_receipts SET expires_at=1;');
  assert.deepEqual(await (await f.status(cookie)).json(), { leadSaved: false, bookingStatus: 'unknown' });
});

test('trusted authenticated confirmation reaches the cookie holder only after a matching prior lead and exact persisted event', async t => {
  const f = setup(t); if (!f) return;
  const leadResult = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = leadResult.headers.get('Set-Cookie').split(';')[0];
  const receipt = booking();
  const result = await f.worker.fetch(signed(receipt), f.env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { accepted: true, matched: true });
  for (let index = 0; index < 2; index++) assert.equal((await f.worker.fetch(signed(receipt), f.env)).status, 200);
  assert.equal(f.database.exec('SELECT count(*) AS n FROM ai_intensive_bookings;')[0].n, 1);
  const status = await f.status(cookie);
  assert.deepEqual(await status.json(), { leadSaved: true, bookingStatus: 'confirmed', eventId: `ti-schedule-${hash(receipt.eventId)}` });
  const row = f.database.exec('SELECT * FROM ai_intensive_bookings;')[0];
  assert.equal(row.event_uid_hash, hash(receipt.eventId));
  assert.equal(row.submission_id, id);
  assert.equal(JSON.stringify(row).includes(lead.email), false);
  assert.equal(JSON.stringify(row).includes(receipt.eventId), false);
});

test('cancellation is durable and stale/replayed confirmations cannot undo it', async t => {
  const f = setup(t); if (!f) return;
  const result = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = result.headers.get('Set-Cookie').split(';')[0];
  const receipt = booking({ confirmedAt: new Date(Date.now() - 5000).toISOString() });
  assert.equal((await f.worker.fetch(signed(receipt), f.env)).status, 200);
  const cancelled = { ...receipt, status: 'cancelled', confirmedAt: now() };
  assert.equal((await f.worker.fetch(signed(cancelled), f.env)).status, 200);
  for (const restored of [receipt, { ...receipt, confirmedAt: now() }]) {
    assert.deepEqual(await (await f.worker.fetch(signed(restored), f.env)).json(), { accepted: true, matched: true });
  }
  assert.equal((await (await f.status(cookie)).json()).bookingStatus, 'cancelled');
});

test('forged, tampered, stale and missing authentication cannot write a booking', async t => {
  const f = setup(t); if (!f) return;
  await f.worker.fetch(f.leadRequest(), f.env);
  const receipt = booking();
  const requests = [
    signed(receipt, { secret: 'different-private-key' }), signed(receipt, { signature: 'a'.repeat(64) }),
    signed(receipt, { timestamp: String(Math.floor(Date.now() / 1000) - 301) }),
    signed(receipt, { timestamp: String(Math.floor(Date.now() / 1000) + 301) }),
    new Request(`${origin}/api/ai-intensive/booking-receipts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(receipt) })
  ];
  for (const request of requests) assert.equal((await f.worker.fetch(request, f.env)).status, 401);
  assert.equal(f.database.exec('SELECT count(*) AS n FROM ai_intensive_bookings;')[0].n, 0);
});

test('valid unmatched receipts persist only hashes and cannot claim a booking until a prior-window lead matches', async t => {
  const f = setup(t); if (!f) return;
  const receipt = booking();
  const unmatched = await f.worker.fetch(signed(receipt), f.env);
  assert.equal(unmatched.status, 200);
  assert.deepEqual(await unmatched.json(), { accepted: true, matched: false });
  const [row] = f.database.exec('SELECT * FROM ai_intensive_bookings;');
  assert.equal(row.submission_id, null);
  assert.equal(row.attendee_email_hash, hash(lead.email));
  assert.equal(JSON.stringify(row).includes(lead.email), false);
  assert.deepEqual(await (await f.status()).json(), { leadSaved: false, bookingStatus: 'unknown' });
  await f.worker.fetch(f.leadRequest(), f.env);
  const reconciled = await f.worker.fetch(signed(receipt), f.env);
  assert.deepEqual(await reconciled.json(), { accepted: true, matched: true });
});

test('unknown schedule, mismatched attendee and invalid chronology cannot claim the visitor booking', async t => {
  const f = setup(t); if (!f) return;
  const saved = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = saved.headers.get('Set-Cookie').split(';')[0];
  const receipt = booking();
  for (const changes of [{ scheduleTitle: 'Unrelated event' },
    { confirmedAt: new Date(Date.now() - 2 * 3600000 - 120000).toISOString() },
    { confirmedAt: new Date(Date.now() + 301000).toISOString() }, { start: 'not-a-date' }, { end: receipt.start }]) {
    const response = await f.worker.fetch(signed({ ...receipt, ...changes }), f.env);
    if (response.status === 200) assert.deepEqual(await response.json(), { accepted: true, matched: false });
    else assert.equal(response.status, 400, JSON.stringify(changes));
  }
  const other = await f.worker.fetch(signed({ ...receipt, eventId: 'other-event', attendeeEmail: 'other@example.invalid' }), f.env);
  assert.deepEqual(await other.json(), { accepted: true, matched: false });
  assert.deepEqual(await (await f.status(cookie)).json(), { leadSaved: true, bookingStatus: 'pending' });
});

test('later retry cannot shift an unmatched booking window onto a fresh post-booking lead', async t => {
  const f = setup(t); if (!f) return;
  const receipt = booking({ confirmedAt: new Date(Date.now() - 120000).toISOString() });
  assert.deepEqual(await (await f.worker.fetch(signed(receipt), f.env)).json(), { accepted: true, matched: false });
  const saved = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = saved.headers.get('Set-Cookie').split(';')[0];
  assert.deepEqual(await (await f.worker.fetch(signed({ ...receipt, confirmedAt: now() }), f.env)).json(), { accepted: true, matched: false });
  assert.deepEqual(await (await f.status(cookie)).json(), { leadSaved: true, bookingStatus: 'pending' });
});

test('earlier authentic evidence removes an association outside the actual original booking window', async t => {
  const f = setup(t); if (!f) return;
  const saved = await f.worker.fetch(f.leadRequest(), f.env);
  const cookie = saved.headers.get('Set-Cookie').split(';')[0];
  const receipt = booking();
  assert.deepEqual(await (await f.worker.fetch(signed(receipt), f.env)).json(), { accepted: true, matched: true });
  const earlier = { ...receipt, confirmedAt: new Date(Date.now() - 120000).toISOString() };
  assert.deepEqual(await (await f.worker.fetch(signed(earlier), f.env)).json(), { accepted: true, matched: false });
  assert.deepEqual(await (await f.status(cookie)).json(), { leadSaved: true, bookingStatus: 'pending' });
});

test('exact legacy scheduler is accepted only with its 30-minute duration and a prior funnel lead', async t => {
  const f = setup(t); if (!f) return;
  await f.worker.fetch(f.leadRequest(), f.env);
  const receipt = booking({ scheduleTitle: BOOKING_TITLES[1] });
  assert.equal((await f.worker.fetch(signed(receipt), f.env)).status, 400);
  receipt.end = new Date(Date.parse(receipt.start) + 30 * 60000).toISOString();
  assert.equal((await f.worker.fetch(signed(receipt), f.env)).status, 200);
});

test('private receipt routes enforce method/host/size/field uniqueness and never become SPA success', async t => {
  const f = setup(t); if (!f) return;
  for (const [path, method, expected] of [['booking-status', 'POST', 405], ['booking-receipts', 'GET', 405], ['booking-status/', 'GET', 404]]) {
    assert.equal((await f.worker.fetch(new Request(`${origin}/api/ai-intensive/${path}`, { method }), f.env)).status, expected);
  }
  assert.equal((await f.worker.fetch(signed(booking(), { origin: 'http://taylorintelligence.ai' }), f.env)).status, 403);
  for (const raw of [' '.repeat(2049), JSON.stringify(booking()).replace('"status":"confirmed"', '"status":"confirmed","status":"cancelled"'), JSON.stringify({ ...booking(), submissionId: id })]) {
    assert.ok([400, 413].includes((await f.worker.fetch(signed({}, { raw }), f.env)).status));
  }
  const cross = await f.worker.fetch(new Request(`${origin}/api/ai-intensive/booking-status`, { headers: { Origin: 'https://attacker.invalid' } }), f.env);
  assert.equal(cross.status, 403);
  assert.equal(cross.headers.has('Access-Control-Allow-Origin'), false);
});

test('storage or secret failure never returns confirmed, cookie, redirect or private error details', async t => {
  const f = setup(t); if (!f) return;
  f.database.failReceipt = true;
  const saved = await f.worker.fetch(f.leadRequest(), f.env);
  assert.equal(saved.status, 503);
  assert.equal(saved.headers.has('Set-Cookie'), false);
  assert.equal(saved.headers.has('Location'), false);
  assert.equal((await saved.text()).includes(lead.email), false);
  f.database.failReceipt = false;
  const cookie = (await f.worker.fetch(f.leadRequest(), f.env)).headers.get('Set-Cookie').split(';')[0];
  delete f.env.TI_BOOKING_RECEIPT_KEY;
  assert.equal((await f.worker.fetch(signed(booking()), f.env)).status, 503);
  f.database.failRead = true;
  const status = await f.status(cookie);
  assert.equal(status.status, 503);
  assert.equal((await status.text()).includes('Private fixture'), false);
});
