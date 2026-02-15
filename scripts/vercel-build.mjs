import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_DIRS = ['public', 'dist'];

const files = [
  'index.html',
  'privacy.html',
  'terms.html',
  'profile.html',
  'auth-system.js',
  'game-engine.js'
];

const dirs = [
  'styles',
  'src',
  'config'
];

for (const outName of OUT_DIRS) {
  const OUT = path.join(ROOT, outName);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  for (const file of files) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(OUT, file));
    }
  }

  for (const dir of dirs) {
    const src = path.join(ROOT, dir);
    const dst = path.join(OUT, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

console.log('Built static output in public/ and dist/');
