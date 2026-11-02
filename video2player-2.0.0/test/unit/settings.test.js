import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULTS, normalize } from '../../src/lib/settings.js';

test('a fresh profile starts with no colour treatment at all', () => {
  const settings = normalize(null);
  assert.equal(settings.brightness, 1);
  assert.equal(settings.contrast, 1);
  assert.equal(settings.saturate, 1);
  assert.equal(settings.warmth, 0);
});

test('a stored value outside its range falls back to neutral', () => {
  const settings = normalize({ contrast: 1.3e3, brightness: -4 });
  assert.equal(settings.contrast, DEFAULTS.contrast);
  assert.equal(settings.brightness, DEFAULTS.brightness);
});

test('a stored value of the wrong type falls back to neutral', () => {
  const settings = normalize({ saturate: '1.5', warmth: null });
  assert.equal(settings.saturate, DEFAULTS.saturate);
  assert.equal(settings.warmth, DEFAULTS.warmth);
});

test('a value the user really chose is kept', () => {
  const settings = normalize({
    schemaVersion: 2,
    contrast: 1.15,
    warmth: 0.27,
  });
  assert.equal(settings.contrast, 1.15);
  assert.equal(settings.warmth, 0.27);
});

test('unknown keys never reach the running state', () => {
  const settings = normalize({ contrast: 1.1, somethingElse: true });
  assert.equal(settings.somethingElse, undefined);
  assert.deepEqual(Object.keys(settings).sort(), Object.keys(DEFAULTS).sort());
});

test('an upgrade from schema 1 drops the colour it was left on', () => {
  const settings = normalize({
    schemaVersion: 1,
    contrast: 1.3,
    saturate: 0,
    warmth: 0.36,
    subtitleScale: 1.25,
    disabledHosts: ['example.com'],
  });
  assert.equal(settings.contrast, 1);
  assert.equal(settings.saturate, 1);
  assert.equal(settings.warmth, 0);
  // Everything that is not colour survives the upgrade.
  assert.equal(settings.subtitleScale, 1.25);
  assert.deepEqual(settings.disabledHosts, ['example.com']);
  assert.equal(settings.schemaVersion, 2);
});

test('colour set on the current schema is kept', () => {
  const settings = normalize({ schemaVersion: 2, saturate: 0, contrast: 1.2 });
  assert.equal(settings.saturate, 0);
  assert.equal(settings.contrast, 1.2);
});
