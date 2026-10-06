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

## AI intensive landing page — campaign draft (2026-10-06)

- URL after an approved deployment: `/ai-intensive/`.
- `ai-intensive/index.html`: independent static document, course copy, price,
  schedule, direct booking CTAs and search/social metadata.
- `ai-intensive/style.css`: compact cream page with plain dark typography,
  a restrained orange-gradient rule, square controls and readable original-color
  client logos in one small horizontal band near the top. This supersedes the decorative gradient versions
  after Theo’s October 6 feedback. The actual current business-card artwork was
  not located, so the orange palette is an approximation, not an exact match.
- `ai-intensive/logos/`: four unmodified official client assets, hosted locally.
- `ai-intensive/og.png`: campaign-specific 1200×630 social preview.
- Linked from the Education section of `/services`; included in `sitemap.xml`.

Draft offer: Friday **October 23, 2026**, **12–5 pm Pacific time**, live on Google Meet,
**$400 CAD per guest**. CAD is the working currency assumption from the local
business context; confirm the full offer in review before publishing. Vancouver
observes PDT (UTC−7) on that date; the page uses “Pacific time” to avoid a fixed
UTC−8 interpretation of PST.

The buyer is a business owner who sends a nominated employee, or attends
themselves. The day works through choosing a task, building/reviewing an AI
workflow, and preparing a first team trial. This is a focused Education offer.

**Logo provenance:** Big O is the Victoria client; its accessible name retains that location. The logos identify
client work, not course participants, testimonials or a franchise endorsement.
Original artwork and aspect ratios are preserved. Szolyd’s original symbol is
paired with a plain-text name; Omen’s official dark mark is shown on a light surface; its transparent source
padding is compensated in CSS without altering the image file.

- Big O Tires Victoria: [official header PNG](https://www.bigotiresvictoria.com/Portals/50/logo.png)
- Szolyd: [official symbol SVG](https://szolyd.com/assets/img/szolyd-mark.svg)
- SD Concrete / Stone Design: [official lockup SVG](https://sdconcrete.com/assets/brand/sd-lockup.svg)
- Omen Foils: [official dark mark PNG](https://omenfoils.com/cdn/shop/files/FINAL_Black_Logo_Social.gif?format=png&v=1674710102)

**Booking flow — live Stripe checkout:** all three `[data-booking-link]`
anchors open [the course booking link](https://book.stripe.com/cNicN71uu2t2bml2lneIw00)
in the same tab. Checkout is a one-time CAD $400 for one guest, with email/full
name required and business name optional. It was created in the Taylor
Intelligence Stripe merchant and independently opened/read back in live mode.
No payment was submitted. The landing page needs no API keys or payment script.

Stripe’s successful-payment confirmation is configured with the date/time,
Google Meet joining URL and attendee follow-up instructions. Standard successful
payment receipts are enabled and saved. These configurations have been read
back; actual payment, receipt delivery and the paid confirmation path remain
untested. The private Meet URL stays outside this public source.

**Before campaign launch:** approve/publish the offer; confirm participant
logistics; configure/test any desired Meta conversion tracking with the real
account/pixel details. No Meta pixel, Conversions API or purchase/enquiry event
is installed by this page. Earlier enquiry-form validation is historical.

**Meet setup:** A private host event with a real Google Meet conference was
created and read back on Theo’s TI calendar for October 23, 12–5 pm Pacific.
The host meeting URL is in the private task handoff and the Stripe post-payment
confirmation, outside this public repository. No external guest invitations were sent.

**Editing checklist:** update date, hours and price consistently in visible copy,
the external checkout/booking product and title/description/social metadata. Remove or refresh this dated offer after
October 23. Keep private business/financial notes outside this public repo.

**Local preview:** run `python3 -m http.server 4183 --bind 127.0.0.1` from the
site root, then open `http://127.0.0.1:4183/ai-intensive/`. No dependency install
is needed. Verify the booking link without placing a real order as a routine code test.

## Regenerating the map

```
cd map
python3 build_map.py      # re-fetch + reproject coastline (needs network)
python3 gen_svg.py         # rebuild map_snippet.svg
# then paste map_snippet.svg over the <svg class="statement-map"> in index.html
```

Domain of record: **taylorintelligence.ai**. v4 is the production site;
the AI intensive change remains a draft until the review branch is merged.
