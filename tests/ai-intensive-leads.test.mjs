import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createWorker } from "../worker/checkout.mjs";
import { CALENDAR_URL, THANK_YOU_PATH, LEAD_SOURCE, MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION } from "../worker/ai-intensive-leads.mjs";

const ORIGIN = "https://taylorintelligence.ai";
const ROUTE = "/api/ai-intensive/leads";
const ID = "831fa0cb-9fbf-47a9-9a4f-784361d8700e";
const base = { name: "Example Person", email: "person@example.invalid", marketingConsent: false, submissionId: ID, website: "" };
const columns = ["submission_id", "name", "email", "marketing_consent", "consent_text", "consent_version", "source"];

function storage(options = {}) {
  const rows = new Map();
  const receipts = new Map();
  const queries = [];
  const sessions = [];
  const database = {
    rows, receipts, queries, sessions,
    withSession(value) { sessions.push(value); return database; },
    prepare(sql) {
      return {
        bind(...values) {
          queries.push({ sql, values });
          return {
            async run() {
              if (sql.includes("INSERT INTO ai_intensive_receipts")) {
                receipts.set(values[0], { token_hash: values[0], submission_id: values[1], expires_at: values[2] });
                return { success: true, meta: { changes: 1 } };
              }
              if (options.failInsert) throw new Error("private person@example.invalid storage failure");
              if (options.unconfirmed) return { success: false, meta: { changes: 1 } };
              if (rows.has(values[0])) return { success: true, meta: { changes: options.conflictChanges ?? 0 } };
              rows.set(values[0], { ...Object.fromEntries(columns.map((column, index) => [column, values[index]])), created_at: new Date().toISOString(), ...options.storedOverrides });
              if (options.ambiguousOnce) { options.ambiguousOnce = false; throw new Error("private write acknowledgement lost"); }
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              if (sql.includes("FROM ai_intensive_receipts")) return receipts.get(values[0]) ?? null;
              if (options.failRead) throw new Error("private database information");
              if (options.falseRead) return false;
              return options.missingRead ? null : rows.get(values[0]) ?? null;
            },
          };
        },
      };
    },
  };
  return database;
}

function setup(options = {}) {
  const db = storage(options);
  const stripeCalls = [];
  const rateCalls = [];
  const worker = createWorker(async (...values) => { stripeCalls.push(values); throw new Error("Stripe must not be called"); });
  const env = {
    AI_INTENSIVE_LEADS: db,
    AI_INTENSIVE_LEAD_LIMITER: { async limit(options) { rateCalls.push(options); return { success: true }; } },
    ASSETS: { fetch: async request => new Response(`asset:${new URL(request.url).pathname}`) },
  };
  return { db, env, worker, stripeCalls, rateCalls };
}

