// Boot, the frame loop and the screens. The world owns the rules, the renderer owns the pixels, the
// input reader owns the devices; this file is the only place that knows about all three, decides what
// screen is on, and turns the events a step reports into sound and saved scores.
import { BEST_KEY, STEP } from './config.js';
import { audio } from './audio.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, CARD_LAYOUT, createInput } from './input.js';
import { createRandom } from './random.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';
import {
  EV_CRACK, EV_FLARE, EV_HIT, EV_KILL, EV_OVER, EV_REFLECT, EV_WAVE_CLEAR,
  PHASE_OVER, PHASE_TITLE, PHASE_UPGRADE, PHASE_WAVE, createWorld,
} from './world.js';

const canvas = document.getElementById('field');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number(params.get('seed') ?? 20261118) || 20261118;

const random = createRandom(seed);
const world = createWorld(random);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) ?? 0) || 0;
  } catch {
    return 0; // private mode, or storage disabled: the game still runs, it just forgets
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* nothing to do */
  }
}

let best = readBest();
let screen = SCREEN_TITLE;
let paused = false;
let hover = 0;

// ---------------------------------------------------------------- screenshot scenes
// ?shot=start|play|upgrade|over stages the real simulation and paints one frame, then stops. The
// pictures in screenshots/ are exactly these frames, taken at 1280x720.
if (shotName) {
  const staged = stageShot(shotName, world);
  screen = staged.screen;
  renderer.draw(world.state, screen, Math.max(best, world.state.score), staged.hover);
  // One more paint after layout settles, so a headless capture never catches a half-sized canvas.
  window.requestAnimationFrame(() => {
    renderer.resize();
    renderer.draw(world.state, screen, Math.max(best, world.state.score), staged.hover);
    // The capture script reads this back: which scene it got, and what was actually on screen.
    const { state } = world;
    document.body.dataset.scene = JSON.stringify({
      phase: state.phase,
      wave: state.wave,
      enemies: state.enemies.length,
      shards: state.shards.length,
      score: state.score,
      hearts: state.hearts,
    });
    document.body.dataset.ready = '1';
  });
} else {
  start();
}

function start() {
  const input = createInput(canvas);
  let last = 0;
  let accumulator = 0;

  function hoveredCard(aim) {
    for (let index = 0; index < CARD_LAYOUT.length; index += 1) {
      const card = CARD_LAYOUT[index];
      if (aim.x >= card.x && aim.x <= card.x + card.w && aim.y >= card.y && aim.y <= card.y + card.h) return index;
    }
    return -1;
  }

  function handle(frame) {
    const act = frame.actions;

    if (act & ACTION_MUTE) audio.setMuted(!audio.isMuted());

    if (screen === SCREEN_TITLE) {
      if (act & ACTION_CONFIRM) {
        audio.unlock();
        world.reset();
        screen = SCREEN_PLAY;
      }
      return;
    }

    if (screen === SCREEN_OVER) {
      if (act & ACTION_CONFIRM) {
        world.reset();
        screen = SCREEN_PLAY;
      }
      return;
    }

    if (screen === SCREEN_UPGRADE) {
      const keyed = frame.pick - 1;
      const choice = keyed >= 0 ? keyed : hover;
      if (choice >= 0 && world.chooseUpgrade(choice)) {
        audio.choose();
        screen = SCREEN_PLAY;
      }
      return;
    }

    if (act & ACTION_PAUSE) {
      paused = !paused;
      screen = paused ? SCREEN_PAUSED : SCREEN_PLAY;
    }
  }

  function frame(now) {
    const delta = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    accumulator += delta;

    const state = world.state;
    const frameInput = input.read();
    hover = screen === SCREEN_UPGRADE ? hoveredCard({ x: frameInput.aimX, y: frameInput.aimY }) : -1;

    handle(frameInput);

    // Fixed steps: the simulation never sees a variable dt, so tuning means the same thing on every machine.
    let guard = 0;
    while (accumulator >= STEP && guard < 6) {
      let events = 0;
      if (screen === SCREEN_TITLE) world.step(STEP, null, true);
      else if (screen === SCREEN_PLAY && !paused) events = world.step(STEP, frameInput);
      accumulator -= STEP;
      guard += 1;
      reactTo(events);
    }
    if (guard >= 6) accumulator = 0;

    if (state.phase === PHASE_UPGRADE && screen === SCREEN_PLAY) screen = SCREEN_UPGRADE;
    if (state.phase === PHASE_OVER && screen !== SCREEN_OVER) {
      screen = SCREEN_OVER;
      if (state.score > best) {
        best = state.score;
        saveBest(best);
      }
      audio.over();
    }

    input.clear();
    renderer.draw(state, screen, best, hover);
    window.requestAnimationFrame(frame);
  }

  function reactTo(events) {
    if (!events) return;
    if (events & EV_HIT) audio.hit();
    if (events & EV_REFLECT) audio.reflect();
    if (events & EV_KILL) audio.kill();
    if (events & EV_FLARE) audio.flare();
    if (events & EV_CRACK) audio.crack();
    if (events & EV_WAVE_CLEAR) audio.wave();
    if (events & EV_OVER) audio.over();
  }

  // Leaving the tab mid-fight should not cost a heart: pause instead.
  window.addEventListener('blur', () => {
    if (screen === SCREEN_PLAY) {
      paused = true;
      screen = SCREEN_PAUSED;
    }
  });

  window.requestAnimationFrame(frame);
}

// Expose a tiny handle for the shots script and for the curious: read-only, no state changes.
window.hollowlight = { state: world.state, stage: (name) => stageShot(name, world) };