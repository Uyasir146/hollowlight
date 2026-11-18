// Everything that only exists to make a moment feel like something: sparks on a reflect, ash on a kill,
// dust where a warden steps, a ring where a wave breaks. Particles are plain objects in one pool, drawn
// in world space, and they never affect the simulation, which is why every scene can be staged twice and
// still be the same frame.
const MAX = 900;

export function createParticles(random) {
  const pool = [];
  let seed = 1;

  function push(particle) {
    if (pool.length >= MAX) pool.shift();
    pool.push(particle);
  }

  return {
    clear() {
      pool.length = 0;
    },
    get all() {
      return pool;
    },
    /** A shard meets the ward: a short spray along the reflected direction. */
    spark(x, y, angle, count = 8, colour = '#8ef0ff') {
      for (let index = 0; index < count; index += 1) {
        const spread = angle + random.range(-0.7, 0.7);
        const speed = random.range(90, 320);
        push({
          kind: 'spark', x, y,
          vx: Math.cos(spread) * speed, vy: Math.sin(spread) * speed,
          life: random.range(0.18, 0.42), age: 0, colour, size: random.range(1.4, 3.2), drag: 3.4,
        });
      }
    },
    /** An enemy breaks: ash that drifts outward and settles. */
    ash(x, y, count = 14, colour = '#6f8bff', radius = 16) {
      for (let index = 0; index < count; index += 1) {
        const angle = random.range(0, Math.PI * 2);
        const speed = random.range(30, 190);
        push({
          kind: 'ash', x: x + Math.cos(angle) * random.range(0, radius),
          y: y + Math.sin(angle) * random.range(0, radius),
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: random.range(0.4, 1.1), age: 0, colour, size: random.range(1.6, 4), drag: 1.9,
        });
      }
    },
    /** A wave breaks: a ring of light that expands and fades. */
    ring(x, y, colour = '#8ef0ff') {
      push({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.55, age: 0, colour, size: 1, drag: 0 });
    },
    /** The warden's own glow throws a mote now and then, so standing still is never dead. */
    mote(x, y, colour = '#ffcf6b') {
      const angle = random.range(0, Math.PI * 2);
      push({
        kind: 'spark', x, y,
        vx: Math.cos(angle) * random.range(6, 26), vy: Math.sin(angle) * random.range(6, 26),
        life: random.range(0.5, 1.2), age: 0, colour, size: random.range(1, 2.4), drag: 0.8,
      });
    },
    step(dt) {
      for (let index = pool.length - 1; index >= 0; index -= 1) {
        const p = pool[index];
        p.age += dt;
        if (p.age >= p.life) {
          pool.splice(index, 1);
          continue;
        }
        if (p.kind === 'ring') continue;
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    },
    /** Fraction of life left, for the renderer's fade. */
    life(p) {
      return 1 - p.age / p.life;
    },
    nextSeed() {
      seed += 1;
      return seed;
    },
  };
}
