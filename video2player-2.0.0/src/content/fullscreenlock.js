import { pageWindow } from './video/pageapi.js';

// Many film players take the screen for themselves when the phone is turned:
// on landscape they put their own element into fullscreen, on portrait they
// leave it. With our player open, either one took fullscreen away from the
// stage, which read exactly like the user backing out, and the player closed
// in the middle of the turn — leaving the film playing somewhere in the page.
//
// While the player is open, the page's calls to take or leave fullscreen are
// answered as if they had worked and otherwise ignored. Our own calls are not
// affected: a content script sees the browser's methods through its Xray
// wrappers, never the page's replacements.
const LOCKED = [
  { owner: 'Element', names: ['requestFullscreen', 'mozRequestFullScreen'] },
  { owner: 'Document', names: ['exitFullscreen', 'mozCancelFullScreen'] },
];

export const lockPageFullscreen = () => {
  const page = pageWindow();
  if (page === null || typeof exportFunction !== 'function') return () => {};

  const restores = [];

  for (const { owner, names } of LOCKED) {
    let proto = null;
    try {
      proto = page[owner].prototype;
    } catch {
      continue;
    }
    for (const name of names) {
      try {
        const original = proto[name];
        if (typeof original !== 'function') continue;
        exportFunction(() => page.Promise.resolve(), proto, {
          defineAs: name,
        });
        restores.push(() => {
          proto[name] = original;
        });
      } catch (error) {
        console.warn(`Video2Player: could not hold ${name} for the player`, error);
      }
    }
  }

  return () => {
    for (const restore of restores) {
      try {
        restore();
      } catch (error) {
        console.warn('Video2Player: could not give fullscreen back', error);
      }
    }
    restores.length = 0;
  };
};
