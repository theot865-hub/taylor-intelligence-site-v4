/* Burrau's Pythagorean three-body initial-value problem, G = 1.
   Masses 3, 4, 5 start at rest opposite the corresponding triangle sides.
   Reference: https://www.ucolick.org/~laugh/oxide/projects/burrau.html
   Unsoftened Newtonian gravity; adaptive RK4 step doubling resolves close passes.
   No prescribed orbits, restoring forces, damping, or periodic resets. */
export const STEP = 1 / 120;
export function createSystem() {
  return [
    { mass: 3, x: 1, y: 3, vx: 0, vy: 0 },
    { mass: 4, x: -2, y: -1, vx: 0, vy: 0 },
    { mass: 5, x: 1, y: -1, vx: 0, vy: 0 }
  ];
}
function derivative(state, masses) {
  const result = new Float64Array(12);
  for (let i = 0; i < 3; i++) {
    result[i * 4] = state[i * 4 + 2]; result[i * 4 + 1] = state[i * 4 + 3];
    for (let j = i + 1; j < 3; j++) {
      const dx = state[j * 4] - state[i * 4], dy = state[j * 4 + 1] - state[i * 4 + 1];
      const r2 = dx * dx + dy * dy, inverseCube = 1 / (r2 * Math.sqrt(r2));
      result[i * 4 + 2] += masses[j] * dx * inverseCube;
      result[i * 4 + 3] += masses[j] * dy * inverseCube;
      result[j * 4 + 2] -= masses[i] * dx * inverseCube;
      result[j * 4 + 3] -= masses[i] * dy * inverseCube;
    }
  }
  return result;
}
function rk4(state, masses, h) {
  const shifted = (k, fraction) => state.map((value, i) => value + h * fraction * k[i]);
  const a = derivative(state, masses), b = derivative(shifted(a, .5), masses);
  const c = derivative(shifted(b, .5), masses), d = derivative(shifted(c, 1), masses);
  return state.map((value, i) => value + h * (a[i] + 2 * b[i] + 2 * c[i] + d[i]) / 6);
}
export function advance(bodies, duration = STEP, tolerance = 1e-12) {
  const masses = bodies.map(b => b.mass);
  let state = Float64Array.from(bodies.flatMap(b => [b.x, b.y, b.vx, b.vy]));
  let elapsed = 0, h = duration, iterations = 0;
  while (elapsed < duration) {
    if (++iterations > 20000) throw new Error('Three-body integration did not converge');
    h = Math.min(h, duration - elapsed);
    const full = rk4(state, masses, h);
    const half = rk4(rk4(state, masses, h / 2), masses, h / 2);
    let error = 0;
    for (let i = 0; i < state.length; i++) error = Math.max(error, Math.abs(half[i] - full[i]) / (15 * (1 + Math.abs(half[i]))));
    if (!Number.isFinite(error) || h < 1e-12) throw new Error('Unresolved three-body encounter');
    if (error <= tolerance) { state = half; elapsed += h; }
    h *= error === 0 ? 2 : Math.max(.15, Math.min(2, .9 * (tolerance / error) ** .2));
  }
  bodies.forEach((b, i) => { [b.x, b.y, b.vx, b.vy] = state.slice(i * 4, i * 4 + 4); });
}
