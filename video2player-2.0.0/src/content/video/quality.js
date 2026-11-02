import { ADAPTERS, AUTO_ID } from './qualityadapters.js';

export { AUTO_ID };

// A streaming player builds its quality ladder after the first segments land,
// so the ladder is looked up again every time the sheet is opened rather than
// once when the session starts.
export const createQuality = (video, host = null, adapters = ADAPTERS) => {
  let adapter = null;
  let options = [];
  // What the viewer asked for has to outlive the adapter. The ladder is looked
  // up again every time the sheet opens, which builds a new adapter each time,
  // and a player that has been given a rung goes back to reporting whatever its
  // own auto has drifted to. The chip should say what was asked for.
  let chosen = null;

  const detect = () => {
    for (const create of adapters) {
      try {
        const candidate = create(video, host);
        if (candidate !== null) return candidate;
      } catch (error) {
        console.warn('Video2Player: a quality adapter threw while probing', error);
      }
    }
    return null;
  };

  const refresh = () => {
    adapter = detect();
    if (adapter === null) {
      options = [];
      chosen = null;
      return options;
    }
    const listed = adapter.list();
    const auto = adapter.hasAuto ? [{ id: AUTO_ID, label: 'Auto' }] : [];
    options = listed.length > 0 ? auto.concat(listed) : [];
    // A choice lives only as long as the rung it names is still on offer.
    if (!options.some((option) => option.id === chosen)) chosen = null;
    return options;
  };

  // Says which of the two things went wrong, because "no quality here" and
  // "found the player, it is offering nothing yet" want different answers from
  // whoever is looking at it.
  const describe = () => {
    const size =
      video.videoWidth === 0
        ? ''
        : `${video.videoWidth}×${video.videoHeight} · `;
    if (adapter !== null) {
      const detail = adapter.diagnose ? adapter.diagnose() : 'no levels yet';
      return `${size}${adapter.name}: ${detail}`;
    }
    return `${size}set by the site`;
  };

  return {
    refresh,
    describe,
    getOptions: () => options,
    getEngine: () => (adapter === null ? null : adapter.name),
    isSwitchable: () => options.length > 1,
    getCurrent: () => {
      if (chosen !== null) return chosen;
      return adapter === null ? null : adapter.current();
    },
    select: (id) => {
      if (adapter === null) return false;
      const wanted = String(id);
      if (adapter.select(wanted) !== true) return false;
      chosen = wanted;
      return true;
    },
  };
};
