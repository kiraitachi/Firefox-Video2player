import { el } from '../shell.js';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// A row of chips whose contents are repainted rather than rebuilt, because a
// streaming site only learns what it can offer after the film has started and
// the sheet has to be able to say so the next time it opens.
// Each row is a section the way a settings sheet on iOS draws one: a quiet
// heading over a segmented control, with the choice that is on raised out of
// the track.
const buildChipRow = (label, extra = []) => {
  const chips = el('div', { class: 'chips' });
  const row = el('div', { class: 'menu-row' }, [
    el('span', { class: 'menu-label', text: label }),
    chips,
    ...extra,
  ]);
  return { row, chips };
};

export const paintChips = (holder, options, onSelect) => {
  const chips = options.map((option) =>
    el('button', {
      class: 'chip',
      type: 'button',
      text: option.label,
      'data-id': String(option.id),
    }),
  );

  const setActive = (id) => {
    for (const chip of chips) {
      chip.setAttribute('aria-pressed', String(chip.dataset.id === String(id)));
    }
  };

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      const raw = chip.dataset.id;
      const id = Number(raw);
      setActive(raw);
      onSelect(Number.isNaN(id) ? raw : id);
    });
  }

  holder.chips.replaceChildren(...chips);
  return setActive;
};

const buildNote = (text) => el('span', { class: 'menu-note', text });

// A list cell with a switch at its end, rather than a chip that has to be
// read twice to tell whether it is on.
const buildToggleCell = (label, isOn, onToggle) => {
  const cell = el('button', { class: 'menu-cell', type: 'button' }, [
    el('span', { class: 'menu-cell-label', text: label }),
    el('span', { class: 'switch', 'aria-hidden': 'true' }),
  ]);
  cell.setAttribute('role', 'switch');
  cell.setAttribute('aria-checked', String(isOn));
  cell.addEventListener('click', () => {
    const next = cell.getAttribute('aria-checked') !== 'true';
    cell.setAttribute('aria-checked', String(next));
    onToggle(next);
  });
  return cell;
};

const buildActionCell = (label, onClick) => {
  const cell = el('button', { class: 'menu-cell', type: 'button' }, [
    el('span', { class: 'menu-cell-label', text: label }),
    el('svg', { class: 'menu-cell-icon', viewBox: '0 0 24 24' }, [
      el('path', { d: 'M9 5l7 7-7 7' }),
    ]),
  ]);
  cell.addEventListener('click', onClick);
  return cell;
};

export const createMenu = ({
  video,
  tracks,
  quality,
  audio,
  onPickFile,
  onRate,
  onNotice,
  isIntroSkipOn,
  onIntroSkip,
}) => {
  const speedRow = buildChipRow('Speed');
  const setSpeed = paintChips(
    speedRow,
    SPEEDS.map((rate) => ({ id: rate, label: `${rate}x` })),
    (rate) => {
      video.playbackRate = rate;
      onRate(rate);
    },
  );
  setSpeed(video.playbackRate);

  const loadCell = buildActionCell('Load .srt / .vtt file', onPickFile);
  const nativeCell = buildToggleCell(
    'Native rendering',
    tracks.isNative(),
    () => {
      tracks.setNative(!tracks.isNative());
    },
  );
  const subtitleRow = buildChipRow('Subtitles', [
    el('div', { class: 'menu-cells' }, [loadCell, nativeCell]),
  ]);
  let setSubtitle = () => {};

  const paintSubtitles = () => {
    const options = [{ id: -1, label: 'Off' }, ...tracks.list()];
    setSubtitle = paintChips(subtitleRow, options, (id) => tracks.select(id));
    setSubtitle(tracks.getSelected());
  };

  // Off means the player does not listen at all, not that it listens and
  // keeps quiet about what it heard.
  const introRow = el('div', { class: 'menu-row' }, [
    el('span', { class: 'menu-label', text: 'Intros' }),
    el('div', { class: 'menu-cells' }, [
      buildToggleCell('Offer to skip', isIntroSkipOn, onIntroSkip),
    ]),
  ]);

  const qualityRow = buildChipRow('Quality');

  // The site keeps the ladder; all we do is ask for a rung. When there is no
  // way in, the row says what is playing instead of pretending to offer a
  // choice that would do nothing.
  const paintQuality = () => {
    quality.refresh();
    const options = quality.getOptions();
    if (options.length === 0) {
      qualityRow.chips.replaceChildren(buildNote(quality.describe()));
      return;
    }
    const setQuality = paintChips(qualityRow, options, (id) => {
      // Only the refusal is worth a word. The chip lighting up already says
      // the choice was taken, and a message over the film for every tap is
      // noise the viewer did not ask for.
      if (!quality.select(id)) onNotice('The site would not change it');
    });
    setQuality(quality.getCurrent());
  };

  // A row that offers one answer is a row in the way, so both of these are
  // hidden until the site turns out to have something to choose between.
  const buildOptionalRow = (label, source, onFail) => {
    const holder = buildChipRow(label);
    const paint = () => {
      source.refresh();
      const options = source.getOptions();
      holder.row.classList.toggle('is-empty', !source.isSwitchable());
      if (!source.isSwitchable()) return;
      const setActive = paintChips(holder, options, (id) => {
        if (!source.select(id)) onNotice(onFail);
      });
      setActive(source.getCurrent());
    };
    return { row: holder.row, paint };
  };

  const audioRow = buildOptionalRow(
    'Audio',
    audio,
    'The site would not change the track',
  );

  paintSubtitles();
  qualityRow.chips.replaceChildren(buildNote('Reading the site…'));
  audioRow.row.classList.add('is-empty');

  // Quality leads. It is the row people open this sheet for, it is the longest,
  // and on a phone held sideways the sheet scrolls — so anything below the
  // first two rows is a row somebody has to go looking for.
  const root = el('div', { class: 'panel menu' }, [
    qualityRow.row,
    audioRow.row,
    speedRow.row,
    subtitleRow.row,
    introRow,
  ]);

  // Both lists can grow while the film plays — a caption track switched on in
  // the site's own player, a quality ladder that finished loading — so they are
  // read again every time the sheet is opened.
  const refresh = () => {
    paintSubtitles();
    paintQuality();
    audioRow.paint();
  };

  const open = () => {
    refresh();
    root.classList.add('is-open');
    // Opened at the top, always. The sheet scrolls, and a chip that still has
    // focus from the last time drags the view down to itself, which hides the
    // row the sheet was opened for.
    root.scrollTop = 0;
  };

  return {
    root,
    refresh,
    open,
    toggle: () => {
      if (root.classList.contains('is-open')) root.classList.remove('is-open');
      else open();
    },
    close: () => root.classList.remove('is-open'),
    isOpen: () => root.classList.contains('is-open'),
    setSubtitle: (id) => setSubtitle(id),
  };
};
