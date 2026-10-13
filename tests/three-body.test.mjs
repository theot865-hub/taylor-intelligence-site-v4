import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../three-body.js', import.meta.url), 'utf8');
const { createSystem, advance, STEP } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const bodies = createSystem();
function energy(b) {
  let total = b.reduce((sum, p) => sum + .5 * p.mass * (p.vx ** 2 + p.vy ** 2), 0);
  b.forEach((p, i) => b.slice(i + 1).forEach(q => { total -= p.mass * q.mass / Math.hypot(p.x - q.x, p.y - q.y); }));
  return total;
}
const initial = energy(bodies);
assert.equal(initial, -12.816666666666666);
let maxDrift = 0, minSeparation = Infinity;
for (let i = 0; i < 120 * 150; i++) {
  advance(bodies);
  maxDrift = Math.max(maxDrift, Math.abs((energy(bodies) - initial) / initial));
  bodies.forEach((b, j) => bodies.slice(j + 1).forEach(c => { minSeparation = Math.min(minSeparation, Math.hypot(b.x - c.x, b.y - c.y)); }));
}
assert.ok(bodies.every(b => Object.values(b).every(Number.isFinite)), 'finite through encounters and escape');
assert.ok(maxDrift < 1e-6, 'relative energy drift below 0.0001%');
assert.ok(minSeparation < .05, 'test includes close encounters');
assert.ok(Math.hypot(...['vx', 'vy'].map(k => bodies.reduce((s, b) => s + b.mass * b[k], 0))) < 1e-8, 'momentum conserved');
assert.ok(Math.hypot(...['x', 'y'].map(k => bodies.reduce((s, b) => s + b.mass * b[k] / 12, 0))) < 1e-8, 'stationary centre of mass');
assert.ok(Math.abs(bodies.reduce((s, b) => s + b.mass * (b.x * b.vy - b.y * b.vx), 0)) < 1e-6, 'angular momentum conserved');
// Output cadence must not determine the orbit. Compare to tighter integration.
const a = createSystem(), reference = createSystem();
for (let i = 0; i < 120 * 10; i++) advance(a, STEP);
for (let i = 0; i < 60 * 10; i++) advance(reference, 1 / 60, 1e-13);
const convergence = Math.max(...a.flatMap((b, i) => ['x', 'y', 'vx', 'vy'].map(k => Math.abs(b[k] - reference[i][k]))));
assert.ok(convergence < 1e-5, 'trajectory agrees with tighter integration at a different output cadence');
console.log({ simulatedTime: 150, maxRelativeEnergyDrift: maxDrift, minSeparation, convergence });
