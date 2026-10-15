import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CALENDAR_URL, THANK_YOU_PATH } from "../worker/ai-intensive-leads.mjs";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root));
const text = path => read(path).toString("utf8");
const hash = value => createHash("sha256").update(value).digest("hex");
const campaign = text("ai-intensive/index.html");

// This revision changes only the ad campaign funnel. These source hashes were
// read from verified production main 838648d40d1e28f23bfbde9e51b7aa70411980ee.
// Deliberate future changes to the protected agency or assets need new review.
// Homepage baseline reviewed October 14 for the approved Contact button;
// the remaining protected assets retain their original baselines.
const preserved = {
  "ai-intensive/fonts/Manrope.ttf": "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6",
  "ai-intensive/fonts/OFL.txt": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b",
  "ai-intensive/images/orange-mentoring-background-mobile.jpg": "ace81f24920255dc4f7af6b487682682a7825aa3c59e79a77a0b739d7a86bdf3",
  "ai-intensive/images/orange-mentoring-background.jpg": "472289b62ee8f3b051149c3392f985ee801c6c81cef4a43af058385734c043f0",
  "ai-intensive/images/theo-julian-call-960.webp": "b2319357b224984de2c112408029adb5442f6db6826ea0a4f4c30108e3efaf7e",
  "ai-intensive/images/theo-julian-call.png": "1e4adc34634f59e601893702dc4793e3bed1ee94da7b59ca48d7475c56f2df04",
  "ai-intensive/images/theo-julian-call.webp": "a1704278ba20e83b2aeb9084e5b31fe7e05f49e624b387183ecf17e4f6505ee7",
  "ai-intensive/images/ti-education-still.jpg": "5c494a8f532f5fe0480d8c1c4ed852fa0eadb328c91365204e55614b813c72c2",
  "ai-intensive/logos/big-o-tires.png": "58814d8600fc3113b6ee2902ab52b1fe08ba11f38b2c24427b71efff16bc26fa",
  "ai-intensive/logos/omen-foils-dark.png": "fdfae3ec6fbd00a9e47634026f9c9039489af766e5c0c820e1f369a170bfdd14",
  "ai-intensive/logos/sd-concrete.svg": "52b5bf825e6eaad5c463b3e3e91d21604cfee4e1340741ec1866fb31491a172f",
  "ai-intensive/logos/szolyd.svg": "87efe5c34d0ee30af4878c0cb1ab5387b330c5fbf0b2bd9d61ea9c5e64beda46",
  "education/education.css": "f319a5e70a279868f4d437627298cb742194a1687bab53a808220086174c6b5c",
  "education/index.html": "4927c4afce5099abbb607726a8a6aac0c54fe70013862455a29b86ae8a958a38",
  "ai-intensive/tracking.js": "ca289a0ca6dc654e02637d4f9d720cc904d3ff501ba8795327e1af0421c8324e",
  "ai-intensive/checkout.js": "697568b6c024a83fe30c5e43411833d262426a7f56618f4a8fb0500616ae5394",
  "ai-intensive/og.png": "9824e5fefe0d76a7374bcec604d15be5e5d21a6cc8e2ed6320dafb2dc782c178",
  "index.html": "0c2a516171ffa2a6a3a26828802735a8d733ba31219bd61827439d5736740930",
  "og.png": "3b39e8988834a4eddc32b55973737640f8ac438fb61701ba6fbf4877aa707a75"
};

test("campaign removes pricing and payment controls from page and social descriptions", () => {
  // Inspect page copy and metadata separately from referenced scripts.
  const publicCopy = campaign.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  assert.doesNotMatch(publicCopy, /\$\s*\d|\bCAD\b|\bStripe\b|company seat|seat selector|\/api\/checkout|checkout\.js|extra-employees|checkout-status/i);
  assert.doesNotMatch(campaign, /<form\b/i);
  assert.match(campaign, /name="description" content="[^"]*Book a free call/);
  assert.match(campaign, /property="og:description" content="[^"]*Book a free call/);
  assert.match(campaign, /name="twitter:description" content="[^"]*Book a free call/);
  assert.match(campaign, /<script src="\/ai-intensive\/tracking\.js\?v=20261014-free-call" defer><\/script>/);
});

test("every free-call and private-session CTA goes through the contact form", () => {
  const links = Array.from(campaign.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))
    .map(([, attrs, body]) => ({ href: attrs.match(/\bhref="([^"]+)"/)?.[1], label: body.replace(/<[^>]*>/g, "").trim() }));
  const bookingLinks = links.filter(link => /Book a free call|Ask about private sessions/.test(link.label));
  assert.equal(bookingLinks.length, 4, "Header, primary, FAQ and private-session links");
  for (const link of bookingLinks) assert.equal(link.href, "/ai-intensive/book", link.label);
  assert.ok(bookingLinks.some(link => link.label === "Ask about private sessions"));
  assert.doesNotMatch(campaign, /href="https:\/\/calendar\.google\.com/);
});

test("campaign uses the verified 15-minute schedule inside the private thank-you handoff", () => {
  const expected = "https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C";
  assert.equal(CALENDAR_URL, expected, "Server preserves the verified dedicated schedule");
  const destination = text("ai-intensive/book/booking.js").match(/const destination = '([^']+)';/)?.[1];
  assert.equal(destination, "/ai-intensive/thank-you/");
  assert.equal(THANK_YOU_PATH, destination);
  assert.match(text("ai-intensive/thank-you/index.html"), /AcZssZ2OnIx-9j8ROlj-uAqbq9_rKBDncdqcEtmf4DshdYIZU80lv-ldIBXfa2uBwTIyuhG67_kvQ57C/);
  assert.match(campaign, /A 15-minute call to see if the AI Intensive fits your business\./);
  assert.doesNotMatch(campaign, /30-minute|AcZssZ1gTNRRjtUhFG3CoFfreS9iHhPiF3XYPo2QBchk6DxCt5HwHm_gLVUe3Z-rBEhu890-og5GPxIP/);
  assert.equal(new URL(CALENDAR_URL).search, "", "No personal data or consent is added to the URL");
  assert.match(text("education/index.html"), /AcZssZ1gTNRRjtUhFG3CoFfreS9iHhPiF3XYPo2QBchk6DxCt5HwHm_gLVUe3Z-rBEhu890-og5GPxIP/,
    "Education retains its existing general 30-minute fit-call schedule");
});

test("agency Education, portraits, chosen artwork and logos remain byte-identical", () => {
  for (const [path, expected] of Object.entries(preserved)) {
    if (path !== "ai-intensive/tracking.js") assert.equal(hash(read(path)), expected, path);
  }
});

test("existing payment verification, privacy signals, SDK readiness and purchase deduplication remain intact", () => {
  const tracking = text("ai-intensive/tracking.js");
  const protectedRegions = [
  [
    "  function safeURL(",
    "  const safeLocation",
    "2595c8a7d1eade5ea895a435880821f4871cf2e9556157fca3b59f22e04be657"
  ],
  [
    "  const order =",
    "  function pixel()",
    "e29104e043468605f0d42dab1d0af76a9a89c3977c12ea5bb2515a83b7b9f17f"
  ],
  [
    "  function pixel()",
    "  function purchaseClaims()",
    "dc3017fce776a644d1dcae2c52306d1a17921e1631413392ba9c69c502e8e76f"
  ],
  [
    "  function purchaseClaims()",
    "  // Only the private booking-status endpoint",
    "9e0395bc522086c8f76e656698c1442860b5dc7d3de14444a33dcd7bb318f6e8"
  ],
  [
    "  function removePixelCookies()",
    "\n  // Called only",
    "f7fab9df3eee2f22e7c57596111049ceb9cd21d2bc27d296935967c7dd161cff"
  ],
  [
    "    confirmedPurchase(result)",
    "\n  function boot()",
    "dc2d98d1c6e0fd03884a00c3d20dd114138af12423f02270b04a70fe396d4d99"
  ]
];
  for (const [start, end, expected] of protectedRegions) {
    const from = tracking.indexOf(start);
    const to = tracking.indexOf(end, from);
    assert.ok(from >= 0 && to > from, start);
    assert.equal(hash(tracking.slice(from, to)), expected, start);
  }
});

test("campaign preserves full-frame portrait markup and all existing styling", () => {
  const figure = campaign.match(/<figure class="mentor-photo">[\s\S]*?<\/figure>/)?.[0];
  assert.ok(figure);
  assert.equal(hash(figure), "725de16d1c190d0b05378633c11ff1d0891ba692c4b974c33409339674029155", "Preserve responsive srcset, original frame and caption");
  const css = text("ai-intensive/style.css");
  const marker = "\n/* The free-call funnel keeps the campaign's existing orange layout. */";
  const boundary = css.indexOf(marker);
  assert.ok(boundary >= 0);
  assert.equal(hash(css.slice(0, boundary)), "c474c2f9a7653e009cc163bf47763f370f9ae1ae2292023dc086496b50f3d253", "Existing campaign CSS");
});

test("booking page collects contact details without payment or Meta tracking", () => {
  const booking = text("ai-intensive/book/index.html");
  assert.match(booking, /<form[^>]+action="\/api\/ai-intensive\/leads"[^>]+method="post"/);
  assert.match(booking, /<input[^>]+name="name"[^>]+required/);
  assert.match(booking, /<input[^>]+name="email"[^>]+required/);
  const checkbox = booking.match(/<input[^>]+name="marketingConsent"[^>]*>/)?.[0];
  assert.ok(checkbox);
  assert.doesNotMatch(checkbox, /\b(?:checked|required)\b/);
  assert.doesNotMatch(booking, /<script[^>]+(?:tracking|checkout)\.js|\/api\/checkout|\bStripe\b/);
});

test("lead API bypasses SPA fallback and private tooling is excluded from assets", () => {
  const config = text("wrangler.jsonc");
  const routes = config.match(/"run_worker_first"\s*:\s*(\[[^\]]*\])/);
  assert.ok(routes);
  assert.ok(JSON.parse(routes[1]).includes("/api/ai-intensive/*"));
  assert.match(text("worker/checkout.mjs"), /path\.startsWith\("\/api\/ai-intensive\/"\).*handleAIIntensiveLeads\(request, env\)/);
  const ignored = new Set(text(".assetsignore").split(/\r?\n/).map(line => line.trim()));
  for (const path of ["worker", "tests", "migrations", "scripts", "docs/", ".wrangler", ".env*", ".dev.vars*"]) {
    assert.ok(ignored.has(path), path);
  }
});
