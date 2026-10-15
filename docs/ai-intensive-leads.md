# Campaign free-call lead storage

This endpoint saves a name and email before opening Theo's separate, confirmed
15-minute AI Intensive Calendar appointment page. Its publicly verified share
alias is https://calendar.app.google/xtN3MFTxaHHHUXPp8, with Google Meet and
Vancouver time. The frontend and server use the same fixed full schedule URL;
the agency's existing 30-minute general scheduler remains unchanged. This
endpoint does not book an appointment or send any email. The agency
Education checkout and Stripe configuration are unchanged.

`POST /api/ai-intensive/leads` accepts either JSON or a native URL-encoded form:

```json
{"name":"Example Person","email":"person@example.invalid","marketingConsent":false,"submissionId":"831fa0cb-9fbf-47a9-9a4f-784361d8700e","website":""}
```

The campaign form must show this separate, optional, initially unchecked choice:
“Send me one practical AI tip each week for my business”. Its server-owned version
is `2026-10-14-v1`. A false value means a
free-call/follow-up request only; it is not permission for marketing. A true value
records the displayed choice, not proof that a later campaign or sender complies
with every legal requirement. It records permission for that specific weekly tip
choice, not broader marketing. This implementation makes no CASL compliance claim.

The Worker records the fixed source `/ai-intensive/`, consent text/version,
choice and a database-generated UTC timestamp. It does not store IP addresses,
user agents or client-supplied redirect URLs in D1. The trusted edge IP is used
only for the transient Cloudflare rate-limit counter. There is no public export/list API,
no third-party email integration and no lead data in logs or error responses.
Name length is capped at 120 Unicode characters and the full request at 2,048
bytes. Email syntax validation is not deliverability verification.

JSON returns `{ "saved": true, "redirect": "https://calendar.google.com/..." }`
only after a confirmed save. The full redirect is a fixed server constant in
`worker/ai-intensive-leads.mjs`; it is never read from the client. Native forms
receive 303 only after that same save. Failures return a clear, safe message
without redirecting. JSON requires a UUIDv4 submission ID. The browser keeps
that ID for retries of one request. An exact retry does not add a row; changed
details or consent with the same ID receive 409. A new request needs a new ID.
For a no-JavaScript form without a generated hidden ID, the server assigns an ID;
independent repeated native submissions are separate requests, not deduplicated.

## Production configuration and verification

Theo explicitly authorized finishing and publishing this deliverable on October
14, 2026. The existing TI account now has the real database
`ti-ai-intensive-leads`, ID `cc82118a-1ded-4ae7-9f48-5d27d9699bd5`, in the
`AI_INTENSIVE_LEADS` binding. A deployment still requires the schema to be applied
and the actual save behavior verified. Missing D1 or rate-limit bindings return
503 and never claim a save. The deployment verification is:

1. Verify that this exact database and binding are in the existing TI account.
2. Apply the schema remotely and verify it through authenticated D1 access.
3. Deploy and verify the configured native Worker limiter
   `AI_INTENSIVE_LEAD_LIMITER`, namespace `2026101401`, five attempts per 60
   seconds per IP and Cloudflare location. A blocked request returns 429 with
   `Retry-After: 60`; no D1 write or redirect follows. A missing, throwing or
   unconfirmed limiter returns 503. Checkout and other routes use no lead quota.
4. Verify a saved consent-off record and optional consent-on record through
   the private dashboard, then remove clearly labelled QA records. Verify that
   failure never redirects and successful save opens the confirmed Calendar URL.
   Do not book a Calendar appointment or send marketing as a test.
5. Keep access and exports private under Theo's ownership. Retention/deletion
   review and the actual weekly-tip sending workflow remain operational follow-up;
   there is no automatic deletion schedule or marketing campaign in this code.

The native limiter is location-local and eventually consistent, so it is an
abuse control rather than exact global accounting. People on a shared IP share
the small quota and may need to wait a minute. The public form has no authenticated
user ID, so a trusted edge IP is used for this bounded anonymous endpoint. See
[Cloudflare's rate-limit documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

### Exact database setup

Run authenticated Wrangler from this repo on the authorized machine. Verify
`wrangler whoami` identifies the existing TI account before any remote command.
The database above was created with the following command; **do not create another
database on each deployment**:

```sh
wrangler d1 create ti-ai-intensive-leads
```

The top-level `wrangler.jsonc` already contains the real binding:

```jsonc
"d1_databases": [{
  "binding": "AI_INTENSIVE_LEADS",
  "database_name": "ti-ai-intensive-leads",
  "database_id": "cc82118a-1ded-4ae7-9f48-5d27d9699bd5",
  "migrations_dir": "migrations"
}]
```

Apply any unapplied migrations and verify the table:

```sh
wrangler d1 migrations apply ti-ai-intensive-leads --local
wrangler d1 migrations apply ti-ai-intensive-leads --remote
wrangler d1 execute ti-ai-intensive-leads --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_intensive_leads';"
```

The canonical deployment can happen on a repository branch push before a PR
merge, so a draft PR is not a deployment barrier. Wrangler 4.36.0 or newer
supports the configured `ratelimits` binding; this workspace has 4.147.0. The
limiter uses Cloudflare's trusted `CF-Connecting-IP` header, never a form field
or `X-Forwarded-For`. Local loopback D1 tests may omit the rate limiter; canonical
requests have no fail-open override. Bindings must also be declared explicitly
in any future named Wrangler environment.

### Private authenticated access and export

In the signed-in Cloudflare dashboard: select the verified TI account → Workers
& Pages → D1 SQL Database → `ti-ai-intensive-leads` → Console. Confirm that
`AI_INTENSIVE_LEADS` is attached to `taylor-intelligence-site-v4`. Only authorized
operators can read/export rows. Do not publish the database console, JSON or CSV.

For a private export, use a directory outside this static site, with a restrictive
umask. The command requires existing authenticated account access and prints
lead data only to the protected file:

```sh
mkdir -m 700 ../private-lead-exports
umask 077
wrangler d1 execute ti-ai-intensive-leads --remote --command "SELECT created_at,name,email,marketing_consent,source,consent_version,consent_text,submission_id FROM ai_intensive_leads ORDER BY created_at,submission_id;" --json > ../private-lead-exports/leads-2026-10-14.json
node scripts/export-ai-intensive-leads.mjs ../private-lead-exports/leads-2026-10-14.json ../private-lead-exports/leads-2026-10-14.csv
```

Use a fresh output filename for each export. The helper creates a new CSV with
mode 0600, quotes every cell and prefixes spreadsheet formula-like user input
(`=`, `+`, `-`, `@`, including leading whitespace/control characters) with an
apostrophe. The private JSON preserves the originals. CSV sanitization does not
remove the need to restrict access, and only consent-on rows may be considered
for the specific weekly tip choice and later separately authorized sending. The
helper has no network access.

## Local checks

```sh
node --test tests/*.test.mjs
```

`tests/ai-intensive-leads.test.mjs` checks rate-limit allow/reject/failure behavior,
routing, save/failure behavior,
strict validation, consent and idempotency with mocked D1 and checks the actual
SQL schema with local SQLite. `tests/ai-intensive-leads-export.test.mjs` checks
CSV injection protection and private file handling. Local D1 end-to-end testing
requires a local-only Wrangler config with a real local binding; never deploy
that local test config or fixture records. `.assetsignore` excludes the Worker,
schema, scripts, docs, tests and local Wrangler data from public static assets.