function jsonRequest(body = base, headers = {}, origin = ORIGIN) {
  return new Request(`${origin}${ROUTE}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10", ...headers }, body: JSON.stringify(body) });
}

function rawRequest(body, type = "application/json", headers = {}) {
  return new Request(`${ORIGIN}${ROUTE}`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": type, "CF-Connecting-IP": "192.0.2.10", ...headers }, body });
}

test("real rate-limit contract uses only the trusted IP and a campaign-specific key before saving", async () => {
  const { db, env, worker, rateCalls } = setup();
  assert.equal((await worker.fetch(jsonRequest(base, { "X-Forwarded-For": "198.51.100.250" }), env)).status, 200);
  assert.deepEqual(rateCalls, [{ key: "ti-ai-intensive-leads:v1:192.0.2.10" }]);
  assert.equal(JSON.stringify(rateCalls).includes(base.email), false);
  assert.equal(JSON.stringify(rateCalls).includes(base.name), false);
  assert.equal(db.rows.size, 1);
  assert.equal((await worker.fetch(jsonRequest({ ...base, submissionId: "831fa0cb-9fbf-47a9-9a4f-784361d8700f" }, { "CF-Connecting-IP": "2001:0db8:0:0:0:0:0:1" }), env)).status, 200);
  assert.equal(rateCalls[1].key, "ti-ai-intensive-leads:v1:2001:db8::1");
});

test("five per-IP attempts are allowed, excess returns 429 without saving, and another IP is independent", async () => {
  const { db, env, worker } = setup();
  const counters = new Map();
  env.AI_INTENSIVE_LEAD_LIMITER = { async limit({ key }) {
    const count = (counters.get(key) ?? 0) + 1;
    counters.set(key, count);
    return { success: count <= 5 };
  } };
  for (let index = 0; index < 5; index++) {
    const submissionId = `831fa0cb-9fbf-47a9-9a4f-784361d8700${index}`;
    assert.equal((await worker.fetch(jsonRequest({ ...base, submissionId }), env)).status, 200);
  }
  const queryCount = db.queries.length;
  const rejected = await worker.fetch(jsonRequest(), env);
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("Retry-After"), "60");
  assert.equal(rejected.headers.has("Location"), false);
  const text = await rejected.text();
  assert.equal(text.includes('"saved":true'), false);
  assert.equal(text.includes(base.email), false);
  assert.equal(db.queries.length, queryCount);
  assert.equal(db.rows.size, 5);
  assert.equal((await worker.fetch(jsonRequest(base, { "CF-Connecting-IP": "198.51.100.20" }), env)).status, 200);
  assert.equal(db.rows.size, 6);
});

test("native rate-limit rejection shows a safe message without redirect or D1 write", async () => {
  const { db, env, worker } = setup();
  env.AI_INTENSIVE_LEAD_LIMITER = { async limit() { return { success: false }; } };
  const result = await worker.fetch(rawRequest(new URLSearchParams({ name: base.name, email: base.email }), "application/x-www-form-urlencoded"), env);
  assert.equal(result.status, 429);
  assert.equal(result.headers.get("Retry-After"), "60");
  assert.equal(result.headers.has("Location"), false);
  assert.match(await result.text(), /wait a minute/);
  assert.equal(db.queries.length, 0);
});

test("missing, throwing and unconfirmed production limiters fail closed before D1 without leaking details", async () => {
  for (const limiter of [undefined, {}, { async limit() { throw new Error(`private ${base.email}`); } }, { async limit() { return {}; } }, { async limit() { return { success: "true" }; } }, { async limit() { return null; } }]) {
    const { db, env, worker } = setup();
    env.AI_INTENSIVE_LEAD_LIMITER = limiter;
    const result = await worker.fetch(jsonRequest(), env);
    assert.equal(result.status, 503);
    assert.equal(result.headers.has("Location"), false);
    const text = await result.text();
    assert.equal(text.includes('"saved":true'), false);
    assert.equal(text.includes(base.email), false);
    assert.equal(text.includes("private"), false);
    assert.equal(db.queries.length, 0);
  }
});

test("missing or invalid trusted edge address fails closed and forwarding headers cannot substitute", async () => {
  const { db, env, worker, rateCalls } = setup();
  for (const address of ["", "1.2.3.999", "user@example.invalid", "192.0.2.1, 192.0.2.2", "::::", "[2001:db8::1]"]) {
    assert.equal((await worker.fetch(jsonRequest(base, { "CF-Connecting-IP": address, "X-Forwarded-For": "192.0.2.1" }), env)).status, 503);
  }
  assert.equal(rateCalls.length, 0);
  assert.equal(db.queries.length, 0);
});

test("loopback-only D1 testing can omit the limiter while production cannot; other routes do not consume lead quota", async () => {
  const { env, worker, rateCalls } = setup();
  for (const path of ["/", "/education/", "/api/checkout/status"]) {
    assert.equal((await worker.fetch(new Request(`${ORIGIN}${path}`), env)).status, 200);
  }
  assert.equal((await worker.fetch(new Request(`${ORIGIN}${ROUTE}`), env)).status, 405);
  assert.equal(rateCalls.length, 0);
  delete env.AI_INTENSIVE_LEAD_LIMITER;
  assert.equal((await worker.fetch(jsonRequest(), env)).status, 503);
  assert.equal((await worker.fetch(jsonRequest(base, { "CF-Connecting-IP": "" }, "http://127.0.0.1:4196"), env)).status, 200);
});

test("confirmed save records the exact optional weekly-tip choice, source and server timestamp before fixed redirect", async () => {
  const { db, env, worker, stripeCalls } = setup();
  const result = await worker.fetch(jsonRequest({ ...base, name: "  Example   Person  ", email: "Person@Example.Invalid" }), env);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { saved: true, redirect: THANK_YOU_PATH });
  assert.equal(result.headers.get("Cache-Control"), "no-store");
  assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
  assert.deepEqual(db.sessions, ["first-primary"]);
  const row = db.rows.get(ID);
  assert.equal(row.name, "Example Person");
  assert.equal(row.email, "person@example.invalid");
  assert.equal(row.marketing_consent, 0);
  assert.equal(row.consent_text, "Send me one practical AI tip each week for my business");
  assert.equal(row.consent_text, MARKETING_CONSENT_TEXT);
  assert.equal(row.consent_version, MARKETING_CONSENT_VERSION);
  assert.equal(row.source, LEAD_SOURCE);
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.equal(db.queries[0].sql.includes(base.email), false, "PII is bound, never interpolated into SQL");
  assert.equal(stripeCalls.length, 0);
});

test("omitted consent saves false, explicit true saves true, and no payment or email action is invoked", async () => {
  for (const value of [undefined, true]) {
    const { db, env, worker, stripeCalls } = setup();
    const body = { ...base };
    if (value === undefined) delete body.marketingConsent;
    else body.marketingConsent = value;
    assert.equal((await worker.fetch(jsonRequest(body), env)).status, 200);
    assert.equal(db.rows.get(ID).marketing_consent, value === true ? 1 : 0);
    assert.equal(stripeCalls.length, 0);
  }
});

test("native form redirects 303 only after a confirmed save and supports the unchecked fallback", async () => {
  for (const value of [undefined, "true", "false"]) {
    const { db, env, worker } = setup();
    const fields = { name: base.name, email: base.email, submissionId: "", website: "" };
    if (value !== undefined) fields.marketingConsent = value;
    const result = await worker.fetch(rawRequest(new URLSearchParams(fields), "application/x-www-form-urlencoded;charset=UTF-8"), env);
    assert.equal(result.status, 303);
    assert.equal(result.headers.get("Location"), `${ORIGIN}${THANK_YOU_PATH}`);
    assert.equal(result.headers.get("Cache-Control"), "no-store");
    const [row] = db.rows.values();
    assert.match(row.submission_id, /^[0-9a-f-]{36}$/);
    assert.equal(row.marketing_consent, value === "true" ? 1 : 0);
  }
});

test("exact UUID retries create one row; changed details or consent receive 409 without overwriting", async () => {
  const { db, env, worker } = setup();
  for (let index = 0; index < 3; index++) assert.equal((await worker.fetch(jsonRequest(), env)).status, 200);
  assert.equal(db.rows.size, 1);
  for (const changes of [{ marketingConsent: true }, { email: "different@example.invalid" }, { name: "Different Person" }]) {
    const result = await worker.fetch(jsonRequest({ ...base, ...changes }), env);
    assert.equal(result.status, 409);
    assert.equal(result.headers.has("Location"), false);
    assert.equal((await result.json()).saved, undefined);
    assert.equal(db.rows.get(ID).marketing_consent, 0);
    assert.equal(db.rows.get(ID).email, base.email);
    assert.equal(db.rows.get(ID).name, base.name);
  }
  assert.equal(db.rows.size, 1);
});

test("a stale D1 changes:1 count on a conflicted UUID cannot claim changed consent was saved", async () => {
  const { db, env, worker } = setup({ conflictChanges: 1 });
  const fields = new URLSearchParams({ name: base.name, email: base.email, submissionId: ID, website: "" });
  assert.equal((await worker.fetch(rawRequest(fields, "application/x-www-form-urlencoded"), env)).status, 303);
  assert.equal((await worker.fetch(rawRequest(fields, "application/x-www-form-urlencoded"), env)).status, 303);
  const changed = await worker.fetch(jsonRequest({ ...base, marketingConsent: true }), env);
  assert.equal(changed.status, 409);
  assert.equal(changed.headers.has("Location"), false);
  assert.equal((await changed.json()).saved, undefined);
  assert.equal(db.rows.size, 1);
  assert.equal(db.rows.get(ID).marketing_consent, 0);
  assert.equal((await worker.fetch(jsonRequest(), env)).status, 200, "the unchanged original remains an idempotent success");
});

test("a successful new-write acknowledgement cannot replace readback of the actual stored consent/details", async () => {
  for (const storedOverrides of [{ marketing_consent: 0 }, { name: "Different Person" }, { email: "different@example.invalid" }, { consent_text: "broader choice" }, { consent_version: "other-version" }, { source: "/other/" }]) {
    const { env, worker } = setup({ storedOverrides });
    const response = await worker.fetch(jsonRequest({ ...base, marketingConsent: true }), env);
    assert.equal(response.status, 409, JSON.stringify(storedOverrides));
    assert.equal(response.headers.has("Location"), false);
    assert.equal((await response.json()).saved, undefined);
  }
});

test("ambiguous acknowledgement fails closed, then the same UUID reconciles the already saved row", async () => {
  const { db, env, worker } = setup({ ambiguousOnce: true });
  const first = await worker.fetch(jsonRequest(), env);
  assert.equal(first.status, 503);
  assert.equal(first.headers.has("Location"), false);
  assert.equal((await first.json()).saved, undefined);
  assert.equal(db.rows.size, 1);
  assert.equal((await worker.fetch(jsonRequest(), env)).status, 200);
  assert.equal(db.rows.size, 1);
});

test("missing binding, failed write and unconfirmed write never produce success or redirect", async () => {
  for (const options of [{ failInsert: true }, { unconfirmed: true }, {}]) {
    const { env, worker } = setup(options);
    if (!Object.keys(options).length) delete env.AI_INTENSIVE_LEADS;
    for (const request of [jsonRequest(), rawRequest(new URLSearchParams({ name: base.name, email: base.email }), "application/x-www-form-urlencoded")]) {
      const result = await worker.fetch(request, env);
      const text = await result.text();
      assert.equal(result.status, 503);
      assert.equal(result.headers.has("Location"), false);
      assert.equal(text.includes("saved"), false);
      assert.equal(text.includes(base.email), false);
      assert.equal(text.includes("private"), false);
      assert.equal(text.includes(CALENDAR_URL), false);
    }
  }
});

test("both new and repeated writes with failed, absent or false readback cannot claim a save", async () => {
  for (const option of ["failRead", "missingRead", "falseRead"]) {
    const options = { [option]: true };
    const { db, env, worker } = setup(options);
    const first = await worker.fetch(jsonRequest(), env);
    assert.equal(first.status, 503);
    assert.equal(first.headers.has("Location"), false);
    assert.equal((await first.json()).saved, undefined);
    assert.equal(db.rows.size, 1, "an acknowledged insert can exist while readback is unavailable");
    options[option] = false;
    assert.equal((await worker.fetch(jsonRequest(), env)).status, 200, "readback can reconcile the existing row");
    options[option] = true;
    const retry = await worker.fetch(jsonRequest(), env);
    assert.equal(retry.status, 503);
    assert.equal((await retry.json()).saved, undefined);
  }
});

test("name, email, consent and UUID validation prevent writes and do not echo PII", async () => {
  const { db, env, worker } = setup();
  const cases = [
    { name: "" }, { name: " " }, { name: null }, { name: 10 }, { name: [] }, { name: "a".repeat(121) }, { name: "Name\nInjected" },
    { email: "" }, { email: null }, { email: [] }, { email: "person" }, { email: "person@localhost" }, { email: "person@-bad.invalid" },
    { email: "person@example..invalid" }, { email: ".person@example.invalid" }, { email: "per..son@example.invalid" }, { email: "person@ex ample.invalid" },
    { email: "person@example.invalid\r\n" }, { email: `${"x".repeat(65)}@example.invalid` },
    { marketingConsent: "true" }, { marketingConsent: "false" }, { marketingConsent: "on" }, { marketingConsent: 1 }, { marketingConsent: null }, { marketingConsent: {} },
    { submissionId: "" }, { submissionId: null }, { submissionId: "fixed-id" }, { submissionId: 1 }, { submissionId: "831fa0cb-9fbf-17a9-9a4f-784361d8700e" },
    { website: "https://spam.invalid" }, { website: null }, { website: false },
  ];
  for (const changes of cases) {
    const result = await worker.fetch(jsonRequest({ ...base, ...changes }), env);
    assert.equal(result.status, 400, JSON.stringify(changes));
    assert.equal(result.headers.has("Location"), false);
    assert.equal((await result.text()).includes(base.email), false);
  }
  assert.equal(db.queries.length, 0);
});

test("malformed, null, nested and duplicate JSON including escaped keys are rejected", async () => {
  const { db, env, worker } = setup();
  const valid = JSON.stringify(base);
  const cases = ["{", "null", "[]", '"text"', "false", valid.replace('"marketingConsent":false', '"marketingConsent":true,"marketingConsent":false'),
    valid.replace('"name":"Example Person"', '"name":"Example Person","na\\u006de":"Different Person"'),
    valid.replace('"name":"Example Person"', '"name":{"a":1}'), valid.replace('"website":""', '"website":[""]'),
    valid.replace('"website":""', '"website":"","redirect":"https://attacker.invalid"'),
  ];
  for (const body of cases) assert.equal((await worker.fetch(rawRequest(body), env)).status, 400, body);
  assert.equal(db.queries.length, 0);
});

test("duplicate native fields, unknown fields and non-boolean checkbox values are rejected", async () => {
  const { db, env, worker } = setup();
  const fields = new URLSearchParams({ name: base.name, email: base.email, submissionId: ID, website: "" }).toString();
  for (const extra of ["&name=Another", "&email=other%40example.invalid", "&marketingConsent=true&marketingConsent=false", "&website=", "&source=other", "&marketingConsent=on"]) {
    assert.equal((await worker.fetch(rawRequest(fields + extra, "application/x-www-form-urlencoded"), env)).status, 400);
  }
  assert.equal(db.queries.length, 0);
});

test("same-origin evidence and approved request hosts are mandatory; no permissive CORS", async () => {
  const { db, env, worker } = setup();
  for (const headers of [{ Origin: "https://attacker.invalid" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }, { "Sec-Fetch-Site": "same-site" }]) {
    assert.equal((await worker.fetch(jsonRequest(base, headers), env)).status, 403);
  }
  const noEvidence = new Request(`${ORIGIN}${ROUTE}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(base) });
  assert.equal((await worker.fetch(noEvidence, env)).status, 403);
  for (const origin of ["https://unapproved.example", "http://taylorintelligence.ai", "https://taylorintelligence.ai.attacker.invalid"]) {
    assert.equal((await worker.fetch(jsonRequest(base, {}, origin), env)).status, 403);
  }
  assert.equal(db.queries.length, 0);
  for (const origin of ["https://www.taylorintelligence.ai", "http://localhost:9047", "http://127.0.0.1:9047", "http://[::1]:9047"]) {
    const local = setup();
    assert.equal((await local.worker.fetch(jsonRequest(base, {}, origin), local.env)).status, 200);
  }
  const evidence = setup();
  const result = await evidence.worker.fetch(new Request(`${ORIGIN}${ROUTE}`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", "CF-Connecting-IP": "192.0.2.10" }, body: JSON.stringify(base) }), evidence.env);
  assert.equal(result.status, 200);
});

