const ARROW = '-->';
const TIMESTAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[,.](\d{1,3})/;
const TAG = /<[^>]*>/g;
const CUE_SETTING = /\{\\[^}]*\}/g;

const toSeconds = (match) => {
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, '0'));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
};

const parseRange = (line) => {
  const halves = line.split(ARROW);
  if (halves.length !== 2) return null;
  const start = TIMESTAMP.exec(halves[0]);
  const end = TIMESTAMP.exec(halves[1]);
  if (!start || !end) return null;
  return { start: toSeconds(start), end: toSeconds(end) };
};

// Markup is stripped because cues are rendered with textContent, never parsed
// as HTML.
const clean = (text) => text.replace(TAG, '').replace(CUE_SETTING, '').trim();

// Handles both SubRip and WebVTT: they differ only in the decimal separator,
// an optional header, and optional cue identifiers.
export const parseSubtitles = (source) => {
  if (typeof source !== 'string') return [];
  const blocks = source
    .replace(/\r\n?/g, '\n')
    .replace(/^\uFEFF/, '')
    .split(/\n{2,}/);

  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    const timeIndex = lines.findIndex((line) => line.includes(ARROW));
    if (timeIndex === -1) continue;

    const range = parseRange(lines[timeIndex]);
    if (!range || range.end < range.start) continue;

    const text = clean(lines.slice(timeIndex + 1).join('\n'));
    if (text === '') continue;
    cues.push({ start: range.start, end: range.end, text });
  }

  cues.sort((first, second) => first.start - second.start);
  return cues;
};

export const findCueText = (cues, time) => {
  for (const cue of cues) {
    if (cue.start > time) break;
    if (time <= cue.end) return cue.text;
  }
  return '';
};
