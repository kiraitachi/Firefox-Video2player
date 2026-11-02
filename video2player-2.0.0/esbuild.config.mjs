import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';

const SOURCE_DIR = 'src';
const OUTPUT_DIR = 'dist';
const TARGET = 'firefox115';

const staticAssets = [
  { from: `${SOURCE_DIR}/manifest.json`, to: `${OUTPUT_DIR}/manifest.json` },
  { from: `${SOURCE_DIR}/icons`, to: `${OUTPUT_DIR}/icons` },
  { from: `${SOURCE_DIR}/popup/popup.html`, to: `${OUTPUT_DIR}/popup.html` },
  { from: `${SOURCE_DIR}/popup/popup.css`, to: `${OUTPUT_DIR}/popup.css` },
];

const bundles = [
  { entry: `${SOURCE_DIR}/content/index.js`, out: `${OUTPUT_DIR}/content.js` },
  { entry: `${SOURCE_DIR}/popup/popup.js`, out: `${OUTPUT_DIR}/popup.js` },
];

// Shipped unminified on purpose: reviewers and users read exactly what runs.
const bundleOptions = {
  bundle: true,
  format: 'iife',
  target: TARGET,
  platform: 'browser',
  charset: 'utf8',
  legalComments: 'inline',
  minify: false,
  sourcemap: false,
  loader: { '.css': 'text' },
};

// Files are overwritten in place rather than wiping the directory: removing
// and recreating dist/ detaches the file watcher `web-ext run` relies on.
const buildAll = async () => {
  if (process.argv.includes('--clean')) {
    await rm(OUTPUT_DIR, { recursive: true, force: true });
  }
  await mkdir(OUTPUT_DIR, { recursive: true });

  for (const asset of staticAssets) {
    await cp(asset.from, asset.to, { recursive: true });
  }

  for (const bundle of bundles) {
    await build({
      ...bundleOptions,
      entryPoints: [bundle.entry],
      outfile: bundle.out,
    });
  }

  console.log(`Built ${bundles.length} bundles into ${OUTPUT_DIR}/`);
};

buildAll().catch((error) => {
  console.error(error);
  process.exit(1);
});