test("declared and streamed request limits and invalid UTF-8 fail before D1", async () => {
  const { db, env, worker } = setup();
  for (const length of ["2049", "bad", "-1"]) assert.equal((await worker.fetch(jsonRequest(base, { "Content-Length": length }), env)).status, 413);
  assert.equal((await worker.fetch(rawRequest(" ".repeat(2049)), env)).status, 413);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } });
  const invalid = new Request(`${ORIGIN}${ROUTE}`, { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.10" }, body: stream, duplex: "half" });
  assert.equal((await worker.fetch(invalid, env)).status, 400);
  assert.equal(db.queries.length, 0);
});

test("unknown API routes and methods cannot become static success responses or expose exports", async () => {
  const { db, env, worker } = setup();
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS"]) {
    const result = await worker.fetch(new Request(`${ORIGIN}${ROUTE}`, { method }), env);
    assert.equal(result.status, 405);
    assert.equal(result.headers.get("Allow"), "POST");
    assert.equal(result.headers.has("Access-Control-Allow-Origin"), false);
  }
  for (const path of ["/api/ai-intensive", "/api/ai-intensive/export", "/api/ai-intensive/leads/", "/api/ai-intensive/leads/status"]) {
    assert.equal((await worker.fetch(new Request(`${ORIGIN}${path}`), env)).status, 404);
  }
  assert.equal((await worker.fetch(rawRequest("name=x", "text/plain"), env)).status, 415);
  assert.equal(db.queries.length, 0);
  for (const path of ["/", "/education/", "/ai-intensive/"]) assert.equal(await (await worker.fetch(new Request(`${ORIGIN}${path}`), env)).text(), `asset:${path}`);
});

