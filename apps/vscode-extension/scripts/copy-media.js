const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const sourceDir = path.join(rootDir, 'media');
const distDir = path.join(rootDir, 'dist');
const targetDir = path.join(distDir, 'media');

if (!fs.existsSync(sourceDir)) {
  console.warn('PromptVC: media directory not found, skipping copy.');
  process.exit(0);
}

fs.mkdirSync(distDir, { recursive: true });
fs.rmSync(targetDir, { recursive: true, force: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });
