import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clampPan,
  clampScale,
  computeCoverScale,
  snapScale,
} from '../../src/content/video/zoom.js';

const close = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-6,
    `expected ${actual} to be about ${expected}`,
  );

test('cover scale crops a letterboxed widescreen picture', () => {
  close(computeCoverScale(1280, 544, 2340, 1080), 1280 / 544 / (2340 / 1080));
});

test('cover scale fills a pillarboxed 4:3 picture', () => {
  close(computeCoverScale(640, 480, 2340, 1080), 2340 / 1080 / (640 / 480));
});

test('cover scale is 1 when the aspects already match', () => {
  close(computeCoverScale(1920, 1080, 1280, 720), 1);
});

test('cover scale falls back to 1 on unusable dimensions', () => {
  assert.equal(computeCoverScale(0, 0, 100, 100), 1);
  assert.equal(computeCoverScale(100, 100, 0, 0), 1);
});

test('scale is clamped between fit and the fill scale', () => {
  assert.equal(clampScale(0.2, 1.6), 1);
  assert.equal(clampScale(1.4, 1.6), 1.4);
  assert.equal(clampScale(12, 1.6), 1.6);
});

test('a picture that already fits cannot be zoomed at all', () => {
  assert.equal(clampScale(2, 1), 1);
  assert.equal(clampScale(2, 0.5), 1);
});

test('scale snaps to a nearby target and leaves others alone', () => {
  assert.equal(snapScale(1.01, [1, 1.5]), 1);
  assert.equal(snapScale(1.48, [1, 1.5]), 1.5);
  assert.equal(snapScale(1.25, [1, 1.5]), 1.25);
});

test('pan cannot expose an edge', () => {
  assert.deepEqual(clampPan(500, 500, 1, 800, 400), { x: 0, y: 0 });
  assert.deepEqual(clampPan(500, 500, 2, 800, 400), { x: 400, y: 200 });
  assert.deepEqual(clampPan(-500, -500, 2, 800, 400), { x: -400, y: -200 });
  assert.deepEqual(clampPan(100, 50, 2, 800, 400), { x: 100, y: 50 });
});
