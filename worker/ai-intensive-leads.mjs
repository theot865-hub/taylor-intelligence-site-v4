// Private D1 storage for the campaign's free-call request. Never log lead data.
export const LEAD_SOURCE = "/ai-intensive/";
export const MARKETING_CONSENT_VERSION = "2026-10-14-v1";
export const MARKETING_CONSENT_TEXT = "Send me one practical AI tip each week for my business";
export const CALENDAR_URL = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C";
export const THANK_YOU_PATH = "/ai-intensive/thank-you/";
export const RECEIPT_COOKIE = "ti_ai_call_receipt";
export const RECEIPT_AGE_SECONDS = 7200;
export const BOOKING_TITLES = Object.freeze(["AI Intensive — free 15-minute call", "30 min with Theo"]);

const ROUTE = "/api/ai-intensive/leads";
const STATUS_ROUTE = "/api/ai-intensive/booking-status";
const RECEIPTS_ROUTE = "/api/ai-intensive/booking-receipts";
const MAX_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set(["name", "email", "marketingConsent", "submissionId", "website"]);
const BOOKING_FIELDS = new Set(["eventId", "attendeeEmail", "start", "end", "status", "scheduleTitle", "confirmedAt"]);
const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

class LeadError extends Error {
  constructor(status, message, headers = {}) { super(message); this.status = status; this.headers = headers; }
}

function response(data, status, wantsJSON, extraHeaders = {}) {
  const body = wantsJSON ? JSON.stringify(data) : data.error ?? "Your request was saved.";
  return new Response(body, {
    status,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": wantsJSON ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function loopback(url) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && ["http:", "https:"].includes(url.protocol);
}

function sameOrigin(request) {
  const url = new URL(request.url);
  const local = loopback(url);
  const canonical = ["https://taylorintelligence.ai", "https://www.taylorintelligence.ai"].includes(url.origin);
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if ((!local && !canonical) || (origin && origin !== url.origin)
      || (site && site !== "same-origin" && site !== "none")
      || (!origin && site !== "same-origin")) {
    throw new LeadError(403, "Please submit your request from the Taylor Intelligence page.");
  }
}

async function checkRateLimit(request, env, prefix = "ti-ai-intensive-leads:v1") {
  const local = loopback(new URL(request.url));
  const limiter = env?.AI_INTENSIVE_LEAD_LIMITER;
  // A loopback-only D1 test can run without the provider binding. Canonical
  // requests must have the real binding; no production fail-open switch exists.
  if (local && !limiter) return;
  if (typeof limiter?.limit !== "function") throw new Error("Rate limiter unavailable");
  const address = request.headers.get("CF-Connecting-IP") ?? (local ? "127.0.0.1" : "");
  let ip;
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address) && address.split(".").every(part => Number(part) <= 255)) ip = address;
  else if (/^[a-f0-9:]{2,45}$/i.test(address)) {
    try { ip = new URL(`http://[${address}]/`).hostname.slice(1, -1); } catch { /* Fail closed below. */ }
  }
  if (!ip) throw new Error("Trusted request address unavailable");
  // Cloudflare sets this header at the edge. Do not use X-Forwarded-For or a
  // form field. The address is used only for a transient Cloudflare counter,
  // never written to D1, exported or logged by this code.
  const result = await limiter.limit({ key: `${prefix}:${ip}` });
  if (result?.success === false) {
    throw new LeadError(429, "Please wait a minute before submitting another request.", { "Retry-After": "60" });
  }
  if (result?.success !== true) throw new Error("Unconfirmed rate-limit result");
}

