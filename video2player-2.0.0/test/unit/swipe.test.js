import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isFeedShaped,
  isVerticalMove,
  readSwipe,
  SWIPE,
} from '../../src/content/gestures/swipe.js';

const HEIGHT = 800;

test('only a mostly vertical move starts a swipe', () => {
  assert.equal(isVerticalMove(0, -40), true);
  assert.equal(isVerticalMove(10, -40), true);
  assert.equal(isVerticalMove(40, -40), false);
  assert.equal(isVerticalMove(40, 5), false);
});

test('finger up is the next video, finger down the previous one', () => {
  assert.equal(readSwipe(-200, HEIGHT), SWIPE.NEXT);
  assert.equal(readSwipe(200, HEIGHT), SWIPE.PREVIOUS);
});

test('a short flick is let go', () => {
  assert.equal(readSwipe(-40, HEIGHT), null);
  assert.equal(readSwipe(90, HEIGHT), null);
});

test('the swipe belongs to an upright phone showing an upright film', () => {
  assert.equal(isFeedShaped(400, 800, 720, 1280), true);
  assert.equal(isFeedShaped(800, 400, 720, 1280), false);
  assert.equal(isFeedShaped(400, 800, 1920, 1080), false);
  assert.equal(isFeedShaped(400, 800, 0, 0), false);
});
