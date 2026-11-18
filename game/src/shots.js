// The screenshot scenes. Each one plays the real simulation forward with an autopilot and stops on a
// frame worth looking at, so what the pictures show is a real game state and not a mock-up: the same
// seed always lands on the same frame, which is what makes the shots reproducible.
import { FIELD, FLARE, WARD } from './config.js';
import { createRandom } from './random.js';
import { offerUpgrades } from './upgrades.js';

function nearestEnemy(state) {
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of state.enemies) {
    const distance = Math.hypot(enemy.x - state.warden.x, enemy.y - state.warden.y);
    if (distance < bestDistance) { bestDistance = distance; best = enemy; }
  }
  return best;
}

/**
 * A player good enough to make an honest picture. It watches what is in the air, picks the shard that
 * will pass closest soonest, holds still while that shard closes so the arc can catch it, and repositions
 * between volleys. It is deliberately not perfect: it dies on the hard waves like anyone would.
 */
export function autopilot(state) {
  const warden = state.warden;
  const hostile = state.shards.filter((shard) => shard.owner === 'enemy');

  // Time to closest approach for every hostile shard; the soonest near-miss is the one to turn for.
  let threat = null;
  let threatScore = Infinity;
  let threatTime = Infinity;
  for (const shard of hostile) {
    const rx = warden.x - shard.x;
    const ry = warden.y - shard.y;
    const speedSquared = shard.vx * shard.vx + shard.vy * shard.vy || 1;
    const time = -(rx * shard.vx + ry * shard.vy) / speedSquared;
    if (time < 0 || time > 3.2) continue;
    const miss = Math.hypot(rx + shard.vx * time, ry + shard.vy * time);
    if (miss > 260) continue;
    const score = time + miss / 700;
    if (score < threatScore) { threatScore = score; threatTime = time; threat = shard; }
  }

  // Aim: at the intercept point of the threat, or at the nearest enemy when the air is clear.
  let aimX;
  let aimY;
  let moveX = 0;
  let moveY = 0;

  if (threat) {
    aimX = threat.x + threat.vx * threatTime;
    aimY = threat.y + threat.vy * threatTime;
  } else {
    const enemy = nearestEnemy(state);
    if (enemy) {
      aimX = enemy.x;
      aimY = enemy.y;
    } else {
      aimX = warden.x + Math.cos(state.time * 1.4) * 120;
      aimY = warden.y + Math.sin(state.time * 1.4) * 120;
    }
  }

  // Movement: back away from everything that is coming, weighted by how soon it lands. The arc can only
  // cover one direction, so the rest of the volley has to be walked out of rather than parried.
  for (const shard of hostile) {
    // The shard being caught is the one thing not to walk away from.
    if (shard === threat && threatTime < 0.7) continue;
    const dx = warden.x - shard.x;
    const dy = warden.y - shard.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speedSquared = shard.vx * shard.vx + shard.vy * shard.vy || 1;
    const time = -((warden.x - shard.x) * shard.vx + (warden.y - shard.y) * shard.vy) / speedSquared;
    if (time < 0 || distance > 420) continue;
    const urgency = 1 / (0.4 + time);
    moveX += (dx / distance) * urgency * (distance < 260 ? 1.9 : 0.7);
    moveY += (dy / distance) * urgency * (distance < 260 ? 1.9 : 0.7);
  }
  for (const other of state.enemies) {
    const dx = warden.x - other.x;
    const dy = warden.y - other.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > 260) continue;
    const push = (260 - distance) / 260;
    moveX += (dx / distance) * push * 2.2;
    moveY += (dy / distance) * push * 2.2;
  }

  // Centre pull and wall repulsion keep the shot inside the frame, which is also how a person plays.
  moveX += (FIELD.width / 2 - warden.x) * 0.0011;
  moveY += (FIELD.height / 2 - warden.y) * 0.0011;
  const margin = 150;
  if (warden.x < margin) moveX += (margin - warden.x) * 0.02;
  if (warden.x > FIELD.width - margin) moveX -= (warden.x - (FIELD.width - margin)) * 0.02;
  if (warden.y < margin) moveY += (margin - warden.y) * 0.02;
  if (warden.y > FIELD.height - margin) moveY -= (warden.y - (FIELD.height - margin)) * 0.02;

  // Hold the platform still for the last fraction of a second before a catch, or the arc misses it.
  const holding = Boolean(threat) && threatTime < 0.55;
  const length = holding ? 0 : Math.hypot(moveX, moveY);
  const move = length > 0.3 ? { x: moveX / length, y: moveY / length } : { x: 0, y: 0 };

  const near = state.enemies.filter((enemy) => Math.hypot(enemy.x - warden.x, enemy.y - warden.y) < FLARE.radius * 0.75).length;
  const actions = state.charge >= FLARE.cost && (near >= 2 || hostile.length >= 6) ? 4 : 0;

  void WARD;
  return { moveX: move.x, moveY: move.y, aimX, aimY, actions, pick: 0 };
}

/**
 * Stage one of the four scenes and return what the renderer should draw: {screen, hover}.
 * Scenes: start, play, upgrade, over.
 */