async function limitedText(request) {
  const length = request.headers.get("Content-Length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) {
    throw new LeadError(413, "Your request is too large. Please shorten the name and email fields.");
  }
  if (!request.body) throw new LeadError(400, "Please enter your name and email.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new LeadError(413, "Your request is too large. Please shorten the name and email fields.");
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

// The contract has only primitive fields. JSON.parse validates the whole input;
// this second pass detects duplicate decoded keys, including escaped spellings.
// Nested objects/arrays are rejected rather than allowing ambiguous payloads.
function flatUniqueJSON(text, fields = FIELDS) {
  const object = JSON.parse(text);
  if (!object || typeof object !== "object" || Array.isArray(object)) throw new Error("Object required");
  let offset = 0;
  const seen = new Set();
  const space = () => { while (/\s/.test(text[offset] ?? "") && offset < text.length) offset++; };
  const string = () => {
    const start = offset++;
    while (offset < text.length) {
      if (text[offset] === "\\") offset += 2;
      else if (text[offset++] === '"') return JSON.parse(text.slice(start, offset));
    }
    throw new Error("Incomplete string");
  };
  space();
  if (text[offset++] !== "{") throw new Error("Object required");
  space();
  while (text[offset] !== "}") {
    if (text[offset] !== '"') throw new Error("Key required");
    const key = string();
    if (seen.has(key) || !fields.has(key)) throw new Error("Duplicate or unexpected field");
    seen.add(key);
    space();
    if (text[offset++] !== ":") throw new Error("Colon required");
    space();
    if (text[offset] === '"') string();
    else {
      if (text[offset] === "{" || text[offset] === "[") throw new Error("Primitive required");
      while (offset < text.length && text[offset] !== "," && text[offset] !== "}") offset++;
    }
    space();
    if (text[offset] === "}") break;
    if (text[offset++] !== ",") throw new Error("Comma required");
    space();
  }
  return object;
}

function validEmail(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value) || /\s/u.test(value.trim())) return null;
  const email = value.trim().toLowerCase();
  const [local, domain, extra] = email.split("@");
  if (!local || !domain || extra !== undefined || email.length > 254 || local.length > 64
      || local.startsWith(".") || local.endsWith(".") || local.includes("..")
      || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}

async function input(request, wantsJSON) {
  let body;
  try {
    const text = await limitedText(request);
    if (wantsJSON) body = flatUniqueJSON(text);
    else {
      const fields = new URLSearchParams(text);
      for (const key of fields.keys()) {
        if (!FIELDS.has(key) || fields.getAll(key).length !== 1) throw new Error("Duplicate or unexpected field");
      }
      body = Object.fromEntries(fields);
    }
  } catch (error) {
    if (error instanceof LeadError) throw error;
    throw new LeadError(400, "Your request could not be read. Please check the form and try again.");
  }

  if (typeof body.name !== "string" || /[\u0000-\u001f\u007f]/.test(body.name)) {
    throw new LeadError(400, "Please enter your name (up to 120 characters).");
  }
  const name = body.name.trim().replace(/\s+/gu, " ");
  if (!name || [...name].length > 120) throw new LeadError(400, "Please enter your name (up to 120 characters).");
  const email = validEmail(body.email);
  if (!email) throw new LeadError(400, "Please enter a valid email address.");

  let marketingConsent = body.marketingConsent ?? false;
  // An omitted, unchecked field means false; an explicit null is invalid JSON.
  if (body.marketingConsent === null) throw new LeadError(400, "Please check your email consent choice and try again.");
  if (!wantsJSON) {
    if (marketingConsent === "true") marketingConsent = true;
    else if (marketingConsent === "false") marketingConsent = false;
  }
  if (typeof marketingConsent !== "boolean") throw new LeadError(400, "Please check your email consent choice and try again.");

  if (body.website !== undefined && (typeof body.website !== "string" || body.website.length > 200 || body.website !== "")) {
    throw new LeadError(400, "Your request could not be accepted. Please return to the form and try again.");
  }
  const rawID = !wantsJSON && (body.submissionId === undefined || body.submissionId === "")
    ? crypto.randomUUID() : body.submissionId;
  if (typeof rawID !== "string" || !UUID.test(rawID)) throw new LeadError(400, "Please refresh the page and submit the form again.");
  return { name, email, marketingConsent, submissionId: rawID.toLowerCase() };
}

async function save(binding, lead) {
  // Sequential consistency when D1 read replication is enabled. The fallback
  // exists for simple local test doubles, not another storage backend.
  const database = typeof binding.withSession === "function" ? binding.withSession("first-primary") : binding;
  const values = [lead.submissionId, lead.name, lead.email, Number(lead.marketingConsent), MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION, LEAD_SOURCE];
  const result = await database.prepare(`
    INSERT INTO ai_intensive_leads
      (submission_id, name, email, marketing_consent, consent_text, consent_version, source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO NOTHING
  `).bind(...values).run();
  if (result?.success !== true) throw new Error("Unconfirmed write");
  // D1's reported change count is not proof of the stored consent or payload.
  // Always read the row in this primary session, including after a new insert.
  // Only the exact persisted record can authorize saved:true or a redirect.
  const previous = await database.prepare(`
    SELECT submission_id, name, email, marketing_consent, consent_text, consent_version, source
    FROM ai_intensive_leads WHERE submission_id = ?
  `).bind(lead.submissionId).first();
  const columns = ["submission_id", "name", "email", "marketing_consent", "consent_text", "consent_version", "source"];
  if (!previous) throw new Error("Unconfirmed stored record");
  if (columns.some((column, index) => previous[column] !== values[index])) {
    throw new LeadError(409, "This request has already been saved with different details. Please refresh the page to start a new request.");
  }
  return database;
}

const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const session = binding => typeof binding.withSession === "function" ? binding.withSession("first-primary") : binding;

function databaseBinding(env) {
  if (!env?.AI_INTENSIVE_LEADS || typeof env.AI_INTENSIVE_LEADS.prepare !== "function") throw new Error("Private storage unavailable");
  return session(env.AI_INTENSIVE_LEADS);
}

async function createReceipt(database, submissionId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await digest(token);
  const expiresAt = Date.now() + RECEIPT_AGE_SECONDS * 1000;
  const result = await database.prepare(`
    INSERT INTO ai_intensive_receipts (token_hash, submission_id, expires_at)
    VALUES (?, ?, ?)
  `).bind(tokenHash, submissionId, expiresAt).run();
  if (result?.success !== true) throw new Error("Unconfirmed receipt write");
  const stored = await database.prepare(`
    SELECT token_hash, submission_id, expires_at FROM ai_intensive_receipts WHERE token_hash = ?
  `).bind(tokenHash).first();
  if (!stored || stored.token_hash !== tokenHash || stored.submission_id !== submissionId || stored.expires_at !== expiresAt) {
    throw new Error("Unconfirmed stored receipt");
  }
  return `${RECEIPT_COOKIE}=${token}; Path=${STATUS_ROUTE}; Max-Age=${RECEIPT_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function cookieToken(request) {
  const values = (request.headers.get("Cookie") ?? "").split(";")
    .map(part => part.trim()).filter(part => part.startsWith(`${RECEIPT_COOKIE}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(RECEIPT_COOKIE.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}

async function bookingStatus(request, env) {
  if (request.method !== "GET") return response({ error: "Method not allowed." }, 405, true, { Allow: "GET" });
  try {
    sameOrigin(request);
    const token = cookieToken(request);
    if (!token) return response({ leadSaved: false, bookingStatus: "unknown" }, 200, true);
    await checkRateLimit(request, env, "ti-ai-intensive-booking-status:v1");
    const database = databaseBinding(env);
    const stored = await database.prepare(`
      SELECT r.submission_id, r.expires_at, b.status, b.event_uid_hash
      FROM ai_intensive_receipts r
      JOIN ai_intensive_leads l ON l.submission_id = r.submission_id
      LEFT JOIN ai_intensive_bookings b ON b.submission_id = r.submission_id
        AND julianday(l.created_at) >= julianday(b.first_receipt_at) - 7200.0 / 86400
        AND julianday(l.created_at) <= julianday(b.first_receipt_at) + 60.0 / 86400
      WHERE r.token_hash = ? AND r.expires_at > ?
      ORDER BY b.last_receipt_at DESC LIMIT 1
    `).bind(await digest(token), Date.now()).first();
    if (!stored || !UUID.test(stored.submission_id ?? "") || !Number.isSafeInteger(stored.expires_at) || stored.expires_at <= Date.now()) {
      return response({ leadSaved: false, bookingStatus: "unknown" }, 200, true);
    }
    if (stored.status === null || stored.status === undefined) return response({ leadSaved: true, bookingStatus: "pending" }, 200, true);
    if (!["confirmed", "cancelled"].includes(stored.status) || !/^[a-f0-9]{64}$/.test(stored.event_uid_hash ?? "")) {
      throw new Error("Invalid stored booking");
    }
    return response({ leadSaved: true, bookingStatus: stored.status, eventId: `ti-schedule-${stored.event_uid_hash}` }, 200, true);
  } catch (error) {
    const known = error instanceof LeadError;
    return response({ error: known ? error.message : "Booking verification is unavailable. Please try again shortly." }, known ? error.status : 503, true, known ? error.headers : {});
  }
}

function isoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? date : null;
}

async function authenticatedBooking(request, env) {
  const secret = env?.TI_BOOKING_RECEIPT_KEY;
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 256) throw new Error("Receipt verification unavailable");
  const timestamp = request.headers.get("X-TI-Timestamp") ?? "";
  const signature = request.headers.get("X-TI-Signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp) * 1000) > 300000
      || !/^[a-f0-9]{64}$/i.test(signature)) throw new LeadError(401, "Receipt authentication failed.");
  let raw;
  try { raw = await limitedText(request); } catch (error) {
    if (error instanceof LeadError) throw error;
    throw new LeadError(400, "Receipt could not be read.");
  }
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = new Uint8Array(signature.match(/../g).map(part => parseInt(part, 16)));
  if (!await crypto.subtle.verify("HMAC", key, bytes, encoder.encode(`${timestamp}.${raw}`))) {
    throw new LeadError(401, "Receipt authentication failed.");
  }
  let booking;
  try { booking = flatUniqueJSON(raw, BOOKING_FIELDS); } catch { throw new LeadError(400, "Receipt payload is invalid."); }
  if (Object.keys(booking).length !== BOOKING_FIELDS.size
      || typeof booking.eventId !== "string" || !/^[a-z0-9@._:-]{1,512}$/i.test(booking.eventId)
      || !BOOKING_TITLES.includes(booking.scheduleTitle) || !["confirmed", "cancelled"].includes(booking.status)) {
    throw new LeadError(400, "Receipt payload is invalid.");
  }
  const email = validEmail(booking.attendeeEmail);
  const start = isoDate(booking.start);
  const end = isoDate(booking.end);
  const confirmed = isoDate(booking.confirmedAt);
  const duration = booking.scheduleTitle === BOOKING_TITLES[0] ? 15 * 60000 : 30 * 60000;
  if (!email || !start || !end || !confirmed || end - start !== duration || confirmed.getTime() > Date.now() + 300000
      || (booking.status === "confirmed" && (start < new Date(confirmed.getTime() - 300000) || start - confirmed > 366 * 86400000))) {
    throw new LeadError(400, "Receipt dates or attendee are invalid.");
  }
  return { ...booking, attendeeEmail: email, attendeeHash: await digest(email), eventHash: await digest(booking.eventId), confirmed };
}

