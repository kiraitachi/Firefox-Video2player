import {
  call,
  isFunction,
  pageWindow,
  read,
  findGlobalMatches,
} from './pageapi.js';

// The quality ladder and the audio tracks are asked of the same object, so the
// hunt for that object lives here rather than twice over. Nothing in this file
// changes anything on the page: it is all identification.

export const isHlsEngine = (value) =>
  Array.isArray(read(value, 'levels')) &&
  typeof read(value, 'currentLevel') === 'number';

export const isDashPlayer = (value) =>
  isFunction(value, 'getBitrateInfoListFor') &&
  isFunction(value, 'setQualityFor');

export const isShakaPlayer = (value) =>
  isFunction(value, 'getVariantTracks') &&
  isFunction(value, 'selectVariantTrack');

// Playerjs hands out one method and keeps everything else in a closure. What
// identifies it is that api('id') answers with the id of the element it was
// built on — cheap, and true of a player that has no ladder to offer.
export const isPlayerjsInstance = (value) =>
  isFunction(value, 'api') && typeof call(value, 'api', 'id') === 'string';

const ATTACHED_KEYS = ['hls', '_hls', '__hls', 'hlsPlayer'];

// Cheapest first: some pages hang the engine straight off the media element.
const findAttachedHls = (video) => {
  const element = video.wrappedJSObject ?? video;
  for (const key of ATTACHED_KEYS) {
    const candidate = read(element, key);
    if (candidate && isHlsEngine(candidate)) return candidate;
  }
  return null;
};

const MATCHERS = [
  { name: 'hls', matches: isHlsEngine },
  { name: 'dash', matches: isDashPlayer },
  { name: 'shaka', matches: isShakaPlayer },
  { name: 'playerjs', matches: isPlayerjsInstance },
];

// One sweep of the page's globals for all of them. Sweeping once per engine
// meant walking the page's globals four times over, through cross-compartment
// wrappers, in the moment the viewer was waiting for the sheet to open.
export const findEngines = (video, host = null) => {
  const found = findGlobalMatches(MATCHERS);
  if (host !== null) {
    for (const matcher of MATCHERS) {
      try {
        if (matcher.matches(host)) found[matcher.name] = host;
      } catch {
        continue;
      }
    }
  }
  if (found.hls === undefined) {
    const attached = findAttachedHls(video);
    if (attached !== null) found.hls = attached;
  }
  return found;
};

// Playerjs is only worth looking for once the page has said it has one: the
// check is a call into an api() that belongs to somebody, and asking that of
// every global with a method by that name is not a question worth asking.
export const hasPlayerjs = () => isFunction(pageWindow(), 'Playerjs');
