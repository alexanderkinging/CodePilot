/**
 * Build better-sqlite3 for system Node.js v22
 * This script should be run before electron:pack:mac
 *
 * Purpose: Create a pre-built better-sqlite3 binary compatible with system Node.js
 * to avoid macOS Dock icon duplication issue when using Electron's Node.js.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const targetDir = '/tmp/better-sqlite3-node22';
const targetBinary = path.join(targetDir, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');

console.log('[build-sqlite3] Starting better-sqlite3 build process...');
console.log('[build-sqlite3] Target directory:', targetDir);

// Check if binary already exists
if (fs.existsSync(targetBinary)) {
  const stats = fs.statSync(targetBinary);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  const mtime = stats.mtime.toISOString();

  console.log('[build-sqlite3] ✅ Binary already exists at', targetBinary);
  console.log('[build-sqlite3]    Size:', sizeMB, 'MB');
  console.log('[build-sqlite3]    Modified:', mtime);
  console.log('[build-sqlite3] Skipping build. Delete the directory to rebuild.');
  console.log('[build-sqlite3] To rebuild: rm -rf', targetDir);
  process.exit(0);
}

console.log('[build-sqlite3] Binary not found. Building from source...');

// Check Node.js version
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
console.log('[build-sqlite3] Current Node.js version:', nodeVersion);

if (nodeMajor < 18) {
  console.error('[build-sqlite3] ❌ FATAL: Node.js version too old.');
  console.error('[build-sqlite3]    Current:', nodeVersion);
  console.error('[build-sqlite3]    Required: v18 or higher (v22 recommended)');
  process.exit(1);
}

if (nodeMajor !== 22) {
  console.warn('[build-sqlite3] ⚠️  WARNING: Node.js version is not v22.');
  console.warn('[build-sqlite3]    Current:', nodeVersion);
  console.warn('[build-sqlite3]    Recommended: v22 (for MODULE_VERSION 127)');
  console.warn('[build-sqlite3]    The binary may not be compatible with the expected ABI.');
}

// Create temp directory
console.log('[build-sqlite3] Creating temporary directory...');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

// Read better-sqlite3 version from main package.json
const mainPackageJson = require('../package.json');
const betterSqlite3Version = mainPackageJson.dependencies['better-sqlite3'];

console.log('[build-sqlite3] Using better-sqlite3 version:', betterSqlite3Version);

// Initialize package.json
const packageJson = {
  name: 'better-sqlite3-node22',
  version: '1.0.0',
  description: 'Pre-built better-sqlite3 for system Node.js',
  dependencies: {
    'better-sqlite3': betterSqlite3Version
  }
};

const packageJsonPath = path.join(targetDir, 'package.json');
console.log('[build-sqlite3] Writing package.json...');
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

// Install and build
console.log('[build-sqlite3] Installing better-sqlite3 and building from source...');
console.log('[build-sqlite3] This may take a few minutes...');

try {
  execSync('npm install --build-from-source', {
    cwd: targetDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_build_from_source: 'true'
    }
  });

  // Verify binary was created
  if (!fs.existsSync(targetBinary)) {
    console.error('[build-sqlite3] ❌ FATAL: Binary was not created at', targetBinary);
    console.error('[build-sqlite3] The build process completed but the binary is missing.');
    console.error('[build-sqlite3] This may indicate a build failure.');
    process.exit(1);
  }

  // Check binary size
  const stats = fs.statSync(targetBinary);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  if (stats.size < 100000) { // Less than 100KB is suspicious
    console.error('[build-sqlite3] ❌ FATAL: Binary size is suspiciously small:', sizeMB, 'MB');
    console.error('[build-sqlite3] Expected size: ~1.5-2.5 MB');
    console.error('[build-sqlite3] The binary may be corrupted or incomplete.');
    process.exit(1);
  }

  console.log('[build-sqlite3] ✅ Successfully built better-sqlite3 binary');
  console.log('[build-sqlite3]    Location:', targetBinary);
  console.log('[build-sqlite3]    Size:', sizeMB, 'MB');
  console.log('[build-sqlite3]    Node.js version:', nodeVersion);
  console.log('[build-sqlite3]    MODULE_VERSION:', process.versions.modules);
  console.log('[build-sqlite3] Build complete!');

} catch (err) {
  console.error('[build-sqlite3] ❌ FATAL: Failed to build better-sqlite3');
  console.error('[build-sqlite3] Error:', err.message);
  console.error('[build-sqlite3]');
  console.error('[build-sqlite3] Troubleshooting:');
  console.error('[build-sqlite3] 1. Ensure you have build tools installed:');
  console.error('[build-sqlite3]    - macOS: xcode-select --install');
  console.error('[build-sqlite3]    - Linux: apt-get install build-essential');
  console.error('[build-sqlite3]    - Windows: npm install --global windows-build-tools');
  console.error('[build-sqlite3] 2. Ensure Python is installed (required by node-gyp)');
  console.error('[build-sqlite3] 3. Try cleaning and rebuilding:');
  console.error('[build-sqlite3]    rm -rf', targetDir);
  console.error('[build-sqlite3]    npm run build:sqlite3');
  process.exit(1);
}
