// The simulation: one fixed step moves the warden, turns the ward, flies the shards, runs the enemies and
// resolves what hit what. It owns no drawing and no sound; it returns a bitmask of what happened this
// step, and main.js turns those bits into audio and screen changes. That split is what lets a screenshot
// scene play the real rules forward with an autopilot and come out the same every time.
import { BOSS, ENEMY, FIELD, FLARE, SCORE, SHARD, STEP, WARD, WARDEN } from './config.js';
import { createParticles } from './particles.js';
import { applyUpgrade, offerRelics, offerUpgrades } from './upgrades.js';
import { bossFor, enemySpeedFor, fireRateFor, waveName, waveSpawnOrder } from './waves.js';
import { isZoneStart, zoneFor } from './zones.js';

export const EV_HIT = 1;
export const EV_OVER = 2;
export const EV_REFLECT = 4;
export const EV_KILL = 8;
export const EV_FLARE = 16;
export const EV_WAVE_CLEAR = 32;
export const EV_CRACK = 64;

export const PHASE_TITLE = 'title';
export const PHASE_WAVE = 'wave';
export const PHASE_UPGRADE = 'upgrade';
export const PHASE_OVER = 'over';

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Shortest signed angle from a to b, so the ward turns the short way round. */
function angleTo(a, b) {
  let delta = (b - a) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

function freshMods() {
  return {
    speed: WARDEN.speed,
    wardHalf: WARD.halfAngle,
    reflectDamage: 24 * WARD.damageBoost,
    chargeGain: WARD.chargePerReflect,
    flareRadius: FLARE.radius,
    pierce: SHARD.pierce,
    maxHearts: WARDEN.maxHearts,
    invuln: WARDEN.invulnFor,
    knockback: WARDEN.knockback,
    // The four the newer cards move. They start neutral so an unmodified run reads the config numbers.
    turnMul: 1,
    shardLife: SHARD.lifeFor,
    killCharge: 0,
    flareDamage: FLARE.damage,
  };
}

export function createWorld(random) {
  const particles = createParticles(random);

  const state = {
    phase: PHASE_TITLE,
    time: 0,
    wave: 0,
    waveName: waveName(1),
    zone: zoneFor(1),
    zoneName: zoneFor(1).name,
    offerKind: 'upgrade',
    pendingRelic: false,
    bossRef: null,
    hearts: WARDEN.maxHearts,
    score: 0,
    kills: 0,
    chain: 0,
    chainTimer: 0,
    bestChain: 0,
    relics: [],
    zone: null,
    zoneName: '',
    offerKind: 'upgrade',
    pendingRelic: false,
    charge: 0,
    mods: freshMods(),
    upgrades: [],
    warden: { x: FIELD.width / 2, y: FIELD.height / 2, invuln: 0 },
    ward: { angle: -Math.PI / 2 },
    flare: null,
    enemies: [],
    shards: [],
    spawnQueue: [],
    spawnTimer: 0,
    waveClock: 0,
    offer: [],
    shake: 0,
    flash: 0,
    wardFlash: 0,
  };
  // The renderer reads the particle list from the state; keeping it here means one object to pass around.
  state.particles = particles;

  function reset() {
    state.phase = PHASE_WAVE;
    state.time = 0;
    state.wave = 0;
    state.hearts = WARDEN.maxHearts;
    state.score = 0;
    state.kills = 0;
    state.chain = 0;
    state.chainTimer = 0;
    state.bestChain = 0;
    state.relics = [];
    state.charge = 0;
    state.mods = freshMods();
    state.upgrades = [];
    state.warden = { x: FIELD.width / 2, y: FIELD.height / 2, invuln: 0 };
    state.ward.angle = -Math.PI / 2;
    state.flare = null;
    state.enemies = [];
    state.shards = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.offer = [];
    state.shake = 0;
    state.flash = 0;
    state.wardFlash = 0;
    particles.clear();
    startWave();
  }

  function startWave() {
    state.wave += 1;
    state.waveName = waveName(state.wave);
    state.phase = PHASE_WAVE;
    const zone = zoneFor(state.wave);
    state.zone = zone;
    state.zoneName = zone.name;
    const order = waveSpawnOrder(state.wave, random);
    state.spawnQueue = order.map((kind, index) => ({
      kind, at: (isZoneStart(state.wave) ? 1.1 : 0.5) + index * 0.62,
    }));
    // The boss walks in first and alone, ahead of its escort, so the player has to deal with it looking
    // at them rather than discovering it behind a crowd.
    const bossKind = bossFor(state.wave);
    if (bossKind) state.spawnQueue.unshift({ kind: bossKind, at: 1.4 });
    state.bossRef = bossKind;
    state.spawnTimer = 0;
    state.waveClock = 0;
    particles.ring(FIELD.width / 2, FIELD.height / 2, '#141c36');
  }

  function spawnEnemy(kind) {
    const spec = ENEMY[kind];
    // A boss that comes back later in endless play comes back heavier, never wider.
    const cycles = spec.boss ? Math.floor((state.wave - 1) / BOSS.every) : 0;
    const zoneHp = spec.boss ? 1 : state.zone.hp;
    const hp = spec.hp * zoneHp * (spec.boss ? 1 + cycles * BOSS.hpPerCycle : 1 + (state.wave - 1) * 0.06);
    const point = random.rim();
    // Keep spawns from landing on top of the player: push them to the far rim if they are close.
    const away = Math.hypot(point.x - state.warden.x, point.y - state.warden.y);
    const spot = away < 260
      ? { x: clamp(FIELD.width - point.x, 40, FIELD.width - 40), y: clamp(FIELD.height - point.y, 40, FIELD.height - 40) }
      : point;
    state.enemies.push({
      kind,
      x: spot.x,
      y: spot.y,
      vx: 0,
      vy: 0,
      radius: spec.radius,
      hp,
      maxHp: hp,
      fireTimer: random.range(0.6, spec.fireFor),
      hurt: 0,
      phase: random.range(0, TAU),
      born: state.time,
      boss: Boolean(spec.boss),
      bossPhase: 1,
      ringTimer: 2.4,
      spiral: random.range(0, TAU),
    });
  }

  function fireShard(from, angle, speed, owner = 'enemy') {
    state.shards.push({
      x: from.x + Math.cos(angle) * (from.radius + 6),
      y: from.y + Math.sin(angle) * (from.radius + 6),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      owner,
      life: SHARD.lifeFor,
      damage: 0,
      pierce: 0,
      radius: SHARD.radius,
      trail: [],
    });
  }

  function hurtWarden(fromX, fromY) {
    if (state.warden.invuln > 0) return 0;
    state.hearts -= 1;
    state.warden.invuln = state.mods.invuln;
    state.shake = Math.max(state.shake, 12);
    state.flash = 0.4;
    const angle = Math.atan2(state.warden.y - fromY, state.warden.x - fromX);
    state.warden.x = clamp(state.warden.x + Math.cos(angle) * 26, 30, FIELD.width - 30);
    state.warden.y = clamp(state.warden.y + Math.sin(angle) * 26, 30, FIELD.height - 30);
    state.chain = 0;
    particles.ash(state.warden.x, state.warden.y, 18, '#ff6b7a', 12);
    if (state.hearts <= 0) {
      state.hearts = 0;
      state.phase = PHASE_OVER;
      particles.ring(state.warden.x, state.warden.y, '#ff6b7a');
      return EV_HIT | EV_OVER;
    }
    return EV_HIT;
  }

  function killEnemy(enemy, index) {
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.chainTimer = SCORE.chainWindow;
    state.chain = Math.min(SCORE.chainMax + 1, state.chain + 1);
    if (state.chain > state.bestChain) state.bestChain = state.chain;
    const multiplier = 1 + (state.chain - 1) * SCORE.chainStep;
    state.score += Math.round(SCORE.perKill * multiplier);
    const colour = enemy.kind === 'lurker' ? '#ff5d8f' : enemy.kind === 'splitter' ? '#a678ff'
      : enemy.kind === 'sentinel' ? '#59e0b0' : '#6f8bff';
    particles.ash(enemy.x, enemy.y, 16, colour, enemy.radius);
    // A splitter breaks into two lesser drifters: killing it early is the wrong instinct, and that is the point.
    if (enemy.kind === 'splitter') {
      for (let index2 = 0; index2 < 2; index2 += 1) {
        const spin = random.range(0, TAU);
        state.enemies.push({
          kind: 'drifter',
          x: enemy.x + Math.cos(spin) * 24,
          y: enemy.y + Math.sin(spin) * 24,
          vx: 0, vy: 0,
          radius: 13,
          hp: ENEMY.drifter.hp * 0.6,
          maxHp: ENEMY.drifter.hp * 0.6,
          fireTimer: random.range(1.1, 2.1),
          hurt: 0,
          phase: spin,
          born: state.time,
        });
      }
    }
    if (state.mods.killCharge > 0) {
      state.charge = Math.min(FLARE.cost, state.charge + state.mods.killCharge);
    }
    if (enemy.boss) {
      // The boss pays in score and in a relic, and it leaves room for the run to breathe.
      state.score += (ENEMY[enemy.kind].score ?? 300) * (1 + Math.floor((state.wave - 1) / BOSS.every) * 0.3);
      state.pendingRelic = true;
      state.shake = Math.max(state.shake, 20);
      state.flash = Math.max(state.flash, 0.5);
      particles.ring(enemy.x, enemy.y, '#ffd166');
      particles.ash(enemy.x, enemy.y, 46, '#ffd166', enemy.radius * 2);
      return;
    }
    state.shake = Math.max(state.shake, 4);
  }

  /** The ward catches a shard: it is turned around the outward normal and becomes yours. */
  function reflectShard(shard) {
    const dx = shard.x - state.warden.x;
    const dy = shard.y - state.warden.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = dx / length;
    const ny = dy / length;
    const dot = shard.vx * nx + shard.vy * ny;
    const speed = Math.max(SHARD.reflectedSpeed, Math.hypot(shard.vx, shard.vy) * WARD.reflectBoost);
    shard.vx = (shard.vx - 2 * dot * nx);
    shard.vy = (shard.vy - 2 * dot * ny);
    const norm = Math.hypot(shard.vx, shard.vy) || 1;
    shard.vx = (shard.vx / norm) * speed;
    shard.vy = (shard.vy / norm) * speed;
    // Nudge it clear of the arc so the same shard is not caught again next step.
    shard.x = state.warden.x + nx * (WARD.radius + shard.radius + 3);
    shard.y = state.warden.y + ny * (WARD.radius + shard.radius + 3);
    shard.owner = 'player';
    shard.damage = state.mods.reflectDamage;
    shard.pierce = state.mods.pierce;
    shard.life = state.mods.shardLife;
    state.charge = Math.min(FLARE.cost, state.charge + state.mods.chargeGain);
    state.score += SCORE.perReflect;
    state.wardFlash = 0.18;
    particles.spark(shard.x, shard.y, Math.atan2(shard.vy, shard.vx), 7);
    return EV_REFLECT;
  }

  /**
   * A boss holds the middle distance, strafes, and changes its script as it loses health: aimed spreads,
   * then a ring that makes standing still fatal, then a spiral that never lets the arena go quiet.
   */
  function stepBoss(enemy, spec, dt, rate, pace) {
    const dx = state.warden.x - enemy.x;
    const dy = state.warden.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance;
    const uy = dy / distance;
    const frac = enemy.maxHp > 0 ? enemy.hp / enemy.maxHp : 0;
    const phase = frac > 0.66 ? 1 : frac > 0.33 ? 2 : 3;
    if (phase !== enemy.bossPhase) {
      enemy.bossPhase = phase;
      enemy.fireTimer = Math.min(enemy.fireTimer, 0.6);
      state.shake = Math.max(state.shake, 16);
      state.flash = Math.max(state.flash, 0.3);
      particles.ring(enemy.x, enemy.y, phase === 3 ? '#ff6b7a' : '#ffd166');
    }

    const want = spec.keepAway;
    const push = distance < want ? -1 : distance > want + 80 ? 1 : 0;
    const strafe = Math.sin(state.time * (0.7 + phase * 0.25) + enemy.phase) * (0.9 + phase * 0.15);
    const pace2 = spec.speed * pace * (1 + (phase - 1) * 0.18);
    enemy.vx = (ux * push - uy * strafe) * pace2;
    enemy.vy = (uy * push + ux * strafe) * pace2;
    enemy.x = clamp(enemy.x + enemy.vx * dt, -80, FIELD.width + 80);
    enemy.y = clamp(enemy.y + enemy.vy * dt, -80, FIELD.height + 80);

    const aim = Math.atan2(dy, dx);
    const speed = random.range(SHARD.enemySpeedMin, SHARD.enemySpeedMax) * pace;

    enemy.fireTimer -= dt * rate * (1 + (phase - 1) * 0.15);
    if (enemy.fireTimer <= 0) {
      enemy.fireTimer = spec.fireFor * random.range(0.85, 1.15);
      const spread = phase === 1 ? [-0.18, 0, 0.18] : [-0.3, -0.1, 0.1, 0.3];
      for (const offset of spread) fireShard(enemy, aim + offset, speed);
    }

    if (phase >= 2) {
      enemy.ringTimer -= dt * rate;
      if (enemy.ringTimer <= 0) {
        enemy.ringTimer = phase === 2 ? 5.2 : 4.0;
        const spokes = phase === 2 ? 10 : 14;
        for (let spoke = 0; spoke < spokes; spoke += 1) {
          fireShard(enemy, enemy.spiral + (spoke / spokes) * TAU, speed * 0.72);
        }
        particles.ring(enemy.x, enemy.y, '#ff6b7a');
      }
    }

    if (phase === 3) {
      enemy.spiral += dt * 1.9;
      if (Math.floor(state.time * 5) !== Math.floor((state.time - dt) * 5)) {
        fireShard(enemy, enemy.spiral, speed * 0.85);
        fireShard(enemy, enemy.spiral + Math.PI, speed * 0.85);
      }
    }
  }

  function stepEnemies(dt) {
    // A wave that drags on gets louder: enemies close and fire faster the longer they are left alive,
    // which stops a patient player from kiting a last drifter around the arena for a minute.
    const pressure = 1 + Math.min(0.9, Math.max(0, state.waveClock - 16) * 0.04);
    const rate = fireRateFor(state.wave) * pressure;
    const pace = enemySpeedFor(state.wave) * pressure;
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      const spec = ENEMY[enemy.kind];
      enemy.hurt = Math.max(0, enemy.hurt - dt);
      const dx = state.warden.x - enemy.x;
      const dy = state.warden.y - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ux = dx / distance;
      const uy = dy / distance;

      if (spec.boss) {
        stepBoss(enemy, spec, dt, rate, pace);
        continue;
      }

      if (enemy.kind === 'lurker') {
        // Charges straight in, and leans into the turn, so it can be dodged but not outrun.
        enemy.vx += ux * 620 * dt;
        enemy.vy += uy * 620 * dt;
        const speed = Math.hypot(enemy.vx, enemy.vy);
        const cap = spec.speed * pace;
        if (speed > cap) {
          enemy.vx = (enemy.vx / speed) * cap;
          enemy.vy = (enemy.vy / speed) * cap;
        }
      } else if (enemy.kind === 'weaver') {
        // Keeps its distance and circles, so its spread shots come from a moving angle.
        const want = spec.keepAway;
        const push = distance < want ? -1 : distance > want + 90 ? 1 : 0;
        const strafe = Math.sin(state.time * 0.9 + enemy.phase) * 0.9;
        enemy.vx = (ux * push - uy * strafe) * spec.speed * pace;
        enemy.vy = (uy * push + ux * strafe) * spec.speed * pace;
      } else {
        enemy.vx = ux * spec.speed * pace;
        enemy.vy = uy * spec.speed * pace;
      }

      enemy.x = clamp(enemy.x + enemy.vx * dt, -60, FIELD.width + 60);
      enemy.y = clamp(enemy.y + enemy.vy * dt, -60, FIELD.height + 60);

      // Melee: a lurker that reaches the warden hurts it and is thrown back.
      if (enemy.kind === 'lurker' && distance < enemy.radius + WARDEN.radius) {
        const hit = hurtWarden(enemy.x, enemy.y);
        const bounce = 300;
        enemy.vx = -ux * bounce;
        enemy.vy = -uy * bounce;
        enemy.x -= ux * 30;
        enemy.y -= uy * 30;
        if (hit & EV_OVER) return;
      }

      if (spec.fireFor === 0 || distance > 900) continue;
      enemy.fireTimer -= dt * rate;
      if (enemy.fireTimer > 0) continue;
      enemy.fireTimer = spec.fireFor * random.range(0.85, 1.2);
      const aim = Math.atan2(dy, dx);
      const speed = random.range(SHARD.enemySpeedMin, SHARD.enemySpeedMax) * pace;
      if (enemy.kind === 'weaver') {
        for (const offset of [-0.26, 0, 0.26]) fireShard(enemy, aim + offset, speed * 0.92);
      } else if (enemy.kind === 'sentinel') {
        for (const offset of [-0.12, 0.12]) fireShard(enemy, aim + offset, speed * 0.8);
      } else {
        fireShard(enemy, aim, speed);
      }
    }
  }

  function stepShards(dt) {
    let events = 0;
    for (let index = state.shards.length - 1; index >= 0; index -= 1) {
      const shard = state.shards[index];
      shard.x += shard.vx * dt;
      shard.y += shard.vy * dt;
      shard.life -= dt;
      shard.trail.push(shard.x, shard.y);
      if (shard.trail.length > 10) shard.trail.splice(0, 2);

      if (shard.life <= 0 || shard.x < -80 || shard.x > FIELD.width + 80
        || shard.y < -80 || shard.y > FIELD.height + 80) {
        state.shards.splice(index, 1);
        continue;
      }

      // The ward: an arc band around the warden. Anything hostile inside it is caught.
      if (shard.owner === 'enemy') {
        const dx = shard.x - state.warden.x;
        const dy = shard.y - state.warden.y;
        const distance = Math.hypot(dx, dy);
        if (distance > WARD.inner - shard.radius && distance < WARD.radius + shard.radius + 4) {
          const relative = Math.abs(angleTo(state.ward.angle, Math.atan2(dy, dx)));
          if (relative <= state.mods.wardHalf + 0.1) {
            events |= reflectShard(shard);
            continue;
          }
        }
        // Through the gap: it can still hit you.
        if (distance < WARDEN.radius + shard.radius) {
          events |= hurtWarden(shard.x, shard.y);
          state.shards.splice(index, 1);
          if (events & EV_OVER) return events;
          continue;
        }
        continue;
      }

      // Your shard: it hunts whatever is left standing.
      for (let e = state.enemies.length - 1; e >= 0; e -= 1) {
        const enemy = state.enemies[e];
        if (Math.hypot(enemy.x - shard.x, enemy.y - shard.y) > enemy.radius + shard.radius) continue;
        enemy.hp -= shard.damage;
        enemy.hurt = 0.14;
        particles.spark(shard.x, shard.y, Math.atan2(shard.vy, shard.vx), 4, '#ffd166');
        if (enemy.hp <= 0) {
          killEnemy(enemy, e);
          events |= EV_KILL;
        }
        shard.pierce -= 1;
        if (shard.pierce < 0) {
          state.shards.splice(index, 1);
        }
        break;
      }
    }
    return events;
  }

  function stepFlare(dt) {
    if (!state.flare) return 0;
    state.flare.age += dt;
    state.shake = Math.max(state.shake, 9);
    if (state.flare.age >= FLARE.growFor) {
      state.flare = null;
    }
    return 0;
  }

  function triggerFlare() {
    if (state.charge < FLARE.cost) return 0;
    state.charge -= FLARE.cost;
    state.flare = { age: 0, radius: state.mods.flareRadius };
    state.shake = Math.max(state.shake, 14);
    let events = EV_FLARE;
    let cracked = 0;
    for (let index = state.shards.length - 1; index >= 0; index -= 1) {
      const shard = state.shards[index];
      if (Math.hypot(shard.x - state.warden.x, shard.y - state.warden.y) > state.mods.flareRadius) continue;
      particles.spark(shard.x, shard.y, Math.atan2(shard.y - state.warden.y, shard.x - state.warden.x), 4, '#ffd166');
      state.shards.splice(index, 1);
      cracked += 1;
    }
    if (cracked > 0) events |= EV_CRACK;
    for (let index = state.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = state.enemies[index];
      if (Math.hypot(enemy.x - state.warden.x, enemy.y - state.warden.y) > state.mods.flareRadius) continue;
      enemy.hp -= state.mods.flareDamage;
      enemy.hurt = 0.2;
      if (enemy.hp <= 0) {
        killEnemy(enemy, index);
        events |= EV_KILL;
      }
    }
    particles.ring(state.warden.x, state.warden.y, '#ffd166');
    return events;
  }

  /** The title screen's scene: the warden drifts, the ward turns, embers rise. No rules run. */
  function stepIdle(dt) {
    state.time += dt;
    const t = state.time;
    state.warden.x = FIELD.width / 2 + Math.cos(t * 0.31) * 120;
    state.warden.y = FIELD.height / 2 + Math.sin(t * 0.44) * 60;
    state.ward.angle += dt * 0.6;
    if (Math.floor(t * 7) !== Math.floor((t - dt) * 7)) {
      particles.mote(state.warden.x + random.range(-18, 18), state.warden.y + random.range(-18, 18));
    }
    particles.step(dt);
    state.shake = Math.max(0, state.shake - dt * 30);
    state.flash = Math.max(0, state.flash - dt);
    state.wardFlash = Math.max(0, state.wardFlash - dt);
    return 0;
  }

  /**
   * Advance one fixed step. `input` is {moveX, moveY, aimX, aimY, actions, pick}; `idle` runs the title
   * scene instead of the rules. Returns the bits above.
   */
  function step(dt, input, idle = false) {
    if (idle) return stepIdle(dt);

    let events = 0;
    state.time += dt;

    // The warden moves; diagonal input is already normalised by the reader.
    const speed = state.mods.speed;
    state.warden.x = clamp(state.warden.x + input.moveX * speed * dt, WARDEN.radius + 6, FIELD.width - WARDEN.radius - 6);
    state.warden.y = clamp(state.warden.y + input.moveY * speed * dt, WARDEN.radius + 6, FIELD.height - WARDEN.radius - 6);
    state.warden.invuln = Math.max(0, state.warden.invuln - dt);

    // The ward turns toward the pointer at a limited rate: aiming is a skill.
    const want = Math.atan2(input.aimY - state.warden.y, input.aimX - state.warden.x);
    const delta = angleTo(state.ward.angle, want);
    const turn = WARD.turnRate * state.mods.turnMul * dt;
    state.ward.angle += clamp(delta, -turn, turn);

    if (state.phase === PHASE_WAVE) {
      state.waveClock += dt;
      if (input.actions & 4) events |= triggerFlare();

      // Spawns arrive on a timer so a wave walks in rather than appearing all at once.
      state.spawnTimer += dt;
      while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.spawnTimer) {
        spawnEnemy(state.spawnQueue.shift().kind);
      }

      stepEnemies(dt);
      if (state.phase === PHASE_OVER) return events | EV_OVER;
      events |= stepShards(dt);
      events |= stepFlare(dt);

      if (state.chainTimer > 0) {
        state.chainTimer -= dt;
        if (state.chainTimer <= 0) state.chain = 0;
      }

      if (state.spawnQueue.length === 0 && state.enemies.length === 0 && state.phase === PHASE_WAVE) {
        state.score += SCORE.perWave * state.wave;
        if (state.pendingRelic) {
          state.offer = offerRelics(state, random);
          state.offerKind = 'relic';
          state.pendingRelic = false;
        } else {
          state.offer = offerUpgrades(state, random);
          state.offerKind = 'upgrade';
        }
        state.phase = PHASE_UPGRADE;
        particles.ring(FIELD.width / 2, FIELD.height / 2, '#8ef0ff');
        events |= EV_WAVE_CLEAR;
      }
    }

    particles.step(dt);
    state.shake = Math.max(0, state.shake - dt * 34);
    state.flash = Math.max(0, state.flash - dt * 1.6);
    state.wardFlash = Math.max(0, state.wardFlash - dt * 3);
    return events;
  }

  /** Take one of the offered cards (index 0..2) and start the next wave. */
  function chooseUpgrade(index) {
    if (state.phase !== PHASE_UPGRADE) return false;
    const upgrade = state.offer[index];
    if (!upgrade) return false;
    applyUpgrade(state, upgrade);
    // Relics are the boss cards: the summary counts them apart from ordinary gifts.
    if (String(upgrade.id).startsWith('relic-')) state.relics.push(upgrade.id);
    state.offer = [];
    startWave();
    return true;
  }

  /** Put the world in the game-over screen, keeping the run's numbers for the summary. */
  function endRun() {
    state.phase = PHASE_OVER;
    particles.ring(state.warden.x, state.warden.y, '#ff6b7a');
  }

  return { state, particles, reset, step, chooseUpgrade, endRun, startWave, STEP };
}