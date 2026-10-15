# Private Calendar confirmation bridge

Lead capture and choosing a time are separate from a confirmed booking. After a
save, JSON returns the fixed relative path `/ai-intensive/thank-you/`; native POST
redirects there on the same canonical origin. That page embeds the verified
Google booking schedule, keeping the visitor on TI while Google handles the
appointment. The thank-you page must fetch `/api/ai-intensive/booking-status`; a page visit
or a saved lead must never emit a Schedule event by itself.

Every verified lead save (including native POST and an exact UUID retry) creates
a fresh 256-bit random receipt. The `ti_ai_call_receipt` cookie is HttpOnly,
Secure, SameSite=Lax, scoped to `/api/ai-intensive/booking-status`, and expires
after two hours. Only its SHA-256 hash is stored, tied to the existing submission
ID in `ai_intensive_receipts`. No name, email or receipt token is put into a URL,
localStorage, public JSON or Meta event. Apply migration
`0002_receipts_bookings.sql` before publishing this Worker. Missing receipt
storage fails closed before any cookie or thank-you redirect; the lead may have
been saved, so the same UUID can reconcile it on retry.

## Visitor status

GET `/api/ai-intensive/booking-status` requires the canonical same-origin browser
request and a valid, unexpired receipt. Without one it returns
`{"leadSaved":false,"bookingStatus":"unknown"}`. A valid lead receipt without
a trusted confirmation returns
`{"leadSaved":true,"bookingStatus":"pending"}`. A confirmed or cancelled
event returns only `leadSaved`, `bookingStatus`, and
`eventId: "ti-schedule-" + SHA256(providerEventUID)`. It never returns attendee
data, marketing consent, raw event UID, submission ID or raw tokens. Responses
are private/no-store and have no permissive CORS. A separate rate-limit key uses
the existing five-per-minute native limiter; polling must wait at least 15
seconds and respect 429 with `Retry-After: 60`. This does not consume lead-submit
quota. Browser privacy signals and Meta consent still govern event sending.

## Authenticated receipts

The existing HOST passive Gmail collector may submit authoritative Google event
creation/cancellation receipts and validated ICS evidence. It uses existing
mailbox access; there is no new Calendar OAuth permission, automatic appointment
creation, third-party message or scheduler change in this endpoint.

POST `/api/ai-intensive/booking-receipts` accepts exactly:

```json
{"eventId":"opaque-provider-uid","attendeeEmail":"person@example.invalid","start":"2026-10-16T17:00:00.000Z","end":"2026-10-16T17:15:00.000Z","status":"confirmed","scheduleTitle":"AI Intensive — free 15-minute call","confirmedAt":"2026-10-14T23:00:00.000Z"}
```

`X-TI-Timestamp` is Unix time in seconds and must be within five minutes of the
server. `X-TI-Signature` is 64 hexadecimal characters: HMAC-SHA256 over
`${timestamp}.${rawUTF8body}`, using the private `TI_BOOKING_RECEIPT_KEY`. The
Worker verifies it with Web Crypto `subtle.verify`. Use a dedicated random key;
never reuse a Stripe or mailbox credential. Keep the matching HOST key in the
existing private bridge config, never in Git, static assets or the handoff.
Signing authenticates the trusted bridge; that collector must independently
verify Google sender authentication, event creation/cancellation and ICS data.

Allowed exact titles are `AI Intensive — free 15-minute call` (15 minutes) and
the retained legacy `30 min with Theo` (30 minutes). The bridge must strip only
the validated provider attendee suffix before submission. Start, end and
confirmedAt require exact UTC ISO strings with milliseconds. A new event must
match an already-existing normalized campaign lead email, whose created_at is
between confirmedAt minus two hours and confirmedAt plus one minute. A valid
unmatched receipt is stored privately using only the provider UID hash,
normalized attendee email hash, immutable dates/title/status and receipt times;
its submission ID remains null. It cannot appear as a confirmed visitor booking.
Retries may reconcile a genuine prior-window lead later, but use the earliest
stored receipt timestamp so a fresh post-booking lead cannot shift the window.
Earlier authentic evidence also removes any former association outside that
original window. Atomic write guards and the public status join recheck the
chronology, so a concurrent receipt cannot expose a mismatched confirmation.
Never create a fresh lead to make a past booking appear verified. A confirmation timestamp cannot be more than five
minutes in the future. Confirmed appointments must start no earlier than five
minutes before confirmation, and within the next 366 days.

Only the provider UID and normalized attendee email's SHA-256 hashes are retained
in `ai_intensive_bookings`, with the matched submission ID when available, fixed
event dates/title, status and first/latest receipt time. UID
deduplication prevents duplicate bookings. Mismatched dates, title or attendee
cannot overwrite an existing UID. Older receipts cannot overwrite a newer
receipt, and cancellation is terminal for that UID; replaying confirmation never
undoes it. Genuine rescheduling/restoration with the same UID requires a separate
review instead of silently rewriting a verified receipt.

HTTP 200 returns only `{"accepted":true,"matched":true}` or the unmatched
equivalent, after exact primary-session D1 readback. Missing
authentication is 401; wrong fields/dates/titles are 400; immutable event conflict
is 409; configuration/storage uncertainty is 503. A matched receipt can still
be cancelled; accepted is not a public conversion claim. Keep unmatched or
failed bridge receipts pending for reconciliation. Never mark
them delivered based on HTTP arrival alone. No public bulk/export endpoint exists.

## Checks and operational evidence

Run `node --test tests/*.test.mjs`. Booking-receipt tests use both migrations in
real local SQLite and cover hashing, cookie expiry, same-origin/method guards,
forged/expired signatures, prior-lead chronology, deduplication, cancellation,
native redirects and failure cases. Fixture appointments do not establish
production health. Record the actual authenticated collector run, provider
confirmation, matching private D1 record and resulting status/event separately.
The visitor's two-hour receipt must still be valid; later direct thank-you visits
without it cannot prove a booking or emit a conversion. Expired-token cleanup
and retained booking-record review are separate private operational work.
