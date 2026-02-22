#!/usr/bin/env node
const fs = require('fs');

const filesToScan = [
  'index.html',
  'app.js',
  'top-streams-fallback.js',
  'src/app.js',
  'src/top-streams-fallback.js',
  'styles/main.css'
];

const blockedPatterns = [
  /codex\/find-reason/gi,
  /feature\/wall-street-v2/gi,
  /codex\/fix-unexpected-token-for-error/gi,
  /^(<<<<<<<|=======|>>>>>>>)/gm
];

let failed = false;

for (const file of filesToScan) {
  const text = fs.readFileSync(file, 'utf8');
  for (const re of blockedPatterns) {
    if (re.test(text)) {
      console.error('BLOCKED_PATTERN', file, re);
      failed = true;
    }
  }
}

const indexHtml = fs.readFileSync('index.html', 'utf8');
const appRefs = [...indexHtml.matchAll(/<script[^>]+src=["'][^"']*app\.js\?v=[^"']+["'][^>]*>/gi)];
const topRefs = [...indexHtml.matchAll(/<script[^>]+src=["'][^"']*top-streams-fallback\.js\?v=[^"']+["'][^>]*>/gi)];

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

if (failed) process.exit(1);
console.log('runtime-integrity-ok');
