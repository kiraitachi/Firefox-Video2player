# Notice

Video2Player 2.x is a derivative work of **Nocturne Player 0.9.1**
(<https://github.com/kvachikk/nocturne-player>), Copyright © Vlad Pohorilets,
distributed under the Mozilla Public License 2.0. The original source is
available at that address, and this project is distributed under the same
license (see `LICENSE`).

## What was changed from Nocturne Player 0.9.1

- **`src/content/controls/badge.js`, `badge.css`** — replaced. Nocturne's round
  fullscreen button is now the Video2Player "Open Player" pill (gradient
  capsule, play-and-arrow mark, slide-in, ripple, placed under the video).
  The module keeps the same interface (`show`, `hide`, `refresh`,
  `onActivate`) so the rest of the player is unchanged.
- **`src/manifest.json`** — new name, id, version, author, icons and links.
- **`src/icons/`** — the Nocturne SVG icon replaced with Video2Player's PNG
  icons.
- **`src/popup/`** — rebranded title, logo and source link.
- **Branding strings** — storage keys, console prefixes, DOM data attributes
  and comments renamed from "nocturne" to "video2player".
- **`package.json`** — reduced to the build, test, lint and packaging scripts.
  Upstream's commit hooks, CI workflows and linter configuration were not
  carried over.

All other source files are unchanged from upstream.