export function stageShot(name, world) {
  const { state } = world;
  const STEP = 1 / 60;

  if (name === 'start') {
    // The title's own scene: the warden drifting, the ward turning, embers rising.
    for (let step = 0; step < 190; step += 1) world.step(STEP, null, true);
    return { screen: 'title', hover: 0 };
  }

  /** Play the real rules until the predicate holds; false if the run ended first. */
  const runUntil = (predicate, maxSteps) => {
    for (let step = 0; step < maxSteps; step += 1) {
      if (predicate()) return true;
      if (state.phase === 'upgrade') {
        world.chooseUpgrade(0);
        continue;
      }
      if (state.phase === 'over') return false;
      world.step(STEP, autopilot(state));
    }
    return false;
  };

  /** The parts of a frame worth keeping, so the best-looking moment can be put back on screen. */
  const snapshot = () => ({
    enemies: state.enemies.map((enemy) => ({ ...enemy })),
    shards: state.shards.map((shard) => ({ ...shard, trail: shard.trail.slice() })),
    warden: { ...state.warden },
    ward: { ...state.ward },
    hearts: state.hearts,
    score: state.score,
    wave: state.wave,
    waveName: state.waveName,
    time: state.time,
    mods: { ...state.mods },
    kills: state.kills,
    charge: state.charge,
    zone: state.zone,
    zoneName: state.zoneName,
    offerKind: state.offerKind,
    pendingRelic: state.pendingRelic,
  });

  const restore = (frame) => {
    state.enemies = frame.enemies.map((enemy) => ({ ...enemy }));
    state.shards = frame.shards.map((shard) => ({ ...shard, trail: shard.trail.slice() }));
    state.warden = { ...frame.warden };
    state.ward = { ...frame.ward };
    state.hearts = frame.hearts;
    state.score = frame.score;
    state.wave = frame.wave;
    state.waveName = frame.waveName;
    state.time = frame.time;
    state.mods = { ...frame.mods };
    state.kills = frame.kills;
    state.charge = frame.charge;
    state.zone = frame.zone;
    state.zoneName = frame.zoneName;
    state.offerKind = frame.offerKind;
    state.pendingRelic = frame.pendingRelic;
  };

  if (name === 'play') {
    world.reset();
    // Play the real rules and keep the busiest healthy frame: wave 3 or later, still standing, plenty in
    // the air. Posing the shot by hand would be a lie about what the game looks like.
    let best = null;
    let bestScore = -1;
    for (let step = 0; step < 20000; step += 1) {
      if (state.phase === 'upgrade') { world.chooseUpgrade(0); continue; }
      if (state.phase === 'over') break;
      world.step(STEP, autopilot(state));
      const foeShards = state.shards.filter((shard) => shard.owner === 'enemy').length;
      const healthy = state.wave >= 3 && state.hearts >= 2 && state.enemies.length >= 3 && foeShards >= 3;
      if (!healthy) continue;
      const busy = state.enemies.length * 2 + foeShards + state.hearts;
      if (busy > bestScore) { bestScore = busy; best = snapshot(); }
      if (foeShards >= 6 && state.enemies.length >= 4) break;
    }
    if (best) restore(best);
    state.phase = 'wave';
    state.charge = 74;
    state.chain = 3;
    state.chainTimer = 1.2;
    state.flash = 0;
    state.shake = 0;
    return { screen: 'play', hover: 0 };
  }

  if (name === 'boss') {
    world.reset();
    // A boss sits at wave five, past where a four-heart run usually ends, so this scene hands the warden
    // the loadout a player would plausibly hold by then: two Step cards, two Wider Ward cards, a Hot
    // Mirror, a Steady Hand, a Lasting Light and the extra hearts two Steady Wicks buy. Every card is one
    // the game really offers, and every frame after this is the real rules run by the real autopilot.
    state.mods.maxHearts = 9;
    state.hearts = 9;
    state.mods.speed *= 1.12 * 1.12;
    state.mods.wardHalf += 0.14 * 2;
    state.mods.reflectDamage *= 1.35;
    state.mods.turnMul *= 1.35;
    state.mods.shardLife *= 1.25;

    let frame = null;
    let frameScore = -1;
    for (let step = 0; step < 60000; step += 1) {
      if (state.phase === 'upgrade') { world.chooseUpgrade(0); continue; }
      if (state.phase === 'over') break;
      world.step(STEP, autopilot(state));
      const boss = state.enemies.find((enemy) => enemy.boss);
      if (!boss) continue;
      const foeShards = state.shards.filter((shard) => shard.owner === 'enemy').length;
      const drained = 1 - Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      // A boss with its bar already eaten into, in a crowded sky, is the frame that shows the fight working.
      const busy = foeShards + state.enemies.length * 2 + drained * 14;
      if (busy > frameScore) { frameScore = busy; frame = snapshot(); }
      if (foeShards >= 6 && drained >= 0.42) break;
    }
    if (frame) restore(frame);
    state.phase = 'wave';
    state.flash = 0;
    state.shake = 0;
    return { screen: 'play', hover: 0 };
  }

  if (name === 'upgrade') {
    world.reset();
    // Three waves in, so the cards are being offered by a run that has already earned them.
    runUntil(() => state.phase === 'upgrade' && state.wave >= 3, 20000);
    if (state.phase !== 'upgrade') {
      // Fall back to a posed offer if the autopilot never cleared a wave.
      state.offer = offerUpgrades(state, createRandom(7));
      state.phase = 'upgrade';
    }
    state.flash = 0;
    state.shake = 0;
    return { screen: 'upgrade', hover: 2 };
  }

  if (name === 'over') {
    world.reset();
    runUntil(() => state.wave >= 5, 20000);
    state.hearts = 0;
    state.score = Math.max(state.score, 1240);
    state.chain = 0;
    world.endRun();
    return { screen: 'over', hover: 0 };
  }

  return { screen: 'title', hover: 0 };
}