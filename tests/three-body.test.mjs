import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Import the browser module without changing this static site's package type.
const source = readFileSync(new URL('../three-body.js', import.meta.url), 'utf8');
const { createSystem, advance } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const bodies = createSystem();
function energy() {
  let total = bodies.reduce((sum, b) => sum + .5 * (b.vx ** 2 + b.vy ** 2), 0);
  bodies.forEach((b, i) => bodies.slice(i + 1).forEach(c => { total -= 1 / Math.hypot(b.x - c.x, b.y - c.y); }));
  return total;
}
const initial = energy();
let maxDrift = 0, maxRadius = 0;
for (let i = 0; i < 480 * 1000; i++) {
  advance(bodies);
  maxDrift = Math.max(maxDrift, Math.abs((energy() - initial) / initial));
  maxRadius = Math.max(maxRadius, ...bodies.map(b => Math.hypot(b.x, b.y)));
}
assert.ok(bodies.every(b => Object.values(b).every(Number.isFinite)), 'finite state');
assert.ok(maxDrift < .0001, 'relative energy drift below 0.01%');
assert.ok(maxRadius < 2, 'system stays bounded');
assert.ok(Math.hypot(...['vx', 'vy'].map(k => bodies.reduce((s, b) => s + b[k], 0))) < 1e-8, 'momentum conserved');
assert.ok(Math.hypot(...['x', 'y'].map(k => bodies.reduce((s, b) => s + b[k] / 3, 0))) < 1e-8, 'stationary centre of mass');
console.log({ simulatedTime: 1000, maxRelativeEnergyDrift: maxDrift, maxRadius });
