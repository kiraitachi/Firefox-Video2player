import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  formatClock,
  formatOffset,
  formatRemaining,
} from '../../src/lib/time.js';

test('formatClock omits hours for short durations', () => {
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(9), '0:09');
  assert.equal(formatClock(1433), '23:53');
  assert.equal(formatClock(3599), '59:59');
});

test('formatClock includes hours once past an hour', () => {
  assert.equal(formatClock(3600), '1:00:00');
  assert.equal(formatClock(5672), '1:34:32');
  assert.equal(formatClock(36000), '10:00:00');
});

test('formatClock truncates rather than rounds', () => {
  assert.equal(formatClock(59.9), '0:59');
});

test('formatClock clamps negatives and rejects non-finite input', () => {
  assert.equal(formatClock(-5), '0:00');
  assert.equal(formatClock(NaN), '--:--');
  assert.equal(formatClock(Infinity), '--:--');
  assert.equal(formatClock(undefined), '--:--');
});

test('formatRemaining counts down from the duration', () => {
  assert.equal(formatRemaining(0, 5672), '-1:34:32');
  assert.equal(formatRemaining(5672, 5672), '-0:00');
  assert.equal(formatRemaining(6000, 5672), '-0:00');
});

test('formatRemaining reports a placeholder without a duration', () => {
  assert.equal(formatRemaining(10, NaN), '--:--');
  assert.equal(formatRemaining(10, Infinity), '--:--');
});

test('formatOffset always carries a sign', () => {
  assert.equal(formatOffset(0), '+0:00');
  assert.equal(formatOffset(90), '+1:30');
  assert.equal(formatOffset(-90), '-1:30');
});
