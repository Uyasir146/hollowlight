// A seeded generator, so a screenshot scene is the same frame every time it is staged and a run can be
// replayed from its seed. mulberry32: small, fast, good enough for spawn angles and star placement.
export function createRandom(seed) {
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    range(min, max) {
      return min + next() * (max - min);
    },
    int(min, max) {
      return Math.floor(this.range(min, max + 1));
    },
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** A point on the field's rim, so enemies walk in from outside the frame. */
    rim() {
      const side = this.int(0, 3);
      if (side === 0) return { x: this.range(0, 1280), y: -40 };
      if (side === 1) return { x: 1320, y: this.range(0, 720) };
      if (side === 2) return { x: this.range(0, 1280), y: 760 };
      return { x: -40, y: this.range(0, 720) };
    },
  };
}
