import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readPlaylistLevel } from '../../src/content/video/playlist.js';

// The shape Playerjs builds for each step of its path: an element holding the
// value it is showing and, beside it, the list it would open.
const fakeElement = (text, children = []) => ({ textContent: text, children });

const fakeLevel = (current, labels) =>
  fakeElement('', [
    fakeElement(current),
    fakeElement(
      '',
      labels.map((label) => fakeElement(label)),
    ),
  ]);

test('a level reads as its value and the choices behind it', () => {
  const level = readPlaylistLevel(fakeLevel('2 серія', ['1 серія', '2 серія']));

  assert.equal(level.current, '2 серія');
  assert.deepEqual(
    level.options.map((option) => option.label),
    ['1 серія', '2 серія'],
  );
});

test('the row itself is kept: a press is what the player answers', () => {
  const element = fakeLevel('1 сезон', ['1 сезон', '2 сезон']);
  const level = readPlaylistLevel(element);

  assert.equal(level.options[1].row, element.children[1].children[1]);
});

test('a level the player drew but never filled is not a level', () => {
  assert.equal(readPlaylistLevel(fakeElement('', [])), null);
  assert.equal(readPlaylistLevel(fakeLevel('', ['1 серія', '2 серія'])), null);
});

test('a lone dub named above every episode is not a choice', () => {
  assert.equal(readPlaylistLevel(fakeLevel('HDrezka', ['HDrezka'])), null);
});

test('an entry the site left unnamed is passed over', () => {
  const element = fakeLevel('2 серія', ['1 серія', '', '2 серія']);
  const level = readPlaylistLevel(element);

  assert.deepEqual(
    level.options.map((option) => option.label),
    ['1 серія', '2 серія'],
  );
});

test('whitespace the site laid out around a name is not part of it', () => {
  const level = readPlaylistLevel(fakeLevel('  2 серія\n', ['a', ' b ']));

  assert.equal(level.current, '2 серія');
  assert.equal(level.options[1].label, 'b');
});
