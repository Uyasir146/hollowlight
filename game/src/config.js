// Every number the game is tuned by, in one place, so the field, the controls, the economy and the
// renderer can never disagree about them. Sizes are in logical pixels: the field is 1280x720 and the
// canvas letterboxes it to whatever the window is.
export const FIELD = { width: 1280, height: 720 };

/** The simulation runs in fixed steps of this length, whatever the frame rate is. */
export const STEP = 1 / 60;

export const WARDEN = {
  radius: 14,
  speed: 268,
  maxHearts: 4,
  invulnFor: 1.5,
  /** How long the little burst of speed lasts after a hit, so a bad moment is not fatal. */
  knockback: 240,
};

/** The ward: the arc the warden holds between itself and danger, and the only way to hurt anything. */
export const WARD = {
  radius: 46,
  halfAngle: 1.15, // ~66 degrees each side: a 132 degree arc
  inner: 30,
  reflectBoost: 1.18,
  damageBoost: 1.6,
  chargePerReflect: 10,
  /** The arc cannot turn faster than this, so aiming is a skill and not a teleport. */
  turnRate: 14,
};

/** The flare: a radial pulse bought with reflect charge, the answer to being surrounded. */
export const FLARE = {
  cost: 100,
  radius: 255,
  damage: 48,
  growFor: 0.32,
  knockback: 260,
};

export const SHARD = {
  radius: 5,
  enemySpeedMin: 178,
  enemySpeedMax: 238,
  reflectedSpeed: 470,
  lifeFor: 7.5,
  /** A reflected shard hits this many enemies before it is spent. Upgrades raise it. */
  pierce: 1,
};

export const ENEMY = {
  drifter: { radius: 17, hp: 22, speed: 54, fireFor: 2.6, damage: 1 },
  weaver: { radius: 15, hp: 26, speed: 80, fireFor: 2.8, damage: 1, keepAway: 300 },
  lurker: { radius: 14, hp: 16, speed: 172, fireFor: 0, damage: 1 },
  splitter: { radius: 22, hp: 34, speed: 40, fireFor: 3.4, damage: 1 },
  sentinel: { radius: 24, hp: 52, speed: 34, fireFor: 3.1, damage: 1 },
  // Bosses live in the same table so the step loop reads one spec shape, but they are neither spawned
  // by waveComposition nor shuffled into a spawn order: waves.js places them, and stepEnemies gives
  // them their own movement and their three-phase attack script.
  hollowking: {
    radius: 46, hp: 560, speed: 44, fireFor: 2.3, damage: 1, keepAway: 330,
    boss: true, name: 'THE HOLLOW KING', score: 420,
  },
  leviathan: {
    radius: 54, hp: 880, speed: 38, fireFor: 2.0, damage: 1, keepAway: 360,
    boss: true, name: 'THE WOUND LEVIATHAN', score: 760,
  },
};

/** A boss arrives every this many waves, alternating between the two, and its health climbs each time. */
export const BOSS = { every: 5, hpPerCycle: 0.42 };

export const SCORE = {
  perKill: 10,
  perReflect: 2,
  perWave: 40,
  chainWindow: 1.6,
  chainStep: 0.5,
  chainMax: 4,
};

export const PALETTE = {
  night: '#070a14',
  deep: '#111830',
  haze: '#1b2547',
  grid: 'rgba(96,124,196,0.10)',
  ward: '#8ef0ff',
  wardHot: '#e8fdff',
  warden: '#ffcf6b',
  wardenHot: '#fff3c4',
  shardFoe: '#79d2ff',
  shardOwn: '#ffd166',
  foe: '#6f8bff',
  foeHurt: '#ffffff',
  lurker: '#ff5d8f',
  splitter: '#a678ff',
  sentinel: '#59e0b0',
  text: '#e9f1ff',
  dim: '#7f92b8',
  danger: '#ff6b7a',
  gold: '#ffd166',
};

/** Where the best score lives between visits. */
export const BEST_KEY = 'hollowlight.best';
export const MUTE_KEY = 'hollowlight.muted';
