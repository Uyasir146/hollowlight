// All drawing. The renderer owns the canvas, the letterbox transform and the palette; it reads the
// simulation's state and paints it, and it never changes the state. Screens are painted over the same
// field, so the title, the upgrade choice and the summary all sit in the world rather than beside it.
import { ENEMY, FIELD, FLARE, PALETTE, WARD, WARDEN } from './config.js';
import { CARD_LAYOUT } from './input.js';
import { PHASE_OVER, PHASE_TITLE, PHASE_UPGRADE, PHASE_WAVE } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_OVER = 'over';
export const SCREEN_PAUSED = 'paused';

const TAU = Math.PI * 2;
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace';

/** Deterministic dust, so the field's texture never crawls between frames of the same seed. */
function dustField() {
  const points = [];
  let seed = 1337;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 150; index += 1) {
    points.push({ x: next() * FIELD.width, y: next() * FIELD.height, r: 0.4 + next() * 1.5, a: 0.06 + next() * 0.16, s: 0.2 + next() * 0.7 });
  }
  return points;
}

const DUST = dustField();

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    scale = Math.min(width / FIELD.width, height / FIELD.height) * dpr;
    offsetX = (canvas.width - FIELD.width * scale) / 2;
    offsetY = (canvas.height - FIELD.height * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  function text(value, x, y, { size = 18, font = MONO, colour = PALETTE.text, align = 'left', spacing = 0, weight = '400', alpha = 1 } = {}) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colour;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(value, x, y);
    ctx.restore();
  }

  function glow(colour, blur) {
    ctx.shadowColor = colour;
    ctx.shadowBlur = blur;
  }

  function noGlow() {
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  function drawBackground(state) {
    const sky = ctx.createRadialGradient(FIELD.width / 2, FIELD.height * 0.46, 40, FIELD.width / 2, FIELD.height * 0.5, 820);
    sky.addColorStop(0, PALETTE.haze);
    sky.addColorStop(0.45, PALETTE.deep);
    sky.addColorStop(1, PALETTE.night);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    // The hollow: rings that thin out as they widen, the game's one piece of scenery.
    ctx.save();
    ctx.translate(FIELD.width / 2, FIELD.height / 2);
    for (let ring = 1; ring <= 6; ring += 1) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(120,150,220,${0.05 - ring * 0.005})`;
      ctx.lineWidth = 1;
      ctx.arc(0, 0, 90 * ring + Math.sin(state.time * 0.3 + ring) * 4, 0, TAU);
      ctx.stroke();
    }
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const angle = (spoke / 12) * TAU + state.time * 0.02;
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(120,150,220,0.035)';
      ctx.moveTo(Math.cos(angle) * 120, Math.sin(angle) * 120);
      ctx.lineTo(Math.cos(angle) * 900, Math.sin(angle) * 900);
      ctx.stroke();
    }
    ctx.restore();

    for (const mote of DUST) {
      const drift = (state.time * mote.s * 6) % FIELD.height;
      const y = (mote.y + drift) % FIELD.height;
      ctx.beginPath();
      ctx.fillStyle = `rgba(190,215,255,${mote.a})`;
      ctx.arc(mote.x, y, mote.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawShard(shard, state) {
    const own = shard.owner === 'player';
    const colour = own ? PALETTE.shardOwn : PALETTE.shardFoe;
    const angle = Math.atan2(shard.vy, shard.vx);
    // Trail: the last few positions, fading back.
    for (let index = 0; index < shard.trail.length; index += 2) {
      const t = index / shard.trail.length;
      ctx.beginPath();
      ctx.fillStyle = colour;
      ctx.globalAlpha = 0.05 + t * 0.18;
      ctx.arc(shard.trail[index], shard.trail[index + 1], shard.radius * (0.35 + t * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(angle);
    glow(colour, own ? 18 : 12);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(shard.radius * 2.1, 0);
    ctx.lineTo(-shard.radius * 1.1, shard.radius * 0.85);
    ctx.lineTo(-shard.radius * 0.5, 0);
    ctx.lineTo(-shard.radius * 1.1, -shard.radius * 0.85);
    ctx.closePath();
    ctx.fill();
    noGlow();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, shard.radius * 0.42, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawEnemy(enemy, state) {
    const flash = enemy.hurt > 0;
    const colour = flash ? PALETTE.foeHurt
      : enemy.kind === 'lurker' ? PALETTE.lurker
        : enemy.kind === 'splitter' ? PALETTE.splitter
          : enemy.kind === 'sentinel' ? PALETTE.sentinel
            : enemy.boss ? (enemy.bossPhase === 3 ? PALETTE.danger : PALETTE.gold) : PALETTE.foe;
    const r = enemy.radius;
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    glow(colour, 14);
    ctx.strokeStyle = colour;
    ctx.fillStyle = 'rgba(10,14,26,0.72)';
    ctx.lineWidth = 2;

    if (enemy.kind === 'drifter' || enemy.kind === 'sentinel') {
      const sides = enemy.kind === 'sentinel' ? 6 : 5;
      ctx.beginPath();
      for (let index = 0; index < sides; index += 1) {
        const a = (index / sides) * TAU + Math.PI / 2 + enemy.phase * 0.2;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (enemy.kind === 'sentinel') {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(89,224,176,0.45)';
        ctx.arc(0, 0, r + 8, 0, TAU);
        ctx.stroke();
      }
    } else if (enemy.kind === 'weaver') {
      ctx.rotate(enemy.phase + state.time * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r, r * 0.8);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (enemy.kind === 'lurker') {
      const angle = Math.atan2(enemy.vy, enemy.vx);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0);
      ctx.lineTo(-r * 0.6, r * 0.9);
      ctx.lineTo(-r * 0.2, 0);
      ctx.lineTo(-r * 0.6, -r * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (enemy.boss) {
      // A boss is a ring inside a ring, with the phase it is in written in its teeth.
      ctx.rotate(enemy.phase + state.time * 0.2);
      const teeth = enemy.bossPhase === 1 ? 8 : enemy.bossPhase === 2 ? 10 : 12;
      ctx.beginPath();
      for (let index = 0; index < teeth * 2; index += 1) {
        const a = (index / (teeth * 2)) * TAU;
        const radius = index % 2 === 0 ? r : r * 0.72;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = enemy.bossPhase === 3 ? 'rgba(255,107,122,0.85)' : 'rgba(255,209,102,0.7)';
      ctx.arc(0, 0, r * 0.5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r + 12 + Math.sin(state.time * 4) * 3, 0, TAU);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      for (let orbit = 0; orbit < 3; orbit += 1) {
        const a = enemy.phase + state.time * 1.6 + (orbit / 3) * TAU;
        ctx.beginPath();
        ctx.fillStyle = colour;
        ctx.arc(Math.cos(a) * (r + 7), Math.sin(a) * (r + 7), 2.4, 0, TAU);
        ctx.fill();
      }
    }

    // The eye: one bright point, so every enemy reads as facing you.
    noGlow();
    ctx.fillStyle = flash ? '#ffffff' : 'rgba(233,241,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(2, r * 0.22), 0, TAU);
    ctx.fill();

    // Damage taken shows as an arc under the body.
    const hp = Math.max(0, enemy.hp / enemy.maxHp);
    if (hp < 0.999) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.arc(0, 0, r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * hp);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWarden(state) {
    const { x, y, invuln } = state.warden;
    const blink = invuln > 0 && Math.floor(invuln * 12) % 2 === 0;
    ctx.save();
    ctx.translate(x, y);

    // The halo that makes the warden findable at a glance.
    const halo = ctx.createRadialGradient(0, 0, 2, 0, 0, 64);
    halo.addColorStop(0, 'rgba(255,207,107,0.42)');
    halo.addColorStop(0.4, 'rgba(255,180,80,0.14)');
    halo.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = blink ? 0.45 : 1;
    glow(PALETTE.warden, 18);
    ctx.fillStyle = PALETTE.wardenHot;
    // The wick: a small teardrop of light.
    ctx.beginPath();
    ctx.moveTo(0, -WARDEN.radius);
    ctx.bezierCurveTo(WARDEN.radius * 0.85, -WARDEN.radius * 0.2, WARDEN.radius * 0.55, WARDEN.radius * 0.85, 0, WARDEN.radius * 0.95);
    ctx.bezierCurveTo(-WARDEN.radius * 0.55, WARDEN.radius * 0.85, -WARDEN.radius * 0.85, -WARDEN.radius * 0.2, 0, -WARDEN.radius);
    ctx.fill();
    noGlow();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, WARDEN.radius * 0.3, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawWard(state) {
    const { x, y } = state.warden;
    const half = state.mods.wardHalf;
    const hot = state.wardFlash > 0;
    const colour = hot ? PALETTE.wardHot : PALETTE.ward;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(state.ward.angle);

    glow(colour, hot ? 26 : 14);
    ctx.strokeStyle = colour;
    ctx.lineWidth = hot ? 7 : 5;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, WARD.radius, -half, half);
    ctx.stroke();

    // A thin inner echo, and the two end ticks that show exactly where the arc stops.
    noGlow();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, WARD.radius - 7, -half + 0.05, half - 0.05);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    for (const side of [-half, half]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(side) * (WARD.radius - 10), Math.sin(side) * (WARD.radius - 10));
      ctx.lineTo(Math.cos(side) * (WARD.radius + 7), Math.sin(side) * (WARD.radius + 7));
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawFlare(state) {
    if (!state.flare) return;
    const t = Math.min(1, state.flare.age / FLARE.growFor);
    const radius = state.flare.radius * (0.35 + t * 0.65);
    ctx.save();
    ctx.translate(state.warden.x, state.warden.y);
    const gradient = ctx.createRadialGradient(0, 0, radius * 0.55, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(255,209,102,0)');
    gradient.addColorStop(0.75, `rgba(255,209,102,${0.30 * (1 - t)})`);
    gradient.addColorStop(1, `rgba(255,240,200,${0.75 * (1 - t)})`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(particles) {
    for (const p of particles.all) {
      const left = particles.life(p);
      if (p.kind === 'ring') {
        ctx.save();
        ctx.globalAlpha = left * 0.5;
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = 2 + left * 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 40 + (1 - left) * 220, 0, TAU);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = Math.min(1, left * 1.4);
      ctx.fillStyle = p.colour;
      if (p.kind === 'spark') {
        const length = Math.hypot(p.vx, p.vy) * 0.02;
        ctx.strokeStyle = p.colour;
        ctx.lineWidth = p.size * 0.7;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.012 * length, p.y - p.vy * 0.012 * length);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + left * 0.8), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function heart(x, y, filled) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-9, -4, -5, -12, 0, -6);
    ctx.bezierCurveTo(5, -12, 9, -4, 0, 4);
    ctx.closePath();
    if (filled) {
      glow(PALETTE.danger, 10);
      ctx.fillStyle = '#ff8b96';
      ctx.fill();
      noGlow();
    } else {
      ctx.strokeStyle = 'rgba(255,139,150,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(state, best) {
    // Hearts, top left, over the wave's name.
    for (let index = 0; index < state.mods.maxHearts; index += 1) {
      heart(40 + index * 26, 44, index < state.hearts);
    }
    text(`WAVE ${state.wave}`, 32, 86, { size: 15, spacing: 3, colour: PALETTE.ward, weight: '600' });
    text(state.waveName, 32, 108, { size: 13, colour: PALETTE.dim, spacing: 1 });
    if (state.zone) {
      // The zone the run is standing in, in its own colour, so a tilt in the rules is never silent.
      text(state.zoneName, 32, 130, { size: 11, colour: state.zone.accent, spacing: 3, alpha: 0.85 });
    }

    // Score, top right, with the chain multiplier under it.
    text(String(state.score).padStart(4, '0'), FIELD.width - 32, 52, { size: 34, align: 'right', colour: PALETTE.text, weight: '600' });
    text(`BEST ${Math.max(best, state.score)}`, FIELD.width - 32, 76, { size: 12, align: 'right', colour: PALETTE.dim, spacing: 2 });
    if (state.chain > 1) {
      const pulse = 1 + Math.sin(state.time * 12) * 0.04;
      text(`\u00d7${state.chain}`, FIELD.width - 32, 116, {
        size: Math.round(22 * pulse), align: 'right', colour: PALETTE.gold, weight: '700', spacing: 1,
      });
    }

    // A boss on the field owns the top centre: its name, its phase, and how much of it is left.
    const boss = state.enemies.find((enemy) => enemy.boss);
    if (boss) {
      const barWidth = 420;
      const barX = FIELD.width / 2 - barWidth / 2;
      const barY = 34;
      ctx.save();
      ctx.fillStyle = 'rgba(10,14,26,0.78)';
      ctx.fillRect(barX - 3, barY - 3, barWidth + 6, 12);
      const frac = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
      const grad = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
      grad.addColorStop(0, boss.bossPhase === 3 ? '#ff6b7a' : '#ffd166');
      grad.addColorStop(1, boss.bossPhase === 3 ? '#ffb3c1' : '#fff3c4');
      ctx.fillStyle = grad;
      glow(boss.bossPhase === 3 ? PALETTE.danger : PALETTE.gold, 18);
      ctx.fillRect(barX, barY, barWidth * frac, 6);
      ctx.restore();
      text(bossName(boss.kind), FIELD.width / 2, barY - 12, {
        size: 14, align: 'center', spacing: 4, weight: '700',
        colour: boss.bossPhase === 3 ? PALETTE.danger : PALETTE.gold,
      });
      text(`PHASE ${boss.bossPhase} / 3`, FIELD.width / 2, barY + 24, {
        size: 10, align: 'center', spacing: 3, colour: PALETTE.dim,
      });
    }

    // Charge, bottom centre: a bar with a hairline frame, and the flare prompt when it is full.
    const ready = state.charge >= FLARE.cost;
    const width = 300;
    const x = FIELD.width / 2 - width / 2;
    const y = FIELD.height - 46;
    ctx.save();
    ctx.fillStyle = 'rgba(10,16,30,0.7)';
    ctx.fillRect(x - 2, y - 2, width + 4, 12);
    const fill = (state.charge / FLARE.cost) * width;
    const gradient = ctx.createLinearGradient(x, 0, x + width, 0);
    gradient.addColorStop(0, '#5b7cff');
    gradient.addColorStop(1, ready ? PALETTE.gold : '#8ef0ff');
    ctx.fillStyle = gradient;
    if (ready) glow(PALETTE.gold, 16);
    ctx.fillRect(x, y, fill, 8);
    ctx.restore();
    text(ready ? 'FLARE READY \u2014 SPACE' : 'CHARGE', FIELD.width / 2, y - 10, {
      size: ready ? 13 : 11, align: 'center', spacing: 3,
      colour: ready ? PALETTE.gold : PALETTE.dim, weight: ready ? '700' : '400',
    });

    // How many shards are in the air, so a lull is readable.
    if (state.shards.length > 0) {
      text(`${state.shards.filter((s) => s.owner === 'enemy').length} SHARDS`, 32, FIELD.height - 28, {
        size: 12, colour: PALETTE.dim, spacing: 2,
      });
    }
  }

  /** The boss's real name lives in the config table; the renderer only borrows it. */
  function bossName(kind) {
    return (ENEMY[kind] && ENEMY[kind].name) || 'SOMETHING OLD';
  }

  function drawTitle(state, best) {
    const dim = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    dim.addColorStop(0, 'rgba(7,10,20,0.72)');
    dim.addColorStop(0.5, 'rgba(7,10,20,0.45)');
    dim.addColorStop(1, 'rgba(7,10,20,0.86)');
    ctx.fillStyle = dim;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);

    const pulse = 0.85 + Math.sin(state.time * 1.6) * 0.1;
    glow(PALETTE.ward, 30 * pulse);
    text('HOLLOWLIGHT', FIELD.width / 2, 258, {
      size: 92, font: SERIF, align: 'center', spacing: 14, colour: '#f2f7ff', weight: '600',
    });
    noGlow();
    text('hold the last light', FIELD.width / 2, 300, {
      size: 18, font: SERIF, align: 'center', spacing: 6, colour: PALETTE.ward, alpha: 0.9,
    });

    const lines = [
      'WASD or arrows   move the warden',
      'Mouse            aim the ward',
      'Catch a shard    it turns, and it is yours',
      'Space            flare, when the charge is full',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2 - 210, 400 + index * 26, { size: 15, colour: PALETTE.text, alpha: 0.86, spacing: 0.5 });
    });

    text(best > 0 ? `BEST ${best}` : 'NO RUN YET', FIELD.width / 2, 542, {
      size: 13, align: 'center', colour: PALETTE.dim, spacing: 4,
    });

    const blink = Math.sin(state.time * 3) > -0.4;
    if (blink) {
      text('PRESS SPACE OR CLICK TO BEGIN', FIELD.width / 2, 610, {
        size: 17, align: 'center', colour: PALETTE.gold, spacing: 5, weight: '600',
      });
    }
    text('a make.fun game', FIELD.width / 2, FIELD.height - 28, {
      size: 11, align: 'center', colour: PALETTE.dim, spacing: 3, alpha: 0.7,
    });
  }

  function wrap(value, max) {
    const words = value.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const attempt = line ? `${line} ${word}` : word;
      if (attempt.length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawUpgrade(state, hover = 0) {
    ctx.fillStyle = 'rgba(6,9,18,0.82)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const relic = state.offerKind === 'relic';
    text(`WAVE ${state.wave} CLEARED`, FIELD.width / 2, 200, {
      size: 15, align: 'center', colour: relic ? PALETTE.gold : PALETTE.ward, spacing: 6, weight: '600',
    });
    text(relic ? 'It left something behind' : 'Choose a gift', FIELD.width / 2, 258, {
      size: relic ? 40 : 46, font: SERIF, align: 'center', spacing: 3,
      colour: relic ? '#ffe9b0' : '#f2f7ff',
    });
    text(relic ? '1 / 2, or click \u2014 one relic, no going back' : '1 / 2 / 3, or click', FIELD.width / 2, 292, {
      size: 13, align: 'center', colour: PALETTE.dim, spacing: 3,
    });

    state.offer.forEach((upgrade, index) => {
      // Two cards are drawn on the outer slots so the pair reads as a choice rather than a gap.
      const slot = state.offer.length === 2 ? index * 2 : index;
      const card = CARD_LAYOUT[slot];
      if (!card) return;
      const active = hover === index + 1;
      ctx.save();
      ctx.fillStyle = active ? 'rgba(28,42,74,0.96)' : 'rgba(16,24,44,0.92)';
      ctx.strokeStyle = active ? upgrade.colour : 'rgba(142,240,255,0.35)';
      ctx.lineWidth = active ? 2.5 : 1.5;
      if (active) glow(upgrade.colour, 22);
      ctx.beginPath();
      const r = 12;
      const { x, y, w, h } = card;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      noGlow();
      ctx.restore();

      text(upgrade.glyph, card.x + card.w / 2, card.y + 56, {
        size: 34, align: 'center', colour: upgrade.colour, font: SERIF,
      });
      text(upgrade.name, card.x + card.w / 2, card.y + 96, {
        size: 19, align: 'center', colour: PALETTE.text, weight: '600', spacing: 1,
      });
      wrap(upgrade.blurb, 26).forEach((line, lineIndex) => {
        text(line, card.x + card.w / 2, card.y + 128 + lineIndex * 19, {
          size: 12.5, align: 'center', colour: PALETTE.dim,
        });
      });
      text(`${index + 1}`, card.x + 16, card.y + card.h - 14, {
        size: 12, colour: paletteFor(upgrade.colour), alpha: 0.8, spacing: 1,
      });
    });
  }

  function paletteFor(colour) {
    return colour;
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(6,9,18,0.78)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const bested = state.score >= best && state.score > 0;
    text('THE LIGHT GOES OUT', FIELD.width / 2, 190, {
      size: 15, align: 'center', colour: PALETTE.danger, spacing: 7, weight: '600',
    });
    text(String(state.score), FIELD.width / 2, 300, {
      size: 104, font: SERIF, align: 'center', colour: '#f2f7ff', weight: '600',
    });
    text('SCORE', FIELD.width / 2, 332, { size: 13, align: 'center', colour: PALETTE.dim, spacing: 6 });
    text(`WAVE ${state.wave} \u00b7 ${state.kills} RETURNED \u00b7 ${state.upgrades.length} GIFTS`, FIELD.width / 2, 384, {
      size: 14, align: 'center', colour: PALETTE.ward, spacing: 2,
    });
    text(bested ? `NEW BEST \u2014 ${state.score}` : `BEST ${best}`, FIELD.width / 2, 434, {
      size: 16, align: 'center', colour: bested ? PALETTE.gold : PALETTE.dim, spacing: 3, weight: '600',
    });
    if (Math.sin(state.time * 3) > -0.4) {
      text('PRESS SPACE OR CLICK TO TRY AGAIN', FIELD.width / 2, 552, {
        size: 16, align: 'center', colour: PALETTE.gold, spacing: 4, weight: '600',
      });
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(6,9,18,0.7)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    text('PAUSED', FIELD.width / 2, FIELD.height / 2, { size: 46, font: SERIF, align: 'center', spacing: 8, colour: PALETTE.text });
    text('ESC TO RESUME', FIELD.width / 2, FIELD.height / 2 + 44, { size: 14, align: 'center', colour: PALETTE.dim, spacing: 4 });
  }

  /**
   * Paint one frame. `screen` is the screen the game is on (title / play / upgrade / over / paused);
   * `best` is the stored best score; `hover` is which upgrade card the pointer is over.
   */
  function draw(state, screen, best = 0, hover = 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.night;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    // Screen shake: a small offset, decaying, applied to the whole field.
    const shake = state.shake;
    if (shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }

    drawBackground(state);
    drawFlare(state);
    for (const enemy of state.enemies) drawEnemy(enemy, state);
    for (const shard of state.shards) drawShard(shard, state);
    drawParticles(state.particles ?? { all: [], life: () => 1 });
    if (screen !== SCREEN_TITLE) drawWard(state);
    drawWarden(state);

    if (screen === SCREEN_TITLE) drawTitle(state, best);
    else {
      drawHud(state, best);
      if (screen === SCREEN_UPGRADE) drawUpgrade(state, hover);
      else if (screen === SCREEN_OVER) drawOver(state, best);
      else if (screen === SCREEN_PAUSED) drawPaused();
    }

    // A hit washes the frame red for a moment.
    if (state.flash > 0.01) {
      ctx.fillStyle = `rgba(255,80,110,${state.flash * 0.35})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  }

  return { draw, resize, SCREEN_TITLE };
}