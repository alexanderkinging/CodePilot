/**
 * electron-builder afterPack hook.
 *
 * Since we use system Node.js to run the server (to avoid Dock icon),
 * we need to use the system Node.js compiled version of better_sqlite3.node
 * instead of the Electron-compiled version.
 */
const fs = require('fs');
const path = require('path');

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;

  // Source: Use the system Node.js compiled version from /tmp
  // This was compiled for Node.js v22 (MODULE_VERSION 127)
  const rebuiltSource = path.join(
    '/tmp',
    'better-sqlite3-node22',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  );

  if (!fs.existsSync(rebuiltSource)) {
    console.error('[afterPack] ❌ FATAL: Pre-built better-sqlite3 binary not found at', rebuiltSource);
    console.error('[afterPack] The application will fail to start without this binary.');
    console.error('[afterPack]');
    console.error('[afterPack] Please run the following command to build the binary:');
    console.error('[afterPack]   npm run build:sqlite3');
    console.error('[afterPack]');
    console.error('[afterPack] Or if you have already built it, ensure the file exists at:');
    console.error('[afterPack]  ', rebuiltSource);
    process.exit(1); // Stop the build process
  }

  // Verify binary size
  const stats = fs.statSync(rebuiltSource);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`[afterPack] Found pre-built binary (${sizeMB} MB)`);

  if (stats.size < 100000) { // Less than 100KB is suspicious
    console.error('[afterPack] ❌ FATAL: Binary size is suspiciously small:', sizeMB, 'MB');
    console.error('[afterPack] Expected size: ~1.5-2.5 MB');
    console.error('[afterPack] The binary may be corrupted. Please rebuild:');
    console.error('[afterPack]   rm -rf /tmp/better-sqlite3-node22');
    console.error('[afterPack]   npm run build:sqlite3');
    process.exit(1);
  }

  // Find all better_sqlite3.node files inside the standalone resources
  const resourcesDir = path.join(appOutDir, 'CodePilot.app', 'Contents', 'Resources');
  // On macOS the structure is: <appOutDir>/CodePilot.app/Contents/Resources/standalone/...
  // But appOutDir might already point to the .app parent, so try both
  const searchRoots = [
    path.join(resourcesDir, 'standalone'),
    path.join(appOutDir, 'Contents', 'Resources', 'standalone'),
  ];

  let replaced = 0;

  function walkAndReplace(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkAndReplace(fullPath);
      } else if (entry.name === 'better_sqlite3.node') {
        console.log(`[afterPack] Replacing ${fullPath}`);
        fs.copyFileSync(rebuiltSource, fullPath);
        replaced++;
      }
    }
  }

  for (const root of searchRoots) {
    walkAndReplace(root);
  }

  if (replaced > 0) {
    console.log(`[afterPack] Replaced ${replaced} better_sqlite3.node file(s) with system Node.js v22 compatible build`);
  } else {
    console.warn('[afterPack] No better_sqlite3.node files found in standalone resources');
    // List the resources dir for debugging
    for (const root of searchRoots) {
      if (fs.existsSync(root)) {
        console.log(`[afterPack] Contents of ${root}:`, fs.readdirSync(root).slice(0, 20));
      }
    }
  }
};
