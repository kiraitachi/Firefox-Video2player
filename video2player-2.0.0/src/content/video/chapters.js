import { call, pageWindow, read, toArray } from './pageapi.js';

// YouTube ships its chapter list inside the blob of data it renders the page
// from. It sits in a different place on the phone site than on the desktop one,
// under a different renderer, and moves without notice — so rather than
// following one path down, the renderers are looked for by name, in every blob
// the page is willing to show us, with a node budget so a page that turns out
// to be a maze cannot cost more than a moment.
const MAX_NODES = 30000;
const MAX_RENDERER_NODES = 400;
const MS_PER_SECOND = 1000;
const MIN_CHAPTERS = 2;

const RENDERER_KEYS = ['chapterRenderer', 'macroMarkersListItemRenderer'];

const readTitle = (renderer) => {
  const title = read(renderer, 'title');
  const simple = read(title, 'simpleText');
  if (typeof simple === 'string' && simple !== '') return simple;

  const runs = toArray(read(title, 'runs'))
    .map((run) => read(run, 'text'))
    .filter((text) => typeof text === 'string');
  return runs.join('');
};

// The start time is spelled two ways and buried at a different depth in each
// shape, so it is searched for within the renderer rather than reached for.
const readStart = (renderer) => {
  const stack = [renderer];
  let budget = MAX_RENDERER_NODES;

  while (stack.length > 0 && budget > 0) {
    const node = stack.pop();
    budget -= 1;
    if (node === null || typeof node !== 'object') continue;

    const millis = Number(read(node, 'timeRangeStartMillis'));
    if (Number.isFinite(millis)) return millis / MS_PER_SECOND;

    const seconds = Number(read(node, 'startTimeSeconds'));
    if (Number.isFinite(seconds)) return seconds;

    let keys;
    try {
      keys = Object.keys(node);
    } catch {
      continue;
    }
    for (const key of keys) stack.push(read(node, key));
  }
  return null;
};

const readChapter = (node) => {
  for (const key of RENDERER_KEYS) {
    const renderer = read(node, key);
    if (renderer === null) continue;

    const title = readTitle(renderer);
    const start = readStart(renderer);
    if (title === '' || start === null) continue;
    return { title, start };
  }
  return null;
};

const collect = (root) => {
  const found = [];
  const stack = [root];
  let budget = MAX_NODES;

  while (stack.length > 0 && budget > 0) {
    const node = stack.pop();
    budget -= 1;
    if (node === null || typeof node !== 'object') continue;

    const chapter = readChapter(node);
    if (chapter !== null) {
      found.push(chapter);
      continue;
    }

    let keys;
    try {
      keys = Object.keys(node);
    } catch {
      continue;
    }
    for (const key of keys) stack.push(read(node, key));
  }

  return found;
};

const tidy = (chapters) => {
  const byStart = new Map();
  for (const chapter of chapters) {
    if (!byStart.has(chapter.start)) byStart.set(chapter.start, chapter);
  }
  const sorted = Array.from(byStart.values()).sort(
    (first, second) => first.start - second.start,
  );
  // One chapter is not a chapter list, it is the whole film with a label on it.
  return sorted.length >= MIN_CHAPTERS ? sorted : [];
};

// The player's own answer comes first: it is the only source that is certainly
// about the video playing right now, rather than about whatever page happened
// to be loaded before the viewer clicked through to this one.
export const readSiteChapters = (playerHost = null) => {
  const scope = pageWindow();
  const sources = [
    call(playerHost, 'getPlayerResponse'),
    read(scope, 'ytInitialData'),
    read(scope, 'ytInitialPlayerResponse'),
  ];

  for (const source of sources) {
    if (source === null) continue;
    const chapters = tidy(collect(source));
    if (chapters.length > 0) return chapters;
  }
  return [];
};

export const chapterAt = (chapters, time) => {
  let current = null;
  for (const chapter of chapters) {
    if (chapter.start > time) break;
    current = chapter;
  }
  return current;
};
