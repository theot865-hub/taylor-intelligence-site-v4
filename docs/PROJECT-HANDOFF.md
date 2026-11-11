# Taylor Intelligence site — project handoff

Updated: November 11, 2026 (America/Vancouver)

This is the starting point for Theo or another AI. Theo is new to coding and
should not need to remember the setup. Keep this file current when the code,
setup or deployment state changes. Explain commands and results plainly.

## Current status

The November 11 revision makes Taylor Intelligence specific to AI and marketing
for automotive repair, tire and service shops. The implementation and local
checks are complete. The hero reads “AI & marketing. Built for automotive.”

Release branch: `codex/automotive-positioning-20261111`. The portable source
package includes `release-receipt.json` with the exact commit, deployment checks
and canonical-site verification. Check that receipt or current GitHub checks
before describing a source copy as live; source files alone are not deployment
proof.

Local verification completed November 11:

- All 153 existing Node tests passed.
- All 206 checked local asset and link references resolve.
- Browser checks covered the homepage and Websites, Marketing, Software and
  Principles at 320, 800 and 1440 pixels wide: no horizontal overflow, missing
  loaded images or remaining Education navigation links.
- The mobile navigation was reviewed at 390 pixels wide.
- Independent source review found no actionable issues.

These checks do not establish a production deployment or real form delivery,
payment completion or appointment booking.

Current editing copy:

`/Users/theotaylor/Documents/Codex/2026-11-11/make-the-taylor-intelligence-site-specific/work/ti-site`

Public site: <https://taylorintelligence.ai/>

Repository: <https://github.com/theot865-hub/taylor-intelligence-site-v4>

This revision starts from `469c3f752955df4b6d5c701e85ea95ff963af2e3`, the
source already served by the site when this task began. It includes the vault
small-screen scrolling fix from PR #23. At the start, repository `main` was
`0bd84cbcc4057c35a01516b3efc78c9341aaf3ea`; source control and the served
version therefore differed. Verify their current state before future work.

## What changed and what stays

- Keep Websites, Marketing, Software as a Service, Agentic as a Service, Team,
  Principles and Contact. The separate vault stays available.
- Write for automotive shops: service enquiries, local drivers, tire and repair
  services, seasonal promotions, service advisors and shop administration.
- Remove Education as a marketed service and remove the homepage education
  section and its navigation and sitemap entries. Do not restore AI Intensive.
- Keep the established TI identity, monochrome terrain, curved panels,
  typography, responsive layout and existing service structure.
- Keep portfolio claims truthful. Work for nonautomotive clients stays labelled
  as that work. Do not turn illustrative software screens into product claims.
- Keep existing prices and contact destinations unless separately requested.
  Website design is CAD $1,500, with CAD $500/month maintenance and SEO billed
  separately from launch. Software and agent services are individually scoped.

`/education/` is now a support notice for the retired AI Intensive, rather than
a promoted service. It remains reachable for historical links and payment
returns, with `noindex, nofollow` and the existing receipt script. The retired
campaign, booking and thank-you routes also remain for prior visitors.

The existing production `AI_INTENSIVE_RETIRED=true` setting blocks new intensive
checkout and legacy lead creation. Historical payment confirmation and private
operational receipt handling must remain intact. This revision does not delete
customer records, refund payments, cancel appointments or reopen the programme.
It does not change credentials, provider accounts or Cloudflare account settings.

## How the site works

This is plain HTML, CSS and JavaScript. There is no frontend framework, package
installation or build step needed to edit text and preview the static pages.
Cloudflare serves the files and runs a separate Worker for existing API routes.

