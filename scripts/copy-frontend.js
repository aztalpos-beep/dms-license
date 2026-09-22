const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const source = path.join(root, 'frontend', 'dist');
const destination = path.join(root, 'backend', 'public');

if (!fs.existsSync(source)) {
  console.error('Frontend dist folder not found:', source);
  process.exit(1);
}

fs.rmSync(destination, {
  recursive: true,
  force: true,
});

fs.mkdirSync(destination, {
  recursive: true,
});

fs.cpSync(source, destination, {
  recursive: true,
});

console.log('Frontend copied successfully.');
console.log('From:', source);
console.log('To:', destination);