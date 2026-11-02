import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chapterAt } from '../../src/content/video/chapters.js';

const CHAPTERS = [
  { title: 'Intro', start: 0 },
  { title: 'The plan', start: 65 },
  { title: 'The heist', start: 240 },
];

test('the chapter is the last one that has started', () => {
  assert.equal(chapterAt(CHAPTERS, 0).title, 'Intro');
  assert.equal(chapterAt(CHAPTERS, 64.9).title, 'Intro');
  assert.equal(chapterAt(CHAPTERS, 65).title, 'The plan');
  assert.equal(chapterAt(CHAPTERS, 1200).title, 'The heist');
});

test('a time before the first chapter has no chapter', () => {
  assert.equal(chapterAt([{ title: 'Later', start: 30 }], 10), null);
  assert.equal(chapterAt([], 10), null);
});