| File or directory | Purpose |
| --- | --- |
| `index.html` | Homepage sections, team, contact form and portfolio |
| `websites/index.html` | Website services, portfolio, price and FAQs |
| `marketing/index.html` | Automotive marketing services |
| `software/index.html` | Software as a Service and Agentic as a Service |
| `principles/index.html` | Approach and principles |
| `vault/index.html` | Separate vault page; preserve its scrolling fix |
| `education/index.html` | Retired programme support notice and payment returns |
| `ai-intensive/` | Retired routes, shared historic assets and receipt handling |
| `site-base.css`, `green.css`, `service-pages.css`, `mobile.css` | Shared design and responsive styles |
| `automotive.css` | Homepage hero layout and responsive automotive heading |
| `terrain.js`, `green.js` | Background motion, navigation and page interactions |
| `lead-form.js` | Existing enquiry-form behaviour and source metadata |
| `assets/` | Logos, work examples, service illustrations and local fonts |
| `sitemap.xml`, `robots.txt`, `_redirects` | Discovery and legacy routing |
| `worker/`, `wrangler.jsonc` | Cloudflare APIs and deployment configuration |
| `tests/` | Existing Node regression tests |
| `.assetsignore` | Files excluded from public static hosting |

Headers and footers are duplicated in the HTML files; there is no shared
template compiler. When changing navigation or shared business descriptions,
update each active agency page consistently. Keep metadata and JSON-LD aligned
with the visible copy. Check all affected pages, not just the homepage.

## Edit and preview

Start in the editing copy, then inspect the current branch and changes:

```sh
git status --short --branch
git log -5 --oneline
```

Do not overwrite unrelated changes. A new AI should read `AGENTS.md`, this
handoff and the current diff before editing. Historical README sections describe
past designs and offers; this handoff's current direction takes precedence.

For a static preview, run this from the site directory:

```sh
python3 -m http.server 4183 --bind 127.0.0.1
```

Open <http://127.0.0.1:4183/>. Leave that terminal running; Control-C stops it.
If the port is already occupied, check whether a preview is already running or
choose another unused port. Refresh after an edit; hard-refresh if assets look
cached. Test the affected desktop and phone layouts.

This server does not run Cloudflare APIs or reproduce its redirects. Form,
checkout and external booking destinations remain real services: inspecting
their appearance does not require submitting a message, payment or booking.

Run the existing regression suite from the site directory:

```sh
node --test tests/*.test.mjs
```

Also inspect links, image loading, navigation, text wrapping and horizontal
overflow. JSON-LD must parse. Record what actually passed and any remaining
limitations; a static preview alone does not prove production API behaviour.

## Publication and recovery

The existing Cloudflare Worker is `taylor-intelligence-site-v4`. Its configuration
serves this directory as static assets and uses `worker/checkout.mjs` for APIs.
Use the existing repository and deployment path; do not register a replacement
site or recreate production resources to publish a copy change.

**A branch push can deploy to the public domain before a PR is merged.**
Cloudflare Workers Builds has previously run `npx wrangler deploy` for
nonproduction branches. A draft PR is not a publication barrier. Complete the
code, checks and review before any authorized push, then verify the actual build
result and canonical URLs. Changing the build settings is separate work; this
revision does not authorize or perform that account change.

Keep secrets out of source, output files and handoff packages. Preserve existing
bindings and the retirement setting. `README.md`, `docs/`, `AGENTS.md`, tests,
Worker source and private configuration must be excluded from static assets.

The full source baseline for this change is
`469c3f752955df4b6d5c701e85ea95ff963af2e3`. For recovery, inspect the revision's
diff against that commit and prepare a targeted revert that preserves later
work and the vault scrolling fix. Do not blindly reset a shared branch or
redeploy an older checkout that predates programme retirement.

## Giving the project to another AI

Provide the complete source together with this handoff and `AGENTS.md`; a single
homepage file is not the whole site. Include the final commit, deployment status
and validation results. Exclude `.git`, dependencies, local caches, credentials
and customer data from a portable package.

A useful starting instruction is:

> Read AGENTS.md and docs/PROJECT-HANDOFF.md, inspect the current Git status and
> diff, then continue the requested change. Preserve the automotive positioning,
> retired programme safeguards and unrelated work. Keep the handoff current.
> Report clearly whether the result is local, pushed or verified live.
