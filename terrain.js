(function () {
      var canvas = document.getElementById("terrain-bg");
      if (!canvas) return;
      var ctx = canvas.getContext("2d");
      var animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches &&
                    !window.matchMedia("(max-width: 1100px)").matches;

      /* ---- CUSTOMIZE: terrain palette + tuning ---- */
      var TERRAIN = {
        skyTop: "#040d08", skyBottom: "#0b1612",
        glow: "138, 226, 172",          /* horizon halo (r,g,b) */
        rampLow: [44, 82, 62],          /* valley-floor point colour */
        rampHigh: [168, 248, 200],      /* ridge-line point colour */
        wire: "rgba(104, 182, 138, 0.16)", /* faint contour lines between points */
        farTint: [96, 148, 152],        /* atmospheric haze colour near the horizon */
        mote: "170, 240, 200",          /* drifting data-motes (r,g,b) */
        speed: 0.72                     /* forward drift, world-units/sec */
      };

      var ROWS = 52, COLS = 128, NEAR = 3.2, FAR = 34, SPAN = 15, CAMH = 4.2;
      var DPR, W, H, cx, horizon, focal, skyGradient, vignette;
      var pointX = new Float64Array(COLS), pointY = new Float64Array(COLS);
      var pointLum = new Uint8Array(COLS), pointScale = new Float32Array(COLS);
      var pointWarm = new Uint8Array(COLS), pointVisible = new Uint8Array(COLS);
      /* Jitter belongs to the world grid, not to the frame. Cache it once and
         reuse the coordinate buffers to keep animation out of the GC cycle. */
      var gridR1 = new Float64Array(ROWS * COLS), gridR2 = new Float64Array(ROWS * COLS);
      for (var gj = 0; gj < ROWS; gj++) for (var gi0 = 0; gi0 < COLS; gi0++) {
        gridR1[gj * COLS + gi0] = hash(gi0 * 1.31, gj * 2.17);
        gridR2[gj * COLS + gi0] = hash(gi0 * 2.73, gj * 1.71);
      }

      function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 1.5);
        W = canvas.clientWidth || window.innerWidth;
        H = canvas.clientHeight || window.innerHeight;
        canvas.width = Math.round(W * DPR);
        canvas.height = Math.round(H * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        cx = W / 2;
        /* horizon pinned near the very top: the camera looks DOWN at the land,
           so the point-cloud fills the whole frame like aerial footage — the
           visible band on load (between header and panel) is all terrain.
           On squarer canvases (the mobile hero block) drop it a little so
           several ridge lines stay in frame instead of sparse near-field. */
        horizon = H * (W / H < 1.2 ? 0.2 : 0.09);
        focal = H * 1.0;
        /* Cover the far plane, including pointer parallax and drifting edge
           points. A fixed world width exposed the left/right mesh boundary. */
        SPAN = Math.max(15, (W * 0.5 + 100) * FAR / focal);
        skyGradient = ctx.createLinearGradient(0, 0, 0, H);
        skyGradient.addColorStop(0, TERRAIN.skyTop);
        skyGradient.addColorStop(0.62, TERRAIN.skyBottom);
        skyGradient.addColorStop(1, TERRAIN.skyTop);
        vignette = ctx.createRadialGradient(cx, H * 0.45, H * 0.3, cx, H * 0.45, H * 0.95);
        vignette.addColorStop(0, "rgba(3, 10, 6, 0)");
        vignette.addColorStop(1, "rgba(3, 10, 6, 0.3)");
        if (GLR) GLR.resize();
      }

      /* deterministic value noise — terrain is stable in world space, so
         features glide toward the camera instead of boiling randomly.
         Integer-lattice hash, mirrored bit-exact in the WebGL shaders so the
         2D story layer and the GL world agree on every height. */
      function hash(x, y) {
        var h = (Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0;
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) | 0;
        h ^= h >>> 13;
        return (h >>> 0) / 4294967296;
      }
      function noise(x, y) {
        var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
        var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
      }
      function terrainH(x, zn) {
        /* fbm base + a ridged, anisotropic octave: sharp crests stretched
           across the view like real ranges, not rolling math-blobs */
        var n = noise(x * 0.16, zn * 0.16) * 0.46 + noise(x * 0.34, zn * 0.34) * 0.20 + noise(x * 0.72, zn * 0.72) * 0.09;
        var rr = 1 - Math.abs(noise(x * 0.11, zn * 0.23) * 2 - 1);
        n += rr * rr * 0.27;
        var valley = 1 - Math.exp(-(x * x) / 46);   /* flatten a corridor up the middle */
        return n * 3.1 * (0.35 + 0.65 * valley);
      }

      /* precomputed height->colour ramp in six depth bands: far rows blend
         toward the haze tint (atmospheric perspective), so the scene reads as
         deep space instead of a flat pattern. No strings built per frame. */
      var BANDS = 6, RAMP = [];
      for (var b = 0; b < BANDS; b++) {
        var haze = (b / (BANDS - 1)) * 0.55, band = [];
        for (var r = 0; r <= 16; r++) {
          var e = (r / 16) * (r / 16) * (3 - 2 * r / 16), c = [];
          for (var ch = 0; ch < 3; ch++) {
            var base = TERRAIN.rampLow[ch] + (TERRAIN.rampHigh[ch] - TERRAIN.rampLow[ch]) * e;
            c.push(Math.round(base + (TERRAIN.farTint[ch] - base) * haze));
          }
          band.push("rgb(" + c[0] + "," + c[1] + "," + c[2] + ")");
        }
        RAMP.push(band);
      }
      /* a sparse warm ramp — moss/lichen flecks catching the light */
      var RAMPW = [];
      for (var b2 = 0; b2 < BANDS; b2++) {
        var hz2 = (b2 / (BANDS - 1)) * 0.55, wband = [];
        for (var r2i = 0; r2i <= 16; r2i++) {
          var e2 = (r2i / 16) * (r2i / 16) * (3 - 2 * r2i / 16), cc = [];
          for (var c2 = 0; c2 < 3; c2++) {
            var bs = [58, 74, 46][c2] + ([214, 196, 122][c2] - [58, 74, 46][c2]) * e2;
            cc.push(Math.round(bs + (TERRAIN.farTint[c2] - bs) * hz2));
          }
          wband.push("rgb(" + cc[0] + "," + cc[1] + "," + cc[2] + ")");
        }
        RAMPW.push(wband);
      }

      /* eased mouse parallax — the canvas sits behind everything, so listen
         on the window; reduced-motion/mobile never registers the listener */
      var mx = 0, my = 0, px = 0, py = 0;
      if (animate) window.addEventListener("mousemove", function (e) {
        mx = (e.clientX / window.innerWidth) * 2 - 1;
        my = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });

      /* data-motes drifting slowly upward above the terrain */
      var motes = [];
      for (var m = 0; m < 42; m++) {
        motes.push({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.2,
                     v: 0.004 + Math.random() * 0.01, ph: Math.random() * 6.283 });
      }

      /* cached soft-glow sprites (one per colour) for the additive bloom pass */
      var spriteCache = {};
      function glowSprite(color) {
        var s = spriteCache[color];
        if (s) return s;
        s = document.createElement("canvas");
        s.width = s.height = 32;
        var g = s.getContext("2d");
        var gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, color);
        gr.addColorStop(0.3, color);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr;
        g.fillRect(0, 0, 32, 32);
        spriteCache[color] = s;
        return s;
      }

      /* low-lying fog banks, anchored to the valley floor; they recycle
         through the depth range forever */
      var fogs = [];
      for (var fg0 = 0; fg0 < 7; fg0++) {
        fogs.push({ x: Math.random() * 14 - 7, zn: Math.random() * 40,
                    drift: Math.random() * 6.283, s: 0.7 + Math.random() * 0.9 });
      }

      /* Each flock shares a quiet heading, while a few birds take their own
         curved flight out and back. The excursion envelope has zero velocity
         and acceleration at both ends, so joining never snaps or jitters. */
      var flock = null, nextFlock = 2.4;
      function spawnFlock(t) {
        var n = 9 + Math.floor(Math.random() * 3), birds = [];
        for (var bi0 = 0; bi0 < n; bi0++) {
          var rank = Math.ceil(bi0 / 2), side = bi0 % 2 ? 1 : -1;
          var solo = bi0 > 0 && bi0 % 3 === 2;
          birds.push({
            ox: -rank * 20 + (Math.random() - 0.5) * 9,
            oy: side * rank * 6 + (Math.random() - 0.5) * 6,
            ph: Math.random() * Math.PI * 2, sz: 0.85 + Math.random() * 0.35,
            depart: solo ? 0.12 + Math.floor(bi0 / 3) * 0.17 : 2,
            duration: 0.29 + Math.random() * 0.045,
            sweep: 0.85 + Math.random() * 0.3,
            depth: bi0 % 2 ? 1 : -0.7
          });
        }
        flock = { born: t, dur: 23 + Math.random() * 4,
          dir: Math.random() < 0.5 ? 1 : -1,
          y0: 0.13 + Math.random() * 0.02, phase: Math.random() * Math.PI * 2,
          birds: birds };
      }
      function birdPose(B, F, age, pose) {
        var progress = age / F.dur;
        var x = -160 + progress * (W + 320);
        var y = H * F.y0 + Math.sin(age * 0.24 + F.phase) * 12;
        var u = (progress - B.depart) / B.duration;
        var excursion = 0, dx = 0, dy = 0;
        if (u > 0 && u < 1) {
          var arc = Math.sin(Math.PI * u);
          excursion = arc * arc * arc * arc;
          var scale = Math.max(0.75, Math.min(1.3, W / 1400));
          dx = excursion * (Math.sin(u * Math.PI * 2) * 100 + 22) * B.sweep * scale;
          dy = excursion * (Math.sin(u * Math.PI * 1.65) * 84 - 22) * B.depth * scale;
        }
        pose.x = (F.dir > 0 ? x : W - x) + (B.ox + dx) * F.dir + px * 0.7;
        pose.y = y + B.oy + Math.sin(age * 0.65 + B.ph) * 4 + dy + py * 0.7;
        pose.excursion = excursion;
        pose.scale = 1 + dy / Math.max(H, 600) * 1.6;
      }
      var birdNow = {}, birdNext = {};
      function drawBirds(t) {
        if (animate && !flock && t > nextFlock) spawnFlock(t);
        if (!flock) return;
        var age = t - flock.born, progress = age / flock.dur;
        if (progress > 1) { flock = null; nextFlock = t + 9 + Math.random() * 9; return; }
        var fade = clamp01(progress * 9) * clamp01((1 - progress) * 9);
        ctx.strokeStyle = "rgb(" + TERRAIN.mote + ")";
        ctx.lineCap = "round";
        for (var bi = 0; bi < flock.birds.length; bi++) {
          var B = flock.birds[bi];
          birdPose(B, flock, age, birdNow);
          if (birdNow.x < -20 || birdNow.x > W + 20) continue;
          birdPose(B, flock, age + 0.04, birdNext);
          var vx = (birdNext.x - birdNow.x) * flock.dir;
          var vy = birdNext.y - birdNow.y;
          var bank = Math.max(-0.65, Math.min(0.65, Math.atan2(vy, Math.max(0.4, vx))));
          /* Wings alternate short powered beats and longer glides. Independent
             phases avoid the synchronized chevron look of the original flock. */
          var cycle = (age * 0.18 + B.ph / (Math.PI * 2)) % 1;
          var burst = cycle < 0.42 ? Math.pow(Math.sin(cycle / 0.42 * Math.PI), 2) : 0;
          var wing = Math.sin(age * 10.5 + B.ph) * burst * (1 - birdNow.excursion * 0.6);
          var wingLength = 6.2 * B.sz * birdNow.scale;
          ctx.save();
          ctx.translate(birdNow.x, birdNow.y);
          ctx.rotate(bank * flock.dir * 0.65);
          ctx.globalAlpha = fade * (0.74 + birdNow.excursion * 0.12);
          ctx.lineWidth = 1.3 * B.sz;
          ctx.beginPath();
          ctx.moveTo(-wingLength, -wingLength * (0.15 + wing * 0.65 + bank * 0.28));
          ctx.quadraticCurveTo(-wingLength * 0.4, -wingLength * 0.13, 0, wingLength * 0.13);
          ctx.quadraticCurveTo(wingLength * 0.4, -wingLength * 0.13,
            wingLength, -wingLength * (0.15 + wing * 0.65 - bank * 0.28));
          ctx.stroke();
          ctx.restore();
        }
        ctx.lineCap = "butt";
        ctx.globalAlpha = 1;
      }

      /* ============ WebGL2 luminous renderer ============
         Renders the WORLD on the canvas beneath this one: sky, a solid
         terrain mesh that truly occludes (depth buffer), and a dense
         additive point cloud. The 2D canvas on top keeps the STORY layer:
         contours, fog, birds and vignette.
         The GLSL noise mirrors the JS hash/noise/terrainH above bit-exactly,
         so both layers agree on every height. If WebGL2 is unavailable this
         returns null and the 2D renderer keeps doing everything itself. */
      var GLR = (function () {
        var cv = document.getElementById("terrain-gl");
        if (!cv) return null;
        var gl = null;
        try { gl = cv.getContext("webgl2", { antialias: false, depth: true }); } catch (err) {}
        if (!gl) { cv.style.display = "none"; return null; }

        var HEAD = "#version 300 es\nprecision highp float;\nprecision highp int;\n";
        var NOISE = "\n" +
          "uint uh(int x, int y) {\n" +
          "  uint h = uint(x) * 0x27d4eb2du ^ uint(y) * 0x165667b1u;\n" +
          "  h = (h ^ (h >> 15u)) * 0x85ebca6bu;\n" +
          "  h ^= h >> 13u;\n" +
          "  return h;\n" +
          "}\n" +
          "float uhashf(int x, int y) { return float(uh(x, y)) / 4294967296.0; }\n" +
          "float vnoise(vec2 p) {\n" +
          "  vec2 f = floor(p), w = p - f;\n" +
          "  int xi = int(f.x), yi = int(f.y);\n" +
          "  w = w * w * (3.0 - 2.0 * w);\n" +
          "  float a = uhashf(xi, yi), b = uhashf(xi + 1, yi), c = uhashf(xi, yi + 1), d = uhashf(xi + 1, yi + 1);\n" +
          "  return a + (b - a) * w.x + (c - a) * w.y + (a - b - c + d) * w.x * w.y;\n" +
          "}\n" +
          "float terrH(float x, float zn) {\n" +
          "  float n = vnoise(vec2(x, zn) * 0.16) * 0.46 + vnoise(vec2(x, zn) * 0.34) * 0.20 + vnoise(vec2(x, zn) * 0.72) * 0.09;\n" +
          "  float rr = 1.0 - abs(vnoise(vec2(x * 0.11, zn * 0.23)) * 2.0 - 1.0);\n" +
          "  n += rr * rr * 0.27;\n" +
          "  float valley = 1.0 - exp(-(x * x) / 46.0);\n" +
          "  return n * 3.1 * (0.35 + 0.65 * valley);\n" +
          "}\n";
        var COMMON = "\n" +
          "uniform vec2 u_res;\n" +
          "uniform float u_t, u_travel, u_xdrift, u_camh, u_focal, u_horizon, u_cx, u_panx, u_pany, u_dpr, u_span;\n" +
          "vec2 proj(float x, float h, float z) {\n" +
          "  return vec2(u_cx + u_panx + x * u_focal / z, u_horizon + u_pany + (u_camh - h) * u_focal / z);\n" +
          "}\n" +
          "vec4 clipOf(vec2 sp, float z) {\n" +
          "  float ndz = (z - 2.4) / 32.0;\n" +
          "  return vec4(sp.x / u_res.x * 2.0 - 1.0, 1.0 - sp.y / u_res.y * 2.0, ndz * 2.0 - 1.0, 1.0);\n" +
          "}\n" +
          "float gateOf(float depth) {\n" +
          "  float g = clamp((u_t - (0.5 + depth * 0.9)) / 0.55, 0.0, 1.0);\n" +
          "  return g * g * (3.0 - 2.0 * g);\n" +
          "}\n" +
          "float frayOf(float fz) { return fz > 0.72 ? pow((fz - 0.72) / 0.28, 1.4) : 0.0; }\n";

        var skyVS = HEAD +
          "void main() {\n" +
          "  vec2 P = vec2[3](vec2(-1., -1.), vec2(3., -1.), vec2(-1., 3.))[gl_VertexID];\n" +
          "  gl_Position = vec4(P, 0.0, 1.0);\n" +
          "}\n";
        var skyFS = HEAD +
          "uniform vec2 u_res, u_glowPos;\n" +
          "uniform float u_dpr, u_gi, u_glowRad;\n" +
          "uniform vec3 u_skyTop, u_skyBot, u_glowC;\n" +
          "out vec4 o;\n" +
          "void main() {\n" +
          "  vec2 uv = gl_FragCoord.xy / (u_res * u_dpr);\n" +
          "  float yy = 1.0 - uv.y;\n" +
          "  vec3 c = yy < 0.62 ? mix(u_skyTop, u_skyBot, yy / 0.62) : mix(u_skyBot, u_skyTop, (yy - 0.62) / 0.38);\n" +
          "  float dd = distance(vec2(uv.x * u_res.x, yy * u_res.y), u_glowPos) / u_glowRad;\n" +
          "  float ga = 0.16 * (1.0 - smoothstep(0.0, 1.0, dd));\n" +
          "  o = vec4(c + u_glowC * ga * u_gi, 1.0);\n" +
          "}\n";

        var meshVS = HEAD + COMMON + NOISE +
          "in vec2 a_ij;\n" +
          "uniform vec2 u_grid;\n" +
          "uniform vec3 u_haze;\n" +
          "out vec3 v_c;\n" +
          "out float v_a;\n" +
          "void main() {\n" +
          "  float fz = a_ij.y / (u_grid.y - 1.0);\n" +
          "  float z = 3.2 + pow(fz, 1.55) * 30.8;\n" +
          "  float zn = z + u_travel;\n" +
          "  float x = -u_span + 2.0 * u_span * a_ij.x / (u_grid.x - 1.0);\n" +
          "  float xw = x + u_xdrift;\n" +
          "  float h = terrH(xw, zn);\n" +
          "  float hL = terrH(xw - 0.35, zn);\n" +
          "  v_a = gateOf(1.0 - fz) * (1.0 - smoothstep(0.62, 0.95, fz));\n" +
          "  v_c = mix(vec3(5., 13., 9.) / 255.0, u_haze, fz * 0.5) * (0.8 + clamp((h - hL) * 1.2, -0.25, 0.5));\n" +
          "  gl_Position = clipOf(proj(x, h, z), z);\n" +
          "}\n";
        var meshFS = HEAD +
          "in vec3 v_c;\n" +
          "in float v_a;\n" +
          "out vec4 o;\n" +
          "void main() { if (v_a < 0.03) discard; o = vec4(v_c * v_a, v_a); }\n";

        var ptsVS = HEAD + COMMON + NOISE +
          "in vec2 a_ij;\n" +
          "uniform vec2 u_grid;\n" +
          "uniform vec3 u_lo, u_hi, u_wlo, u_whi, u_haze;\n" +
          "uniform float u_gain;\n" +
          "out vec3 v_c;\n" +
          "void main() {\n" +
          "  float fz = a_ij.y / (u_grid.y - 1.0);\n" +
          "  float depth = 1.0 - fz;\n" +
          "  float z = 3.2 + pow(fz, 1.55) * 30.8;\n" +
          "  float zn = z + u_travel;\n" +
          "  float r1 = uhashf(int(a_ij.x) * 2 + 1, int(a_ij.y));\n" +
          "  float r2 = uhashf(int(a_ij.x), int(a_ij.y) * 2 + 1);\n" +
          "  float x = -u_span + 2.0 * u_span * a_ij.x / (u_grid.x - 1.0) + (r1 - 0.5) * 0.36;\n" +
          "  float zj = z + (r2 - 0.5) * 0.4;\n" +
          "  float znj = zn + (r2 - 0.5) * 0.4;\n" +
          "  float xw = x + u_xdrift;\n" +
          "  float h = terrH(xw, znj);\n" +
          "  float hL = terrH(xw - 0.35, znj);\n" +
          "  float cloud = vnoise(vec2(xw * 0.07 + u_t * 0.055, zn * 0.07 - u_t * 0.03));\n" +
          "  float lit = clamp(0.6 + (h - hL) * 2.2, 0.0, 1.0);\n" +
          "  vec2 sp = proj(x, h, zj);\n" +
          "  float e = gateOf(depth);\n" +
          "  float fray = frayOf(fz);\n" +
          "  if (e < 1.0 || fray > 0.0) {\n" +
          "    float wob = fray > 0.0 ? 0.4 + 0.6 * sin(u_t * 0.9 + r1 * 6.283) : 1.0;\n" +
          "    float scat = (1.0 - e) * (40.0 + 140.0 * r2);\n" +
          "    sp.x += (r1 - 0.5) * 2.0 * (scat + fray * 26.0 * wob);\n" +
          "    sp.y += -r2 * scat * 0.9 + (r1 - 0.5) * 2.0 * fray * 18.0 * wob;\n" +
          "  }\n" +
          "  float lum = clamp(0.14 + h / 3.1 * 0.72 + lit * 0.3 - (cloud - 0.5) * 0.3, 0.0, 1.0);\n" +
          "  float ec = lum * lum * (3.0 - 2.0 * lum);\n" +
          "  vec3 col = (r1 > 0.965 ? mix(u_wlo, u_whi, ec) : mix(u_lo, u_hi, ec));\n" +
          "  col = mix(col, u_haze, fz * 0.55);\n" +
          "  float alpha = (0.26 + 0.72 * pow(depth, 1.2)) * (0.3 + 0.7 * e) * (1.0 - fray * 0.3);\n" +
          "  float glowk = 0.5 + 1.2 * smoothstep(0.5, 1.0, lum);\n" +
          "  v_c = col * alpha * glowk * u_gain;\n" +
          "  float size = clamp(u_focal / z * 0.013, 1.0, 3.6) * (0.7 + 0.6 * r2);\n" +
          "  gl_PointSize = size * 3.6 * u_dpr;\n" +
          "  gl_Position = clipOf(sp, zj - 0.35);\n" +
          "}\n";
        var ptsFS = HEAD +
          "in vec3 v_c;\n" +
          "out vec4 o;\n" +
          "void main() {\n" +
          "  vec2 q = gl_PointCoord * 2.0 - 1.0;\n" +
          "  float d2 = dot(q, q);\n" +
          "  if (d2 > 1.0) discard;\n" +
          "  o = vec4(v_c * exp(-d2 * 4.5), 0.0);\n" +
          "}\n";

        function sh(type, src) {
          var s = gl.createShader(type);
          gl.shaderSource(s, src);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn("terrain-gl shader:", gl.getShaderInfoLog(s)); return null; }
          return s;
        }
        function prog(vsSrc, fsSrc) {
          var v = sh(gl.VERTEX_SHADER, vsSrc), f = sh(gl.FRAGMENT_SHADER, fsSrc);
          if (!v || !f) return null;
          var p = gl.createProgram();
          gl.attachShader(p, v);
          gl.attachShader(p, f);
          gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.warn("terrain-gl link:", gl.getProgramInfoLog(p)); return null; }
          return p;
        }
        var skyP = prog(skyVS, skyFS), meshP = prog(meshVS, meshFS), ptsP = prog(ptsVS, ptsFS);
        if (!skyP || !meshP || !ptsP) { cv.style.display = "none"; return null; }

        var PC = 360, PR = 120, MC = 240, MR = 90;
        function makeVAO(p, cols, rows) {
          var arr = new Float32Array(cols * rows * 2), k = 0;
          for (var jj = 0; jj < rows; jj++) for (var ii = 0; ii < cols; ii++) { arr[k++] = ii; arr[k++] = jj; }
          var vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          var b = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
          var a = gl.getAttribLocation(p, "a_ij");
          gl.enableVertexAttribArray(a);
          gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
          return vao;
        }
        var ptsVAO = makeVAO(ptsP, PC, PR);
        var meshVAO = makeVAO(meshP, MC, MR);
        gl.bindVertexArray(meshVAO);
        var idx = new Uint16Array((MC - 1) * (MR - 1) * 6), q = 0;
        for (var mj = 0; mj < MR - 1; mj++) for (var mi = 0; mi < MC - 1; mi++) {
          var v0 = mj * MC + mi;
          idx[q++] = v0; idx[q++] = v0 + 1; idx[q++] = v0 + MC;
          idx[q++] = v0 + 1; idx[q++] = v0 + MC + 1; idx[q++] = v0 + MC;
        }
        var ib = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
        gl.bindVertexArray(null);

        var locCache = {};
        function loc(p, n) {
          var key = (p === ptsP ? "p" : p === meshP ? "m" : "s") + n;
          if (!(key in locCache)) locCache[key] = gl.getUniformLocation(p, n);
          return locCache[key];
        }
        function hex3(hx) {
          return [parseInt(hx.substr(1, 2), 16) / 255, parseInt(hx.substr(3, 2), 16) / 255, parseInt(hx.substr(5, 2), 16) / 255];
        }
        function n3(a) { return [a[0] / 255, a[1] / 255, a[2] / 255]; }
        var skyTopC = hex3(TERRAIN.skyTop), skyBotC = hex3(TERRAIN.skyBottom);
        var glowC = TERRAIN.glow.split(",").map(function (v) { return parseFloat(v) / 255; });
        var loC = n3(TERRAIN.rampLow), hiC = n3(TERRAIN.rampHigh), hazeC = n3(TERRAIN.farTint);
        var wloC = n3([58, 74, 46]), whiC = n3([214, 196, 122]);

        function common(p, t, travel, xdrift, camh, panx, pany) {
          gl.uniform2f(loc(p, "u_res"), W, H);
          gl.uniform1f(loc(p, "u_t"), t);
          gl.uniform1f(loc(p, "u_travel"), travel);
          gl.uniform1f(loc(p, "u_xdrift"), xdrift);
          gl.uniform1f(loc(p, "u_camh"), camh);
          gl.uniform1f(loc(p, "u_focal"), focal);
          gl.uniform1f(loc(p, "u_horizon"), horizon);
          gl.uniform1f(loc(p, "u_cx"), cx);
          gl.uniform1f(loc(p, "u_panx"), panx);
          gl.uniform1f(loc(p, "u_pany"), pany);
          gl.uniform1f(loc(p, "u_dpr"), DPR);
          gl.uniform1f(loc(p, "u_span"), SPAN);
        }

        return {
          resize: function () {
            cv.width = Math.round(W * DPR);
            cv.height = Math.round(H * DPR);
          },
          render: function (t, travel, xdrift, camh, panx, pany, gi) {
            gl.viewport(0, 0, cv.width, cv.height);
            gl.clearColor(0, 0, 0, 1);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            /* sky + horizon glow */
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.BLEND);
            gl.useProgram(skyP);
            gl.uniform2f(loc(skyP, "u_res"), W, H);
            gl.uniform1f(loc(skyP, "u_dpr"), DPR);
            gl.uniform1f(loc(skyP, "u_gi"), gi);
            gl.uniform1f(loc(skyP, "u_glowRad"), W * (0.55 + 0.04 * Math.sin(t * 0.13)));
            gl.uniform2f(loc(skyP, "u_glowPos"), cx + panx * 0.6, horizon + pany);
            gl.uniform3fv(loc(skyP, "u_skyTop"), skyTopC);
            gl.uniform3fv(loc(skyP, "u_skyBot"), skyBotC);
            gl.uniform3fv(loc(skyP, "u_glowC"), glowC);
            gl.bindVertexArray(null);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            /* terrain mass — writes depth, so ridges truly occlude */
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.depthMask(true);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.useProgram(meshP);
            common(meshP, t, travel, xdrift, camh, panx, pany);
            gl.uniform2f(loc(meshP, "u_grid"), MC, MR);
            gl.uniform3fv(loc(meshP, "u_haze"), hazeC);
            gl.bindVertexArray(meshVAO);
            gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
            /* luminous point cloud — additive, depth-tested against the mesh */
            gl.depthMask(false);
            gl.blendFunc(gl.ONE, gl.ONE);
            gl.useProgram(ptsP);
            common(ptsP, t, travel, xdrift, camh, panx, pany);
            gl.uniform2f(loc(ptsP, "u_grid"), PC, PR);
            gl.uniform3fv(loc(ptsP, "u_lo"), loC);
            gl.uniform3fv(loc(ptsP, "u_hi"), hiC);
            gl.uniform3fv(loc(ptsP, "u_wlo"), wloC);
            gl.uniform3fv(loc(ptsP, "u_whi"), whiC);
            gl.uniform3fv(loc(ptsP, "u_haze"), hazeC);
            gl.uniform1f(loc(ptsP, "u_gain"), 1.15);
            gl.bindVertexArray(ptsVAO);
            gl.drawArrays(gl.POINTS, 0, PC * PR);
            gl.bindVertexArray(null);
            gl.depthMask(true);
          }
        };
      })();

      function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

      function project(x, h, z, camh) {
        return { x: cx + px + (x * focal) / z, y: horizon + py + ((camh - h) * focal) / z };
      }

      function draw(t, dt) {
        var travel = t * TERRAIN.speed;
        var camh = CAMH + Math.sin(t * 0.22) * 0.12;
        /* ease the camera toward the pointer; meander the flight path so the
           terrain slides gently sideways as well as forward */
        var cameraEase = 1 - Math.exp(-2.5 * (dt || 1 / 60));
        px += (mx * -26 - px) * cameraEase;
        py += (my * -12 - py) * cameraEase;
        var xdrift = Math.sin(t * 0.043) * 3;

        /* the glow ignites last in the boot sequence, like a sunrise as the
           system comes online (fully lit for the static frame's large t) */
        var gi = clamp01((t - 1.4) / 1.0); gi = gi * gi * (3 - 2 * gi);

        if (GLR) {
          /* the GL canvas below draws sky, glow, terrain mass and the
             luminous point cloud; this canvas keeps the story layer */
          ctx.clearRect(0, 0, W, H);
          GLR.render(t, travel, xdrift, camh, px, py, gi);
        } else {
          /* sky + ground base */
          ctx.fillStyle = skyGradient;
          ctx.fillRect(0, 0, W, H);

          /* horizon halo */
          var gx = cx + px * 0.6, gy = horizon + py;
          var glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, W * (0.55 + 0.04 * Math.sin(t * 0.13)));
          /* Match the GL halo: slightly dimmer, with a flat slope at both
             the centre and edge instead of a visible two-segment falloff. */
          for (var hs = 0; hs <= 32; hs++) {
            var hr = hs / 32;
            var ha = 0.16 * (1 - hr * hr * (3 - 2 * hr));
            glow.addColorStop(hr, "rgba(" + TERRAIN.glow + ", " + (ha * gi) + ")");
          }
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, W, H);
        }

        /* terrain rows, far -> near so close points paint over distant ones */
        for (var j = ROWS - 1; j >= 0; j--) {
          var fz = j / (ROWS - 1);
          var z = NEAR + Math.pow(fz, 1.55) * (FAR - NEAR);
          var zn = z + travel;
          var depth = 1 - fz;                       /* 1 near, 0 far */
          var alpha = 0.26 + 0.72 * Math.pow(depth, 1.2);
          var size = Math.min(3.6, Math.max(1, (focal / z) * 0.013));
          var bandI = Math.round(fz * (BANDS - 1));
          var ramp = RAMP[bandI], rampW = RAMPW[bandI];

          /* boot sequence: rows assemble far -> near, each point converging in
             from a scattered position. The far field never fully assembles —
             the horizon is forever resolving out of motes, so the intro never
             ends; it just recedes to the back of the world. */
          var gate = 0.5 + depth * 0.9;
          var e = clamp01((t - gate) / 0.55); e = e * e * (3 - 2 * e);
          var fray = fz > 0.72 ? Math.pow((fz - 0.72) / 0.28, 1.4) : 0;

          var hPrev = 0, cloudV = 0.5;
          for (var i = 0; i < COLS; i++) {
            var gridIndex = j * COLS + i;
            var r1 = gridR1[gridIndex], r2 = gridR2[gridIndex];
            /* organic jitter: points sit off the grid like a real point-cloud
               scan, not graph paper */
            var x = -SPAN + (2 * SPAN * i) / (COLS - 1) + (r1 - 0.5) * 0.42;
            var zj = z + (r2 - 0.5) * 0.5;
            var xw = x + xdrift;
            var h = terrainH(xw, zn + (r2 - 0.5) * 0.5);
            /* drifting cloud shadows (sampled every other column) */
            if (!GLR && !(i & 1)) cloudV = noise(xw * 0.07 + t * 0.055, zn * 0.07 - t * 0.03);
            /* low sun from the left: slopes facing it catch the light */
            var lit = clamp01(0.6 + (h - hPrev) * 0.9);
            hPrev = h;
            var sx = cx + px + (x * focal) / zj;
            var sy = horizon + py + ((camh - h) * focal) / zj;
            if (e < 1 || fray > 0) {
              var wob = fray > 0 ? 0.4 + 0.6 * Math.sin(t * 0.9 + r1 * 6.283) : 1;
              var scat = (1 - e) * (40 + 140 * r2);
              sx += (r1 - 0.5) * 2 * (scat + fray * 26 * wob);
              sy += -r2 * scat * 0.9 + (r1 - 0.5) * 2 * fray * 18 * wob;
            }
            pointVisible[i] = sx >= -100 && sx <= W + 100 ? 1 : 0;
            pointX[i] = sx; pointY[i] = sy;
            if (!GLR && pointVisible[i]) {
              /* Only the 2D fallback needs point colours and cloud lighting.
                 WebGL already computes these in its point-cloud shader. */
              var lum = 0.14 + (h / 3.1) * 0.72 + lit * 0.3 - (cloudV - 0.5) * 0.3;
              pointLum[i] = Math.max(0, Math.min(16, Math.round(lum * 16)));
              pointScale[i] = 0.7 + 0.6 * r2;
              pointWarm[i] = r1 > 0.93 ? 1 : 0;
            }
          }

          /* the land gets a body: each ridge fills softly down the frame, so
             nearer ridges occlude and separate from the ones behind */
          /* only every third row casts a silhouette, so the land separates into
             distinct misty layers instead of accumulating into murk
             (GL mode: the mesh provides the mass, so skip the fills) */
          var fillA = (!GLR && j % 3 === 0) ? 0.075 * e * (1 - fray) : 0;
          if (fillA > 0.008) {
            ctx.globalAlpha = 1;
            var hzT = fz * 0.5;   /* farther silhouettes carry the haze tint */
            ctx.fillStyle = "rgba(" + Math.round(5 + (TERRAIN.farTint[0] - 5) * hzT) + "," +
                                      Math.round(13 + (TERRAIN.farTint[1] - 13) * hzT) + "," +
                                      Math.round(9 + (TERRAIN.farTint[2] - 9) * hzT) + "," + fillA.toFixed(3) + ")";
            ctx.beginPath();
            var began = false;
            for (i = 0; i < COLS; i++) {
              if (!pointVisible[i]) continue;
              if (!began) { ctx.moveTo(pointX[i], pointY[i]); began = true; }
              else ctx.lineTo(pointX[i], pointY[i]);
            }
            if (began) {
              ctx.lineTo(W + 30, H + 30); ctx.lineTo(-30, H + 30);
              ctx.closePath(); ctx.fill();
            }
          }

          /* contour line, smoothed through midpoints so it meanders like a
             hand-drawn survey line — fades in as the row assembles and
             dissolves again in the frayed horizon band */
          ctx.globalAlpha = alpha * e * e * (1 - fray * 0.85);
          ctx.strokeStyle = TERRAIN.wire;
          ctx.lineWidth = 1;
          ctx.beginPath();
          var previousPoint = -1;
          for (i = 0; i < COLS; i++) {
            if (!pointVisible[i]) { previousPoint = -1; continue; }
            if (previousPoint < 0) ctx.moveTo(pointX[i], pointY[i]);
            else ctx.quadraticCurveTo(pointX[previousPoint], pointY[previousPoint],
              (pointX[previousPoint] + pointX[i]) / 2, (pointY[previousPoint] + pointY[i]) / 2);
            previousPoint = i;
          }
          ctx.stroke();

          /* the points themselves: varied sizes, occasional warm flecks like
             lichen catching the light (GL mode: the point cloud lives on the
             GL canvas, so the 2D layer keeps only the contour lines) */
          if (!GLR) {
            var pAlpha = Math.min(1, alpha * 1.15) * (0.3 + 0.7 * e) * (1 - fray * 0.3);
            ctx.globalAlpha = pAlpha;
            for (i = 0; i < COLS; i++) {
              if (!pointVisible[i]) continue;
              var ps = size * pointScale[i];
              ctx.fillStyle = (pointWarm[i] ? rampW : ramp)[pointLum[i]];
              ctx.fillRect(pointX[i] - ps / 2, pointY[i] - ps / 2, ps, ps);
            }
            /* additive bloom pass: sunlit ground becomes luminous, not plotted */
            ctx.globalCompositeOperation = "lighter";
            for (i = 0; i < COLS; i++) {
              if (!pointVisible[i] || pointLum[i] < 10) continue;
              var ps2 = size * pointScale[i];
              ctx.globalAlpha = pAlpha * 0.42 * ((pointLum[i] - 9) / 7);
              ctx.drawImage(glowSprite((pointWarm[i] ? rampW : ramp)[pointLum[i]]),
                            pointX[i] - ps2 * 2.1, pointY[i] - ps2 * 2.1, ps2 * 4.2, ps2 * 4.2);
            }
            ctx.globalCompositeOperation = "source-over";
          }
        }
        ctx.globalAlpha = 1;

        /* low valley fog: soft banks drifting through the corridor, fading in
           once the terrain has assembled */
        var fogA = clamp01((t - 1.3) / 1.6);
        if (fogA > 0) {
          var RANGE = FAR - NEAR - 3;
          for (var fi = 0; fi < fogs.length; fi++) {
            var F = fogs[fi];
            var zw = NEAR + 1 + (((F.zn - travel) % RANGE) + RANGE) % RANGE;
            var fxw = F.x + Math.sin(t * 0.05 + F.drift) * 1.5;
            var fh2 = terrainH(fxw + xdrift, zw + travel);
            var fp = project(fxw, fh2 * 0.45, zw, camh);
            var rad = (focal / zw) * F.s;
            if (rad < 6 || fp.x < -rad * 3 || fp.x > W + rad * 3) continue;
            var dfade = clamp01((FAR - 4 - zw) / (FAR - 8));
            ctx.save();
            ctx.translate(fp.x, fp.y);
            ctx.scale(2.6, 1);
            var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
            fg.addColorStop(0, "rgba(126, 168, 142," + (0.055 * fogA * dfade).toFixed(3) + ")");
            fg.addColorStop(1, "rgba(126, 168, 142, 0)");
            ctx.fillStyle = fg;
            ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
            ctx.restore();
          }
        }

        /* data-motes drifting upward, twinkling — brighter during the boot
           sequence, when they read as the raw material the terrain forms from */
        var moteBoost = 1 + Math.max(0, 1 - t / 2.2) * 0.9;
        for (var mi = 0; mi < motes.length; mi++) {
          var M = motes[mi];
          var yy = ((M.y - t * M.v) % 1 + 1) % 1;
          var tw = 0.5 + 0.5 * Math.sin(t * 1.7 + M.ph);
          ctx.fillStyle = "rgba(" + TERRAIN.mote + "," + Math.min(0.5, (0.06 + 0.2 * tw) * moteBoost).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(M.x * W + px * 0.5, yy * H + py * 0.5, M.s, 0, 6.2832); ctx.fill();
        }

        drawBirds(t);

        /* soft vignette so the white panels pop against the edges */
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, W, H);
      }

      var terrainFrame = 0, terrainTime = 0, previousTime = null, manuallyPaused = false;
      function frame(ts) {
        terrainFrame = 0;
        if (!animate || document.hidden) return;
        var dt = previousTime === null ? 0 : Math.min((ts - previousTime) / 1000, .1);
        previousTime = ts;
        terrainTime += dt;
        draw(terrainTime, dt);
        terrainFrame = requestAnimationFrame(frame);
      }
      function syncMotion() {
        cancelAnimationFrame(terrainFrame); previousTime = null;
        animate = !manuallyPaused && !matchMedia('(prefers-reduced-motion: reduce)').matches && !matchMedia('(max-width: 1100px)').matches;
        var toggle = document.querySelector('.terrain-toggle');
        if (toggle) { toggle.textContent = animate ? 'Pause motion' : 'Play motion'; toggle.setAttribute('aria-pressed', String(!animate)); }
        if (animate && !document.hidden) terrainFrame = requestAnimationFrame(frame);
      }
      document.addEventListener('DOMContentLoaded', function() {
        var toggle = document.querySelector('.terrain-toggle');
        if (toggle) toggle.addEventListener('click', function() { manuallyPaused = !manuallyPaused; syncMotion(); });
        syncMotion();
      });
      document.addEventListener('visibilitychange', syncMotion);
      matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', syncMotion);
      matchMedia('(max-width: 1100px)').addEventListener('change', syncMotion);

      resize();
      window.addEventListener("resize", function () { resize(); if (!animate) drawStatic(); });
      function drawStatic() {
        /* Reduced-motion/mobile still: the same landscape and a passing flock. */
        var t = 11.3;
        spawnFlock(t);
        flock.born = t - flock.dur * 0.42;
        draw(t);
        flock = null;
      }
      if (animate) terrainFrame = requestAnimationFrame(frame);
      else drawStatic();
    })();