test("Unicode names and quoted SQL-looking content remain parameter data", async () => {
  const { db, env, worker } = setup();
  const name = "李 O'Brien'); DROP TABLE ai_intensive_leads; --";
  assert.equal((await worker.fetch(jsonRequest({ ...base, name }), env)).status, 200);
  assert.equal(db.queries[0].sql.includes(name), false);
  assert.equal(db.queries[0].values[1], name);
  assert.equal(db.rows.get(ID).name, name);
});

function sqlite(sql, context) {
  try { return execFileSync("sqlite3", [":memory:"], { input: `.bail on\n.mode json\n${readFileSync(new URL("../migrations/0001_ai_intensive_leads.sql", import.meta.url), "utf8")}\n${sql}`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); }
  catch (error) { if (error.code === "ENOENT") { context.skip("Local SQLite CLI is unavailable"); return null; } throw error; }
}

test("actual SQLite schema defaults consent false, timestamps in UTC and ignores duplicate IDs without changing consent", t => {
  const text = sqlite(`
    INSERT INTO ai_intensive_leads (submission_id,name,email,consent_text,consent_version,source)
    VALUES ('${ID}','Example Person','person@example.invalid','weekly tip','test-v1','/ai-intensive/');
    INSERT INTO ai_intensive_leads (submission_id,name,email,marketing_consent,consent_text,consent_version,source)
    VALUES ('${ID}','Changed Person','changed@example.invalid',1,'weekly tip','test-v1','/ai-intensive/') ON CONFLICT(submission_id) DO NOTHING;
    SELECT count(*) AS count,marketing_consent,name,email,created_at,source FROM ai_intensive_leads;`, t);
  if (text === null) return;
  const [row] = JSON.parse(text);
  assert.equal(row.count, 1);
  assert.equal(row.marketing_consent, 0);
  assert.equal(row.name, "Example Person");
  assert.equal(row.email, base.email);
  assert.equal(row.source, LEAD_SOURCE);
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test("actual SQLite constraints reject ambiguous consent, blank required names and wrong source", t => {
  if (sqlite("SELECT 1;", t) === null) return;
  const values = ["2,'Example Person','/ai-intensive/'", "NULL,'Example Person','/ai-intensive/'", "0,'','/ai-intensive/'", "0,'Example Person','/other/'"];
  for (const value of values) {
    const [consent, ...rest] = value.split(",");
    const name = rest[0];
    const source = rest[1];
    assert.throws(() => sqlite(`INSERT INTO ai_intensive_leads (submission_id,marketing_consent,name,email,consent_text,consent_version,source) VALUES ('${ID}',${consent},${name},'person@example.invalid','weekly tip','test-v1',${source});`, t), /Command failed/);
  }
});
