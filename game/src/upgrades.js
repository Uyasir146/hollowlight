// The three cards offered between waves. Each one changes a modifier the simulation reads, never a
// constant, so a run's tuning is the base numbers shaped by what the player chose. The pool is filtered
// by what is still useful (a heal when already full, a stack that is capped), then three are drawn.
export const UPGRADES = [
  {
    id: 'swift', name: 'Warden Step', glyph: '\u2192',
    blurb: '+12% move speed. The best defence is not being where the shard lands.',
    maxStacks: 4, colour: '#8ef0ff',
    apply(state) { state.mods.speed *= 1.12; },
  },
  {
    id: 'wide', name: 'Wider Ward', glyph: '\u25dc',
    blurb: '+8\u00b0 of arc on each side. More of the world can be caught and sent back.',
    maxStacks: 4, colour: '#8ef0ff',
    apply(state) { state.mods.wardHalf += 0.14; },
  },
  {
    id: 'hot', name: 'Hot Mirror', glyph: '\u25c8',
    blurb: '+35% damage on every returned shard. Chain kills come faster.',
    maxStacks: 4, colour: '#ffd166',
    apply(state) { state.mods.reflectDamage *= 1.35; },
  },
  {
    id: 'quick', name: 'Quick Charge', glyph: '\u25cb',
    blurb: '+30% flare charge per catch. The flare arrives before the swarm does.',
    maxStacks: 3, colour: '#ffd166',
    apply(state) { state.mods.chargeGain *= 1.3; },
  },
  {
    id: 'far', name: 'Long Flare', glyph: '\u2739',
    blurb: '+28% flare radius. It reaches the back of the crowd.',
    maxStacks: 3, colour: '#ffb3c1',
    apply(state) { state.mods.flareRadius *= 1.28; },
  },
  {
    id: 'pierce', name: 'Split Light', glyph: '\u2b2f',
    blurb: 'A returned shard passes through one more enemy before it is spent.',
    maxStacks: 2, colour: '#a678ff',
    apply(state) { state.mods.pierce += 1; },
  },
  {
    id: 'heart', name: 'Steady Wick', glyph: '\u2665',
    blurb: '+1 heart and heal one. The dark has to work harder.',
    maxStacks: 2, colour: '#ff6b7a',
    apply(state) { state.mods.maxHearts += 1; state.hearts = Math.min(state.mods.maxHearts, state.hearts + 1); },
  },
  {
    id: 'mend', name: 'Gather Embers', glyph: '\u2726',
    blurb: 'Heal one heart now.',
    maxStacks: 99, colour: '#ff6b7a',
    available: (state) => state.hearts < state.mods.maxHearts,
    apply(state) { state.hearts = Math.min(state.mods.maxHearts, state.hearts + 1); },
  },
  {
    id: 'steady', name: 'Steady Hand', glyph: '\u21bb',
    blurb: '+35% ward turn rate. The arc gets where it is needed sooner.',
    maxStacks: 3, colour: '#8ef0ff',
    apply(state) { state.mods.turnMul *= 1.35; },
  },
  {
    id: 'lasting', name: 'Lasting Light', glyph: '\u2748',
    blurb: '+25% flight time on a returned shard. It keeps hunting longer.',
    maxStacks: 3, colour: '#ffd166',
    apply(state) { state.mods.shardLife *= 1.25; },
  },
  {
    id: 'feed', name: 'Ember Feed', glyph: '\u2735',
    blurb: '+4 flare charge per kill. The crowd pays for its own undoing.',
    maxStacks: 3, colour: '#ffb347',
    apply(state) { state.mods.killCharge += 4; },
  },
  {
    id: 'sear', name: 'Searing Flare', glyph: '\u2600',
    blurb: '+45% flare damage. What survives the pulse is left limping.',
    maxStacks: 3, colour: '#ff9e7a',
    apply(state) { state.mods.flareDamage *= 1.45; },
  },
  {
    id: 'calm', name: 'Even Breath', glyph: '\u25cc',
    blurb: 'A hit leaves you untouchable a little longer, and knocks you clear.',
    maxStacks: 2, colour: '#7f92b8',
    apply(state) { state.mods.invuln += 0.45; state.mods.knockback *= 1.35; },
  },
];

/**
 * Boss rewards are not more of the same: one card, taken from a short list that is never offered
 * between waves, so beating a boss visibly changes the run rather than nudging a number.
 */
export const RELICS = [
  {
    id: 'relic-twin', name: 'TWIN WARD', glyph: '\u25dc', relic: true,
    blurb: 'The catching arc widens by half again on both sides.',
    maxStacks: 1, colour: '#e8fdff',
    apply(state) { state.mods.wardHalf += 0.5; },
  },
  {
    id: 'relic-gale', name: 'GALE STEP', glyph: '\u27f6', relic: true,
    blurb: 'A fifth of the warden moves faster than the shards chasing it.',
    maxStacks: 1, colour: '#8ef0ff',
    apply(state) { state.mods.speed *= 1.2; },
  },
  {
    id: 'relic-mirror', name: 'TRUE MIRROR', glyph: '\u25c8', relic: true,
    blurb: 'Returned shards carry nearly twice the force.',
    maxStacks: 1, colour: '#ffd166',
    apply(state) { state.mods.reflectDamage *= 1.8; },
  },
  {
    id: 'relic-vessel', name: 'LAST VESSEL', glyph: '\u2665', relic: true,
    blurb: 'Two more hearts, and both of them filled.',
    maxStacks: 1, colour: '#ff6b7a',
    apply(state) { state.mods.maxHearts += 2; state.hearts = Math.min(state.mods.maxHearts, state.hearts + 2); },
  },
];

function stacksOf(state, id) {
  return state.upgrades.filter((entry) => entry === id).length;
}

/** Three distinct cards this run can still use; fewer only if the pool has run dry. */
export function offerUpgrades(state, random) {
  const pool = UPGRADES.filter((upgrade) => {
    if (upgrade.available && !upgrade.available(state)) return false;
    return stacksOf(state, upgrade.id) < upgrade.maxStacks;
  });
  const picked = [];
  const bag = pool.slice();
  while (picked.length < 3 && bag.length > 0) {
    picked.push(bag.splice(random.int(0, bag.length - 1), 1)[0]);
  }
  return picked;
}

/** Two relics the run does not already hold. Fewer only if the list has run dry. */
export function offerRelics(state, random) {
  const pool = RELICS.filter((relic) => stacksOf(state, relic.id) < relic.maxStacks);
  const picked = [];
  const bag = pool.slice();
  while (picked.length < 2 && bag.length > 0) {
    picked.push(bag.splice(random.int(0, bag.length - 1), 1)[0]);
  }
  return picked;
}

export function applyUpgrade(state, upgrade) {
  upgrade.apply(state);
  state.upgrades.push(upgrade.id);
}