import { createSiteCaptions } from './sitecaptions.js';
import { findCueText, parseSubtitles } from '../../lib/subtitles.js';

const CUE_LOAD_RETRY_MS = 300;
const CUE_LOAD_ATTEMPTS = 10;
const ADOPT_RETRY_MS = 600;

const FILE_ID_BASE = 1000;
const SITE_ID_BASE = 2000;

const isSiteId = (id) => id >= SITE_ID_BASE;

const describe = (track, index) =>
  track.label || track.language || `Track ${index + 1}`;

const readCues = (track) => {
  const cues = [];
  if (!track.cues) return cues;
  for (const cue of track.cues) {
    cues.push({ start: cue.startTime, end: cue.endTime, text: cue.text });
  }
  return cues;
};

// Cues from a <track src> arrive asynchronously, so the list is re-read until
// it fills or we give up.
const loadTrackCues = (track, onReady) => {
  let attempts = 0;
  const poll = () => {
    const cues = readCues(track);
    if (cues.length > 0 || attempts >= CUE_LOAD_ATTEMPTS) {
      onReady(cues);
      return;
    }
    attempts += 1;
    setTimeout(poll, CUE_LOAD_RETRY_MS);
  };
  poll();
};

export const createTrackManager = (video, onCue, onSelection, host = null) => {
  const loaded = [];

  let cues = [];
  let selected = -1;
  let lastText = '';
  let isNative = false;

  const nativeTracks = () => Array.from(video.textTracks);

  const silenceAll = () => {
    for (const track of nativeTracks()) track.mode = 'disabled';
  };

  const emit = (text) => {
    if (text === lastText) return;
    lastText = text;
    onCue(text);
  };

  // Only the site source may paint while it is the selected one; a stale
  // mutation arriving after a switch must not put its line back on screen.
  const site = createSiteCaptions((text) => {
    if (isSiteId(selected)) emit(text);
  }, host);

  const update = () => {
    if (selected === -1 || isNative || isSiteId(selected)) return;
    emit(findCueText(cues, video.currentTime));
  };

  const siteOptions = () =>
    site.list().map((label, index) => ({
      id: SITE_ID_BASE + index,
      label,
    }));

  const list = () => {
    const items = nativeTracks().map((track, index) => ({
      id: index,
      label: describe(track, index),
    }));
    for (const entry of loaded) {
      items.push({ id: entry.id, label: entry.label });
    }
    const fromSite = siteOptions();
    if (fromSite.length > 0) return items.concat(fromSite);
    // A player that paints captions without naming them still deserves a way
    // to turn them on.
    if (site.hasContainer()) {
      items.push({ id: SITE_ID_BASE, label: 'Site captions' });
    }
    return items;
  };

  const select = (id) => {
    const wasSite = isSiteId(selected);
    selected = id;
    cues = [];
    emit('');
    onSelection(id);

    if (isSiteId(id)) {
      silenceAll();
      site.select(id - SITE_ID_BASE);
      return;
    }

    if (wasSite) site.disable();

    if (id === -1) {
      silenceAll();
      return;
    }

    const custom = loaded.find((entry) => entry.id === id);
    if (custom) {
      silenceAll();
      cues = custom.cues;
      update();
      return;
    }

    const tracks = nativeTracks();
    for (let index = 0; index < tracks.length; index++) {
      // 'hidden' keeps cues available while Gecko paints nothing, so the
      // custom renderer owns the look; 'showing' hands it back.
      if (index !== id) tracks[index].mode = 'disabled';
      else tracks[index].mode = isNative ? 'showing' : 'hidden';
    }
    if (isNative) return;
    loadTrackCues(tracks[id], (list) => {
      cues = list;
      update();
    });
  };

  const addCues = (label, text) => {
    const parsed = parseSubtitles(text);
    if (parsed.length === 0) return null;
    const id = FILE_ID_BASE + loaded.length;
    loaded.push({ id, label, cues: parsed });
    return id;
  };

  // A site that ships <track default> already has Gecko painting cues, and a
  // site with its own caption layer already has them on screen. Either way the
  // track is adopted so it renders through our layer instead of underneath the
  // controls, and so the menu tells the truth about what is on.
  const adoptShowingTrack = () => {
    if (selected !== -1) return true;
    const tracks = nativeTracks();
    for (let index = 0; index < tracks.length; index++) {
      if (tracks[index].mode !== 'showing') continue;
      select(index);
      return true;
    }
    if (site.isOn()) {
      select(SITE_ID_BASE + Math.max(0, site.activeIndex()));
      return true;
    }
    return false;
  };

  video.addEventListener('timeupdate', update);
  video.addEventListener('seeked', update);

  if (!adoptShowingTrack()) setTimeout(adoptShowingTrack, ADOPT_RETRY_MS);

  return {
    list,
    select,
    addCues,
    getSelected: () => selected,
    setNative: (value) => {
      isNative = value;
      emit('');
      if (selected !== -1) select(selected);
    },
    isNative: () => isNative,
    // The site paints its own captions; only ours are drawn by the player.
    isSiteSelected: () => isSiteId(selected),
    destroy: () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('seeked', update);
      site.destroy();
      silenceAll();
    },
  };
};
