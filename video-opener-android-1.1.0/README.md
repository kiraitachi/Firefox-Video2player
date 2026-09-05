# Video Opener for Android — v1.1.0

Detects videos on web pages and opens them directly in your default Android
video player app (VLC, MX Player, etc.) — Android only, no desktop support.

## What was broken in 1.0.0

**The main bug:** many video sites (xvideos, xhamster, pornhub, twitch,
youtube, and most modern "tube"-style sites) stream video using
MediaSource Extensions (MSE) / HLS. That means the actual `<video>` tag's
`src` is a `blob:` URL — a temporary reference that only exists inside the
page's own browser tab. VLC or any other external app **cannot** open a
`blob:` URL; when 1.0.0 tried, nothing happened, which is why "it wasn't
working properly."

## What's fixed in 1.1.0

1. **Real URL recovery for xvideos.com** — xvideos exposes the actual
   `.mp4` / `.m3u8` stream URLs via inline JS (`html5player.setVideoUrlHigh(...)`,
   `setVideoUrlLow(...)`, `setVideoHLS(...)`). The extension now reads these
   directly from the page's `<script>` tags instead of relying on the
   blob URL, before it ever opens VLC.
2. **Generic fallback extraction** for other MSE/HLS-based sites: scans
   inline scripts for a raw `.mp4`/`.m3u8` URL when the video element only
   exposes a blob.
3. **Corrected Android intent URI format** — switched from
   `intent:<url>#Intent;...;end` to the canonical
   `intent://<host+path>#Intent;scheme=https;...;end;` format. The old
   format could silently fail to parse when the video URL contained a
   `;` or certain query-string characters (common in signed CDN URLs).
4. **No forced package** — the intent no longer specifies an app package,
   so Android hands it to whatever is set as your **default** video
   player. If VLC is your default handler for video files, it opens VLC
   directly with no extra picker.
5. **Auto-open with silent fallback** — tapping the button now opens the
   video immediately (single tap, no extra dialog). A small "Open Video
   In…" dialog only appears if nothing seems to have happened within
   1.5 seconds (e.g. blob URL couldn't be resolved, or no compatible app
   is installed), offering explicit VLC / MX Player buttons and a
   "Copy Video URL" option as a last resort.

## Testing on xvideos.com

Because this needs a real Android device with Firefox and VLC installed,
I can't click-test it myself — but here's how to verify it on your end:

1. Install the updated XPI (see below)
2. Open a video's watch page on xvideos.com
3. Wait for the video to start buffering — the "Open in App" pill should
   appear under the player once the video is detected
4. Tap it — VLC (or your default video player) should open and start
   playing within ~1 second
5. **If it doesn't work:** open `about:debugging` → this extension →
   "Inspect" to see the console. Set `DEBUG = true` at the top of
   `content.js` and reload — you'll see logs like:
   ```
   [VideoOpener] xvideos direct URL found: https://...mp4?...
   [VideoOpener] Opening intent: intent://...
   ```
   If it logs `null` for the URL, xvideos likely changed their player's
   internal API — send me the page's `view-source:` HTML for that watch
   page and I'll update the regex patterns.

## Files
```
manifest.json    – MV2, Android-only, gecko_android 142+
content.js       – detection, URL recovery, intent builder, fallback UI
content.css      – Firefox-native pill button + fallback dialog styles
background.js    – re-injects content script on browser action tap
icons/
```
