// Everything a site's own player knows about itself — the quality ladder, the
// caption list — lives in the page's JavaScript, which a content script sees
// only through Gecko's Xray wrappers. Waiving those wrappers is the supported
// way in on Firefox, and it stays a read of objects the page already made: no
// code is injected into the page and nothing is evaluated from a string.
//
// Nothing here can throw at the caller. A site is free to have a getter that
// raises, a method that is missing, or a value from a compartment we cannot
// touch; every one of those means "this player cannot do that", not "the
// player is broken".
const MAX_SCANNED_KEYS = 500;

// Null rather than a throw where there is no window at all, so that a sweep of
// the page's globals is simply an empty answer instead of an error every caller
// would have to catch.
export const pageWindow = () => {
  if (typeof window === 'undefined') return null;
  return window.wrappedJSObject ?? window;
};

// Structured-cloned into the page's compartment so a page function can read it.
// Falls back to the plain value where the helper is absent, which is a context
// that already shares one compartment with the page.
export const toPage = (value) => {
  if (typeof cloneInto !== 'function') return value;
  try {
    return cloneInto(value, pageWindow());
  } catch {
    return value;
  }
};

export const read = (object, key) => {
  if (object === null || typeof object !== 'object') return null;
  try {
    const value = object[key];
    return value === undefined ? null : value;
  } catch {
    return null;
  }
};

export const call = (object, name, ...args) => {
  if (object === null || typeof object !== 'object') return null;
  let method;
  try {
    method = object[name];
  } catch {
    return null;
  }
  if (typeof method !== 'function') return null;
  try {
    // Reflect.apply, not method.apply: the latter reaches the page's own
    // Function.prototype.apply, which then tries to read `length` off an array
    // built in our compartment and is refused — "Permission denied to access
    // property length". Every call into a site's player failed that way, which
    // is why the quality ladder, the caption list and the chapter list all came
    // back empty on YouTube. Reflect is ours, so the arguments are unpacked on
    // this side and the page only ever sees the values.
    const value = Reflect.apply(method, object, args);
    return value === undefined ? null : value;
  } catch (error) {
    console.warn(`Video2Player: ${name}() failed on the site's player`, error);
    return null;
  }
};

export const write = (object, key, value) => {
  if (object === null || typeof object !== 'object') return false;
  try {
    object[key] = value;
    return true;
  } catch {
    return false;
  }
};

// Page arrays come from another compartment, so they are walked by index
// rather than spread: an iterator that throws must not take the player down.
export const toArray = (value) => {
  const length = read(value, 'length');
  if (typeof length !== 'number' || !Number.isFinite(length)) return [];
  const items = [];
  for (let index = 0; index < length; index++) {
    items.push(read(value, index));
  }
  return items;
};

export const isFunction = (object, name) => {
  if (object === null || typeof object !== 'object') return false;
  try {
    return typeof object[name] === 'function';
  } catch {
    return false;
  }
};

// A site's player API usually lives on an ancestor of the video: YouTube puts
// it on #movie_player. This has to be read before the video is moved onto our
// stage, because afterwards the chain of ancestors is ours, not theirs.
export const findApiAncestor = (element, names) => {
  let node = element.parentElement;
  while (node !== null) {
    const waived = node.wrappedJSObject ?? node;
    for (const name of names) {
      if (isFunction(waived, name)) return waived;
    }
    node = node.parentElement;
  }
  return null;
};

// A last resort for players that keep their engine on a global under a name
// only they know. Bounded, and every property read is guarded, because a getter
// on a page global can throw or be expensive.
//
// Every matcher is tried against each global in one sweep, and the first object
// that answers to a matcher is kept for it. Sweeping once per engine instead
// meant walking the page's globals several times over, through
// cross-compartment wrappers, in the moment the viewer was waiting.
export const findGlobalMatches = (matchers) => {
  const scope = pageWindow();
  const found = {};
  if (scope === null) return found;
  let keys;
  try {
    keys = Object.keys(scope);
  } catch {
    return found;
  }

  let missing = matchers.length;
  const limit = Math.min(keys.length, MAX_SCANNED_KEYS);
  for (let index = 0; index < limit && missing > 0; index++) {
    const value = read(scope, keys[index]);
    if (value === null || typeof value !== 'object') continue;
    for (const matcher of matchers) {
      if (found[matcher.name] !== undefined) continue;
      try {
        if (matcher.matches(value)) {
          found[matcher.name] = value;
          missing--;
        }
      } catch {
        continue;
      }
    }
  }
  return found;
};
