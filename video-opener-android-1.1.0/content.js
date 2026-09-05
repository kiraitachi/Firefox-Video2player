/**
 * Video Opener for Android – Content Script (v1.1)
 *
 * Fixes vs 1.0.0:
 *  1. Correct Android intent:// URI format (old format could fail to parse
 *     on some intent handlers when the URL contained ';' or query strings).
 *  2. No forced app/package — uses the OS default handler for video/*
 *     (this is what actually makes it "open with VLC" if VLC is set default).
 *  3. Blob-URL fix: many tube sites (xvideos, xhamster, pornhub, etc.) use
 *     MediaSource/HLS streaming, so <video src> is a blob: URL that VLC/MX
 *     CANNOT open externally. We now scan the page for the real .mp4/.m3u8
 *     URL before falling back to the unusable blob.
 *  4. Single-tap flow: badge tap opens the video immediately (no extra
 *     picker step) — matching how Samsung Browser's "open externally"
 *     button behaves. A fallback mini-dialog only appears if nothing
 *     seems to have happened after ~1.5s (e.g. no compatible app, or the
 *     detected URL was unusable).
 */

(function () {
  "use strict";
  if (window.__videoOpenerInjected) return;
  window.__videoOpenerInjected = true;

  // ── Debug logging (toggle to true while troubleshooting a site) ─────────
  const DEBUG = false;
  const log = (...args) => { if (DEBUG) console.log("[VideoOpener]", ...args); };

  // ── Config ────────────────────────────────────────────────────────────
  const BUTTON_ID_PREFIX  = "voa-btn-";
  const OVERLAY_CLASS     = "voa-overlay";
  const MIN_VIDEO_SIZE    = 100;   // px – ignore tiny/tracking pixels
  const OBSERVER_THROTTLE = 800;   // ms
  const OPEN_FALLBACK_MS  = 1500;  // ms – how long to wait before assuming the intent failed

  // Sites known to use custom players / MSE-HLS streaming that hide the
  // real URL behind a blob:. We apply extra extraction logic for these.
  const SPECIAL_SITES = [
    "xvideos.com", "xnxx.com", "xhamster.com", "pornhub.com",
    "redtube.com", "youporn.com", "spankbang.com",
    "crunchyroll.com", "funimation.com", "hidive.com",
    "9anime", "gogoanime", "zoro.to", "aniwatch",
    "twitch.tv", "kick.com", "youtube.com", "vimeo.com",
    "dailymotion.com", "streamtape", "doodstream", "mixdrop"
  ];

  // ── State ─────────────────────────────────────────────────────────────
  const trackedVideos = new WeakMap();
  let buttonCounter = 0;
  let observerTimer = null;

  // ── Utility ───────────────────────────────────────────────────────────
  function isSpecialSite() {
    const host = location.hostname.toLowerCase();
    return SPECIAL_SITES.some(s => host.includes(s));
  }

  function isSufficientlyVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width >= MIN_VIDEO_SIZE && rect.height >= MIN_VIDEO_SIZE;
  }

  // ── xvideos.com specific extraction ──────────────────────────────────
  // xvideos exposes the real stream URLs via inline JS calls like:
  //   html5player.setVideoUrlHigh('https://.../video.mp4?...');
  //   html5player.setVideoUrlLow('https://.../video.mp4?...');
  //   html5player.setVideoHLS('https://.../video.m3u8?...');
  // The <video> element itself only ever gets a blob: URL because
  // playback goes through MSE. We prefer High > Low > HLS since a
  // direct .mp4 plays in more external apps than .m3u8.
  function extractXvideosUrl() {
    const patterns = [
      /html5player\.setVideoUrlHigh\(\s*'([^']+)'/,
      /html5player\.setVideoUrlLow\(\s*'([^']+)'/,
      /html5player\.setVideoHLS\(\s*'([^']+)'/,
    ];
    for (const script of document.querySelectorAll("script:not([src])")) {
      const text = script.textContent;
      if (!text || !text.includes("html5player")) continue;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          log("xvideos direct URL found:", match[1]);
          return match[1].replace(/\\\//g, "/"); // unescape JSON-style slashes
        }
      }
    }
    return null;
  }

  // ── Generic fallback extraction ──────────────────────────────────────
  // Best-effort scan of inline <script> content for a raw .mp4 / .m3u8
  // URL when the <video> tag only exposes a blob:. Works on many custom
  // JS players that embed the source config directly in the page.
  function extractGenericStreamUrl() {
    const re = /https?:\/\/[^"'\s\\<>]+?\.(?:mp4|m3u8)(?:\?[^"'\s\\<>]*)?/gi;
    let best = null;
    for (const script of document.querySelectorAll("script:not([src])")) {
      const text = script.textContent;
      if (!text) continue;
      const matches = text.match(re);
      if (!matches) continue;
      const candidate = matches.find(u =>
        !u.includes("thumb") && !u.includes("preview") && !u.includes(".vtt")
      ) || matches[0];
      if (candidate) { best = candidate; break; }
    }
    if (best) log("generic stream URL found:", best);
    return best;
  }

  // ── Video source extraction ───────────────────────────────────────────
  function getVideoSrc(video) {
    const candidates = [];

    if (video.currentSrc) candidates.push(video.currentSrc);
    if (video.src)        candidates.push(video.src);

    for (const s of video.querySelectorAll("source[src]")) {
      if (s.src) candidates.push(s.src);
    }

    for (const attr of ["data-src", "data-video-src", "data-url", "data-hls-url"]) {
      const v = video.getAttribute(attr);
      if (v) candidates.push(v);
    }

    // Prefer a real, non-blob URL first
    const direct = candidates.find(u => u && !u.startsWith("blob:") && !u.startsWith("mediasource:"));
    if (direct) return direct;

    // Nothing usable on the element itself — the site is very likely
    // streaming via MSE/HLS (blob: src). Try to recover the real URL.
    const host = location.hostname.toLowerCase();
    if (host.includes("xvideos.com")) {
      const xv = extractXvideosUrl();
      if (xv) return xv;
    }
    if (isSpecialSite() || candidates.some(u => u && u.startsWith("blob:"))) {
      const generic = extractGenericStreamUrl();
      if (generic) return generic;
    }

    // Last resort — return the blob (won't open externally, but the
    // fallback dialog will still let the user copy the page URL).
    return candidates.find(u => u && u.startsWith("blob:")) ?? null;
  }

  // ── Button placement ──────────────────────────────────────────────────
  function positionButton(btn, video) {
    const rect = video.getBoundingClientRect();
    const scrollTop  = window.scrollY || document.documentElement.scrollTop;
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft;
    const btnWidth = btn.offsetWidth || 130;
    const leftPos = rect.left + scrollLeft + rect.width / 2 - btnWidth / 2;
    const topPos  = rect.bottom + scrollTop + 6;
    btn.style.left = Math.max(4, leftPos) + "px";
    btn.style.top  = topPos + "px";
  }

  // ── Android intent URI builder (fixed format) ────────────────────────
  // Uses the canonical Chrome/Android intent:// syntax:
  //   intent://<url-without-scheme>#Intent;scheme=<scheme>;action=...;end
  // This is far more reliable than "intent:<full-url>#Intent;...;end"
  // because query strings containing ';' or unescaped characters no
  // longer break the Intent's own field separators.
  function buildIntentUri(rawUrl, opts = {}) {
    let scheme = "https";
    let rest = rawUrl;
    try {
      const u = new URL(rawUrl);
      scheme = u.protocol.replace(":", "");
      rest = rawUrl.slice(u.protocol.length + 2); // strip "scheme://"
    } catch (_) {
      // Not a fully-qualified URL (shouldn't normally happen) — fall
      // back to the simple form.
      return `intent:${rawUrl}#Intent;action=android.intent.action.VIEW;type=video/*;end`;
    }

    const parts = [
      "action=android.intent.action.VIEW",
      `scheme=${scheme}`,
      "type=video/*",
    ];
    if (opts.package) parts.push(`package=${opts.package}`);
    parts.push(`S.title=${encodeURIComponent(document.title || "Video")}`);
    parts.push("end");

    return `intent://${rest}#Intent;${parts.join(";")};`;
  }

  // Known package names for the explicit fallback buttons
  const PLAYER_PACKAGES = {
    vlc: "org.videolan.vlc",
    mx:  "com.mxtech.videoplayer.ad",
    mpv: "is.xyz.mpv",
  };

  // ── Create the button overlay ──────────────────────────────────────────
  function createButton(video, src) {
    const id = BUTTON_ID_PREFIX + (++buttonCounter);

    const btn = document.createElement("div");
    btn.id = id;
    btn.className = OVERLAY_CLASS;
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Open in external video player");
    btn.setAttribute("tabindex", "0");

    btn.innerHTML = `
      <div class="voa-inner">
        <svg class="voa-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="1.5"/>
          <path d="M15.5 12L10 8.5V15.5L15.5 12Z" fill="currentColor"/>
          <path d="M19 5L21 3M21 3H18M21 3V6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="voa-label">Open in App</span>
      </div>
      <div class="voa-ripple"></div>
    `;

    function handleActivate(e) {
      e.preventDefault();
      e.stopPropagation();

      // Re-resolve the src at click time — some players only finalize
      // the real URL once playback has actually started.
      const freshSrc = getVideoSrc(video) || src;
      openInExternalPlayer(freshSrc, video);

      const ripple = btn.querySelector(".voa-ripple");
      ripple.classList.remove("voa-ripple-active");
      void ripple.offsetWidth;
      ripple.classList.add("voa-ripple-active");
    }

    btn.addEventListener("click", handleActivate);
    btn.addEventListener("touchend", handleActivate, { passive: false });
    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") handleActivate(e);
    });

    document.body.appendChild(btn);
    positionButton(btn, video);

    const reposition = () => positionButton(btn, video);
    window.addEventListener("scroll", reposition, { passive: true });
    window.addEventListener("resize", reposition, { passive: true });

    trackedVideos.set(video, { btn, reposition });
    return btn;
  }

  // ── Open in external player ────────────────────────────────────────────
  function openInExternalPlayer(src, video) {
    if (!src) {
      showFallbackDialog(null);
      return;
    }

    if (src.startsWith("blob:")) {
      // We know this can't be opened externally — go straight to the
      // fallback dialog instead of firing a doomed intent.
      log("Refusing to open blob: URL directly, showing fallback.");
      showFallbackDialog(src, { isBlob: true });
      return;
    }

    const intentUri = buildIntentUri(src);
    log("Opening intent:", intentUri);

    // Detect whether Firefox actually handed off to another app. If the
    // tab is still visible after OPEN_FALLBACK_MS, assume nothing opened
    // (no default set / no compatible app / malformed intent) and show
    // the manual fallback so the user isn't left stuck.
    let handed_off = false;
    const onVisibilityChange = () => {
      if (document.hidden) handed_off = true;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    location.href = intentUri;

    setTimeout(() => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (!handed_off) {
        log("No app hand-off detected — showing fallback dialog.");
        showFallbackDialog(src);
      }
    }, OPEN_FALLBACK_MS);
  }

  // ── Fallback dialog (shown only if auto-open didn't seem to work) ─────
  function showFallbackDialog(src, opts = {}) {
    const existing = document.getElementById("voa-fallback-dialog");
    if (existing) existing.remove();

    const dialog = document.createElement("div");
    dialog.id = "voa-fallback-dialog";
    dialog.className = "voa-dialog";

    const blobWarning = opts.isBlob ? `
      <div class="voa-dialog-warn">
        This video streams via a temporary link the page controls, so it can't
        be handed to another app directly. Try "Copy Video URL" and paste it
        into VLC's "Open Network Stream", or use the direct-link buttons below
        if the site provided one.
      </div>` : "";

    const vlcUri = src ? buildIntentUri(src, { package: PLAYER_PACKAGES.vlc }) : null;
    const mxUri  = src ? buildIntentUri(src, { package: PLAYER_PACKAGES.mx })  : null;

    dialog.innerHTML = `
      <div class="voa-dialog-box">
        <div class="voa-dialog-title">Open Video In…</div>
        ${blobWarning}
        ${src && !opts.isBlob ? `
        <a class="voa-dialog-btn" data-href="${vlcUri}">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M15 12L10 9v6l5-3Z" fill="currentColor"/></svg>
          VLC Player
        </a>
        <a class="voa-dialog-btn" data-href="${mxUri}">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M10 9l5 3-5 3V9Z" fill="currentColor"/></svg>
          MX Player
        </a>` : ""}
        ${src ? `<button class="voa-dialog-copy" data-src="${src}">Copy Video URL</button>` : ""}
        <button class="voa-dialog-close">Cancel</button>
      </div>
    `;

    dialog.querySelectorAll(".voa-dialog-btn").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        location.href = a.dataset.href;
        dialog.remove();
      });
    });

    dialog.querySelector(".voa-dialog-close").addEventListener("click", () => dialog.remove());
    dialog.addEventListener("click", e => { if (e.target === dialog) dialog.remove(); });

    const copyBtn = dialog.querySelector(".voa-dialog-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(copyBtn.dataset.src);
          copyBtn.textContent = "Copied!";
          setTimeout(() => dialog.remove(), 900);
        } catch (_) {
          copyBtn.textContent = "Copy failed";
        }
      });
    }

    document.body.appendChild(dialog);
  }

  // ── Process a single video element ────────────────────────────────────
  function processVideo(video) {
    if (trackedVideos.has(video)) return;
    if (!isSufficientlyVisible(video)) return;

    const src = getVideoSrc(video);
    if (!src) {
      const srcObserver = new MutationObserver(() => {
        const lazySrc = getVideoSrc(video);
        if (lazySrc) {
          srcObserver.disconnect();
          createButton(video, lazySrc);
        }
      });
      srcObserver.observe(video, { attributes: true, childList: true, subtree: true });

      const onReady = () => {
        const readySrc = getVideoSrc(video);
        if (readySrc) createButton(video, readySrc);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("playing", onReady);
      };
      video.addEventListener("canplay", onReady);
      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("playing", onReady); // catches late MSE attachment

      trackedVideos.set(video, { btn: null, reposition: null });
      return;
    }

    createButton(video, src);
  }

  // ── Scan all videos on page ─────────────────────────────────────────────
  function scanVideos() {
    document.querySelectorAll("video").forEach(processVideo);

    if (isSpecialSite()) {
      document.querySelectorAll("iframe").forEach(iframe => {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iDoc) iDoc.querySelectorAll("video").forEach(processVideo);
        } catch (_) {
          // cross-origin – cannot access
        }
      });
    }
  }

  // ── MutationObserver for dynamic pages ──────────────────────────────────
  function throttledScan() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(scanVideos, OBSERVER_THROTTLE);
  }

  const domObserver = new MutationObserver(mutations => {
    const hasVideo = mutations.some(m =>
      [...m.addedNodes].some(n =>
        n.nodeName === "VIDEO" ||
        (n.querySelectorAll && n.querySelectorAll("video").length > 0)
      )
    );
    if (hasVideo) throttledScan();
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  function init() {
    scanVideos();

    domObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("popstate", scanVideos);
    document.addEventListener("yt-navigate-finish", scanVideos);

    // A couple of delayed re-scans catch players that attach their MSE
    // source only after a user-gesture "play" or after ads finish.
    setTimeout(scanVideos, 1500);
    setTimeout(scanVideos, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
