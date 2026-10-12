/* Newtonian equal-mass three-body system, G = 1.
   Figure-eight initial conditions (Carles Simó), Chenciner & Montgomery:
   https://people.ucsc.edu/~rmont/talks/Heidelberg2Problems.pdf
   Velocity Verlet with a fixed physical timestep; no prescribed paths. */
export const STEP = 1 / 480;
export function createSystem() {
  return [
    { x: .97000436, y: -.24308753, vx: .466203685, vy: .43236573 },
    { x: -.97000436, y: .24308753, vx: .466203685, vy: .43236573 },
    { x: 0, y: 0, vx: -.93240737, vy: -.86473146 }
  ];
}
function acceleration(bodies) {
  const a = bodies.map(() => ({ x: 0, y: 0 }));
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
    const dx = bodies[j].x - bodies[i].x, dy = bodies[j].y - bodies[i].y;
    const r2 = dx * dx + dy * dy, force = 1 / (r2 * Math.sqrt(r2));
    a[i].x += dx * force; a[i].y += dy * force;
    a[j].x -= dx * force; a[j].y -= dy * force;
  }
  return a;
}
export function advance(bodies, dt = STEP) {
  const before = acceleration(bodies);
  bodies.forEach((b, i) => {
    b.x += b.vx * dt + .5 * before[i].x * dt * dt;
    b.y += b.vy * dt + .5 * before[i].y * dt * dt;
  });
  const after = acceleration(bodies);
  bodies.forEach((b, i) => {
    b.vx += .5 * (before[i].x + after[i].x) * dt;
    b.vy += .5 * (before[i].y + after[i].y) * dt;
  });
}