async function storeBooking(database, booking) {
  const read = () => database.prepare(`
    SELECT b.event_uid_hash, b.submission_id, b.attendee_email_hash, b.start_at, b.end_at, b.status, b.schedule_title, b.first_receipt_at, b.last_receipt_at, l.email AS attendee_email, l.created_at AS lead_created_at
    FROM ai_intensive_bookings b LEFT JOIN ai_intensive_leads l ON l.submission_id = b.submission_id
    WHERE b.event_uid_hash = ?
  `).bind(booking.eventHash).first();
  const prior = await read();
  let submissionId = prior?.submission_id ?? null;
  if (prior && (prior.attendee_email_hash !== booking.attendeeHash || (submissionId && prior.attendee_email !== booking.attendeeEmail) || prior.start_at !== booking.start
      || prior.end_at !== booking.end || prior.schedule_title !== booking.scheduleTitle)) {
    throw new LeadError(409, "Receipt conflicts with the stored event.");
  }
  const priorDate = prior ? isoDate(prior.first_receipt_at) : null;
  if (prior && !priorDate) throw new Error("Invalid stored receipt date");
  // A later delivery/retry cannot move the matching window forward and make
  // a lead created after an earlier trusted booking count as a prior lead.
  const matchTime = Math.min(booking.confirmed.getTime(), priorDate?.getTime() ?? Infinity);
  const before = new Date(matchTime - RECEIPT_AGE_SECONDS * 1000).toISOString();
  const after = new Date(matchTime + 60000).toISOString();
  if (submissionId) {
    const leadDate = isoDate(prior.lead_created_at);
    if (!leadDate) throw new Error("Invalid stored lead date");
    // Out-of-order authentic evidence can reveal an earlier booking time. A
    // former association outside that original window must no longer confirm.
    if (prior.lead_created_at < before || prior.lead_created_at > after) submissionId = null;
  }
  if (!submissionId) {
    const lead = await database.prepare(`
      SELECT submission_id FROM ai_intensive_leads
      WHERE email = ? AND source = ? AND created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC, submission_id DESC LIMIT 1
    `).bind(booking.attendeeEmail, LEAD_SOURCE, before, after).first();
    if (lead && !UUID.test(lead.submission_id ?? "")) throw new Error("Invalid stored prior lead");
    submissionId = lead?.submission_id ?? null;
  }
  // An older confirmation cannot undo a cancellation, including concurrent or
  // replayed bridge deliveries. Event dates/title/lead are immutable per UID.
  const result = await database.prepare(`
    INSERT INTO ai_intensive_bookings
      (event_uid_hash, submission_id, attendee_email_hash, start_at, end_at, status, schedule_title, first_receipt_at, last_receipt_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(event_uid_hash) DO UPDATE SET
      submission_id = CASE WHEN excluded.submission_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM ai_intensive_leads l WHERE l.submission_id = excluded.submission_id
          AND julianday(l.created_at) >= julianday(min(ai_intensive_bookings.first_receipt_at, excluded.first_receipt_at)) - 7200.0 / 86400
          AND julianday(l.created_at) <= julianday(min(ai_intensive_bookings.first_receipt_at, excluded.first_receipt_at)) + 60.0 / 86400
      ) THEN excluded.submission_id ELSE NULL END,
      status = CASE WHEN ai_intensive_bookings.status = 'cancelled' THEN 'cancelled'
        WHEN excluded.last_receipt_at >= ai_intensive_bookings.last_receipt_at THEN excluded.status ELSE ai_intensive_bookings.status END,
      first_receipt_at = min(ai_intensive_bookings.first_receipt_at, excluded.first_receipt_at),
      last_receipt_at = max(ai_intensive_bookings.last_receipt_at, excluded.last_receipt_at)
    WHERE excluded.attendee_email_hash = ai_intensive_bookings.attendee_email_hash
      AND excluded.start_at = ai_intensive_bookings.start_at
      AND excluded.end_at = ai_intensive_bookings.end_at
      AND excluded.schedule_title = ai_intensive_bookings.schedule_title
  `).bind(booking.eventHash, submissionId, booking.attendeeHash, booking.start, booking.end, booking.status, booking.scheduleTitle, booking.confirmedAt, booking.confirmedAt).run();
  if (result?.success !== true) throw new Error("Unconfirmed booking write");
  const stored = await read();
  if (!stored || stored.event_uid_hash !== booking.eventHash || stored.submission_id !== submissionId
      || stored.attendee_email_hash !== booking.attendeeHash
      || stored.start_at !== booking.start || stored.end_at !== booking.end || stored.schedule_title !== booking.scheduleTitle
      || (submissionId && stored.attendee_email !== booking.attendeeEmail) || !["confirmed", "cancelled"].includes(stored.status)
      || !isoDate(stored.first_receipt_at) || !isoDate(stored.last_receipt_at)) throw new Error("Unconfirmed stored booking");
  if (stored.last_receipt_at === booking.confirmedAt && booking.status === "cancelled" && stored.status !== "cancelled") {
    throw new Error("Unconfirmed cancellation");
  }
  return Boolean(submissionId);
}

