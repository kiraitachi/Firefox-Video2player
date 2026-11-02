// An opening sounds the same in every episode of a series, and nothing else in
// an episode does. That is the whole method: keep a coarse picture of how the
// last episode sounded, notice when the one playing now starts to sound the
// same, and remember the stretch where the two agreed. From then on the same
// stretch is recognised in every episode, wherever it falls.
//
// The picture is a spectrum, five times a second, in 33 bands. It says which
// pitches were loud and which were quiet, and no sound can be rebuilt from it.
//
// Every number below was measured on episodes of one series, played on a
// phone: a second of an opening scores 0.86 to 0.89 against its own start,
// and no second of the story anywhere passed 0.41.

export const STEP_S = 0.2;
export const BANDS = 33;
const LOW_HZ = 250;
const HIGH_HZ = 4000;

// Levels are kept in half-decibel steps around -70 dB, one byte a band.
const LEVEL_CENTRE_DB = -70;
const LEVEL_STEPS_PER_DB = 2;
const QUANT = 127;

// How much sound is compared at once. Learning searches ten minutes of the
// last episode and wants six seconds to be sure; recognising searches only
// the opening and four seconds are enough.
export const LEARN_WINDOW_CELLS = 30;
export const RECOGNISE_WINDOW_CELLS = 20;
const MATCH_SCORE = 0.6;
// A match has to hold over several checks in a row, at the same alignment. A
// chance resemblance scores high once, somewhere different every time.
// Both hold for two seconds: learning checks every second, recognising every
// two fifths of one.
const LEARN_CHECKS = 3;
const RECOGNISE_CHECKS = 5;
const RECOGNISE_EVERY_CELLS = 2;
const LAG_TOLERANCE_CELLS = 2;
const LEARN_EVERY_CELLS = 5;

// The first look, a second into the opening: the last second of sound against
// only the first three seconds of each opening already known. That is enough
// to put the button up; the full comparison then has eight seconds to agree,
// or the button goes away again.
const QUICK_WINDOW_CELLS = 5;
const QUICK_SPAN_CELLS = 15;
const QUICK_SCORE = 0.7;
const QUICK_CHECKS = 2;
const CONFIRM_WITHIN_CELLS = 40;
// Joining an opening halfway there is no start to see, so three seconds are
// held against the whole of it: openings scored 0.71 and up, the story never
// passed 0.51.
const MIDWAY_WINDOW_CELLS = 15;
const MIDWAY_SCORE = 0.65;
const MIDWAY_EVERY_CELLS = 2;

// An opening's chorus can sound like its own first verse. When two places in
// the opening match about as well, the later one is taken: it can only put the
// end too early, which lands inside the song, never too late, which eats the
// story.
const TIE_SCORE = 0.05;

// How the edges of a learned opening are found: the two episodes are compared
// cell by cell, smoothed over a second, until they stop agreeing.
const EDGE_SCORE = 0.3;
const EDGE_SMOOTH_CELLS = 5;
const CELL_SCORE = 0.6;

// Openings run a minute and a half; a recap of the last episode matches in
// scraps of a few seconds. Anything that keeps matching past the upper bound
// is the same episode watched again.
export const MIN_INTRO_CELLS = Math.round(30 / STEP_S);
export const MAX_INTRO_CELLS = Math.round(150 / STEP_S);

// Openings come early. Only this much of each episode is kept to learn from.
export const RECORD_CELLS = Math.round(600 / STEP_S);

// The analyser is read on a timer that drifts, so now and then a fifth of a
// second passes with no reading in it. A gap that short is filled with the
// cell before it; a longer one is a seek.
const MAX_FILLED_GAP_CELLS = 3;

export const bandEdges = (sampleRate, fftSize) => {
  const hzPerBin = sampleRate / fftSize;
  const edges = [];
  for (let band = 0; band <= BANDS; band++) {
    const hz = LOW_HZ * (HIGH_HZ / LOW_HZ) ** (band / BANDS);
    edges.push(Math.round(hz / hzPerBin));
  }
  return edges;
};

