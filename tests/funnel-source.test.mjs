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
// Zoom image baselines updated October 20 for the approved direct-from-original
// colour/background/name revision; other protected assets retain their baselines.
const preserved = {
  "ai-intensive/fonts/Manrope.ttf": "3ae11c49db0455a3cc33e37d380f20fdb8c7f8b41dc07625c177e3d87a9d6ae6",
  "ai-intensive/fonts/OFL.txt": "58172e0c0fac2cda8a37b348164bb55e44b0e69051e557e92b1d3f6910141f7b",
  "ai-intensive/images/orange-mentoring-background-mobile.jpg": "ace81f24920255dc4f7af6b487682682a7825aa3c59e79a77a0b739d7a86bdf3",
  "ai-intensive/images/orange-mentoring-background.jpg": "472289b62ee8f3b051149c3392f985ee801c6c81cef4a43af058385734c043f0",
  "ai-intensive/images/theo-julian-call-960.webp": "7186f3c671abbf43876f3d60144ab3561d97b25e963e02cfc77fc4438cbe9dc8",
  "ai-intensive/images/theo-julian-call.png": "43c3098707a8f7acb858311006e5ffb40b02aab14ffa5cca74fe49efcbb44a6c",
  "ai-intensive/images/theo-julian-call.webp": "ce3ef70030b7da0744fb487276010cb1a3d3d90d32f988809370f7de776f52b3",
  "ai-intensive/images/ti-education-still.jpg": "5c494a8f532f5fe0480d8c1c4ed852fa0eadb328c91365204e55614b813c72c2",
  "ai-intensive/logos/big-o-tires.png": "58814d8600fc3113b6ee2902ab52b1fe08ba11f38b2c24427b71efff16bc26fa",
  "ai-intensive/logos/omen-foils-dark.png": "fdfae3ec6fbd00a9e47634026f9c9039489af766e5c0c820e1f369a170bfdd14",
  "ai-intensive/logos/sd-concrete.svg": "52b5bf825e6eaad5c463b3e3e91d21604cfee4e1340741ec1866fb31491a172f",
  "ai-intensive/logos/szolyd.svg": "87efe5c34d0ee30af4878c0cb1ab5387b330c5fbf0b2bd9d61ea9c5e64beda46",
  "education/education.css": "f319a5e70a279868f4d437627298cb742194a1687bab53a808220086174c6b5c",
  "ai-intensive/tracking.js": "ca289a0ca6dc654e02637d4f9d720cc904d3ff501ba8795327e1af0421c8324e",
  "ai-intensive/checkout.js": "697568b6c024a83fe30c5e43411833d262426a7f56618f4a8fb0500616ae5394",
  "ai-intensive/og.png": "9824e5fefe0d76a7374bcec604d15be5e5d21a6cc8e2ed6320dafb2dc782c178",
  "og.png": "3b39e8988834a4eddc32b55973737640f8ac438fb61701ba6fbf4877aa707a75"
};




test("portraits, chosen artwork, logos and legacy receipt assets remain byte-identical", () => {
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
    "  // Private Google receipts and browser-observed",
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
