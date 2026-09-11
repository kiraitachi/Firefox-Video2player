# Video2Player for Android

![Extension icon](https://addons.mozilla.org/user-media/addon_icons/3006/3006699-64.png?modified=3c54f730)

A Firefox extension (Android only) that detects video content on a web page
and lets you open it directly in your default video player app — VLC, MX
Player, or whichever app you've set as the system default for video files.

---

## What it does

- Scans the current page for `<video>` elements as they appear, including
  ones added dynamically after the page loads (infinite-scroll feeds, SPA
  navigation, players that attach late).
- Overlays a small "Open in App" button beneath each detected video, styled
  to match Firefox's own color palette so it feels like a native browser
  feature rather than a third-party injection.
- On tap, resolves the actual playable URL for that video and hands it to
  Android via an intent, so the OS opens it in your default video player —
  no extra app-picker step if you already have a default set.
- If the direct URL can't be determined (see limitations below), falls back
  to a small dialog offering explicit "Open with VLC" / "Open with MX
  Player" buttons, or a "Copy Video URL" option so you can paste it into a
  player manually.

## Intent

Many mobile browsers (Samsung Internet, for example) offer a built-in
"open externally" button on video content. Firefox for Android does not.
This extension exists to bring that same convenience to Firefox: a single
tap to hand a video off to a dedicated player app, instead of watching it
inside the browser's own video controls.

It's built specifically for **Android** and is not intended to run, or be
useful, on desktop Firefox — desktop already has other ways to save or open
media, and Android's intent system is the mechanism this extension depends
on entirely.

## Limitations

- **Streaming/blob URLs**: many sites (most tube sites, Twitch, YouTube,
  Vimeo, and others) serve video through MediaSource Extensions or HLS,
  which means the `<video>` element's actual `src` is a temporary `blob:`
  reference that only exists inside that browser tab. External apps can't
  open a `blob:` URL. The extension includes extraction logic for a few
  known sites (currently xvideos.com) that expose a real direct URL
  elsewhere on the page, plus a generic best-effort scan for other sites —
  but this is not guaranteed to work everywhere, and sites can change their
  player code at any time and break it.
- **No forced player**: the extension intentionally does not pin video
  playback to a specific app. It relies on whatever you've set as your
  Android default handler for video files. If you have no default set,
  Android may show its own app-chooser instead of opening silently.
- **Requires a real device to verify**: intent handling, app defaults, and
  player compatibility can only be confirmed on an actual Android device
  with Firefox and a video player installed — this can't be simulated or
  tested in a desktop environment.
- **DRM-protected or heavily obfuscated players**: sites using encrypted
  media extensions (EME) or aggressively obfuscated JavaScript will likely
  not yield a usable direct URL at all.
- **Not a downloader**: the extension only hands off a URL to another app
  for playback; it does not fetch, store, or convert video files itself.
