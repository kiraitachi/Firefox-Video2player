# Video2Player for Android

![Extension icon](https://addons.mozilla.org/user-media/addon_icons/3006/3006699-64.png?modified=3c54f730)

[![License: MPL-2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)
[![No data collected](https://img.shields.io/badge/data%20collected-none-brightgreen.svg)](#privacy)
 
[![Extension icon](https://addons.mozilla.org/user-media/addon_icons/3006/3006699-64.png?modified=3c54f730)](https://addons.mozilla.org/en-US/firefox/addon/video-opener-for-android/)
 
A Firefox extension for **Android and desktop** that detects videos on web
pages and opens them in a **built-in, touch-first player**: thick seek bar,
gesture controls, quality / audio / subtitle pickers, colour tuning and skip
intro.
 
Tap the **Open Player** pill under a video and that video takes over the
screen with a proper player. It plays the page's own `<video>` element, so it
works on anything the browser can play, including streams that external apps
cannot open (`blob:` / MSE / HLS).
 
> **Version 2.0 changes what the pill does.** Versions 1.x handed the video's
> URL to an external app (VLC, MX Player…) through an Android intent. That
> fails whenever a site streams through a `blob:` URL. From 2.0 the video plays
> in the built-in player instead, so no URL ever has to be recovered. The 1.x
> code is kept in [`video-opener-android-1.1.0/`](video-opener-android-1.1.0)
> for reference.
 
## The pill
 
- Appears centred under the main video on the page (inside its bottom edge when
  there is no room below), slides in once and **stays** while the video is in
  view.
- Tap it to open the player. Tap the ✕ in the player to go back; the video is
  returned to the page exactly where it was.
- Turn it off per site from the toolbar popup.
## The player
 
- **Seek bar**: thick, grab it anywhere; drag away from it to scrub slower.
  Chapter marks are drawn when the site provides them.
- **Double-tap / double-click** the right side for +10 s, the left for −10 s.
  Keep tapping to go further.
- **Hold** the right side for 2×, the left to rewind.
- **Tap / click** shows or hides the controls. Only the play button pauses.
- **Pinch** to fill the screen and crop black bars.
- **Swipe** up or down through TikTok / Reels / Shorts style feeds.
- **Follows the device**: portrait or landscape, turning mid-film included.
- **Quality, audio track, speed, subtitles** (site tracks or your own `.srt` /
  `.vtt`) in the settings sheet.
- **Seasons and episodes** picker on sites that have one.
- **Colour**: brightness, contrast, saturation and a warm night light; the
  choice is remembered.
- **Skip intro**: learns a series' opening by ear (on the device, nothing is
  sent anywhere) and offers to skip it from the third episode.
Desktop uses the same Pointer Events as touch, so a mouse behaves like a
finger: click, double-click the sides to seek, press-and-hold, drag the seek
bar. There are no keyboard shortcuts yet.
 
## Privacy
 
- Permissions: `storage` (your settings, on the device) and `activeTab`.
- No `fetch`, no `XMLHttpRequest`, no remote URLs; `npm run lint:privacy`
  enforces it.
- Nothing is collected or sent. Works offline. The build is not minified.
- It runs on all sites only to find the `<video>`.
## Limitations
 
- **Quality** works with `<source>` lists, YouTube, hls.js, dash.js, Shaka and
  Playerjs. Elsewhere the row shows what is playing.
- **Rewind** is stepped seeking; browsers cannot play backwards.
- **Volume** stays on the device's buttons on Android; the web has no access.
- **Saving a frame** is impossible on Firefox for Android.
- **Skip intro** needs two episodes to learn an opening. It listens only to a
  video the site serves itself; a film loaded from another domain is left
  alone, since the browser would silence it.
- **DRM-protected video** has not been tested.
- **Ads:** it works best with an ad blocker. The pill attaches to whichever
  video the page shows most prominently, which can be an ad.
- Not yet verified on a wide range of real devices and sites. Please
  [open an issue](https://github.com/kiraitachi/Firefox-Video2player/issues)
  if a site misbehaves.
## Install
 
From [addons.mozilla.org](https://addons.mozilla.org/en-US/firefox/addon/video-opener-for-android/).
Needs Firefox for Android 142+ or desktop Firefox 140+.
 
## Development
 
```bash
npm ci
npm run build       # dist/
npm test            # unit tests
npm run lint        # web-ext lint + privacy check
npm run package     # artifacts/video2player-<version>.zip
```
 
On a phone (enable **Remote debugging via USB** in Firefox's developer
settings first):
 
```bash
npm run fixture && npm run serve &
adb reverse tcp:8422 tcp:8422
npm run start:android   # then open http://localhost:8422/
```
 
The extension is bundled with esbuild from `src/`. The output in `dist/` is
what ships; it is not minified. Node 20 or newer is required.
 
## Credits and license
 
The player engine (everything under `src/content/` apart from the pill in
`controls/badge.*`, plus `src/lib/` and the popup) is adapted from
**Nocturne Player** by Vlad Pohorilets,
<https://github.com/kvachikk/nocturne-player>, licensed under MPL-2.0. See
[NOTICE.md](NOTICE.md) for what was changed.
 
Video2Player is released under the [MPL-2.0](LICENSE).
