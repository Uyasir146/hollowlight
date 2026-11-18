// Keyboard and mouse, read once per frame and handed to the simulation as one plain object, so the
// game logic never touches the DOM and the screenshot autopilot can drive the same input.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FLARE = 4;
export const ACTION_MUTE = 8;

/** The upgrade cards sit in the same place the renderer draws them; both read this layout. */
export const CARD_LAYOUT = [
  { x: 250, y: 330, w: 240, h: 210 },
  { x: 520, y: 330, w: 240, h: 210 },
  { x: 790, y: 330, w: 240, h: 210 },
];

const MOVE = {
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
};

function cardAt(point) {
  for (let index = 0; index < CARD_LAYOUT.length; index += 1) {
    const c = CARD_LAYOUT[index];
    if (point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h) return index + 1;
  }
  return 0;
}

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouse = { x: 640, y: 360 };
  let pick = 0; // 1..3: which upgrade card was clicked or keyed this frame

  function onKeyDown(event) {
    if (event.repeat) return;
    const code = event.code;
    if (MOVE[code]) {
      held.add(code);
      event.preventDefault();
      return;
    }
    if (code === 'Space') { actions |= ACTION_CONFIRM | ACTION_FLARE; event.preventDefault(); }
    else if (code === 'Escape' || code === 'KeyP') { actions |= ACTION_PAUSE; event.preventDefault(); }
    else if (code === 'KeyM') { actions |= ACTION_MUTE; }
    else if (code === 'Digit1') pick = 1;
    else if (code === 'Digit2') pick = 2;
    else if (code === 'Digit3') pick = 3;
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  /** The canvas is letterboxed and scaled; map the pointer back into field coordinates. */
  function toField(event) {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / 1280, rect.height / 720) || 1;
    const offX = (rect.width - 1280 * scale) / 2;
    const offY = (rect.height - 720 * scale) / 2;
    return { x: (event.clientX - rect.left - offX) / scale, y: (event.clientY - rect.top - offY) / scale };
  }

  function onPointerMove(event) {
    mouse = toField(event);
  }

  function onPointerDown(event) {
    // A click on an upgrade card chooses it; anywhere else it counts as confirm/flare.
    mouse = toField(event);
    const card = cardAt(mouse);
    if (card) pick = card;
    else actions |= ACTION_CONFIRM | ACTION_FLARE;
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('blur', () => held.clear());

  return {
    /** The object the simulation steps against. */
    read() {
      let x = 0;
      let y = 0;
      for (const code of held) {
        const [dx, dy] = MOVE[code];
        x += dx;
        y += dy;
      }
      const length = Math.hypot(x, y) || 1;
      return { moveX: x / length, moveY: y / length, aimX: mouse.x, aimY: mouse.y, actions, pick };
    },
    /** Call once the frame is done: actions and the card pick are one-shot. */
    clear() {
      actions = 0;
      pick = 0;
    },
  };
}
