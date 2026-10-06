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

## AI guided implementation — campaign draft (2026-10-06)

- Route after approved deployment: `/ai-intensive/`. The existing route is retained for continuity; its offer is now a four-week programme.
- `ai-intensive/index.html`: standalone document, owner-facing offer, scope, price, booking links, FAQs and search/social metadata.
- `ai-intensive/style.css`: independent editorial design with oversized Manrope type, a vivid warm-orange hero, a purposeful workflow diagram, a four-week plan and charcoal investment section. Clear original-color logos remain in one small band near the top. The parent-site design is separate.
- `ai-intensive/fonts/Manrope.ttf`: self-hosted variable font, no external font request. Original copyright and SIL OFL1.1 retained in `fonts/OFL.txt`. Source: [Google Fonts Manrope](https://github.com/google/fonts/tree/main/ofl/manrope).
- `ai-intensive/logos/`: original official client assets hosted locally.
- `ai-intensive/og.png`: current 1200×630 social poster; new offer/price, no fixed workshop date.
- Education link in `/services` points here; sitemap includes the route.

**Current authorized draft offer:** four weeks of private guided implementation,
**$2,500 CAD per business**, one nominated employee and one agreed workflow.
Owner joins kickoff/outcome review. Four weekly90-minute working sessions,
three progress reviews between sessions, workflow testing, human review steps,
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
scope. An optional choice of direct checkout remains open, but the default
fit-call-first recommendation is implemented. There is no current programme
payment link on the page. The superseded course Stripe Payment Link is deactivated; its public checkout now refuses purchases. The product/price are retained historically.

**Logo provenance:** Big O is the Victoria client, retained in its accessible
name. These marks identify client work, not purchases/testimonials/endorsement of
this new programme. Artwork/aspect ratios preserved; Szolyd symbol is paired with
its name; Omen source padding is compensated in CSS.

- Big O Tires Victoria: [official header PNG](https://www.bigotiresvictoria.com/Portals/50/logo.png)
- Szolyd: [official symbol SVG](https://szolyd.com/assets/img/szolyd-mark.svg)
- SD Concrete / Stone Design: [official lockup SVG](https://sdconcrete.com/assets/brand/sd-lockup.svg)
- Omen Foils: [official dark mark PNG](https://omenfoils.com/cdn/shop/files/FINAL_Black_Logo_Social.gif?format=png&v=1674710102)

The orange direction follows Theo’s request; exact current business-card artwork
was not located, so this is not claimed as an exact palette match. Earlier
purple/decorative cards and faint recolored logos were rejected; do not restore.

**Before launch:** review/publish the concrete page; confirm delivery capacity,
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
booking/payment as a routine test. Main auto-deploys; keep this change on draft
PR#2 until publication is authorized.

## Regenerating the map

```
cd map
python3 build_map.py      # re-fetch + reproject coastline (needs network)
python3 gen_svg.py         # rebuild map_snippet.svg
# then paste map_snippet.svg over the <svg class="statement-map"> in index.html
```

Domain of record: **taylorintelligence.ai**. v4 is the production site;
the AI intensive change remains a draft until the review branch is merged.
