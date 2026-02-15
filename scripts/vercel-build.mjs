import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PRIMARY_OUT = 'public';
const outputs = [PRIMARY_OUT];

if (process.env.ALSO_BUILD_DIST === '1') {
  outputs.push('dist');
}

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

for (const outName of outputs) {
  const outDir = path.join(ROOT, outName);

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

console.log(`Built static output in ${outputs.join(' and ')}/`);
