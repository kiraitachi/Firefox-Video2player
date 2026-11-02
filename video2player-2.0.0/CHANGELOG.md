# Changelog

## 2.0.0

- **New:** the pill now opens a built-in player instead of handing the video
  to an external app. Works on Android and desktop Firefox.
- Player engine adapted from Nocturne Player 0.9.1 (MPL-2.0): seek bar,
  gestures, quality / audio / subtitle pickers, colour tuning, skip intro,
  episode picker, feed swiping.
- Plays the page's own video element, so `blob:` / MSE / HLS streams work.
- Removed: external-player intents, stream-URL recovery and network sniffing
  (no longer needed).
- Manifest: desktop Firefox 140+ and Firefox for Android 142+; permissions
  reduced to `storage` and `activeTab`.

## 1.1.0

- Android-only. Opened videos in an external player through an intent, with
  site-specific URL recovery for streaming pages.
