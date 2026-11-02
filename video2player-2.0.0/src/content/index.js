import {
  isHostEnabled,
  onSettingsChanged,
  readSettings,
  writeSettings,
} from '../lib/settings.js';

const PERSIST_DELAY_MS = 400;
import { createBadge } from './controls/badge.js';
import { createVideoWatcher } from './detect.js';
import { createSession } from './session.js';

// A player embedded in an iframe should honour the decision the user made about
// the page they can actually see, so the embedding host counts too.
const resolveHosts = () => {
  const hosts = [location.host];
  if (window.top === window) return hosts;

  try {
    hosts.push(window.top.location.host);
  } catch {
    if (document.referrer !== '') {
      try {
        hosts.push(new URL(document.referrer).host);
      } catch (error) {
        console.error('Video2Player: unreadable referrer', error);
      }
    }
  }
  return hosts;
};

const isDocumentSupported = () =>
  document.contentType === 'text/html' &&
  location.protocol !== 'about:' &&
  location.protocol !== 'moz-extension:';

const start = async () => {
  if (!isDocumentSupported()) return;

  const hosts = resolveHosts();
  let session = null;
  let current = await readSettings();
  let persistTimer = null;

  const badge = createBadge();

  // Preferences are written back in one debounced batch: stepping a value five
  // times should not mean five writes.
  const persist = (patch) => {
    current = { ...current, ...patch };
    if (persistTimer !== null) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      writeSettings(patch);
    }, PERSIST_DELAY_MS);
  };

  badge.onActivate = async (video) => {
    if (session) return;
    badge.hide();
    session = createSession(video, {
      settings: current,
      onPersist: persist,
      // A feed may have moved on while the player was open, so the badge goes
      // back on whichever video the player was showing last.
      onExit: (lastVideo) => {
        session = null;
        badge.show(lastVideo);
      },
    });
    await session.enter();
  };

  const watcher = createVideoWatcher((primary) => {
    if (session) return;
    if (primary) badge.show(primary);
    else badge.hide();
  });

  const apply = (settings) => {
    const isEnabled = hosts.every((host) => isHostEnabled(settings, host));
    if (isEnabled) {
      watcher.start();
    } else {
      watcher.stop();
      badge.hide();
    }
  };

  apply(current);
  onSettingsChanged((next) => {
    current = next;
    apply(next);
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type !== 'query-state') return false;
    return Promise.resolve({ videoCount: watcher.getCount() });
  });
};

start().catch((error) => {
  console.error('Video2Player: failed to start', error);
});
