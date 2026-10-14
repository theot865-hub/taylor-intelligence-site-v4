-- Private campaign lead records. This migration is excluded from public assets.
-- An unchecked marketing box is false, independent of the free-call request.
CREATE TABLE ai_intensive_leads (
  submission_id TEXT PRIMARY KEY NOT NULL CHECK(length(submission_id) = 36),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK(marketing_consent IN (0, 1)),
  consent_text TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source = '/ai-intensive/'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX ai_intensive_leads_created_at ON ai_intensive_leads(created_at);
