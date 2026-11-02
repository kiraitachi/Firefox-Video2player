import { call } from './pageapi.js';
import { findEngines } from './engines.js';

// A series carries its playlist as a path — a season, a dub, an episode — and
// Playerjs draws one element per step of that path, each holding the value it
// is showing and the list it would open. Reading those is how the steps are
// known, and pressing a row in one of the lists is how a step is changed:
// api('playlist'), api('play') and api('find') all refuse an entry by index or
// by name, while a press on the row the player drew answers.
//
// Nothing here is a selector borrowed from a stylesheet. The levels are found
// through the id the player itself reports, so a themed or renamed skin still
// reads.

const MAX_LEVELS = 8;
const MIN_OPTIONS = 2;

const textOf = (element) => (element.textContent || '').trim();

// Every level is a value and the list behind it, in that order. A level that
// is drawn but never filled — the player keeps a few spare — has neither.
const readLevel = (element) => {
  const [chip, list] = element.children;
  if (chip === undefined || list === undefined) return null;

  const current = textOf(chip);
  if (current === '') return null;

  const options = [];
  for (const row of list.children) {
    const label = textOf(row);
    if (label !== '') options.push({ label, row });
  }
  // One option is not a choice, and a lone dub named above every episode is
  // noise rather than a control.
  if (options.length < MIN_OPTIONS) return null;

  return { chip, current, options };
};

// The rows answer a press, not a call: this is the sequence a finger makes,
// sent to the row the player drew.
const press = (target) => {
  const box = target.getBoundingClientRect();
  const clientX = box.left + box.width / 2;
  const clientY = box.top + box.height / 2;
  const shared = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
    view: window,
  };
  const touch = new Touch({ identifier: 1, target, clientX, clientY });
  const touching = {
    bubbles: true,
    cancelable: true,
    composed: true,
    touches: [touch],
    targetTouches: [touch],
    changedTouches: [touch],
  };
  const lifted = { ...touching, touches: [], targetTouches: [] };

  target.dispatchEvent(new PointerEvent('pointerdown', shared));
  target.dispatchEvent(new TouchEvent('touchstart', touching));
  target.dispatchEvent(new MouseEvent('mousedown', shared));
  target.dispatchEvent(new TouchEvent('touchend', lifted));
  target.dispatchEvent(new PointerEvent('pointerup', shared));
  target.dispatchEvent(new MouseEvent('mouseup', shared));
  target.dispatchEvent(new MouseEvent('click', shared));
};

export const createPlaylist = (video, host = null) => {
  let player = null;
  let playerId = '';
  let levels = [];

  const levelAt = (index) =>
    document.getElementById(`${playerId}_playlist${index}`);

  const refresh = () => {
    levels = [];
    playerId = '';
    player = findEngines(video, host).playerjs ?? null;
    if (player === null) return false;

    const id = call(player, 'api', 'id');
    if (typeof id !== 'string' || id === '') return false;
    playerId = id;

    const found = [];
    for (let index = 1; index <= MAX_LEVELS; index++) {
      const element = levelAt(index);
      if (element === null) continue;
      const level = readLevel(element);
      if (level !== null) found.push({ index, ...level });
    }
    // Playerjs numbers its levels from the deepest — the episode is first and
    // the season is last — while a reader goes the other way.
    levels = found.reverse();
    return levels.length > 0;
  };

  return {
    refresh,
    // A film has no path to walk; a series has one.
    has: () => levels.length > 0,
    // What the bar draws: a value and the choices behind it, one per step.
    getLevels: () =>
      levels.map(({ current, options }) => ({
        current,
        labels: options.map((option) => option.label),
      })),
    select: (level, option) => {
      const step = levels[level];
      if (step === undefined) return false;

      // The rows are read again rather than kept: choosing a season has the
      // player rebuild every step under it, and the rows held from before that
      // are detached elements no press can reach.
      const opened = readLevel(levelAt(step.index));
      if (opened === null) return false;
      // Only the step the player is currently showing has live rows, so the
      // step is opened first — the same press its own breadcrumb takes — and
      // the choice made in the list that opening puts on screen.
      press(opened.chip);

      const shown = readLevel(levelAt(step.index)) ?? opened;
      const chosen = shown.options[option];
      if (chosen === undefined) return false;
      press(chosen.row);
      return true;
    },
  };
};

// Exported for the tests, which build a level rather than a whole player.
export const readPlaylistLevel = readLevel;
