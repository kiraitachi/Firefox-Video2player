const STORAGE_KEY = 'video2player';
const SCHEMA_VERSION = 2;

export const DEFAULTS = Object.freeze({
  schemaVersion: SCHEMA_VERSION,
  warmth: 0,
  brightness: 1,
  contrast: 1,
  saturate: 1,
  doubleTapSeconds: 10,
  holdSpeed: 2,
  areEffectsReduced: false,
  subtitleScale: 1,
  areSubtitlesNative: false,
  isIntroSkipOn: true,
  disabledHosts: [],
});

const KEYS = Object.keys(DEFAULTS);

// The picture must start exactly as the site encoded it, so a stored value that
// is not a number in range is not trusted: it falls back to the neutral one
// rather than tinting somebody's first film for reasons they cannot see.
const RANGES = {
  warmth: { min: 0, max: 0.45 },
  brightness: { min: 0.4, max: 2 },
  contrast: { min: 0.5, max: 1.5 },
  saturate: { min: 0, max: 2 },
  subtitleScale: { min: 0.5, max: 2 },
  doubleTapSeconds: { min: 5, max: 60 },
  holdSpeed: { min: 1.5, max: 4 },
};

const inRange = (key, value) => {
  const range = RANGES[key];
  if (range === undefined) return value;
  const isNumber = typeof value === 'number' && Number.isFinite(value);
  if (!isNumber) return DEFAULTS[key];
  if (value < range.min || value > range.max) return DEFAULTS[key];
  return value;
};

const COLOUR_KEYS = ['warmth', 'brightness', 'contrast', 'saturate'];

// Schema 1 kept whatever colour the panel was last left on, including values
// somebody had only been trying out. They came back on the next film — on what
// looked like a clean profile — as a picture that was already tinted, or in one
// case with the colour drained out of it entirely. The upgrade drops them once;
// after that they are the viewer's again.
const migrate = (stored) => {
  if (stored === null || typeof stored !== 'object') return stored;
  if (stored.schemaVersion === SCHEMA_VERSION) return stored;
  const migrated = { ...stored };
  for (const key of COLOUR_KEYS) delete migrated[key];
  return migrated;
};

// Rebuilt key by key so every settings object shares one hidden class, and so
// unknown keys from a future version can never leak into the running state.
export const normalize = (raw) => {
  const stored = migrate(raw);
  const settings = {};
  for (const key of KEYS) {
    const value = stored?.[key];
    settings[key] = value === undefined ? DEFAULTS[key] : inRange(key, value);
  }
  settings.schemaVersion = SCHEMA_VERSION;
  settings.disabledHosts = Array.isArray(settings.disabledHosts)
    ? settings.disabledHosts.slice()
    : [];
  return settings;
};

export const readSettings = async () => {
  try {
    const stored = await browser.storage.local.get(STORAGE_KEY);
    return normalize(stored[STORAGE_KEY]);
  } catch (error) {
    console.error('Video2Player: could not read settings', error);
    return normalize(null);
  }
};

export const writeSettings = async (patch) => {
  const current = await readSettings();
  const next = normalize({ ...current, ...patch });
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: next });
  } catch (error) {
    console.error('Video2Player: could not save settings', error);
  }
  return next;
};

export const resetSettings = async () => {
  try {
    await browser.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error('Video2Player: could not reset settings', error);
  }
  return normalize(null);
};

export const onSettingsChanged = (handler) => {
  const listener = (changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    handler(normalize(changes[STORAGE_KEY].newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
};

export const isHostEnabled = (settings, host) =>
  !settings.disabledHosts.includes(host);

export const setHostEnabled = async (host, isEnabled) => {
  const settings = await readSettings();
  const others = settings.disabledHosts.filter((entry) => entry !== host);
  const disabledHosts = isEnabled ? others : others.concat(host);
  return writeSettings({ disabledHosts });
};
