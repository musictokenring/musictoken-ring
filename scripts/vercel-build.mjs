import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_DIRS = ['public', 'dist'].map((dir) => path.join(ROOT, dir));

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

for (const outDir of OUT_DIRS) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  for (const file of files) {
    const src = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, file));
    }
  }

  for (const dir of dirs) {
    const src = path.join(ROOT, dir);
    const dst = path.join(outDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dst, { recursive: true });
    }
  }
}

console.log('Built static output in public/ and dist/');
