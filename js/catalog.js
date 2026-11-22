// The sound catalog: pure data shared by the UI, the URL codec and the tests. Synthesis lives in sounds.js.
export const GROUPS = [
  { id: 'noise', name: 'Noise', hue: 262 }, { id: 'rain', name: 'Rain', hue: 214 }, { id: 'water', name: 'Water', hue: 192 },
  { id: 'fire', name: 'Fire', hue: 22 }, { id: 'nature', name: 'Nature', hue: 140 }, { id: 'places', name: 'Places', hue: 286 }, { id: 'tones', name: 'Tones', hue: 330 },
];
// [id, name, group, character knob label (or ''), default character 0-100, default volume]
const S = [
  ['white', 'White noise', 'noise', '', 0, 45], ['pink', 'Pink noise', 'noise', '', 0, 55], ['brown', 'Brown noise', 'noise', '', 0, 60], ['blue', 'Blue noise', 'noise', '', 0, 40], ['violet', 'Violet noise', 'noise', '', 0, 35],
  ['rain-light', 'Light rain', 'rain', 'Drops', 40, 60], ['rain-heavy', 'Heavy rain', 'rain', 'Drops', 60, 55], ['rain-window', 'Rain on window', 'rain', 'Drops', 50, 60], ['rain-roof', 'Rain on roof', 'rain', 'Drops', 55, 60],
  ['rain-tent', 'Rain on tent', 'rain', 'Drops', 50, 60], ['thunder', 'Thunder', 'rain', 'Frequency', 40, 55], ['storm', 'Storm', 'rain', 'Fury', 55, 55],
  ['ocean', 'Ocean waves', 'water', 'Swell', 50, 60], ['stream', 'Stream', 'water', 'Flow', 50, 55], ['waterfall', 'Waterfall', 'water', 'Spray', 50, 50], ['drips', 'Water drops', 'water', 'Rate', 40, 50], ['underwater', 'Underwater', 'water', 'Depth', 50, 55],
  ['campfire', 'Campfire', 'fire', 'Crackle', 50, 60], ['fireplace', 'Fireplace', 'fire', 'Crackle', 40, 60],
  ['wind', 'Wind', 'nature', 'Gustiness', 50, 55], ['wind-trees', 'Wind in trees', 'nature', 'Gustiness', 50, 55], ['forest', 'Forest leaves', 'nature', 'Rustle', 50, 50], ['crickets', 'Crickets', 'nature', 'Chorus', 50, 45], ['birds', 'Birdsong', 'nature', 'Song', 50, 45],
  ['fan', 'Fan / AC', 'places', 'Speed', 40, 55], ['train', 'Train cabin', 'places', 'Speed', 50, 55], ['airplane', 'Airplane cabin', 'places', 'Engine', 50, 55], ['cafe', 'Cafe murmur', 'places', 'Crowd', 50, 50], ['typing', 'Soft typing', 'places', 'Pace', 50, 45],
  ['heartbeat', 'Heartbeat', 'tones', 'Tempo', 25, 50], ['bowl', 'Singing bowl', 'tones', 'Pitch', 40, 45], ['drone', 'Binaural drone', 'tones', 'Beat Hz', 30, 40], ['space', 'Deep space', 'tones', 'Depth', 50, 50],
];
export const SOUNDS = S.map(([id, name, g, ch, dc, dv]) => ({ id, name, g, ch, dc, dv }));
export const BY_ID = Object.fromEntries(SOUNDS.map(s => [s.id, s]));
const m = (name, master, ...items) => ({ name, master, items: items.map(([id, v, c]) => ({ id, v, c: c ?? BY_ID[id].dc })) });
export const PRESETS = [
  m('Rainy cabin', 75, ['rain-roof', 70, 55], ['fireplace', 45, 35], ['thunder', 35, 20], ['brown', 18]),
  m('Campfire night', 75, ['campfire', 70, 60], ['crickets', 40, 50], ['wind-trees', 25, 30], ['space', 12]),
  m('Ocean deep sleep', 70, ['ocean', 75, 45], ['pink', 20], ['wind', 22, 25], ['bowl', 20, 25]),
  m('Thunderstorm', 78, ['storm', 70, 70], ['rain-heavy', 45, 70], ['thunder', 55, 55]),
  m('Focus brown', 70, ['brown', 70], ['rain-window', 25, 30], ['fan', 18, 25]),
  m('Forest morning', 72, ['birds', 55, 55], ['wind-trees', 40, 30], ['stream', 40, 45], ['forest', 25, 40]),
  m('Flight', 72, ['airplane', 75, 55], ['pink', 18], ['heartbeat', 0, 20]),
  m('Cafe study', 72, ['cafe', 65, 55], ['rain-window', 35, 40], ['typing', 22, 40]),
].map(p => ({ ...p, items: p.items.filter(i => i.v > 0) }));
export const VIZ = { // scenery weights per sound: [rain, water, fire, wind, forest, night, space, machine]
  white: [0, 0, 0, 0, 0, 0, .5, 0], pink: [0, 0, 0, 0, 0, 0, .5, 0], brown: [0, 0, 0, 0, 0, 0, .5, 0], blue: [0, 0, 0, 0, 0, 0, .5, 0], violet: [0, 0, 0, 0, 0, 0, .5, 0],
  'rain-light': [1], 'rain-heavy': [1], 'rain-window': [1, 0, 0, 0, 0, .2], 'rain-roof': [1], 'rain-tent': [1, 0, 0, 0, .2], thunder: [.5, 0, 0, 0, 0, .4], storm: [1, 0, 0, .5],
  ocean: [0, 1], stream: [0, .8, 0, 0, .3], waterfall: [0, 1], drips: [0, .8], underwater: [0, 1, 0, 0, 0, 0, .3],
  campfire: [0, 0, 1, 0, 0, .3], fireplace: [0, 0, 1], wind: [0, 0, 0, 1], 'wind-trees': [0, 0, 0, .6, .6], forest: [0, 0, 0, 0, 1], crickets: [0, 0, 0, 0, .2, 1], birds: [0, 0, 0, 0, 1],
  fan: [0, 0, 0, 0, 0, 0, 0, .8], train: [0, 0, 0, 0, 0, 0, 0, 1], airplane: [0, 0, 0, 0, 0, .2, 0, 1], cafe: [0, 0, .2, 0, 0, 0, 0, .7], typing: [0, 0, 0, 0, 0, 0, 0, .7],
  heartbeat: [0, 0, 0, 0, 0, 0, 1], bowl: [0, 0, 0, 0, 0, .3, 1], drone: [0, 0, 0, 0, 0, 0, 1], space: [0, 0, 0, 0, 0, .3, 1],
};
