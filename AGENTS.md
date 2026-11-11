# Working on the Taylor Intelligence site

- Theo is new to coding and may hand this project to another AI at any time.
  Explain setup and results plainly; do not rely on remembered chat context.
- Start with `docs/PROJECT-HANDOFF.md`, then inspect Git status and the current
  diff. Preserve unrelated work. Historical README entries are an archive.
- Keep the handoff current when code, setup, decisions or deployment state
  changes. Record the actual commit, checks, limitations and whether work is
  local or verified live. Make source packages usable without this chat.
- The current audience is automotive repair, tire and service shops. Preserve
  Websites, Marketing, Software as a Service, Agentic as a Service, Team,
  Principles, Contact and the vault. Education and AI Intensive are retired.
- Preserve historical payment/booking receipt safeguards and the existing
  retirement setting. Do not delete records or reopen retired offerings.
- This is plain HTML/CSS/JavaScript. Shared headers and footers are duplicated;
  update all affected pages consistently. Keep copy, metadata and links aligned.
- Run checks appropriate to the change and inspect affected responsive layouts.
  The existing regression command is `node --test tests/*.test.mjs`.
- Branch pushes can trigger production deployment before PR merge. Finish
  preparation and validation before an authorized push, then verify the build
  and canonical site. A draft PR is not a deployment barrier.
- Keep credentials, customer data and internal handoff files out of public
  assets. Preserve `.assetsignore` exclusions, including this file and `docs/`.