// Power in each band, back in decibels, from an analyser's decibel bins.
export const bandsFromSpectrum = (decibels, edges) => {
  const bands = new Float32Array(BANDS);
  for (let band = 0; band < BANDS; band++) {
    const from = edges[band];
    const to = Math.max(from + 1, edges[band + 1]);
    let power = 0;
    for (let bin = from; bin < to; bin++) power += 10 ** (decibels[bin] / 10);
    bands[band] = 10 * Math.log10(power / (to - from) + 1e-12);
  }
  return bands;
};

const toLevel = (decibels) => {
  const steps = (decibels - LEVEL_CENTRE_DB) * LEVEL_STEPS_PER_DB;
  return Math.max(-128, Math.min(127, Math.round(steps)));
};

// Turns band readings into cells: one per fifth of a second of the video's
// own clock, each the average level of every band over that fifth.
export const createCellBuilder = (onCell) => {
  const sum = new Float64Array(BANDS);
  let cell = -1;
  let count = 0;
  let emitted = -1;
  let previous = null;

  const flush = () => {
    if (count === 0) return;
    const levels = new Int8Array(BANDS);
    for (let m = 0; m < BANDS; m++) levels[m] = toLevel(sum[m] / count);
    const gap = cell - emitted;
    if (previous !== null && gap > 1 && gap <= MAX_FILLED_GAP_CELLS) {
      for (let index = emitted + 1; index < cell; index++) {
        onCell(index, previous);
      }
    }
    onCell(cell, levels);
    emitted = cell;
    previous = levels;
  };

  return {
    push: (seconds, bands) => {
      const index = Math.floor(seconds / STEP_S);
      if (index !== cell) {
        flush();
        sum.fill(0);
        count = 0;
        cell = index;
      }
      for (let m = 0; m < BANDS; m++) sum[m] += bands[m];
      count += 1;
    },
    reset: () => {
      sum.fill(0);
      count = 0;
      cell = -1;
      emitted = -1;
      previous = null;
    },
  };
};

// Cells laid end to end in one typed array, with a flag per cell saying
// whether it was ever heard: a seek leaves holes, and a hole must not count.
export const createRecording = (length) => ({
  cells: new Int8Array(length * BANDS),
  heard: new Uint8Array(length),
  length,
});

export const writeCell = (recording, index, levels) => {
  if (index < 0 || index >= recording.length) return;
  recording.cells.set(levels, index * BANDS);
  recording.heard[index] = 1;
};

export const copyRange = (recording, from, to) => {
  const copy = createRecording(to - from);
  copy.cells.set(recording.cells.subarray(from * BANDS, to * BANDS));
  copy.heard.set(recording.heard.subarray(from, to));
  return copy;
};

// What a recording sounds like on average, band by band.
const averageOf = (recording) => {
  const mean = new Float64Array(BANDS);
  let count = 0;
  for (let index = 0; index < recording.length; index++) {
    if (!recording.heard[index]) continue;
    count += 1;
    const at = index * BANDS;
    for (let m = 0; m < BANDS; m++) mean[m] += recording.cells[at + m];
  }
  return mean.map((value) => (count === 0 ? 0 : value / count));
};

// A cell as it is compared: its levels less the reference's own average —
// which takes out the mix, the dub and the loudness, and leaves the music —
// then centred and scaled to unit length, so a comparison is a dot product.
//
// Both sides of a comparison are shaped with the same average, the
// reference's. That is what makes the answer the same however much of the
// episode was heard before it; a running average of the live sound had the
// opening's first seconds score 0.73 or 0.89 depending on where listening
// started.
const shapeInto = (target, at, levels, from, mean) => {
  let centre = 0;
  for (let m = 0; m < BANDS; m++) centre += levels[from + m] - mean[m];
  centre /= BANDS;
  let norm = 0;
  const shaped = new Float64Array(BANDS);
  for (let m = 0; m < BANDS; m++) {
    shaped[m] = levels[from + m] - mean[m] - centre;
    norm += shaped[m] * shaped[m];
  }
  norm = Math.sqrt(norm) || 1;
  for (let m = 0; m < BANDS; m++) {
    target[at + m] = Math.round((shaped[m] / norm) * QUANT);
  }
};

