// Private D1 storage for the campaign's free-call request. Never log lead data.
export const LEAD_SOURCE = "/ai-intensive/";
export const MARKETING_CONSENT_VERSION = "2026-10-14-v1";
export const MARKETING_CONSENT_TEXT = "Send me one practical AI tip each week for my business";
export const CALENDAR_URL = "https://calendar.google.com/calendar/appointments/schedules/AcZssZ1gTNRRjtUhFG3CoFfreS9iHhPiF3XYPo2QBchk6DxCt5HwHm_gLVUe3Z-rBEhu890-og5GPxIP";

const ROUTE = "/api/ai-intensive/leads";
const MAX_BYTES = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set(["name", "email", "marketingConsent", "submissionId", "website"]);
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

async function checkRateLimit(request, env) {
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
  const result = await limiter.limit({ key: `ti-ai-intensive-leads:v1:${ip}` });
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
function flatUniqueJSON(text) {
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
    if (seen.has(key) || !FIELDS.has(key)) throw new Error("Duplicate or unexpected field");
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
  if (result?.success !== true || ![0, 1].includes(result.meta?.changes)) throw new Error("Unconfirmed write");
  if (result.meta.changes === 1) return;
  const previous = await database.prepare(`
    SELECT submission_id, name, email, marketing_consent, consent_text, consent_version, source
    FROM ai_intensive_leads WHERE submission_id = ?
  `).bind(lead.submissionId).first();
  const columns = ["submission_id", "name", "email", "marketing_consent", "consent_text", "consent_version", "source"];
  if (!previous) throw new Error("Unconfirmed prior write");
  if (columns.some((column, index) => previous[column] !== values[index])) {
    throw new LeadError(409, "This request has already been saved with different details. Please refresh the page to start a new request.");
  }
}

// Only this private endpoint is handled here; there is no public list/export API.
export async function handleAIIntensiveLeads(request, env) {
  const type = (request.headers.get("Content-Type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const wantsJSON = type === "application/json";
  const url = new URL(request.url);
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
    await save(env.AI_INTENSIVE_LEADS, lead);
    if (!wantsJSON) return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: CALENDAR_URL } });
    return response({ saved: true, redirect: CALENDAR_URL }, 200, true);
  } catch (error) {
    const known = error instanceof LeadError;
    return response({ error: known ? error.message : "We could not save your request right now. Please try again shortly or contact Taylor Intelligence." }, known ? error.status : 503, wantsJSON, known ? error.headers : {});
  }
}
