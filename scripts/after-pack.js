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
    console.warn('[afterPack] Rebuilt better_sqlite3.node not found at', rebuiltSource);
    return;
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
