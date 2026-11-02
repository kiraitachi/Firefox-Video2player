import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAudioTracks } from '../../src/content/video/audiotracks.js';

// createAudioTracks finds its engine among the page's globals, which a test has
// none of; the engine is handed in as the player host instead, which is the
// same door a site that names its player takes.
const VIDEO = { wrappedJSObject: {} };

const hlsEngine = (tracks, current) => ({
  levels: [],
  currentLevel: 0,
  audioTracks: tracks,
  audioTrack: current,
});

test('hls tracks are listed by name and switched by index', () => {
  const engine = hlsEngine(
    [
      { name: 'Українська', lang: 'uk' },
      { name: 'English', lang: 'en' },
    ],
    0,
  );
  const audio = createAudioTracks(VIDEO, engine);
  assert.deepEqual(
    audio.refresh().map((option) => option.label),
    ['Українська', 'English'],
  );
  assert.equal(audio.getCurrent(), '0');
  assert.equal(audio.select('1'), true);
  assert.equal(engine.audioTrack, 1);
});

test('a nameless track falls back to its language, then its place', () => {
  const engine = hlsEngine([{ lang: 'uk' }, {}], 0);
  const audio = createAudioTracks(VIDEO, engine);
  assert.deepEqual(
    audio.refresh().map((option) => option.label),
    ['uk', 'Track 2'],
  );
});

test('a single track is not offered as a choice', () => {
  const audio = createAudioTracks(VIDEO, hlsEngine([{ name: 'only' }], 0));
  audio.refresh();
  assert.equal(audio.isSwitchable(), false);
});

test('a player with no tracks at all offers nothing', () => {
  const audio = createAudioTracks(VIDEO, hlsEngine([], -1));
  assert.deepEqual(audio.refresh(), []);
  assert.equal(audio.getCurrent(), null);
  assert.equal(audio.select('0'), false);
});

test('the chip holds the choice the engine has not caught up with', () => {
  const engine = hlsEngine([{ name: 'a' }, { name: 'b' }], 0);
  const audio = createAudioTracks(VIDEO, engine);
  audio.refresh();
  audio.select('1');
  engine.audioTrack = 0;
  assert.equal(audio.getCurrent(), '1');
});

test('a choice the engine stops offering is forgotten', () => {
  const engine = hlsEngine([{ name: 'a' }, { name: 'b' }], 0);
  const audio = createAudioTracks(VIDEO, engine);
  audio.refresh();
  audio.select('1');
  // The stream was rebuilt with one track and the engine is playing it. With
  // the choice forgotten, the row follows the engine again rather than pointing
  // at a track that is no longer there.
  engine.audioTracks = [{ name: 'a' }];
  engine.audioTrack = 0;
  audio.refresh();
  assert.equal(audio.getCurrent(), '0');
});
