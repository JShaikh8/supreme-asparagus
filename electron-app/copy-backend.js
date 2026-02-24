// copy-backend.js
// Copies backend folder into electron-app for packaging
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'backend');
const dest = path.join(__dirname, 'backend');

// Remove existing backend folder if present
if (fs.existsSync(dest)) {
  console.log('Removing old backend folder...');
  fs.rmSync(dest, { recursive: true, force: true });
}

// Copy backend folder, excluding node_modules
console.log('Copying backend folder...');
fs.cpSync(src, dest, {
  recursive: true,
  filter: (source) => !source.includes('node_modules')
});

// Extra safety: Ensure no node_modules in destination
const destNodeModules = path.join(dest, 'node_modules');
if (fs.existsSync(destNodeModules)) {
  console.log('Removing any node_modules that got copied...');
  fs.rmSync(destNodeModules, { recursive: true, force: true });
}

// Copy .env file if it exists
const srcEnv = path.join(src, '.env');
const destEnv = path.join(dest, '.env');
if (fs.existsSync(srcEnv)) {
  console.log('✅ Copying .env file with credentials...');
  fs.copyFileSync(srcEnv, destEnv);
} else {
  console.warn('⚠️  No .env file found in backend. RotoWire authentication will not work.');
  console.warn('   Create backend/.env with ROTOWIRE_USERNAME and ROTOWIRE_PASSWORD');
}

console.log('✅ Backend folder copied successfully');
