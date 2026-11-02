import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPlayerjsAdapter,
  matchLabel,
} from '../../src/content/video/qualityadapters.js';

// Stands in for the one method Playerjs exposes: api(name) reads, and
// api(name, value) writes.
const fakePlayer = (qualities, quality) => {
  const state = { quality, asked: [] };
  return {
    state,
    api: (name, value) => {
      if (name === 'qualities') return qualities;
      if (name !== 'quality') return null;
      if (value === undefined) return state.quality;
      state.asked.push(value);
      state.quality = value;
      return null;
    },
  };
};

const LADDER = ['480p', '720p', '1080p', 'Авто'];

test('the site list is offered auto first, then best to worst', () => {
  const adapter = buildPlayerjsAdapter(fakePlayer(LADDER, 'Авто 720p'));
  assert.deepEqual(
    adapter.list().map((option) => option.id),
    ['Авто', '1080p', '720p', '480p'],
  );
});

test('the word the site uses for auto is shown in English', () => {
  const adapter = buildPlayerjsAdapter(fakePlayer(LADDER, 'Авто 720p'));
  assert.deepEqual(
    adapter.list().map((option) => option.label),
    ['Auto', '1080p', '720p', '480p'],
  );
});

test('on auto the auto chip is current, not the rung auto picked', () => {
  const adapter = buildPlayerjsAdapter(fakePlayer(LADDER, 'Авто 720p'));
  assert.equal(adapter.current(), 'Авто');
});

test('a pinned rung is current', () => {
  const adapter = buildPlayerjsAdapter(fakePlayer(LADDER, '1080p'));
  assert.equal(adapter.current(), '1080p');
});

test('choosing a rung asks the site for it', () => {
  const player = fakePlayer(LADDER, '480p');
  const adapter = buildPlayerjsAdapter(player);
  assert.equal(adapter.select('1080p'), true);
  assert.deepEqual(player.state.asked, ['1080p']);
});

test('choosing the rung already playing asks for nothing', () => {
  const player = fakePlayer(LADDER, '1080p');
  const adapter = buildPlayerjsAdapter(player);
  assert.equal(adapter.select('1080p'), true);
  assert.deepEqual(player.state.asked, []);
});

test('a rung the site does not list is refused', () => {
  const player = fakePlayer(LADDER, '480p');
  const adapter = buildPlayerjsAdapter(player);
  assert.equal(adapter.select('2160p'), false);
  assert.deepEqual(player.state.asked, []);
});

test('a player with no list of its own has no current rung', () => {
  const adapter = buildPlayerjsAdapter(fakePlayer([], ''));
  assert.deepEqual(adapter.list(), []);
  assert.equal(adapter.current(), null);
});

test('the longest label the answer starts with wins', () => {
  assert.equal(matchLabel(LADDER, 'Авто 1080p'), 'Авто');
  assert.equal(matchLabel(LADDER, '720p'), '720p');
  assert.equal(matchLabel(LADDER, ''), null);
  assert.equal(matchLabel(LADDER, null), null);
});
