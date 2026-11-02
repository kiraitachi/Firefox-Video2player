import { call, isFunction } from './pageapi.js';

// Writing to currentTime asks the browser to move a stream the site is still in
// charge of. A site feeding the element through Media Source Extensions can
// answer by tearing its stream down and building a new one — YouTube does,
// leaving the element empty for seconds, which looked to the player like the
// video had been taken away and threw the viewer out mid-scrub.
//
// Where the site publishes its own seek, that is the one to ask: it moves the
// same picture and leaves the site's own machinery in step with it.
// isFinal is the difference between "show me this moment" and "go there". A
// drag asks for the first, every frame it passes over; only the finger coming
// off asks for the second. Telling YouTube that every preview was final made it
// rebuild its stream — and its <video> element — under a finger that was still
// moving, which took the player down with it.
export const createSeeker = (video, host) => {
  const isSiteSeekable = isFunction(host, 'seekTo');

  return (seconds, isFinal = true) => {
    const limit = Number.isFinite(video.duration) ? video.duration : seconds;
    const time = Math.min(limit, Math.max(0, seconds));
    if (isSiteSeekable) call(host, 'seekTo', time, isFinal);
    else video.currentTime = time;
    return time;
  };
};
