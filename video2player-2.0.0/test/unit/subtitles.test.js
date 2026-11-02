import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findCueText, parseSubtitles } from '../../src/lib/subtitles.js';

const SRT = `1
00:00:01,000 --> 00:00:04,000
Hello there

2
00:00:05,500 --> 00:00:09,250
Second line
over two rows
`;

const VTT = `WEBVTT

intro
00:01.000 --> 00:04.000
<i>Hello</i> there
`;

test('parses SubRip cues', () => {
  const cues = parseSubtitles(SRT);
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { start: 1, end: 4, text: 'Hello there' });
  assert.equal(cues[1].start, 5.5);
  assert.equal(cues[1].end, 9.25);
  assert.equal(cues[1].text, 'Second line\nover two rows');
});

test('parses WebVTT with a header, cue id and markup', () => {
  const cues = parseSubtitles(VTT);
  assert.equal(cues.length, 1);
  assert.deepEqual(cues[0], { start: 1, end: 4, text: 'Hello there' });
});

test('skips malformed blocks rather than throwing', () => {
  const cues = parseSubtitles('1\nnot a timestamp\ntext\n\n\n');
  assert.deepEqual(cues, []);
  assert.deepEqual(parseSubtitles(''), []);
  assert.deepEqual(parseSubtitles(null), []);
});

test('drops cues that end before they start', () => {
  const cues = parseSubtitles('00:00:09,000 --> 00:00:02,000\nbroken');
  assert.deepEqual(cues, []);
});

test('handles hours and returns cues in time order', () => {
  const cues = parseSubtitles(
    '00:00:20,000 --> 00:00:22,000\nsecond\n\n' +
      '01:02:03,500 --> 01:02:05,000\nlater\n\n' +
      '00:00:01,000 --> 00:00:02,000\nfirst',
  );
  assert.deepEqual(
    cues.map((cue) => cue.text),
    ['first', 'second', 'later'],
  );
  assert.equal(cues[2].start, 3723.5);
});

test('finds the cue covering a moment', () => {
  const cues = parseSubtitles(SRT);
  assert.equal(findCueText(cues, 0.5), '');
  assert.equal(findCueText(cues, 2), 'Hello there');
  assert.equal(findCueText(cues, 4.5), '');
  assert.equal(findCueText(cues, 6), 'Second line\nover two rows');
  assert.equal(findCueText(cues, 100), '');
});
