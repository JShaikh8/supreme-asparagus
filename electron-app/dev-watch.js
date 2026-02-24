// electron-app/dev-watch.js
// Watches backend folder and auto-copies changes during development

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const BACKEND_SOURCE = path.join(__dirname, '..', 'backend');
const WATCH_DELAY = 1000; // Wait 1 second after change before copying
let copyTimeout = null;

console.log('🔍 Starting development backend watcher...\n');

// Initial copy
console.log('📋 Initial backend copy...');
copyBackend();

// Watch for changes
console.log(`👀 Watching ${BACKEND_SOURCE} for changes...`);
console.log('💡 Backend changes will auto-copy to electron-app/backend\n');

fs.watch(BACKEND_SOURCE, { recursive: true }, (eventType, filename) => {
  // Ignore node_modules changes
  if (filename && filename.includes('node_modules')) {
    return;
  }

  // Debounce: wait for changes to settle before copying
  if (copyTimeout) {
    clearTimeout(copyTimeout);
  }

  copyTimeout = setTimeout(() => {
    console.log(`📝 Change detected: ${filename || 'unknown file'}`);
    copyBackend();
  }, WATCH_DELAY);
});

function copyBackend() {
  exec('node copy-backend.js', (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Error copying backend:', error.message);
      return;
    }
    if (stderr) {
      console.error('⚠️  Backend copy warning:', stderr);
    }
    console.log('✅ Backend copied successfully');
    console.log('👀 Watching for more changes...\n');
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Stopping backend watcher...');
  process.exit(0);
});

console.log('ℹ️  Press Ctrl+C to stop watching\n');