// A reference ready to be compared against: its own cells shaped once, and a
// shaped copy of the live recording filled in as the comparisons reach it.
const prepare = (recording, live) => {
  const mean = averageOf(recording);
  const shaped = new Int8Array(recording.cells.length);
  for (let index = 0; index < recording.length; index++) {
    if (!recording.heard[index]) continue;
    shapeInto(shaped, index * BANDS, recording.cells, index * BANDS, mean);
  }
  const liveShaped = new Int8Array(live.cells.length);
  const liveDone = new Uint8Array(live.length);
  return {
    recording,
    shaped,
    liveShaped,
    liveCell: (index) => {
      if (liveDone[index]) return;
      shapeInto(liveShaped, index * BANDS, live.cells, index * BANDS, mean);
      liveDone[index] = 1;
    },
    // A cell written again after a seek back has to be shaped again.
    forget: (index) => {
      liveDone[index] = 0;
    },
  };
};

const dot = (a, aIndex, b, bIndex) => {
  let total = 0;
  const aStart = aIndex * BANDS;
  const bStart = bIndex * BANDS;
  for (let m = 0; m < BANDS; m++) total += a[aStart + m] * b[bStart + m];
  return total / (QUANT * QUANT);
};

const isHeard = (recording, from, length) => {
  for (let index = from; index < from + length; index++) {
    if (!recording.heard[index]) return false;
  }
  return true;
};

const windowScore = (reference, liveStart, at, window) => {
  let total = 0;
  for (let k = 0; k < window; k++) {
    total += dot(reference.liveShaped, liveStart + k, reference.shaped, at + k);
  }
  return total / window;
};

// Where in the reference the last `window` live cells, ending at `liveEnd`,
// sound most alike, searching its first `span` places.
const findBest = (live, liveEnd, reference, window, span) => {
  const liveStart = liveEnd - window;
  const none = { score: -1, at: -1 };
  if (liveStart < 0 || !isHeard(live, liveStart, window)) return none;
  for (let k = liveStart; k < liveEnd; k++) reference.liveCell(k);
  const { recording } = reference;
  const last = Math.min(span, recording.length - window);
  if (last < 0) return none;
  const scores = new Float32Array(last + 1).fill(-1);
  let best = none;
  for (let at = 0; at <= last; at++) {
    if (!recording.heard[at] || !recording.heard[at + window - 1]) continue;
    scores[at] = windowScore(reference, liveStart, at, window);
    if (scores[at] > best.score) best = { score: scores[at], at };
  }
  // Of the places that match about as well, the latest — unless taking it
  // would put the reference's start before the episode's, which says it is a
  // repeat inside the song and not where the song is.
  for (let at = last; at > best.at; at--) {
    const isClose = scores[at] >= best.score - TIE_SCORE;
    if (isClose && liveStart - at >= -LAG_TOLERANCE_CELLS) {
      return { score: scores[at], at };
    }
  }
  return best;
};

// An alignment that puts the reference's start before the episode's cannot
// be right, however well it scores: it is a repeat inside the song.
const createAgreement = (count, bar) => {
  let checks = [];
  return {
    add: (score, lag) => {
      const isPossible = lag >= -LAG_TOLERANCE_CELLS;
      const check = { score: isPossible ? score : -1, lag };
      checks = [...checks, check].slice(-count);
      if (checks.length < count) return null;
      if (checks.some((check) => check.score < bar)) return null;
      const lags = checks.map((check) => check.lag);
      const spread = Math.max(...lags) - Math.min(...lags);
      return spread <= LAG_TOLERANCE_CELLS ? lags.at(-1) : null;
    },
    clear: () => {
      checks = [];
    },
  };
};

