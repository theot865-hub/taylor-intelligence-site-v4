# Taylor Intelligence — Orange portfolio review

Local redesign on `codex/orange-portfolio`, based on main `5d09f1a` (October 12, 2026).
**Not published. Do not push until the redesign is approved for production:** Cloudflare has deployed review branches to the canonical domain before a PR merge.

## Current direction: Celestial Atlas reference

The initial cream/editorial/tilted-card design was rejected. Theo explicitly requested something closer to TI v1: minimal but visually present, with orbiting elements. The original `f0269c5` Celestial Atlas was found in the iCloud v1 checkout and rendered as reference.

The current homepage uses a new, compact canvas interpretation: three mutually gravitating bodies with orange trails, compact destination links and a pause button. `three-body.js` solves Burrau’s Pythagorean initial-value problem: masses3:4:5 released from rest under unsoftened Newtonian gravity ([source](https://www.ucolick.org/~laugh/oxide/projects/burrau.html)). Adaptive RK4 step doubling resolves close passes; the display samples at120Hz of simulated time, independently of rendering. The scene starts18 simulated units into the run so trajectory history is already visible. Trails are sampled physical positions. The camera fits recent history and never changes the dynamics. There are no prescribed paths, central anchor, restoring force, damping, or automatic resets. The former figure-eight solution was rejected because its periodic appearance missed the intended behavior. Reduced-motion preference renders a still scene; animation stops offscreen and in hidden tabs. No new frontend dependency or image-generation service.

- `/`: orbital homepage, five client logos and four featured websites.
- `/websites`: Stone Design Concrete, Szolyd, Knot Normal, Tire X preview, and Adam’s Tires (past project).
- `/portfolio`: alias for `/websites`.
- `/services`, `/approach`, `/contact`, `/card`: existing routes and contact behavior, with shared styling.
- `/ai-intensive/`, `worker/`, checkout and tracking: unchanged from base.

`orange.css` owns the theme; `orbit.js` owns the scene and `three-body.js` its physics. `assets/work/` contains actual site screenshots captured October 12. The Tire X logo is the exact established white/red lockup retrieved from `https://taylorintelligence-test.ca/wp-content/themes/webdesignsun/assets/img/logo.svg`, replacing an obsolete concept in the local brand kit. Other original logos remain in `ai-intensive/logos/`.

Screenshots are dated portfolio snapshots. Big O and Omen are client logos; their sites are not attributed to TI. Sasquatch and CCT review builds remain excluded at Theo’s request (live sites plus Tire X only).

## Local review

Serve the folder with SPA fallback for the extensionless routes. The review server and QA evidence are outside the published assets at `/Users/theotaylor/Documents/Codex/2026-10-12/ti-orange-review/`. Preview: http://127.0.0.1:4188 . The public contact form is real; verification must not submit enquiries.

## Structure

```
index.html     routed page content and existing contact/router logic
orange.css     restrained orange atlas / portfolio design
orbit.js       three-body canvas rendering and motion controls
three-body.js  adaptive Newtonian three-body integrator
assets/        original logo and actual website screenshots
_redirects     Cloudflare Pages rewrites so /card etc. serve index.html
map/           build pipeline for the hairline Salish Sea coastline map
  build_map.py   fetch OSM coastline (Overpass) → stitch → simplify → map_data.json
  gen_svg.py     map_data.json → map_snippet.svg (paste into index.html)
  map_data.json  cached projected paths + city coords
  map_snippet.svg the <svg> currently embedded in the statement band
```

## Pages / routing

Client-side router (bottom of `index.html`). Reads the hash, or the last path
segment so bare paths work once `_redirects` is live.

- `/`            Home — statement + map, Services, closing CTA
- `/websites`    Website collection; `/portfolio` is an alias
- `/approach`    In-depth: 3-step method + per-service deep dives + Conduit + principles
- `/contact`     Contact form + direct details
- `/card`        alias → Contact (the QR / business-card landing)

Add a page: drop a `#page-x` block and add `x: true` to the `standalone` map
(and a `_redirects` line if it needs a bare path).

## Deployment

The production domain is **taylorintelligence.ai**. Cloudflare Workers Builds
deploys repository pushes automatically. On October9, the review branch
`codex/company-ai-intensive` deployed to the canonical domain before PR5 merged.
**A draft PR is not a deployment barrier with the current Cloudflare settings.**
Check the actual build and public URL after any push. `wrangler.jsonc` serves static assets
from this directory and routes `/api/checkout` to the server-only Worker.
`.assetsignore` excludes the Worker source, tests, credentials, README, Git files
and map pipeline from public assets. There is no frontend build command.

The existing contact form uses Web3Forms with its public client access key
already in the HTML. `_redirects` and the Worker's SPA fallback support the main
site's bare routes. Keep offer/copy changes on a review branch until approved.

## AI intensive — current revision (2026-10-12)

**October 12 price revision:** Theo set the company seat to CAD $1,200; additional employee observers remain CAD $100 each. Live one-time Stripe company Price `price_1UPpAmPUw9hCFj9HMR2kugF2` replaces the previous $2,000 Price for new checkouts. Confirmation preserves the exact historical Price and total for existing bookings, and purchase measurement uses the confirmed historical amount. The October 9 verification below is historical.

**Revision status:** offer, assets and live Stripe checkout verified October9,
2026. PR5 integrates the approved revision into `main`. `/api/checkout/status`
reports `ready: true`; the booking button opens live Stripe-hosted checkout.
The restricted key is stored only as Cloudflare secret `STRIPE_SECRET_KEY`.
Its only permission is Checkout Sessions: Write (includes Read), verified in
Stripe. Real unpaid hosted sessions showed CAD2,000 for the company seat and
CAD2,300 for one company plus three employee observers, with quantities1 and3.
Server confirmation returned the same totals/currency/counts and `unpaid/open`.
No card details, actual payment, paid receipt or meeting invitation were tested.
Historical October9 logs with `ready: false` describe the earlier unconfigured
state; they do not describe the current live checkout.

- Live route: [taylorintelligence.ai/ai-intensive/](https://taylorintelligence.ai/ai-intensive/). The existing route is retained for continuity; the current revision is a two-week group intensive for business owners.
- `ai-intensive/index.html`: standalone document, owner-facing offer, scope, price, booking links, FAQs and search/social metadata.
- `ai-intensive/style.css`: independent, compact mentoring layout. A split orange hero holds the complete offer, inclusion checklist, price and employee seat selector next to Theo’s supplied image of himself and Julian. The final design pass retains this split layout and modestly enlarges the full, uncropped photo: about10% on desktop/tablet, with16px extra width on phones. On phones (640px and below), the order is headline, full call image, company seat selector/payment, then longer introduction and inclusions. The short seat note retains the four-call/two-week facts beside the price. Mobile checklist checkmarks and decorative link arrows are hidden; seat +/− and FAQ controls remain usable. Larger screens keep the split layout. FAQs follow the hero. Small original-color logos remain in their white band near the top. The parent-site design is separate.
- Load motion is CSS-only: one staggered fade/rise on each page load, a full-frame photo entrance and small hover-arrow movement. Everything settles in about1.25seconds. No motion library or JavaScript required. `prefers-reduced-motion` disables entrances/hover movement; keyboard focus immediately reveals the focused animated group. Keep the static final layout/content visible when animations are unavailable.
- `ai-intensive/fonts/Manrope.ttf`: self-hosted variable font, no external font request. Original copyright and SIL OFL1.1 retained in `fonts/OFL.txt`. Source: [Google Fonts Manrope](https://github.com/google/fonts/tree/main/ofl/manrope).
- `ai-intensive/logos/`: original official client assets hosted locally.
- `ai-intensive/images/theo-julian-call.png`: October 9, 2026 portrait revision approved for publication. Theo’s actual supplied white-shirt photo and real expression are preserved over a generated, softly unfocused brutalist-apartment backdrop in the left video tile. No face or mouth edit is used. All pixels outside the left tile, Julian’s portrait, call controls and Theo’s original label are unchanged. Final 1672×941 PNG SHA256 `1e4adc34634f59e601893702dc4793e3bed1ee94da7b59ca48d7475c56f2df04`; original call image SHA256 `ac41e043e4f3f04ec0e626128396d026a166b21e5d23abc1c3cc2ebbbec6facc`. The background is generated; this composite is not an actual call recorded in that apartment. Private source photo, generation prompts, native Vision mask, reconstruction scripts and pixel audits remain in Theo’s local portable handoff, outside the public repository. Display the complete outer call frame at its original aspect ratio, including all application chrome and call controls; do not crop, clip or round its corners.
- `ai-intensive/images/orange-mentoring-background.jpg`: web-optimized derivative of one completed Higgsfield image, job `97ab4c12-93b9-4fd7-84d6-cd14ac73994c`, model `gpt_image_2_5`. Orange/apricot pigment and paper-grain background; no generated people. The generation quote was 0.25 credits; an actual debit was not separately checked.
- `ai-intensive/images/orange-mentoring-background-mobile.jpg`: separate portrait orange mesh gradient for phones, generated with Higgsfield on October 9, 2026 (completed job `26dcde81-b555-45b6-b22e-a9600e814f24`, model `gpt_image_2_5`). Light peach/orange behind the offer flows into richer tangerine below. The `max-width: 640px` rule selects it; larger screens use the original desktop artwork. The source PNG and exact prompt are retained in Theo's local portable handoff. No generated text or people. The generation quote was 0.25 credits; an actual debit was not separately checked.
- `ai-intensive/og.png`: current 1200×630 social poster using the same October 9 call composite and two-week group offer. This referenced social poster is included in the deployed static assets.
- Education link in `/services` points here; sitemap includes the route.

**Current offer:** four live shared group calls over two weeks, giving business
owners hands-on advice on incorporating AI into their own businesses. **$1,200
CAD per company seat** covers one business owner for all four calls. Additional
employees from that company can sit in and watch for **$100 CAD each** for the
full intensive. Dates/times are **to be announced**; do not restore the old
October 23 workshop date or invent call duration. Private company sessions are
an enquiry option: **“Ask about private sessions”**. No private price is set.

**Booking implementation:** `ai-intensive/checkout.js` calculates the visible
total and sends the chosen employee count to `POST /api/checkout`. The server
creates a genuine Stripe-hosted Checkout Session with company quantity 1 and
employee quantity N. It omits the employee item when N is zero. Prices, currency
and redirect URLs are controlled by the server. A standard Payment Link does not
have a supported URL quantity parameter, so do not replace this with a cosmetic
cart whose total differs at checkout.

`worker/checkout.mjs` uses `STRIPE_SECRET_KEY` from a Cloudflare **secret** and
`STRIPE_COMPANY_PRICE_ID` / `STRIPE_EMPLOYEE_PRICE_ID` bindings. Never place a key
in browser JavaScript, source, screenshots, logs or archives. Checkout retries
use an idempotency token; the server validates integer counts 0–99, same-origin
requests and exact CAD totals. 99 is a technical cap, not promised cohort
capacity. Native forms redirect with 303 when JavaScript is unavailable; the
numeric employee input remains usable. `GET /api/checkout/status` reports
configuration readiness. A return URL alone is not payment proof:
`GET /api/checkout/confirmation` checks the owned Stripe Session and exact total
before the page confirms a completed paid booking. No purchase is made by QA.

**Free fit calls and private enquiries:** A secondary outline button below
the payment controls says **“Not sure yet? Book a free fit call”**. It opens
[Theo’s existing 30-minute Google Calendar appointment
page](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1gTNRRjtUhFG3CoFfreS9iHhPiF3XYPo2QBchk6DxCt5HwHm_gLVUe3Z-rBEhu890-og5GPxIP),
also used by “Ask about private sessions”. It is outside the checkout form
and does not fire payment or purchase events. Its prior Chrome
read-back showed Theo Taylor, theo@taylorintelligence.ai, Vancouver time and
Meet information after booking. No new private booking was submitted. The
superseded $400 workshop Payment Link remains deactivated.

**Logo provenance:** Big O is the Victoria client, retained in its accessible
name. These marks identify client work, not purchases/testimonials/endorsement of
this new programme. Artwork/aspect ratios preserved; Szolyd symbol is paired with
its name; Omen source padding is compensated in CSS.

- Big O Tires Victoria: [official header PNG](https://www.bigotiresvictoria.com/Portals/50/logo.png)
- Szolyd: [official symbol SVG](https://szolyd.com/assets/img/szolyd-mark.svg)
- SD Concrete / Stone Design: [official lockup SVG](https://sdconcrete.com/assets/brand/sd-lockup.svg)
- Omen Foils: [official dark mark PNG](https://omenfoils.com/cdn/shop/files/FINAL_Black_Logo_Social.gif?format=png&v=1674710102)

The compact split hero and inclusion checklist follow Theo’s chosen
[AIwithMichal mentoring reference](https://aiwithmichal.com/ai-mentoring), using
original TI copy, branding and imagery. Theo’s final design pass reverts the larger image-centered rearrangement, keeping this split layout with only a modest photo enlargement. No copied testimonials, credentials,
subscriptions or recruiting claims. Theo explicitly retained the orange gradient
and contained logo band, requested more creative artwork, rejected the example
workflow diagram, numbered programme grid and dark pricing panel, and wanted the
FAQs higher. Do not restore those sections. Orange follows the business-card
direction; exact current card artwork was not located, so this is not claimed as
an exact palette match.

**Published October 6, 2026:** Theo explicitly authorized publication. PR#2 was merged at `56a6a4f39dfe19089a8e0af36f994b02e30e2d29`, including reviewed source `0ec5ae03e1eaadddf1fce3e56d5a2bfca1f68a16`. Cloudflare Workers Builds succeeded; the public route, original full-frame image/logos/font, current price, load motion and three booking links were verified live.

**Operations still to set:** group call dates/times, delivery capacity and final
terms/tax arrangements. Checkout is fixed at the displayed CAD total, with no
automatic tax or optional invoice added by this integration. Purchased companies
and employee quantities are in Stripe; Theo must send group call details and
manage delivery. No automatic meeting invitation, Conversions API or Meta campaign was
installed/launched. The October10 consent-based Meta Pixel is documented below. The former workshop
Meet event is historical and must not be used as the new group schedule. Keep
private links and funding notes outside public source.

**Editing and validation:** update scope/prices consistently in visible copy,
SEO metadata, social poster, server total checks and Stripe owned prices. Preserve
the full approved portrait, orange artwork, logo band and existing motion. Run
`node --test tests/*.test.mjs` for checkout and ad-measurement validation. Static preview:
`python3 -m http.server 4183 --bind 127.0.0.1` from the site root, then
`http://127.0.0.1:4183/ai-intensive/`. A static server cannot run the checkout API;
its booking button safely stays unavailable. For end-to-end local development,
use official Wrangler (`npx wrangler dev`) with a separate local test secret in
ignored `.dev.vars` and test Price IDs. Never use a real payment as routine QA.
No client Stripe SDK or publishable key is needed. Repository pushes can
auto-deploy review branches too; retain the portable handoff outside public
hosting and verify the actual public state after each push.

## Meta ad measurement (October10,2026)

Pixel **1281844947404157** came from Julian's email to Theo dated October10,
2026 at22:43:55−07:00 (Gmail message `1a1297d6d54b3768`). Its base code was
adapted into `ai-intensive/tracking.js`, on the intensive page only.

- No Meta SDK, beacon or cookies load until a visitor allows optional measurement.
  Decline and Allow are both available; footer **Ad choices** changes the decision.
  Consent lasts180days, and Global Privacy Control / Do Not Track override it.
- Only HTTPS canonical/www production hosts send events. Local/preview QA does
  not contaminate the pixel. Automatic events and advanced matching are disabled;
  no manual name, email, phone, form data or Stripe session token is sent to Meta.
- `PageView` and `ViewContent` identify the intensive after consent.
- `InitiateCheckout` fires only after the server returns a valid Stripe checkout
  destination, with the exact CAD1,200 + CAD100 per observer total and quantities.
  Repeated submission of the same attempt does not create another browser event.
- `Purchase` requires the server to verify paid + complete, the owned live offer,
  exact amount/currency and employee count. It uses a stable SHA256-derived opaque
  event ID, browser-persisted deduplication under a cross-tab Web Lock.
  No event is fabricated from a success query parameter or an unpaid session.
- The Stripe return token is removed from the visible URL before the Pixel loads.
  It stays in that tab's history state so confirmation can survive reload. Raw or
  encoded session tokens in the URL/referrer suppress the Pixel entirely.
- SDK loading, consent withdrawal, storage failure and ad blockers cannot prevent
  booking. Purchase is skipped when Web Locks or a durable deduplication claim are unavailable.
  The consent panel links to a short privacy disclosure and Meta's policy.

This is browser measurement, not Conversions API or a payment webhook. Purchases
can be missed when people decline, block Meta, close Stripe without returning,
or lack usable browser storage. Deduplication covers the current browser, not
other devices or cleared storage; events queued to Meta are not a delivery
receipt. No real paid purchase is submitted as routine verification, and Meta
Events Manager attribution/reporting must not be claimed from source tests alone.

## Regenerating the map

```
cd map
python3 build_map.py      # re-fetch + reproject coastline (needs network)
python3 gen_svg.py         # rebuild map_snippet.svg
# then paste map_snippet.svg over the <svg class="statement-map"> in index.html
```

Domain of record: **taylorintelligence.ai**. v4 is the production site;
the AI intensive landing page uses `/ai-intensive/`.

Three-body stability check: `node tests/three-body.test.mjs`. Checks energy, linear/angular momentum, centre of mass and finite state through close encounters and escape over150 simulated time units, plus convergence against tighter integration at a different output cadence. Opening hero is 420px desktop / 475px mobile to expose client logos and project imagery earlier.
