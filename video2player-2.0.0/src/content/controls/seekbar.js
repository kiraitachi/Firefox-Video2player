import { chapterAt } from '../video/chapters.js';
import { formatClock, formatRemaining } from '../../lib/time.js';
import { el } from '../shell.js';

const PREVIEW_INTERVAL_MS = 120;

// Pull the finger away from the bar and the same swipe covers less time, so a
// two-hour film can be landed on the exact scene.
const PRECISION_STEPS = [
  { withinPx: 40, factor: 1 },
  { withinPx: 100, factor: 0.5 },
  { withinPx: 180, factor: 0.25 },
  { withinPx: Infinity, factor: 0.1 },
];

const precisionFor = (distancePx) => {
  for (const step of PRECISION_STEPS) {
    if (distancePx <= step.withinPx) return step;
  }
  return PRECISION_STEPS[PRECISION_STEPS.length - 1];
};

export const createSeekBar = (video, seek) => {
  const elapsed = el('span', { class: 'time', text: '0:00' });
  const remaining = el('span', { class: 'time', text: '--:--' });
  const fill = el('div', { class: 'seek-fill' });
  const marks = el('div', { class: 'seek-marks' });
  const zones = el('div', { class: 'seek-zones' });
  const track = el('div', { class: 'seek-track' }, [fill, zones, marks]);
  const headTime = el('span', { class: 'seek-time', text: '0:00' });
  const area = el('div', { class: 'seek-area' }, [track, headTime]);
  const chapterLabel = el('div', { class: 'chapter' });
  const root = el('div', { class: 'seekbar' }, [
    chapterLabel,
    el('div', { class: 'seek-row' }, [elapsed, area, remaining]),
  ]);

  let isScrubbing = false;
  let scrubTime = 0;
  let lastPreviewAt = 0;
  let chapters = [];
  let arePlaced = false;
  let spans = [];

  const duration = () => (Number.isFinite(video.duration) ? video.duration : 0);

  // The dividers can only be placed once the film has told us how long it is,
  // so placing them is retried from the paint that follows.
  const placeMarks = () => {
    const total = duration();
    if (arePlaced || chapters.length === 0 || total === 0) return;
    const dividers = chapters
      .filter((chapter) => chapter.start > 0 && chapter.start < total)
      .map((chapter) => {
        const mark = el('span', { class: 'seek-mark' });
        mark.style.left = `${(chapter.start / total) * 100}%`;
        return mark;
      });
    marks.replaceChildren(...dividers);
    arePlaced = true;
  };

  // Stretches of the film painted onto the track — the opening, once it has
  // been recognised — redrawn whenever the length of the film is learned.
  const placeZones = () => {
    const total = duration();
    if (total === 0) return;
    const drawn = spans.map((span) => {
      const zone = el('span', { class: 'seek-zone' });
      zone.style.left = `${(span.start / total) * 100}%`;
      zone.style.width = `${((span.end - span.start) / total) * 100}%`;
      return zone;
    });
    zones.replaceChildren(...drawn);
  };

  const showChapter = (time) => {
    if (chapters.length === 0) return;
    const chapter = chapterAt(chapters, time);
    const title = chapter === null ? '' : chapter.title;
    if (chapterLabel.textContent === title) return;
    chapterLabel.textContent = title;
    chapterLabel.classList.toggle('is-visible', title !== '');
  };

  // While scrubbing the left label holds the moment the drag started, so the
  // target time on the line is not simply repeated back to the user and they
  // can see where to return to.
  const paint = (time) => {
    const total = duration();
    placeMarks();
    showChapter(time);
    const ratio = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
    fill.style.transform = `scaleX(${ratio})`;
    area.style.setProperty('--progress', `${ratio * 100}%`);
    headTime.textContent = formatClock(time);
    remaining.textContent = formatRemaining(time, video.duration);
    if (!isScrubbing) elapsed.textContent = formatClock(time);
  };

  const sync = () => {
    if (isScrubbing) return;
    paint(video.currentTime);
  };

  const start = () => {
    scrubTime = video.currentTime;
    lastPreviewAt = 0;
    elapsed.textContent = formatClock(scrubTime);
    isScrubbing = true;
    root.classList.add('is-scrubbing');
  };

  // Measured rather than assumed: the bar sits a fifth of the way up the
  // screen, and where exactly that lands depends on the phone.
  const barCenter = (fallback) => {
    const rect = track.getBoundingClientRect();
    if (rect.height === 0) return fallback;
    return rect.top + rect.height / 2;
  };

  const move = ({ dx, y, width, height }) => {
    const total = duration();
    if (total === 0) return;

    const step = precisionFor(Math.abs(y - barCenter(height)));
    scrubTime += (dx / width) * total * step.factor;
    scrubTime = Math.min(total, Math.max(0, scrubTime));
    paint(scrubTime);

    const now = performance.now();
    if (now - lastPreviewAt < PREVIEW_INTERVAL_MS) return;
    lastPreviewAt = now;
    seek(scrubTime, false);
  };

  const end = () => {
    if (!isScrubbing) return;
    isScrubbing = false;
    root.classList.remove('is-scrubbing');
    if (duration() > 0) seek(scrubTime);
    paint(scrubTime);
  };

  video.addEventListener('timeupdate', sync);
  video.addEventListener('durationchange', sync);
  video.addEventListener('durationchange', placeZones);
  video.addEventListener('seeked', sync);
  sync();

  return {
    root,
    start,
    move,
    end,
    setZones: (list) => {
      spans = list;
      placeZones();
    },
    setChapters: (list) => {
      chapters = list;
      arePlaced = false;
      placeMarks();
      showChapter(video.currentTime);
    },
    destroy: () => {
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('durationchange', sync);
      video.removeEventListener('durationchange', placeZones);
      video.removeEventListener('seeked', sync);
    },
  };
};
