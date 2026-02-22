#!/usr/bin/env node
const fs = require('fs');
const { execSync } = require('child_process');

const runtimeFiles = [
  'index.html',
  'app.js',
  'top-streams-fallback.js',
  'src/app.js',
  'src/top-streams-fallback.js',
  'styles/main.css'
];

const blockedRuntimePatterns = [
  /codex\/find-reason/gi,
  /feature\/wall-street-v2/gi,
  /codex\/fix-unexpected-token-for-error/gi,
  /^(<<<<<<<|=======|>>>>>>>)/gm
];

let failed = false;

for (const file of runtimeFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const re of blockedRuntimePatterns) {
    if (re.test(text)) {
      console.error('BLOCKED_PATTERN', file, re);
      failed = true;
    }
  }
}

// Repository-wide check for unresolved conflict markers.
try {
  const trackedFiles = execSync('git ls-files', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((path) => !path.startsWith('node_modules/'));

  for (const file of trackedFiles) {
    const text = fs.readFileSync(file, 'utf8');
    if (/^(<<<<<<<|=======|>>>>>>>)/m.test(text)) {
      console.error('UNRESOLVED_CONFLICT_MARKER', file);
      failed = true;
    }
  }
} catch (error) {
  console.error('GIT_SCAN_FAILED', error.message);
  failed = true;
}

const indexHtml = fs.readFileSync('index.html', 'utf8');
const appRefs = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']*app\.js\?v=[^"']+)["'][^>]*>/gi)];
const topRefs = [...indexHtml.matchAll(/<script[^>]+src=["']([^"']*top-streams-fallback\.js\?v=[^"']+)["'][^>]*>/gi)];

if (appRefs.length !== 1) {
  console.error('INVALID_SCRIPT_REF_COUNT', 'app.js', appRefs.length);
  failed = true;
}

if (topRefs.length !== 1) {
  console.error('INVALID_SCRIPT_REF_COUNT', 'top-streams-fallback.js', topRefs.length);
  failed = true;
}

if (/src\/app\.js\?v=/i.test(indexHtml) || /src\/top-streams-fallback\.js\?v=/i.test(indexHtml)) {
  console.error('INVALID_SRC_RUNTIME_INCLUDE', 'Legacy /src runtime include found in index.html');
  failed = true;
}

const buildMeta = indexHtml.match(/<meta\s+name=["']mtr-build["']\s+content=["']([^"']+)["']/i)?.[1] || '';
const buildJs = indexHtml.match(/window\.MTR_BUILD_ID\s*=\s*['"]([^'"]+)['"]/i)?.[1] || '';
const appVersion = appRefs[0]?.[1]?.match(/\?v=([^"']+)/)?.[1] || '';
const topVersion = topRefs[0]?.[1]?.match(/\?v=([^"']+)/)?.[1] || '';

if (!buildMeta || !buildJs || !appVersion || !topVersion) {
  console.error('BUILD_METADATA_INCOMPLETE', { buildMeta, buildJs, appVersion, topVersion });
  failed = true;
}

if (buildMeta && buildJs && buildMeta !== buildJs) {
  console.error('BUILD_ID_MISMATCH', 'meta', buildMeta, 'js', buildJs);
  failed = true;
}

if (buildJs && appVersion && buildJs !== appVersion) {
  console.error('BUILD_ID_MISMATCH', 'js', buildJs, 'appVersion', appVersion);
  failed = true;
}

if (buildJs && topVersion && buildJs !== topVersion) {
  console.error('BUILD_ID_MISMATCH', 'js', buildJs, 'topVersion', topVersion);
  failed = true;
}

if (failed) process.exit(1);
console.log('runtime-integrity-ok');
