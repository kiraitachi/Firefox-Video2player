import {
  bandEdges,
  bandsFromSpectrum,
  createCellBuilder,
  createIntroTracker,
  STEP_S,
} from '../../lib/introprint.js';
import { readIntroStore, saveEpisode } from '../../lib/introstore.js';

const FFT_SIZE = 8192;
const SAMPLE_MS = 100;
// A clip, a trailer or a short has no opening worth skipping, and listening to
// it would only push a real episode out of the store.
const MIN_EPISODE_S = 600;

// Routing a video through Web Audio cannot be undone: once its sound goes
// through our graph it goes through it for good, so the graph is made once per
// element and outlives every session that uses it. Closing it would leave the
// film silent.
const graphs = new WeakMap();

const originOf = (url) => {
  try {
    return new URL(url, location.href).origin;
  } catch {
    return null;
  }
};

// The browser hands Web Audio silence from a video it fetched from another
// site without permission — and the viewer would hear that silence too, since
// the sound now goes through the graph. So the player only listens to a video
// this frame is allowed to read: its own stream (a `blob:` it made, which is
// how sites feed MSE), its own address, or one fetched with CORS.
export const canListen = (video) => {
  const source = video.currentSrc;
  if (source === '' || video.srcObject) return false;
  if (source.startsWith('blob:')) {
    return originOf(source.slice('blob:'.length)) === location.origin;
  }
  if (video.crossOrigin !== null) return true;
  return originOf(source) === location.origin;
};

const connect = (video) => {
  if (graphs.has(video)) return graphs.get(video);
  let graph = null;
  try {
    const context = new AudioContext();
    const source = context.createMediaElementSource(video);
    const analyser = context.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    source.connect(context.destination);
    source.connect(analyser);
    graph = { context, analyser };
  } catch (error) {
    // Most likely the site routed the video through Web Audio itself, which
    // can only be done once.
    console.warn('Video2Player: cannot listen to this video', error);
  }
  graphs.set(video, graph);
  return graph;
};

const isEpisode = (video) =>
  Number.isFinite(video.duration) && video.duration >= MIN_EPISODE_S;

// Listens to one video while the player is open and reports the opening the
// moment it is recognised, as start and end in seconds of the video's clock —
// or null, when what looked like an opening turned out not to be one.
export const createIntroWatch = (video, { onFound }) => {
  let graph = null;
  let timer = null;
  let tracker = null;
  let builder = null;
  let bins = null;
  let edges = null;
  let episode = '';
  let isEnabled = false;
  let isFoundSaved = false;
  let generation = 0;

  const finish = () => {
    if (tracker === null) return;
    const found = isFoundSaved ? null : tracker.getFound();
    const recording = tracker.getRecording();
    tracker = null;
    saveEpisode({ found, recording });
  };

  const onCell = (index, levels) => {
    if (tracker === null) return;
    const result = tracker.push(index, levels);
    if (result === null) return;
    // A second into a likely opening the button goes up; if the full
    // comparison does not bear it out, it comes down again.
    if (result.kind === 'dismissed') {
      onFound(null);
      return;
    }
    onFound({ start: result.start * STEP_S, end: result.end * STEP_S });
    // Saved now rather than when the player closes: what was learned should
    // not depend on the player being closed tidily.
    if (result.kind === 'learned') {
      isFoundSaved = true;
      saveEpisode({ found: result, recording: null });
    }
  };

  const sample = () => {
    if (tracker === null || graph === null) return;
    const isSteady =
      !video.paused &&
      !video.seeking &&
      !video.ended &&
      video.playbackRate === 1;
    if (!isSteady) {
      builder.reset();
      return;
    }
    graph.analyser.getFloatFrequencyData(bins);
    builder.push(video.currentTime, bandsFromSpectrum(bins, edges));
  };

  // A new episode in the same element — a playlist moving on — closes the old
  // one and starts listening afresh.
  const begin = async () => {
    finish();
    generation += 1;
    const current = generation;
    episode = video.currentSrc;
    if (!isEnabled || !isEpisode(video) || !canListen(video)) return;
    graph = connect(video);
    if (graph === null) return;
    graph.context.resume().catch(() => {});
    const store = await readIntroStore();
    if (current !== generation || !isEnabled) return;
    const { sampleRate } = graph.context;
    edges = bandEdges(sampleRate, FFT_SIZE);
    bins = new Float32Array(graph.analyser.frequencyBinCount);
    builder = createCellBuilder(onCell);
    isFoundSaved = false;
    tracker = createIntroTracker(store);
  };

  const handleSource = () => {
    if (video.currentSrc !== episode || tracker === null) begin();
  };

  const start = () => {
    if (timer !== null) return;
    timer = setInterval(sample, SAMPLE_MS);
    video.addEventListener('durationchange', handleSource);
    video.addEventListener('loadedmetadata', handleSource);
    begin();
  };

  const stop = () => {
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    video.removeEventListener('durationchange', handleSource);
    video.removeEventListener('loadedmetadata', handleSource);
    generation += 1;
    finish();
  };

  return {
    setEnabled: (value) => {
      isEnabled = value;
      if (value) start();
      else stop();
    },
    destroy: stop,
  };
};
