import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hitTest,
  isDragZone,
  isHoldZone,
  ZONE,
} from '../../src/content/gestures/zones.js';

const WIDTH = 800;
const HEIGHT = 360;

const zoneAt = (xRatio, yRatio) =>
  hitTest(xRatio * WIDTH, yRatio * HEIGHT, WIDTH, HEIGHT);

test('the bottom of the screen belongs to the system, not the player', () => {
  for (const yRatio of [0.89, 0.94, 0.99]) {
    assert.equal(zoneAt(0.5, yRatio), ZONE.DEAD);
    assert.equal(zoneAt(0.05, yRatio), ZONE.DEAD);
    assert.equal(zoneAt(0.95, yRatio), ZONE.DEAD);
  }
});

test('the seek band sits above the home gesture', () => {
  assert.equal(zoneAt(0.5, 0.73), ZONE.SEEK);
  assert.equal(zoneAt(0.5, 0.87), ZONE.SEEK);
  assert.equal(zoneAt(0.02, 0.8), ZONE.SEEK);
});

test('the middle of the picture is not a pause button', () => {
  assert.equal(zoneAt(0.5, 0.5), ZONE.DEAD);
  assert.equal(zoneAt(0.5, 0.1), ZONE.DEAD);
  assert.equal(ZONE.PAUSE, undefined);
});

test('the sides are wide, so a sloppy second tap still lands on one', () => {
  for (const xRatio of [0.02, 0.2, 0.39]) {
    assert.equal(zoneAt(xRatio, 0.15), ZONE.HOLD_LEFT);
    assert.equal(zoneAt(xRatio, 0.7), ZONE.HOLD_LEFT);
  }
  for (const xRatio of [0.61, 0.8, 0.98]) {
    assert.equal(zoneAt(xRatio, 0.15), ZONE.HOLD_RIGHT);
    assert.equal(zoneAt(xRatio, 0.7), ZONE.HOLD_RIGHT);
  }
  assert.equal(zoneAt(0.2, 0.05), ZONE.DEAD);
  assert.equal(zoneAt(0.8, 0.05), ZONE.DEAD);
});

test('the hold boxes stay clear of the seek band', () => {
  assert.equal(zoneAt(0.23, 0.4), ZONE.HOLD_LEFT);
  assert.equal(zoneAt(0.8, 0.4), ZONE.HOLD_RIGHT);
  assert.equal(zoneAt(0.23, 0.8), ZONE.SEEK);
  assert.equal(zoneAt(0.8, 0.8), ZONE.SEEK);
});

test('only the seek band drags and only the side boxes hold', () => {
  assert.ok(isDragZone(ZONE.SEEK));
  assert.ok(!isDragZone(ZONE.DEAD));
  assert.ok(isHoldZone(ZONE.HOLD_LEFT));
  assert.ok(isHoldZone(ZONE.HOLD_RIGHT));
  assert.ok(!isHoldZone(ZONE.DEAD));
});
