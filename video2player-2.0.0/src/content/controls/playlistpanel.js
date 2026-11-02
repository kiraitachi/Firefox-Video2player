import { el } from '../shell.js';
import { paintChips } from './menu.js';

// The playlist drawn the way the settings sheet is: each step but the last a
// segmented control, since a season or a dub is one short word out of a few,
// and the last step — the episodes — an inset list with a tick by the one that
// is playing, since a season can run to twenty-odd of them and a row reads
// better than a chip that has wrapped onto its fifth line.
// Picking a season leaves the sheet up, because the episode is still to be
// chosen; picking an episode is the answer, and the sheet goes away.

const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7.5';

const buildEpisodeCell = (label, isCurrent, onPick) => {
  const cell = el('button', { class: 'menu-cell', type: 'button' }, [
    el('span', { class: 'menu-cell-label', text: label }),
  ]);
  if (isCurrent) {
    cell.classList.add('is-current');
    cell.setAttribute('aria-current', 'true');
    cell.append(
      el('svg', { class: 'menu-cell-check', viewBox: '0 0 24 24' }, [
        el('path', { d: CHECK_PATH }),
      ]),
    );
  }
  cell.addEventListener('click', onPick);
  return cell;
};

export const createPlaylistPanel = ({ onSelect }) => {
  const root = el('div', { class: 'panel menu playlist-panel' });
  let levels = [];

  // The step above names the list under it: the episodes of "2 сезон" are
  // headed "2 сезон", which is all a viewer needs to know where they are.
  const buildHeading = (index) =>
    index === 0
      ? null
      : el('span', { class: 'menu-label', text: levels[index - 1].current });

  const buildLevelRow = (level, index) => {
    const isLast = index === levels.length - 1;
    const heading = buildHeading(index);
    const parts = heading === null ? [] : [heading];

    if (isLast) {
      const cells = level.labels.map((label, option) =>
        buildEpisodeCell(label, label === level.current, () =>
          onSelect(index, option, true),
        ),
      );
      parts.push(el('div', { class: 'menu-cells' }, cells));
      return el('div', { class: 'menu-row' }, parts);
    }

    const holder = { chips: el('div', { class: 'chips' }) };
    const options = level.labels.map((label, option) => ({
      id: option,
      label,
    }));
    const setActive = paintChips(holder, options, (option) =>
      onSelect(index, option, false),
    );
    setActive(level.labels.indexOf(level.current));
    parts.push(holder.chips);
    return el('div', { class: 'menu-row' }, parts);
  };

  // Repainted in place, keeping where the list was scrolled to: the player
  // rewrites its path while a season loads, and a sheet that jumped back to
  // the top on every rewrite would lose the viewer's place in it.
  const paint = () => {
    const { scrollTop } = root;
    root.replaceChildren(...levels.map(buildLevelRow));
    root.scrollTop = scrollTop;
  };

  // Opened on the episode that is playing rather than on the first one: the
  // next episode is what people open this for, and it sits right under it.
  const revealCurrent = () => {
    const current = root.querySelector('.menu-cell.is-current');
    if (current === null) {
      root.scrollTop = 0;
      return;
    }
    const middle = current.offsetTop - root.clientHeight / 2;
    root.scrollTop = Math.max(0, middle + current.offsetHeight / 2);
  };

  const isOpen = () => root.classList.contains('is-open');

  const open = () => {
    paint();
    root.classList.add('is-open');
    revealCurrent();
  };

  const close = () => root.classList.remove('is-open');

  return {
    root,
    setLevels: (next) => {
      levels = next;
      if (levels.length === 0) close();
      if (isOpen()) paint();
    },
    open,
    close,
    isOpen,
    toggle: () => {
      if (isOpen()) close();
      else open();
    },
  };
};
