import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createQuality } from '../../src/content/video/quality.js';

// A player that is asked for a rung, takes it, and then goes back to reporting
// whatever its own auto has drifted to — the shape of the problem the sheet has
// to hide from the viewer.
const driftingPlayer = () => {
  const state = { asked: [] };
  const adapter = {
    name: 'test',
    hasAuto: false,
    list: () => [
      { id: '1080p', label: '1080p' },
      { id: '480p', label: '480p' },
    ],
    current: () => 'Auto',
    select: (id) => {
      state.asked.push(id);
      return true;
    },
  };
  return { state, create: () => adapter };
};

const VIDEO = { videoWidth: 0, videoHeight: 0 };

test('the chip shows the choice, not what the player drifted to', () => {
  const player = driftingPlayer();
  const quality = createQuality(VIDEO, null, [player.create]);
  quality.refresh();
  assert.equal(quality.getCurrent(), 'Auto');
  assert.equal(quality.select('1080p'), true);
  assert.equal(quality.getCurrent(), '1080p');
});

test('the choice survives the ladder being looked up again', () => {
  const player = driftingPlayer();
  const quality = createQuality(VIDEO, null, [player.create]);
  quality.refresh();
  quality.select('480p');
  quality.refresh();
  assert.equal(quality.getCurrent(), '480p');
});

test('a choice the player no longer offers is forgotten', () => {
  let listed = [
    { id: '1080p', label: '1080p' },
    { id: '480p', label: '480p' },
  ];
  const adapter = {
    name: 'test',
    hasAuto: false,
    list: () => listed,
    current: () => 'Auto',
    select: () => true,
  };
  const quality = createQuality(VIDEO, null, [() => adapter]);
  quality.refresh();
  quality.select('1080p');
  listed = [
    { id: '720p', label: '720p' },
    { id: '480p', label: '480p' },
  ];
  quality.refresh();
  assert.equal(quality.getCurrent(), 'Auto');
});

test('a refused choice is not remembered', () => {
  const adapter = {
    name: 'test',
    hasAuto: false,
    list: () => [
      { id: '1080p', label: '1080p' },
      { id: '480p', label: '480p' },
    ],
    current: () => 'Auto',
    select: () => false,
  };
  const quality = createQuality(VIDEO, null, [() => adapter]);
  quality.refresh();
  assert.equal(quality.select('1080p'), false);
  assert.equal(quality.getCurrent(), 'Auto');
});

test('an adapter that throws leaves the sheet with nothing to offer', () => {
  const quality = createQuality(VIDEO, null, [
    () => {
      throw new Error('the page said no');
    },
  ]);
  assert.deepEqual(quality.refresh(), []);
  assert.equal(quality.getCurrent(), null);
  assert.equal(quality.isSwitchable(), false);
});
