import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

import { createRecognizer } from '../../src/content/gestures/recognizer.js';

const WIDTH = 800;
const HEIGHT = 360;

const createSurface = () => {
  const listeners = new Map();
  return {
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type) => listeners.delete(type),
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
    }),
    fire: (type, xRatio, yRatio) =>
      listeners.get(type)({
        pointerId: 1,
        clientX: xRatio * WIDTH,
        clientY: yRatio * HEIGHT,
      }),
  };
};

const setUp = () => {
  const surface = createSurface();
  const events = [];
  const record = (name) => (detail) => events.push({ name, ...detail });
  createRecognizer(surface, {
    tap: record('tap'),
    multiTap: record('multiTap'),
    holdStart: record('holdStart'),
    holdEnd: record('holdEnd'),
  });
  const tapAt = (xRatio, yRatio) => {
    surface.fire('pointerdown', xRatio, yRatio);
    surface.fire('pointerup', xRatio, yRatio);
  };
  return { surface, events, tapAt };
};

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
});

test('a lone tap on a side waits for a second before showing controls', () => {
  const { events, tapAt } = setUp();
  tapAt(0.8, 0.4);
  assert.deepEqual(events, []);
  mock.timers.tick(400);
  assert.deepEqual(
    events.map((event) => event.name),
    ['tap'],
  );
  mock.timers.reset();
});

test('a tap in the middle acts at once, so a second tap can pause', () => {
  const { events, tapAt } = setUp();
  tapAt(0.5, 0.4);
  tapAt(0.5, 0.4);
  assert.deepEqual(
    events.map((event) => event.name),
    ['tap', 'tap'],
  );
  mock.timers.reset();
});

test('a double-tap that is not very quick still seeks, never toggles', () => {
  const { events, tapAt } = setUp();
  tapAt(0.8, 0.4);
  mock.timers.tick(280);
  tapAt(0.84, 0.46);
  mock.timers.tick(1000);
  assert.deepEqual(
    events.map((event) => [event.name, event.zone]),
    [['multiTap', 'holdRight']],
  );
  mock.timers.reset();
});

test('a second tap that strays onto the middle still seeks', () => {
  const { events, tapAt } = setUp();
  tapAt(0.7, 0.4);
  mock.timers.tick(200);
  tapAt(0.55, 0.4);
  mock.timers.tick(1000);
  assert.deepEqual(
    events.map((event) => [event.name, event.zone]),
    [['multiTap', 'holdRight']],
  );
  mock.timers.reset();
});

test('holding a side reports the start and the end of the hold', () => {
  const { events, surface } = setUp();
  surface.fire('pointerdown', 0.8, 0.4);
  mock.timers.tick(400);
  surface.fire('pointerup', 0.8, 0.4);
  assert.deepEqual(
    events.map((event) => [event.name, event.zone]),
    [
      ['holdStart', 'holdRight'],
      ['holdEnd', 'holdRight'],
    ],
  );
  mock.timers.reset();
});
