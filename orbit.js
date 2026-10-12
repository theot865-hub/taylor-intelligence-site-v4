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
    const colors = ['211,83,25', '236,137,39', '126,69,39'];
    const trails = bodies.map(() => []);
    const trailLength = 250;
    let sample = 0, width = 0, height = 0, scale = 1, cx = 0, cy = 0;
    let frame = 0, previous = null, accumulator = 0, visible = true;
    let paused = reduced.matches, userPaused = false;
    function step() {
      advance(bodies);
      if (++sample % 5 === 0) bodies.forEach((b, i) => {
        trails[i].push({ x: b.x, y: b.y });
        if (trails[i].length > trailLength) trails[i].shift();
      });
    }
    // Pre-integrate a short history so the static/reduced-motion view is complete.
    for (let i = 0; i < trailLength * 5; i++) step();
    function project(p) {
      const angle = -.36, x = p.x * scale, y = p.y * scale;
      return { x: cx + x * Math.cos(angle) - y * Math.sin(angle), y: cy + x * Math.sin(angle) + y * Math.cos(angle) };
    }
    function render() {
      ctx.clearRect(0, 0, width, height);
      // All lines are sampled physical trajectories, never orbit templates.
      trails.forEach((trail, i) => {
        for (let j = 1; j < trail.length; j++) {
          const a = project(trail[j - 1]), b = project(trail[j]);
          const age = j / trail.length;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = `rgba(${colors[i]},${age * .62})`;
          ctx.lineWidth = .6 + age * 1.5; ctx.stroke();
        }
      });
      bodies.forEach((body, i) => {
        const p = project(body), r = width < 701 ? 12 : 19;
        const glow = ctx.createRadialGradient(p.x, p.y, r * .2, p.x, p.y, r * 5);
        glow.addColorStop(0, `rgba(${colors[i]},.24)`); glow.addColorStop(1, `rgba(${colors[i]},0)`);
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2); ctx.fill();
        const sphere = ctx.createRadialGradient(p.x - r * .35, p.y - r * .4, 0, p.x, p.y, r);
        sphere.addColorStop(0, '#fff0b8'); sphere.addColorStop(.32, i === 2 ? '#db9b60' : '#ffc071');
        sphere.addColorStop(.72, `rgb(${colors[i]})`); sphere.addColorStop(1, i === 2 ? '#573425' : '#a64019');
        ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colors[i]},.2)`; ctx.lineWidth = .6; ctx.stroke();
      });
    }
    function resize() {
      const bounds = host.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (width < 701) { cx = width * .52; cy = 335; scale = Math.min(width * .37, 170); }
      else { cx = width * .735; cy = height * .44; scale = Math.min(width * .205, height * .52); }
      render();
    }
    function tick(now) {
      frame = 0;
      if (paused || !visible || document.hidden) return;
      // Simulated time is independent of display refresh; cap recovery after stalls.
      if (previous !== null) accumulator += Math.min((now - previous) / 1000, .05) * .38;
      previous = now;
      while (accumulator >= STEP) { step(); accumulator -= STEP; }
      render(); frame = requestAnimationFrame(tick);
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
