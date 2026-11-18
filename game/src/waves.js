// What each wave sends, and in what order. The composition is the difficulty curve: the first waves
// teach one enemy at a time, then every wave mixes what came before with a little more of it.
export const WAVE_NAMES = [
  'first light', 'drift', 'the leaning', 'press', 'split', 'the long dark',
  'narrow', 'siege', 'the deep', 'hollow', 'last wick', 'no dawn',
  'the count', 'salt and rust', 'what waited',
];

/** The boss a wave carries, or null. The stride alternates the two names, so wave 5 and 10 differ. */
export function bossFor(wave) {
  if (wave % BOSS_EVERY !== 0) return null;
  return (wave / BOSS_EVERY) % 2 === 1 ? 'hollowking' : 'leviathan';
}

/** Which enemy kinds are on the field from which wave on. */
const UNLOCK = { drifter: 1, lurker: 4, weaver: 5, splitter: 6, sentinel: 8 };

const BOSS_EVERY = 5;

/**
 * How many of each kind a wave fields, before they are shuffled into a spawn order. A boss wave sends
 * a smaller escort: the boss is the wave, and a crowd on top of it would only hide it.
 */
export function waveComposition(wave) {
  const boss = bossFor(wave) !== null;
  const raw = 1 + Math.round(wave * 0.75);
  const budget = boss ? Math.max(2, Math.round(raw * 0.5)) : raw;
  const counts = { drifter: 0, lurker: 0, weaver: 0, splitter: 0, sentinel: 0 };

  const weights = [];
  for (const [kind, from] of Object.entries(UNLOCK)) {
    if (wave < from) continue;
    // Newer kinds start as a taste and grow; the drifter fades into the background as the rest arrive.
    const age = wave - from;
    const weight = kind === 'drifter' ? Math.max(0.6, 1.6 - wave * 0.12) : Math.min(2.2, 0.7 + age * 0.35);
    weights.push([kind, weight]);
  }
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [kind, weight] of weights) {
    counts[kind] = Math.max(0, Math.round((budget * weight) / total));
  }

  // Every wave has at least two bodies in it, however the rounding went.
  let placed = Object.values(counts).reduce((sum, n) => sum + n, 0);
  while (placed < 2) { counts.drifter += 1; placed += 1; }

  const kinds = [];
  for (const [kind, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) kinds.push(kind);
  }
  return kinds;
}

/** The spawn order for a wave: a shuffle, so two runs of the same wave are not the same queue. */
export function waveSpawnOrder(wave, random) {
  const kinds = waveComposition(wave);
  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const swap = random.int(0, index);
    [kinds[index], kinds[swap]] = [kinds[swap], kinds[index]];
  }
  return kinds;
}

export function waveName(wave) {
  return WAVE_NAMES[Math.min(wave, WAVE_NAMES.length) - 1] ?? 'the deep';
}

/**
 * How fast enemies work their trigger, as a multiplier on the timer: below 1 they fire slower than their
 * base rate. The first waves are deliberately unhurried so a new player can learn the catch, and the
 * rate climbs to the base speed and stays there.
 */
export function fireRateFor(wave) {
  return Math.min(1, 0.62 + (wave - 1) * 0.05);
}

export function enemySpeedFor(wave) {
  return 1 + Math.min(0.45, (wave - 1) * 0.035);
}