import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SOURCE_DIR = 'src';
const MANIFEST_PATH = 'src/manifest.json';
const SCANNED_EXTENSIONS = ['.js', '.mjs', '.html', '.css'];

// Nothing in this extension may reach the network or read device sensors.
const FORBIDDEN_PATTERNS = [
  { pattern: /\bfetch\s*\(/, reason: 'network request' },
  { pattern: /\bXMLHttpRequest\b/, reason: 'network request' },
  { pattern: /\bsendBeacon\b/, reason: 'telemetry beacon' },
  { pattern: /\bWebSocket\b/, reason: 'network connection' },
  { pattern: /\bEventSource\b/, reason: 'network connection' },
  { pattern: /\bimportScripts\b/, reason: 'remote code' },
  { pattern: /\beval\s*\(/, reason: 'dynamic code execution' },
  { pattern: /new\s+Function\s*\(/, reason: 'dynamic code execution' },
  { pattern: /\bstorage\.sync\b/, reason: 'account-synced storage' },
  { pattern: /\bnavigator\.geolocation\b/, reason: 'device sensor' },
  { pattern: /\bnavigator\.mediaDevices\b/, reason: 'device sensor' },
  { pattern: /\bnavigator\.connection\b/, reason: 'device fingerprinting' },
  { pattern: /\bdocument\.cookie\b/, reason: 'cookie access' },
  { pattern: /\b(gtag|mixpanel|amplitude|posthog)\b/, reason: 'analytics' },
  { pattern: /\b(telemetry|analytics)\s*[:=(]/i, reason: 'analytics' },
  // www.w3.org is the XML namespace identifier for SVG, never a request.
  {
    pattern: /https?:\/\/(?!github\.com\/|www\.w3\.org\/)/,
    reason: 'remote URL',
  },
];

const ALLOWED_PERMISSIONS = ['storage', 'activeTab'];

const collectFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(path);
      files.push(...nested);
    } else if (SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) {
      files.push(path);
    }
  }
  return files;
};

const scanFile = async (path) => {
  const content = await readFile(path, 'utf8');
  const lines = content.split('\n');
  const violations = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    for (const rule of FORBIDDEN_PATTERNS) {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relative('.', path),
          line: index + 1,
          reason: rule.reason,
          text: line.trim(),
        });
      }
    }
  }
  return violations;
};

const checkManifest = async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const violations = [];
  const permissions = manifest.permissions ?? [];
  for (const permission of permissions) {
    if (!ALLOWED_PERMISSIONS.includes(permission)) {
      violations.push({
        file: MANIFEST_PATH,
        line: 0,
        reason: 'permission outside the allowlist',
        text: permission,
      });
    }
  }
  const hostPermissions = manifest.host_permissions ?? [];
  for (const host of hostPermissions) {
    violations.push({
      file: MANIFEST_PATH,
      line: 0,
      reason: 'host permission grants network access',
      text: host,
    });
  }
  return violations;
};

const run = async () => {
  const files = await collectFiles(SOURCE_DIR);
  const results = await Promise.all(files.map(scanFile));
  const violations = results.flat().concat(await checkManifest());

  if (violations.length > 0) {
    console.error('Privacy check failed:\n');
    for (const violation of violations) {
      const place = `${violation.file}:${violation.line}`;
      console.error(`  ${place}  ${violation.reason}\n    ${violation.text}`);
    }
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }

  console.log(`Privacy check passed: ${files.length} files clean.`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
