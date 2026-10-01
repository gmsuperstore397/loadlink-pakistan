'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function collectJavaScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectJavaScriptFiles(full));
    else if (entry.isFile() && full.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = collectJavaScriptFiles(ROOT);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\\n`);
  }
}

if (failed) {
  process.exit(1);
}

// Prevent import-time checks from depending on production secrets or a real database.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'loadlink-preflight-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://preflight:preflight@127.0.0.1:5432/preflight';
process.env.PORT = process.env.PORT || '0';

try {
  require(path.join(ROOT, 'server.js'));
} catch (error) {
  console.error('SERVER_IMPORT_CHECK_FAILED:', error && error.stack ? error.stack : error);
  process.exit(1);
}

console.log(`BACKEND_PREFLIGHT_OK: ${files.length} JavaScript files syntax-checked and server.js imported successfully`);
