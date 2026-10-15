-- Only hashes of visitor tokens and provider event UIDs are retained.
-- These private tables and migrations are excluded from public static assets.
CREATE TABLE ai_intensive_receipts (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  submission_id TEXT NOT NULL REFERENCES ai_intensive_leads(submission_id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL CHECK(typeof(expires_at) = 'integer' AND expires_at > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX ai_intensive_receipts_expiry ON ai_intensive_receipts(expires_at);

CREATE TABLE ai_intensive_bookings (
  event_uid_hash TEXT PRIMARY KEY NOT NULL CHECK(length(event_uid_hash) = 64 AND event_uid_hash NOT GLOB '*[^0-9a-f]*'),
  submission_id TEXT REFERENCES ai_intensive_leads(submission_id) ON DELETE CASCADE,
  attendee_email_hash TEXT NOT NULL CHECK(length(attendee_email_hash) = 64 AND attendee_email_hash NOT GLOB '*[^0-9a-f]*'),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('confirmed', 'cancelled')),
  schedule_title TEXT NOT NULL CHECK(schedule_title IN ('AI Intensive — free 15-minute call', '30 min with Theo')),
  first_receipt_at TEXT NOT NULL,
  last_receipt_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK(julianday(start_at) IS NOT NULL AND julianday(end_at) > julianday(start_at)),
  CHECK(julianday(first_receipt_at) IS NOT NULL AND julianday(last_receipt_at) >= julianday(first_receipt_at))
);
CREATE INDEX ai_intensive_bookings_lead ON ai_intensive_bookings(submission_id, last_receipt_at);
CREATE INDEX ai_intensive_leads_email_time ON ai_intensive_leads(email, created_at);
