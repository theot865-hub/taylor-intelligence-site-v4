# Taylor Intelligence — Agency site

Local branch `codex/green-portfolio`, built from v4 review `3ae0462` and authored green v3 `0df7132`.
**Publication authorized by Theo on October 12, 2026.** Cloudflare can deploy review branches to the canonical domain before a PR merge; verify the exact build and public content after every push.

## Current review direction

Theo's October12 direction combines the original curved white panels, Archivo Black typography and animated terrain with monochrome shading, birds and the professional TI monogram/Manrope wordmark. The black curved homepage headline reads “One agency for everything” The homepage is a compact overview: Websites → Marketing → Education → Software & agents → Team → Contact.

- Local review: `/Users/theotaylor/Work/Sites/ti-green-review-20261012`, http://127.0.0.1:4191/.
- Dedicated pages: `/websites/`, `/marketing/`, `/education/`, `/software/` and `/principles/`.
- Header: Services, Team, Our Socials, Principles, Let’s talk. Each dropdown matches its trigger width. Team links to the homepage studio section; Principles links to four principles on its own page.
- Our Socials currently links only to the confirmed `https://www.instagram.com/taylorintelligence/` profile. Other agency profile URLs are pending Theo/Julian; no personal or guessed profiles added.
- `/portfolio` redirects to `/websites/`. Legacy `/services`, `/approach`, `/contact`, `/card` retain homepage section behavior.
- Original green reference remains at4190; previous orange review at4188.

## Assets and code

Static HTML, no frontend build step. `site-base.css` contains the extracted original panel/terrain styles; `terrain.js` contains the terrain renderer and independent bird flight. `green.css` adds the portfolio layout; `service-pages.css` adds shared navigation and standalone service layouts. `green.js` handles disclosures, mobile navigation, legacy section aliases and contact feedback. `lead-form.js` retains UTM/page metadata behavior. Form success requires both HTTP success and `{success:true}`; test requests are intercepted, never sent.

The landscape keeps its birds, pause control and hidden-tab suspension. Neural chains, explorer routes and ridge pulses are removed. Viewport-aware world width and100px overscan prevent exposed edges. Screens up to1100px and reduced-motion preferences use a still frame.

The client strip uses five original logos. Tire X preserves the red X with black wireframe TIRE/CANADA lettering on transparent ground. The homepage initially shows Stone Design, Szolyd and Knot Normal; a right-side disclosure reveals Tire X, labelled as a review build. The dedicated Websites page shows all four. Adam’s Tires, Sasquatch and CCT concepts are excluded. Big O and Omen are client logos, not website credits.

Marketing cards use original colour Meta, Google Ads, Instagram, TikTok and Facebook vector marks (`assets/brands/SOURCES.md`), plus the coded Brand scaling illustration. Software uses clearly labelled illustrative workspace/agent diagrams and explains Agentic as a Service; Tire X software remains in development. Education reuses the full Theo/Julian call image and existing checkout script. Principles are draft brand copy for review: people, usefulness, clarity and learning.

Website purchase is CAD1,500 upfront; CAD500/month maintenance and SEO must be activated separately at launch (see `docs/website-checkout.md`). Education remains CAD1,200/company plus CAD100/employee observer for four calls over two weeks. Marketing and software are scoped individually; fit-call links use the existing Google Calendar schedule. The campaign `/ai-intensive/` keeps its independent layout and offer. Its labels, heading punctuation, fonts and images share the October12 cleanup. This agency redesign preserves the October 12 CAD1,200 Stripe configuration, Worker and checkout scripts.

Review scripts and screenshots live outside the deploy bundle in `/Users/theotaylor/Documents/Codex/2026-10-12/ti-orange-review/`. October12 multipage QA covered six routes at320/390/800/1150/1625px, image decoding, no horizontal overflow/runtime errors, education selector readiness/totals, exact dropdown dimensions, Escape dismissal and navigation. No payment or enquiry submitted.

## October12 cleanup and motion pass

The current direction removes decorative numbered overlines and repeated micro-slogans. Page labels are only Websites, Marketing, Education, Software / AgAAS and Principles. Headings have no decorative full stops. The expressive curved headlines remain; secondary headings use quieter, direct wording. Links use a restrained underline rather than repeated diagonal arrows. Header chevrons sit close to their labels, with more even navigation spacing; dropdowns still match their triggers.

Scrolling uses native browser behavior, with no wheel interception or animation dependency. Five chained full-screen drop shadows were the measured bottleneck: repeated isolated local Chromium scroll tests improved from median83.3ms to16.7ms/frame after removing them. A lightweight SVG cap and white rectangle replace the long panel mask, retaining the original curve and the viewport docking mask. These are local comparisons, not guarantees for every device.

Birds retain the flock and gain individually timed departures, banked swoops, glides and smooth returns. The terrain reuses coordinate buffers/jitter/gradients and skips redundant point lighting when WebGL is rendering. Pause/reduced-motion/hidden-tab behavior remains. Keep the grayscale filter on the terrain; the removed filters are the edge-outline shadows only.

Fullframe WebP images use responsive srcsets; originals are retained. Education image:2,509,286 bytes original to70,960 full-size/37,204 responsive. Four work previews total766KB original to399KB full-size/152KB responsive. Both fonts are local WOFF2 (43KB combined); licenses and sources in `assets/fonts/`. Font width comparisons matched the previous files exactly. There are no Google Fonts requests, new dependencies or paid hosting requirements from this pass. Final responsive and motion evidence is stored outside the deploy bundle.

## Deployment

**Policy-page follow-up (October12):** standalone `/privacy/` and `/terms/` pages are absent from this deployment. Their broken agency-footer links were removed; the campaign’s inline privacy disclosure and consent controls remain intact. Historical v2 policy pages need review against current Stripe, optional Meta measurement and newsletter handling before restoration. No new legal terms were created.

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

## Education landing-page comparison — October 12

Theo authorized publication of the agency redesign and the second education design. `/ai-intensive/` is the existing compact campaign page; `/education/` keeps the agency contour intro and uses the same orange artwork, client logos and CAD1,200 + CAD100 observer offer. The alternate design is not yet an active randomized or equivalently measured A/B experiment. Only `/ai-intensive/` loads consent-based Meta measurement; both checkout return URLs currently point there. Match consent/event behavior and persist an originating variant before interpreting comparative conversion results. No campaign or ad spending is launched by publication.

Prepublication audit: 47 existing tests pass and 355 local asset references resolve. Responsive and visual checks are recorded above. Newsletter signups are requests sent to the existing enquiry inbox, not enrollment in a managed mailing platform.
