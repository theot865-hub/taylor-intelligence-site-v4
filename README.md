# Taylor Intelligence — site v4 · "Simple by design"

A lean, self-contained agency site. Pure white ground, single black hairline
weight, no frameworks, no build step. Everything (CSS, JS, the map SVG) is
inlined in `index.html`.

## Structure

```
index.html     the entire site — inline CSS + JS + SVG, no dependencies
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
- `/portfolio`   Selected work
- `/approach`    In-depth: 3-step method + per-service deep dives + Conduit + principles
- `/contact`     Contact form + direct details
- `/card`        alias → Contact (the QR / business-card landing)

Add a page: drop a `#page-x` block and add `x: true` to the `standalone` map
(and a `_redirects` line if it needs a bare path).

## Deployment

The production domain is **taylorintelligence.ai**. Cloudflare Workers Builds
deploys pushes to **main** automatically. `wrangler.jsonc` serves static assets
from this directory; `.assetsignore` excludes README, Git files and the map
pipeline. There is no application build command.

The existing contact form uses Web3Forms with its public client access key
already in the HTML. `_redirects` and the Worker's SPA fallback support the main
site's bare routes. Keep offer/copy changes on a review branch until approved.

## AI guided implementation — live (2026-10-06)

- Live route: [taylorintelligence.ai/ai-intensive/](https://taylorintelligence.ai/ai-intensive/). The existing route is retained for continuity; its offer is now a three-week programme.
- `ai-intensive/index.html`: standalone document, owner-facing offer, scope, price, booking links, FAQs and search/social metadata.
- `ai-intensive/style.css`: independent, compact mentoring layout. A split orange hero holds the complete offer, inclusion checklist, price and fit-call link next to Theo’s supplied image of himself and Julian. The final design pass retains this split layout and modestly enlarges the full, uncropped photo: about10% on desktop/tablet, with16px extra width on phones. FAQs follow immediately. Small original-color logos remain in their white band near the top. The parent-site design is separate.
- Load motion is CSS-only: one staggered fade/rise on each page load, a full-frame photo entrance and small hover-arrow movement. Everything settles in about1.25seconds. No motion library or JavaScript required. `prefers-reduced-motion` disables entrances/hover movement; keyboard focus immediately reveals the focused animated group. Keep the static final layout/content visible when animations are unavailable.
- `ai-intensive/fonts/Manrope.ttf`: self-hosted variable font, no external font request. Original copyright and SIL OFL1.1 retained in `fonts/OFL.txt`. Source: [Google Fonts Manrope](https://github.com/google/fonts/tree/main/ofl/manrope).
- `ai-intensive/logos/`: original official client assets hosted locally.
- `ai-intensive/images/theo-julian-call.png`: October 9, 2026 portrait revision approved for publication. Theo’s actual supplied white-shirt photo and real expression are preserved over a generated, softly unfocused brutalist-apartment backdrop in the left video tile. No face or mouth edit is used. All pixels outside the left tile, Julian’s portrait, call controls and Theo’s original label are unchanged. Final 1672×941 PNG SHA256 `1e4adc34634f59e601893702dc4793e3bed1ee94da7b59ca48d7475c56f2df04`; original call image SHA256 `ac41e043e4f3f04ec0e626128396d026a166b21e5d23abc1c3cc2ebbbec6facc`. The background is generated; this composite is not an actual call recorded in that apartment. Private source photo, generation prompts, native Vision mask, reconstruction scripts and pixel audits remain in Theo’s local portable handoff, outside the public repository. Display the complete outer call frame at its original aspect ratio, including all application chrome and call controls; do not crop, clip or round its corners.
- `ai-intensive/images/orange-mentoring-background.jpg`: web-optimized derivative of one completed Higgsfield image, job `97ab4c12-93b9-4fd7-84d6-cd14ac73994c`, model `gpt_image_2_5`. Orange/apricot pigment and paper-grain background; no generated people. The generation quote was 0.25 credits; an actual debit was not separately checked.
- `ai-intensive/images/orange-mentoring-background-mobile.jpg`: separate portrait orange mesh gradient for phones, generated with Higgsfield on October 9, 2026 (completed job `26dcde81-b555-45b6-b22e-a9600e814f24`, model `gpt_image_2_5`). Light peach/orange behind the offer flows into richer tangerine below. The `max-width: 640px` rule selects it; larger screens use the original desktop artwork. The source PNG and exact prompt are retained in Theo's local portable handoff. No generated text or people. The generation quote was 0.25 credits; an actual debit was not separately checked.
- `ai-intensive/og.png`: current 1200×630 social poster using the same October 9 call composite and three-week offer. This referenced social poster is included in the deployed static assets.
- Education link in `/services` points here; sitemap includes the route.

**Current published offer:** three weeks of private guided implementation,
**$2,500 CAD per business**, one nominated employee and one agreed workflow.
Owner joins kickoff/outcome review. Three weekly 90-minute working sessions,
two progress reviews between sessions, workflow testing, human review steps,
an operating guide and handover. Start date/times agreed together after the fit
call. Tool subscriptions, additional workflows and custom
software/integrations are scoped separately. This supersedes the earlier
fixed-date group workshop. No guaranteed savings/ROI or unlimited support.

**Booking:** all three `[data-booking-link]` anchors open Theo’s actual existing
[30-minute Google Calendar appointment page](https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1gTNRRjtUhFG3CoFfreS9iHhPiF3XYPo2QBchk6DxCt5HwHm_gLVUe3Z-rBEhu890-og5GPxIP) in the same tab. Verified
in Chrome: Theo Taylor under theo@taylorintelligence.ai, 30min, Vancouver time,
available appointment times, Google Meet information added after booking.
Existing schedule and availability were preserved. No appointment/test booking
or invitation submitted. No API keys, payment code, scheduler embed or third-party
JavaScript needed. Call is free; programme payment is handled after agreeing the
scope. The fit-call-first approach is implemented. There is no current programme
payment link on the page. The superseded course Stripe Payment Link is deactivated; its public checkout now refuses purchases. The product/price are retained historically.

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

**Operations to confirm:** delivery capacity,
final terms/tax/payment arrangements and Meta readiness. No conversion pixel,
Conversions API, purchase event or campaign was installed/launched. A fit call is
not a paid engagement. The earlier workshop Meet event is historical; programme
calls are scheduled individually. Keep private host links and business/financial
notes outside public source.

**Editing:** update price/scope consistently in visible copy, title/description,
OG/Twitter metadata, social image and any future payment link. Keep native booking
links accessible. No install/build step. To preview, run `python3 -m http.server
4183 --bind 127.0.0.1` from the site root. Open `http://127.0.0.1:4183/ai-intensive/`.
The main site’s local hash route is `/#/services`; production Workers handles
bare routes. Check destination and responsive layout without submitting a real
booking/payment as a routine test. Main auto-deploys; use a review branch for future changes. PR#2 is merged and the page is live.

## Regenerating the map

```
cd map
python3 build_map.py      # re-fetch + reproject coastline (needs network)
python3 gen_svg.py         # rebuild map_snippet.svg
# then paste map_snippet.svg over the <svg class="statement-map"> in index.html
```

Domain of record: **taylorintelligence.ai**. v4 is the production site;
the AI mentoring landing page is live at `/ai-intensive/`.
