import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BANDS,
  bandEdges,
  bandsFromSpectrum,
  createCellBuilder,
  createIntroTracker,
  STEP_S,
} from '../../src/lib/introprint.js';

const FRAME_S = 0.1;

// A seeded generator, so every run hears the same made-up episodes.
const createRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

// A stretch of sound: one band level per frame, nothing like any other
// stretch made from a different seed.
const makeSound = (seed, seconds) => {
  const random = createRandom(seed);
  const frames = [];
  for (let k = 0; k < seconds / FRAME_S; k++) {
    frames.push(
      Float32Array.from({ length: BANDS }, () => -70 + random() * 40),
    );
  }
  return frames;
};

const INTRO = makeSound(7, 90);

// An episode: some story, the opening, more story.
const makeEpisode = (seed, before, after = 200) => [
  ...makeSound(seed, before),
  ...INTRO,
  ...makeSound(seed + 1000, after),
];

// Every answer the tracker gave, with the cell it gave it at.
const listen = (frames, tracker) => {
  const events = [];
  const builder = createCellBuilder((index, vector) => {
    const result = tracker.push(index, vector);
    if (result !== null) events.push({ ...result, at: index });
  });
  frames.forEach((bands, k) => builder.push(k * FRAME_S, bands));
  return events;
};

const play = (frames, tracker) => listen(frames, tracker)[0] ?? null;

const near = (cells, seconds, slack = 1) =>
  assert.ok(
    Math.abs(cells * STEP_S - seconds) <= slack,
    `expected ${cells * STEP_S}s to be within ${slack}s of ${seconds}s`,
  );

const learnFromTwo = () => {
  const first = createIntroTracker({ intros: [], previous: [] });
  play(makeEpisode(1, 40), first);
  const second = createIntroTracker({
    intros: [],
    previous: [first.getRecording()],
  });
  const found = play(makeEpisode(2, 75), second);
  return { found, second };
};

test('the first episode has nothing to compare with', () => {
  const tracker = createIntroTracker({ intros: [], previous: [] });
  assert.equal(play(makeEpisode(1, 40), tracker), null);
  assert.notEqual(tracker.getRecording(), null);
});

test('the opening is learned from the second episode, edges and all', () => {
  const { found } = learnFromTwo();
  assert.equal(found.kind, 'learned');
  near(found.start, 75);
  near(found.end, 165);
});

test('a learned opening is offered a second in, then confirmed', () => {
  const { found } = learnFromTwo();
  const third = createIntroTracker({
    intros: [found.recording],
    previous: [],
  });
  const [offered, confirmed] = listen(makeEpisode(3, 130), third);
  assert.equal(offered.kind, 'likely');
  near(offered.start, 130);
  near(offered.end, 220);
  assert.ok(offered.at * STEP_S - 130 <= 1.5, 'offered within 1.5 s');
  assert.equal(confirmed.kind, 'known');
  near(confirmed.start, 130);
});

test('an opening joined halfway is offered within a few seconds', () => {
  const { found } = learnFromTwo();
  const tracker = createIntroTracker({
    intros: [found.recording],
    previous: [],
  });
  // Listening starts 40 s into the opening, which begins at 130 s.
  const episode = makeEpisode(3, 130).slice(Math.round(170 / FRAME_S));
  const timed = episode.map((bands, k) => [170 + k * FRAME_S, bands]);
  const events = [];
  const builder = createCellBuilder((index, levels) => {
    const result = tracker.push(index, levels);
    if (result !== null) events.push({ ...result, at: index });
  });
  for (const [seconds, bands] of timed) builder.push(seconds, bands);
  assert.equal(events[0].kind, 'likely');
  near(events[0].start, 130);
  near(events[0].end, 220);
  assert.ok(events[0].at * STEP_S - 170 <= 4, 'offered within 4 s');
});

test('an opening that only starts alike is offered, then withdrawn', () => {
  const { found } = learnFromTwo();
  const fourth = createIntroTracker({
    intros: [found.recording],
    previous: [],
  });
  const episode = [
    ...makeSound(4, 60),
    ...INTRO.slice(0, 30),
    ...makeSound(5, 120),
  ];
  const events = listen(episode, fourth);
  assert.deepEqual(
    events.map((event) => event.kind),
    ['likely', 'dismissed'],
  );
});

test('episodes with no opening in common teach nothing', () => {
  const first = createIntroTracker({ intros: [], previous: [] });
  play(makeSound(11, 300), first);
  const second = createIntroTracker({
    intros: [],
    previous: [first.getRecording()],
  });
  assert.equal(play(makeSound(12, 300), second), null);
});

test('the same episode watched again is not mistaken for an opening', () => {
  const episode = makeEpisode(1, 40);
  const first = createIntroTracker({ intros: [], previous: [] });
  play(episode, first);
  const again = createIntroTracker({
    intros: [],
    previous: [first.getRecording()],
  });
  assert.equal(play(episode, again), null);
  assert.equal(again.getRecording(), null);
});

test('band edges climb from low to high and stay inside the spectrum', () => {
  const edges = bandEdges(48000, 8192);
  assert.equal(edges.length, BANDS + 1);
  for (let k = 1; k < edges.length; k++) assert.ok(edges[k] >= edges[k - 1]);
  assert.ok(edges.at(-1) < 4096);
});

test('a flat spectrum gives the same level in every band', () => {
  const edges = bandEdges(48000, 8192);
  const bands = bandsFromSpectrum(new Float32Array(4096).fill(-50), edges);
  for (const level of bands) assert.ok(Math.abs(level + 50) < 1e-3);
});
