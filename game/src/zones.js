// The arena changes under the warden as the night goes on: every three waves the light shifts and the
// rules tilt with it. One zone is a mood and a small multiplier, never a new mechanic, so the player
// learns to read the field rather than memorise a wave list.
export const ZONES = [
  {
    id: 'hollow', name: 'THE HOLLOW', accent: '#6f8bff',
    line: 'nothing here has a shadow',
    hp: 1.0, pace: 1.0, rate: 1.0,
  },
  {
    id: 'ember', name: 'EMBER REACH', accent: '#ffb347',
    line: 'the air remembers a fire',
    hp: 1.08, pace: 1.0, rate: 1.12,
  },
  {
    id: 'saltmere', name: 'SALTMERE FLATS', accent: '#8ef0ff',
    line: 'fog, and things that move in it',
    hp: 1.0, pace: 1.14, rate: 1.0,
  },
  {
    id: 'undertow', name: 'THE UNDERTOW', accent: '#a678ff',
    line: 'the ground is not ground',
    hp: 1.18, pace: 1.06, rate: 1.05,
  },
  {
    id: 'last-wick', name: 'THE LAST WICK', accent: '#ff6b7a',
    line: 'everything is closing at once',
    hp: 1.26, pace: 1.16, rate: 1.18,
  },
];

/** Endless play keeps the threat rising after the last written zone; only the numbers move. */
export function zoneFor(wave) {
  const index = Math.floor((wave - 1) / 3);
  if (index < ZONES.length) return ZONES[index];
  const over = index - ZONES.length + 1;
  return {
    id: 'beyond', name: `BEYOND THE WICK ${over}`, accent: '#ff6b7a',
    line: 'the dark is no longer surprised by you',
    hp: 1.26 + over * 0.06, pace: 1.16 + over * 0.03, rate: 1.18 + over * 0.03,
  };
}

/** Every three waves the zone turns over; the HUD announces it and the score pays a little for it. */
export function isZoneStart(wave) {
  return (wave - 1) % 3 === 0;
}