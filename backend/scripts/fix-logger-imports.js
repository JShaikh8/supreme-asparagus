// Script to add missing logger imports to files that use logger but don't import it
const fs = require('fs');
const path = require('path');

function findFilesRecursive(dir, pattern) {
  const files = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules') {
      files.push(...findFilesRecursive(fullPath, pattern));
    } else if (item.isFile() && pattern.test(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

const backendDir = path.join(__dirname, '..');
const jsFiles = findFilesRecursive(backendDir, /\.js$/);
const needsLoggerImport = [];

for (const file of jsFiles) {
  // Skip the logger file itself and this script
  if (file.includes('logger.js') || file.includes('fix-logger-imports.js')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const usesLogger = /logger\.(info|warn|error|debug|http|verbose|silly|db|security|success|fail|api|perf|logError|startupBanner|requestLogger)\s*\(/.test(content);
  // Match various patterns: './logger', '../utils/logger', '../../utils/logger', './utils/logger'
  const hasLoggerImport = /const\s+logger\s*=\s*require\s*\(['"](\.\/)?(\.\.\/)*(?:utils\/)?logger['"]\)/.test(content);

  if (usesLogger && !hasLoggerImport) {
    needsLoggerImport.push(file);
  }
}

console.log('Files needing logger import:');
needsLoggerImport.forEach(f => console.log(f));
console.log('');
console.log('Total:', needsLoggerImport.length, 'files');

// Remove duplicate logger imports
if (process.argv.includes('--dedup')) {
  console.log('\nRemoving duplicate logger imports...');

  for (const file of jsFiles) {
    if (file.includes('logger.js') || file.includes('fix-logger-imports.js')) continue;

    const content = fs.readFileSync(file, 'utf8');
    const loggerImportPattern = /const\s+logger\s*=\s*require\s*\(['"](\.\/)?(\.\.\/)*(?:utils\/)?logger['"]\);?\n?/g;
    const matches = content.match(loggerImportPattern);

    if (matches && matches.length > 1) {
      // Keep only the first one
      let newContent = content;
      let first = true;
      newContent = content.replace(loggerImportPattern, (match) => {
        if (first) {
          first = false;
          return match;
        }
        return '';
      });

      if (newContent !== content) {
        fs.writeFileSync(file, newContent);
        console.log(`Removed ${matches.length - 1} duplicate(s) from: ${file}`);
      }
    }
  }
}

// Fix the files
if (process.argv.includes('--fix')) {
  console.log('\nFixing files...');

  for (const file of needsLoggerImport) {
    const content = fs.readFileSync(file, 'utf8');

    // Calculate relative path from file to utils/logger
    const fileDir = path.dirname(file);
    const loggerPath = path.join(backendDir, 'utils', 'logger');
    let relativePath = path.relative(fileDir, loggerPath).replace(/\\/g, '/');
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }

    const loggerImport = `const logger = require('${relativePath}');\n`;

    // Find the last require statement and insert after it
    const lines = content.split('\n');
    let lastRequireIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && !lines[i].trim().startsWith('//')) {
        lastRequireIndex = i;
      }
      // Stop searching after we hit class definition or function
      if (/^(class|function|async function|module\.exports)/.test(lines[i].trim())) {
        break;
      }
    }

    if (lastRequireIndex >= 0) {
      // Insert after the last require
      lines.splice(lastRequireIndex + 1, 0, loggerImport.trim());
    } else {
      // No requires found, add at the top after any comments
      let insertIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].trim().startsWith('//') && lines[i].trim() !== '') {
          insertIndex = i;
          break;
        }
      }
      lines.splice(insertIndex, 0, loggerImport.trim());
    }

    fs.writeFileSync(file, lines.join('\n'));
    console.log('Fixed:', file);
  }
}
