# AI Intensive Calendly flow

## Current preparation

Prepared locally from main `425c7d7b2db1a7b84d78baf927e6b509c0d21cad`; not pushed
or published. Root verified the owned free 15-minute event in Calendly's saved
editor: Google Meet, connected Theo Google account, Vancouver time. The sole
public field in `ai-intensive/book/calendly-config.js` is configured:

```js
window.TICalendlyConfig = Object.freeze({ eventUrl: 'https://calendly.com/theo-taylorintelligence/ai-intensive' });
```

Use HTTPS `calendly.com/<owner>/<event>` without query/hash or credentials.
Empty/invalid values load no widget and show Theo's email fallback. **Do not
publish the empty state.** Preserve availability, existing bookings and all
unrelated agency/Education/payment settings.

Keep Calendly's confirmation behavior at default: our parent page navigates
after the official completed-booking event. A competing provider redirect can
race that event. Native redirect is a paid feature and is unnecessary here.
Keep optional redirect detail-passing off because it can expose names, email
and answers in the URL. Never hide Calendly's cookie/privacy controls.

The runtime loads the official widget.js and calls initInlineWidget. The
container uses data-auto-load="false" to disable the vendor class auto-scan;
manual initialization runs once with the configured URL. Without that guard,
the vendor scans the class before export and throws while reading a missing
data-url. The
mobile container has no minimum width and reaches the viewport edges, avoiding
320px provider content overflowing narrow-page gutters. Verify the actual
owned event at 320/390px and desktop before publication.

## Browser evidence and Meta

Only `calendly.event_scheduled` from exact origin `https://calendly.com` and
the actual widget iframe's contentWindow is accepted. Earlier progress,
unrelated frames, malformed payloads and mismatched event/invitee URI pairs
cannot navigate or convert. The provider-namespaced event plus invitee identity
is SHA256-hashed into the existing opaque Schedule ID format.

Only version, source, opaque ID and completion time enter sessionStorage.
The marker is valid for 15 minutes, rejects future/unknown fields and remains
in the booking tab. A new flow clears the previous marker. If a readable old
marker cannot be cleared, use the ordinary separate-tab provider fallback.
If new hashing/storage fails, scheduling remains valid and clean thank-you
navigation still works, but there is no new confirmation/measurement claim.

The thank-you page gives fresh Calendly completion priority over legacy data.
It calls the distinct observedCalendlySchedule method, without fabricating
leadSaved or a server receipt. Marker freshness is rechecked at actual SDK,
consent and locked-claim dispatch. Existing optional consent, GPC/DNT,
revocation and durable cross-tab claims suppress duplicate Schedule events.
The page sends no Purchase, price, currency, names, email, raw URIs or answers.

This is browser-observed completion. A person can edit their own browser state;
no API lookup, signed webhook or server attestation is claimed. A direct URL,
query flag or missing/expired marker alone cannot convert. Provider confirmation
is the operational record; browser dispatch does not prove Meta receipt,
attribution, attendance or paid demand. A separate provider tab cannot send the
parent completion event; its confirmation email remains authoritative.
With JavaScript blocked entirely, email Theo to arrange the call.

## Legacy and consent boundaries

No Calendly booking creates a TI D1 lead or uses the Google-mail receipt bridge.
Preserve existing Google appointments, D1 data, private endpoints, HMAC key and
ordinary HOST collector. No automatic Google status request occurs on the
default thank-you page. The explicit “Check an earlier Google booking” action
starts the preserved private-cookie check; URL flags never establish proof.

Removing duplicate fields does not enroll anyone in marketing. Root saved the
Calendly question “Weekly AI tips (optional)” as Checkboxes, Required false,
with one option: “Yes, email me weekly AI tips from Taylor Intelligence. I can
unsubscribe at any time.” Preserve its optional unchecked choice and separate
Meta ad choice. The provider stores the booking answer; this source does not
copy it into D1 or start an email pipeline. A saved answer is not an email
automation or delivery receipt. Root also saved and read back nine upcoming
date-specific availability windows; provider settings remain account-owned. Paid fulfilment, group dates,
Education and ad funding remain their own gates. No new API secret, webhook,
account plan, database migration or timer is needed.

## Tests and release

```sh
node --test tests/*.test.mjs
```

Tests use inert widget windows and local WebCrypto, never real provider bookings
or Meta traffic. They cover origin/source spoofing, bad URI pairs, duplicates,
marker shape/TTL/future/storage, default direct visits, explicit legacy access,
consent/privacy/revocation, delayed SDK and freshness, cross-tab claims, and
existing Google/Purchase behavior.

Before publication: verify the owned event, host, duration, availability,
joining provider and visible consent/banner. Perform one authorized test
booking: details collected once, correct provider confirmation, automatic clean
thank-you navigation and at most one Schedule after optional ad consent.
Check actual 320/390px/desktop layout, keyboard use and fallback. Julian must
check actual Events Manager receipt/attribution separately. No unrelated
appointment cancellation or plan purchase is implied.

Root owns publication. Any pushed branch can deploy canonical before merge;
a draft PR is not a barrier. Preserve the portable patch/test evidence.
Rollback changed static booking/thank-you/tracker files to the verified main
base if needed; backend/database/collector rollback is unnecessary.

Official references:
- [Advanced JS embed](https://calendly.com/help/advanced-calendly-embed-for-developers)
- [Parent-window events](https://developer.calendly.com/api-docs/overview/embedding/notifying-the-parent-window)
- [Native redirect/detail passing](https://calendly.com/help/how-to-redirect-invitees-to-another-site-after-booking)
