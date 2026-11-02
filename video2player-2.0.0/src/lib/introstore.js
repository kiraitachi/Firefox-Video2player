import { BANDS, createRecording } from './introprint.js';

// Kept apart from the settings: this is what the player has learned, not what
// the viewer chose, and it is many times larger.
//
// Nothing here says where a recording came from — no address, no title, no
// time it was watched. It is spectra and nothing else, which is also why it
// works across sites: an opening is recognised by how it sounds, wherever it
// is playing.
const STORAGE_KEY = 'video2playerIntros';
const VERSION = 2;
const MAX_INTROS = 12;
// Two, not one: someone following two series at once still has the last
// episode of each to learn from.
const MAX_PREVIOUS = 2;
const CHUNK = 0x8000;

const toBase64 = (bytes) => {
  let binary = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
};

const fromBase64 = (text) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

const packCells = ({ cells }) =>
  toBase64(new Uint8Array(cells.buffer, cells.byteOffset, cells.byteLength));

// Under a minute heard is not worth keeping: it would push out an episode
// that has more to compare against.
const MIN_HEARD_CELLS = 300;

const countHeard = (recording) =>
  recording.heard.reduce((total, flag) => total + flag, 0);

const unpack = (entry) => {
  const recording = createRecording(entry.length);
  const cells = fromBase64(entry.cells);
  if (cells.length !== entry.length * BANDS) return null;
  recording.cells.set(new Int8Array(cells.buffer));
  if (entry.heard === undefined) recording.heard.fill(1);
  else recording.heard.set(fromBase64(entry.heard));
  return { ...recording, id: entry.id, seenAt: entry.seenAt };
};

const empty = () => ({ version: VERSION, nextId: 1, intros: [], previous: [] });

// A store from another version, or one that no longer parses, is dropped:
// the worst that costs is one more opening heard in full.
const readRaw = async () => {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    const raw = stored[STORAGE_KEY];
    if (raw?.version !== VERSION) return empty();
    return raw;
  } catch (error) {
    console.error('Video2Player: could not read learned intros', error);
    return empty();
  }
};

export const readIntroStore = async () => {
  const raw = await readRaw();
  const decode = (list) => list.map(unpack).filter((entry) => entry !== null);
  try {
    return { intros: decode(raw.intros), previous: decode(raw.previous) };
  } catch (error) {
    console.error('Video2Player: learned intros are unreadable', error);
    return { intros: [], previous: [] };
  }
};

// Called once an episode is done with: what it taught, and what it leaves
// for the next episode to be compared with.
const writeEpisode = async ({ found, recording }) => {
  const raw = await readRaw();
  const now = Date.now();
  let { intros } = raw;
  let { nextId } = raw;

  if (found?.kind === 'learned') {
    const entry = {
      id: nextId,
      length: found.recording.length,
      cells: packCells(found.recording),
      seenAt: now,
    };
    nextId += 1;
    intros = [entry, ...intros];
  } else if (found?.kind === 'known') {
    intros = intros.map((entry) =>
      entry.id === found.recording.id ? { ...entry, seenAt: now } : entry,
    );
  }

  // The openings not heard for longest are the ones let go of first.
  intros = intros
    .toSorted((first, second) => second.seenAt - first.seenAt)
    .slice(0, MAX_INTROS);

  let { previous } = raw;
  if (recording !== null && countHeard(recording) >= MIN_HEARD_CELLS) {
    const entry = {
      id: nextId,
      length: recording.length,
      cells: packCells(recording),
      heard: toBase64(recording.heard),
      seenAt: now,
    };
    nextId += 1;
    previous = [entry, ...previous].slice(0, MAX_PREVIOUS);
  }

  const next = { version: VERSION, nextId, intros, previous };
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: next });
  } catch (error) {
    console.error('Video2Player: could not save learned intros', error);
  }
};

// Every save reads the store, changes it and writes it back, so two at once
// would lose one of them. They take turns.
let pending = Promise.resolve();

export const saveEpisode = (episode) => {
  pending = pending.then(() => writeEpisode(episode));
  return pending;
};

export const clearIntroStore = async () => {
  try {
    await browser.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error('Video2Player: could not clear learned intros', error);
  }
};
