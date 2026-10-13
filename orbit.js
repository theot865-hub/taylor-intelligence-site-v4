import { createSystem, advance, STEP } from './three-body.js';

const host = document.querySelector('.atlas-hero');
const canvas = document.getElementById('atlas-canvas');
if (host && canvas) {
  const ctx = canvas.getContext('2d');
  const toggle = host.querySelector('.orbit-toggle');
  if (!ctx) toggle.hidden = true;
  else {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const bodies = createSystem();
    const colors = ['215,73,20', '232,151,43', '96,72,60'];
    const trails = bodies.map(() => []);
    const trailLength = 720;
    let sample = 0, width = 0, height = 0, cx = 0, cy = 0;
    let frame = 0, previous = null, accumulator = 0, visible = true;
    let paused = reduced.matches, userPaused = false;
    let view = { x: 0, y: 0, extentX: 3, extentY: 3 };
    function step() {
      advance(bodies);
      if (++sample % 3 === 0) bodies.forEach((b, i) => {
        trails[i].push({ x: b.x, y: b.y });
        if (trails[i].length > trailLength) trails[i].shift();
      });
    }
    // Pre-integrate a short history so the static/reduced-motion view is complete.
    for (let i = 0; i < trailLength * 3; i++) step();
    fitView(true);
    function fitView(immediate = false) {
      // The camera follows the physical positions, never pushes bodies back onscreen.
      const points = [...bodies, ...trails.flat()];
      const xs = points.map(p => p.x), ys = points.map(p => p.y);
      const left = Math.min(...xs), right = Math.max(...xs);
      const top = Math.min(...ys), bottom = Math.max(...ys);
      const target = { x: (left + right) / 2, y: (top + bottom) / 2,
        extentX: Math.max(1.5, (right - left) / 2), extentY: Math.max(1.5, (bottom - top) / 2) };
      for (const key of Object.keys(view)) view[key] += (target[key] - view[key]) * (immediate ? 1 : .035);
    }
    function project(p) {
      const mobile = width < 701;
      const unit = Math.min((mobile ? width * .42 : width * .22) / view.extentX,
        (mobile ? 82 : 126) / view.extentY);
      return { x: cx + (p.x - view.x) * unit, y: cy + (p.y - view.y) * unit };
    }
    function render() {
      ctx.clearRect(0, 0, width, height);
      // All lines are sampled physical trajectories, never orbit templates.
      trails.forEach((trail, i) => {
        for (let j = 1; j < trail.length; j++) {
          const a = project(trail[j - 1]), b = project(trail[j]);
          const age = j / trail.length;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${colors[i]},${(.12 + age * .7)})`;
          ctx.lineWidth = .45 + age * .9; ctx.stroke();
        }
      });
      bodies.forEach((body, i) => {
        const p = project(body), r = (width < 701 ? 3.8 : 5.3) * Math.cbrt(body.mass / 3);
        const glow = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, r * 6);
        glow.addColorStop(0, `rgba(${colors[i]},.36)`); glow.addColorStop(1, `rgba(${colors[i]},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgb(${colors[i]})`; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff6df'; ctx.beginPath(); ctx.arc(p.x, p.y, r * .36, 0, Math.PI * 2); ctx.fill();
      });
    }
    function resize() {
      const bounds = host.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (width < 701) { cx = width * .52; cy = 335; }
      else { cx = width * .735; cy = height * .44; }
      render();
    }
    function tick(now) {
      frame = 0;
      if (paused || !visible || document.hidden) return;
      // Simulated time is independent of display refresh; cap recovery after stalls.
      if (previous !== null) accumulator += Math.min((now - previous) / 1000, .05) * 1.15;
      previous = now;
      try {
        while (accumulator >= STEP) { step(); accumulator -= STEP; }
      } catch (error) {
        paused = true; updateToggle(); render();
        console.error(error); return;
      }
      fitView(); render(); frame = requestAnimationFrame(tick);
    }
    function schedule() {
      cancelAnimationFrame(frame); frame = 0; previous = null;
      if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
      else render();
    }
    function updateToggle() {
      toggle.textContent = paused ? 'Play motion' : 'Pause motion';
      toggle.setAttribute('aria-pressed', String(paused));
    }
    toggle.addEventListener('click', () => { paused = !paused; userPaused = paused; updateToggle(); schedule(); });
    reduced.addEventListener('change', () => { paused = reduced.matches || userPaused; updateToggle(); schedule(); });
    new ResizeObserver(resize).observe(host);
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; schedule(); }).observe(host);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('hashchange', () => requestAnimationFrame(() => {
      visible = !document.getElementById('page-home').classList.contains('is-hidden'); resize(); schedule();
    }));
    resize(); updateToggle(); schedule();
  }
}