// How alike the live sound and a reference are over the last `cells` cells,
// at a fixed alignment.
const agreementAt = (live, reference, liveIndex, lag, cells) => {
  let total = 0;
  for (let k = 0; k < cells; k++) {
    const at = liveIndex - k;
    const other = at - lag;
    if (at < 0 || other < 0 || other >= reference.recording.length) return -1;
    if (!live.heard[at] || !reference.recording.heard[other]) return -1;
    reference.liveCell(at);
    total += dot(reference.liveShaped, at, reference.shaped, other);
  }
  return total / cells;
};

// Follows one episode as it plays, against the openings already known and the
// episodes heard before it. Fed one cell at a time; answers with what it found:
//
// - `likely`: an opening started a second ago, and where it should end.
// - `known`: the opening is confirmed, with its start and end.
// - `dismissed`: what looked like an opening was not one.
// - `learned`: a new opening, heard in this episode and an earlier one.
export const createIntroTracker = ({ intros, previous }) => {
  const live = createRecording(RECORD_CELLS + MAX_INTRO_CELLS);
  const known = intros.map((recording) => ({
    ...prepare(recording, live),
    agreement: createAgreement(RECOGNISE_CHECKS, MATCH_SCORE),
    quick: createAgreement(QUICK_CHECKS, QUICK_SCORE),
    midway: createAgreement(QUICK_CHECKS, MIDWAY_SCORE),
  }));
  const earlier = previous.map((recording) => ({
    ...prepare(recording, live),
    agreement: createAgreement(LEARN_CHECKS, MATCH_SCORE),
  }));
  const references = [...known, ...earlier];

  let found = null;
  let likely = null;
  let learning = null;
  let isRewatch = false;
  let lastCell = -1;
  let confirmations = 0;

  const span = (entry, lag) => ({
    start: lag,
    end: lag + entry.recording.length,
    recording: entry.recording,
  });

  const offer = (index, entry, lag) => {
    likely = {
      kind: 'likely',
      ...span(entry, lag),
      entry,
      lag,
      deadline: index + CONFIRM_WITHIN_CELLS,
    };
    confirmations = 0;
    return likely;
  };

  const look = (index, entry, agreement, window, reach) => {
    const best = findBest(live, index + 1, entry, window, reach);
    return agreement.add(best.score, index + 1 - window - best.at);
  };

  const glimpse = (index) => {
    const isMidwayTurn = index % MIDWAY_EVERY_CELLS === 0;
    for (const entry of known) {
      const start = look(
        index,
        entry,
        entry.quick,
        QUICK_WINDOW_CELLS,
        QUICK_SPAN_CELLS,
      );
      if (start !== null) return offer(index, entry, start);
      if (!isMidwayTurn) continue;
      const midway = look(
        index,
        entry,
        entry.midway,
        MIDWAY_WINDOW_CELLS,
        entry.recording.length,
      );
      if (midway !== null) return offer(index, entry, midway);
    }
    return null;
  };

  // Once the start has been seen, the place in the song is known: it only has
  // to keep sounding alike there, which no repeat of a chorus can confuse.
  const confirm = (index) => {
    const { entry, lag } = likely;
    const score = agreementAt(live, entry, index, lag, RECOGNISE_WINDOW_CELLS);
    confirmations = score >= MATCH_SCORE ? confirmations + 1 : 0;
    if (confirmations < RECOGNISE_CHECKS * RECOGNISE_EVERY_CELLS) return null;
    found = { kind: 'known', ...span(entry, lag) };
    likely = null;
    return found;
  };

  // Joining an opening halfway, there is no start to see; the whole of every
  // known opening is searched instead.
  const recognise = (index) => {
    for (const entry of known) {
      const best = findBest(
        live,
        index + 1,
        entry,
        RECOGNISE_WINDOW_CELLS,
        entry.recording.length,
      );
      const lag = entry.agreement.add(
        best.score,
        index + 1 - RECOGNISE_WINDOW_CELLS - best.at,
      );
      if (lag === null) continue;
      found = { kind: 'known', ...span(entry, lag) };
      return found;
    }
    return null;
  };

  // The window first agreed somewhere inside the opening; the opening itself
  // began wherever the two episodes started agreeing, which is found walking
  // back from there.
  const startLearning = (index, entry, lag) => {
    let start = index + 1 - LEARN_WINDOW_CELLS;
    while (
      agreementAt(live, entry, start - 1, lag, EDGE_SMOOTH_CELLS) >= EDGE_SCORE
    ) {
      start -= 1;
    }
    learning = {
      entry,
      lag,
      start: Math.max(0, start - EDGE_SMOOTH_CELLS + 1),
    };
  };

  const followLearning = (index) => {
    const { start, lag, entry } = learning;
    if (index - start > MAX_INTRO_CELLS) {
      isRewatch = true;
      learning = null;
      return null;
    }
    const score = agreementAt(live, entry, index, lag, EDGE_SMOOTH_CELLS);
    if (score >= EDGE_SCORE) return null;
    // The smoothed score falls a second after the opening ends. The last cell
    // that still agrees on its own is where it really ended — and an end put
    // early leaves a beat of the song, where an end put late eats the story.
    let end = index;
    while (
      end > start &&
      agreementAt(live, entry, end - 1, lag, 1) < CELL_SCORE
    ) {
      end -= 1;
    }
    learning = null;
    if (end - start < MIN_INTRO_CELLS) return null;
    const intro = copyRange(live, start, end);
    intro.heard.fill(1);
    found = { kind: 'learned', start, end, recording: intro };
    return found;
  };

  const tryLearning = (index) => {
    if (index >= RECORD_CELLS) return;
    for (const entry of earlier) {
      const best = findBest(
        live,
        index + 1,
        entry,
        LEARN_WINDOW_CELLS,
        entry.recording.length,
      );
      const lag = entry.agreement.add(
        best.score,
        index + 1 - LEARN_WINDOW_CELLS - best.at,
      );
      if (lag === null) continue;
      startLearning(index, entry, lag);
      return;
    }
  };

  const step = (index) => {
    if (found !== null || isRewatch) return null;
    if (learning !== null) return followLearning(index);
    if (likely !== null) {
      const confirmed = confirm(index);
      if (confirmed !== null) return confirmed;
      if (index <= likely.deadline) return null;
      likely = null;
      return { kind: 'dismissed' };
    }
    const hint = glimpse(index);
    if (hint !== null) return hint;
    if (index % RECOGNISE_EVERY_CELLS === 0) {
      const hit = recognise(index);
      if (hit !== null) return hit;
    }
    if (index % LEARN_EVERY_CELLS === 0) tryLearning(index);
    return null;
  };

  return {
    push: (index, levels) => {
      writeCell(live, index, levels);
      for (const entry of references) entry.forget(index);
      // A jump breaks every comparison that was being built up: the cells
      // either side of it are not neighbours in the film.
      const isJump = index !== lastCell + 1;
      lastCell = index;
      if (isJump) {
        for (const entry of references) entry.agreement.clear();
        for (const entry of known) {
          entry.quick.clear();
          entry.midway.clear();
        }
        learning = null;
        // A jump while the opening was only likely is most often the viewer
        // taking the offer. It is not taken back from under them.
        if (likely !== null) {
          found = { kind: 'known', ...span(likely.entry, likely.lag) };
          likely = null;
        }
      }
      return step(index);
    },
    getFound: () => found,
    // What this episode leaves for the next one to learn from: the start of it,
    // unless it turned out to be an episode heard before.
    getRecording: () => (isRewatch ? null : copyRange(live, 0, RECORD_CELLS)),
  };
};
