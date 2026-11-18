// All sound is synthesised with WebAudio: no audio files to load, nothing to fetch, and every cue can
// be pitched by how good the moment was. The context is created on the first gesture (browsers refuse
// to start one before that) and every call is a no-op until it exists.
let context = null;
let master = null;
let muted = false;

function ensure() {
  if (context) return context;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(context.destination);
  return context;
}

/** A single shaped tone: the workhorse for pings, thuds and chimes. */
function tone({ type = 'sine', from = 440, to = 440, gain = 0.2, attack = 0.005, decay = 0.18, delay = 0 }) {
  const ctx = ensure();
  if (!ctx || muted) return;
  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), now + decay);
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  osc.connect(amp);
  amp.connect(master);
  osc.start(now);
  osc.stop(now + attack + decay + 0.02);
}

/** Filtered noise, for the flare and for a shard breaking. */
function noise({ gain = 0.2, decay = 0.3, from = 1800, to = 200, delay = 0 }) {
  const ctx = ensure();
  if (!ctx || muted) return;
  const now = ctx.currentTime + delay;
  const length = Math.floor(ctx.sampleRate * decay);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 2;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, now);
  filter.frequency.exponentialRampToValueAtTime(to, now + decay);
  filter.Q.value = 1.1;
  const amp = ctx.createGain();
  amp.gain.value = gain;
  source.connect(filter);
  filter.connect(amp);
  amp.connect(master);
  source.start(now);
}

export const audio = {
  unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  },
  setMuted(value) {
    muted = value;
    if (master) master.gain.value = muted ? 0 : 0.5;
  },
  isMuted() {
    return muted;
  },
  /** The ward catches a shard: bright, and higher the longer the chain runs. */
  reflect(chain = 0) {
    const pitch = 660 * 1.09 ** Math.min(chain, 8);
    tone({ type: 'triangle', from: pitch, to: pitch * 1.5, gain: 0.16, decay: 0.1 });
    tone({ type: 'sine', from: pitch * 2, to: pitch * 3, gain: 0.06, decay: 0.06 });
  },
  /** An enemy dies. */
  kill(chain = 0) {
    tone({ type: 'square', from: 220 * 1.06 ** Math.min(chain, 10), to: 90, gain: 0.12, decay: 0.16 });
  },
  /** The warden is hit. */
  hit() {
    tone({ type: 'sawtooth', from: 160, to: 55, gain: 0.24, decay: 0.32 });
    noise({ gain: 0.12, decay: 0.2, from: 900, to: 120 });
  },
  /** The flare: a rising sweep and a wash of noise. */
  flare() {
    tone({ type: 'sawtooth', from: 120, to: 780, gain: 0.2, decay: 0.34 });
    noise({ gain: 0.22, decay: 0.45, from: 3200, to: 240 });
  },
  /** A wave is cleared and the upgrade cards appear. */
  wave() {
    tone({ type: 'sine', from: 523, to: 523, gain: 0.13, decay: 0.14 });
    tone({ type: 'sine', from: 784, to: 784, gain: 0.13, decay: 0.16, delay: 0.11 });
    tone({ type: 'sine', from: 1046, to: 1046, gain: 0.11, decay: 0.22, delay: 0.22 });
  },
  /** Choosing a card. */
  choose() {
    tone({ type: 'triangle', from: 420, to: 620, gain: 0.14, decay: 0.12 });
  },
  /** The run ends. */
  over() {
    tone({ type: 'sine', from: 340, to: 320, gain: 0.16, decay: 0.3 });
    tone({ type: 'sine', from: 250, to: 120, gain: 0.16, decay: 0.7, delay: 0.14 });
  },
  /** A shard is destroyed by the flare rather than by being returned. */
  crack() {
    noise({ gain: 0.1, decay: 0.16, from: 2400, to: 400 });
  },
};