async function bookingReceipt(request, env) {
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405, true, { Allow: "POST" });
  try {
    const url = new URL(request.url);
    if (!loopback(url) && !["https://taylorintelligence.ai", "https://www.taylorintelligence.ai"].includes(url.origin)) {
      throw new LeadError(403, "Receipt host is unavailable.");
    }
    if ((request.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      throw new LeadError(415, "Receipt requires JSON.");
    }
    const booking = await authenticatedBooking(request, env);
    const matched = await storeBooking(databaseBinding(env), booking);
    return response({ accepted: true, matched }, 200, true);
  } catch (error) {
    const known = error instanceof LeadError;
    return response({ error: known ? error.message : "Booking receipt could not be verified right now." }, known ? error.status : 503, true, known ? error.headers : {});
  }
}

// No public list/export API. Trusted confirmation and visitor receipt routes
// are distinct from the lead form and from any payment integration.
export async function handleAIIntensiveLeads(request, env) {
  const type = (request.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const wantsJSON = type === "application/json";
  const url = new URL(request.url);
  if (url.pathname === STATUS_ROUTE) return bookingStatus(request, env);
  if (url.pathname === RECEIPTS_ROUTE) return bookingReceipt(request, env);
  if (url.pathname !== ROUTE) return response({ error: "Not found." }, 404, wantsJSON);
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405, wantsJSON, { Allow: "POST" });
  try {
    sameOrigin(request);
    if (!["application/json", "application/x-www-form-urlencoded"].includes(type)) {
      throw new LeadError(415, "Use the name and email form to submit your request.");
    }
    await checkRateLimit(request, env);
    const lead = await input(request, wantsJSON);
    if (!env?.AI_INTENSIVE_LEADS || typeof env.AI_INTENSIVE_LEADS.prepare !== "function") {
      throw new LeadError(503, "We could not save your request right now. Please try again shortly or contact Taylor Intelligence.");
    }
    const database = await save(env.AI_INTENSIVE_LEADS, lead);
    const cookie = await createReceipt(database, lead.submissionId);
    if (!wantsJSON) return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: new URL(THANK_YOU_PATH, request.url).href, "Set-Cookie": cookie } });
    return response({ saved: true, redirect: THANK_YOU_PATH }, 200, true, { "Set-Cookie": cookie });
  } catch (error) {
    const known = error instanceof LeadError;
    return response({ error: known ? error.message : "We could not save your request right now. Please try again shortly or contact Taylor Intelligence." }, known ? error.status : 503, wantsJSON, known ? error.headers : {});
  }
}
