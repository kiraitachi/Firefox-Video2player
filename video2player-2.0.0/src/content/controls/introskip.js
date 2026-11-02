import { el } from '../shell.js';

// The button goes a moment before the opening does: tapping it with a second
// to go would land in the story anyway.
const HIDE_BEFORE_END_S = 1.5;
// The learned end is good to a fifth of a second. Landing that much early
// leaves the last note of the song, never the first line of the story.
const LAND_EARLY_S = 0.2;

// "Skip intro", over the corner of the picture for as long as the opening
// plays. It stays up whether or not the controls are, since the whole point is
// one tap without first bringing anything up.
export const createIntroSkip = (video, seek) => {
  const button = el('button', { class: 'intro-skip', type: 'button' }, [
    el('span', { text: 'Skip intro' }),
    el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
      el('path', { d: 'M5 6l6 6-6 6M13 6l6 6-6 6' }),
    ]),
  ]);

  let span = null;

  const update = () => {
    const time = video.currentTime;
    const isOn =
      span !== null &&
      time >= span.start - 1 &&
      time < span.end - HIDE_BEFORE_END_S;
    button.classList.toggle('is-visible', isOn);
  };

  button.addEventListener('click', () => {
    if (span === null) return;
    seek(span.end - LAND_EARLY_S);
    button.classList.remove('is-visible');
  });

  video.addEventListener('timeupdate', update);
  video.addEventListener('seeked', update);

  return {
    root: button,
    show: (next) => {
      span = next;
      update();
    },
    destroy: () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('seeked', update);
    },
  };
};
