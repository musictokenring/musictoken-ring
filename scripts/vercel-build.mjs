import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist');

const filesToCopy = [
  'index.html',
  'privacy.html',
  'terms.html',
  'profile.html',
  'auth-system.js',
  'game-engine.js'
];

const directoriesToCopy = [
  'styles',
  'src',
  'config'
];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of filesToCopy) {
  const sourceFile = path.join(rootDir, file);
  if (fs.existsSync(sourceFile)) {
    fs.copyFileSync(sourceFile, path.join(outDir, file));
  }
}

for (const directory of directoriesToCopy) {
  const sourceDirectory = path.join(rootDir, directory);
  const targetDirectory = path.join(outDir, directory);
  if (fs.existsSync(sourceDirectory)) {
    fs.cpSync(sourceDirectory, targetDirectory, { recursive: true });
  }
}

console.log('Built static output in dist/');
