import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

// Replace symlinks in standalone with real copies so electron-builder can package them
function resolveStandaloneSymlinks() {
  // Try both the nested path and the flat path
  const possiblePaths = [
    '.next/standalone/.next/node_modules',
    '.next/standalone/Developer/AI_App/CodePilot/.next/node_modules'
  ];

  let standaloneModules = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      standaloneModules = p;
      break;
    }
  }

  if (!standaloneModules) {
    console.log('No standalone .next/node_modules found to resolve symlinks');
    return;
  }

  console.log(`Resolving symlinks in: ${standaloneModules}`);

  const entries = fs.readdirSync(standaloneModules);
  for (const entry of entries) {
    const fullPath = path.join(standaloneModules, entry);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(fullPath);
      const resolved = path.resolve(standaloneModules, target);
      if (fs.existsSync(resolved)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        fs.cpSync(resolved, fullPath, { recursive: true });
        console.log(`Resolved symlink: ${entry} -> ${target}`);
      } else {
        console.warn(`Symlink target not found: ${entry} -> ${resolved}`);
      }
    }
  }
}

// Flatten Next.js standalone output structure
// Next.js includes the full project path in standalone output, but we need files at the root
function flattenStandaloneOutput() {
  const standaloneDir = '.next/standalone';
  if (!fs.existsSync(standaloneDir)) {
    console.warn('Warning: .next/standalone directory not found');
    return;
  }

  // Find the nested project directory (e.g., Developer/AI_App/CodePilot/)
  const entries = fs.readdirSync(standaloneDir);
  let nestedPath = null;

  // Look for the first directory that's not node_modules or .next
  for (const entry of entries) {
    const fullPath = path.join(standaloneDir, entry);
    if (fs.statSync(fullPath).isDirectory() && entry !== 'node_modules' && entry !== '.next') {
      // This might be the start of the nested path, traverse down
      let current = fullPath;
      while (true) {
        const subEntries = fs.readdirSync(current);
        const subDirs = subEntries.filter(e => {
          const p = path.join(current, e);
          return fs.statSync(p).isDirectory() && e !== 'node_modules' && e !== '.next';
        });

        // If we find server.js at this level, we've found the nested project root
        if (subEntries.includes('server.js')) {
          nestedPath = current;
          break;
        }

        // If there's exactly one subdirectory, keep traversing
        if (subDirs.length === 1) {
          current = path.join(current, subDirs[0]);
        } else {
          break;
        }
      }

      if (nestedPath) break;
    }
  }

  if (!nestedPath) {
    console.log('Standalone output is already flat or server.js not found');
    return;
  }

  console.log(`Found nested project at: ${nestedPath}`);
  console.log('Flattening standalone output...');

  // Only move essential Next.js files, not the entire project
  const essentialFiles = [
    'server.js',
    'package.json',
    '.next',
    'node_modules',
    'public'
  ];

  const nestedEntries = fs.readdirSync(nestedPath);
  for (const entry of nestedEntries) {
    // Only move essential files
    if (!essentialFiles.includes(entry)) {
      continue;
    }

    const src = path.join(nestedPath, entry);
    const dest = path.join(standaloneDir, entry);

    // Special handling for node_modules: merge instead of skip
    if (entry === 'node_modules') {
      if (fs.existsSync(dest)) {
        console.log(`Merging ${entry} from nested path to root`);
        // Copy all modules from nested to root, overwriting if needed
        const nestedModules = fs.readdirSync(src);
        for (const mod of nestedModules) {
          const modSrc = path.join(src, mod);
          const modDest = path.join(dest, mod);
          if (!fs.existsSync(modDest)) {
            console.log(`  Copying module: ${mod}`);
            fs.cpSync(modSrc, modDest, { recursive: true });
          }
        }
        continue;
      }
    }

    // Skip if already exists at root (except node_modules, handled above)
    if (fs.existsSync(dest)) {
      console.log(`Skipping ${entry} (already exists at root)`);
      continue;
    }

    console.log(`Moving ${entry} to root`);
    fs.renameSync(src, dest);
  }

  // Clean up the now-empty nested directory structure
  const topLevelNested = path.join(standaloneDir, entries.find(e => {
    const p = path.join(standaloneDir, e);
    return fs.existsSync(p) && fs.statSync(p).isDirectory() && e !== 'node_modules' && e !== '.next';
  }));

  if (topLevelNested && fs.existsSync(topLevelNested)) {
    console.log(`Removing empty nested directory: ${topLevelNested}`);
    fs.rmSync(topLevelNested, { recursive: true, force: true });
  }

  console.log('Standalone output flattened successfully');
}

async function buildElectron() {
  const shared = {
    bundle: true,
    platform: 'node',
    target: 'node18',
    external: ['electron'],
    sourcemap: true,
    minify: false,
  };

  await build({
    ...shared,
    entryPoints: ['electron/main.ts'],
    outfile: 'dist-electron/main.js',
  });

  await build({
    ...shared,
    entryPoints: ['electron/preload.ts'],
    outfile: 'dist-electron/preload.js',
  });

  console.log('Electron build complete');

  // Fix standalone symlinks BEFORE flattening (symlinks point to original paths)
  resolveStandaloneSymlinks();

  // Flatten Next.js standalone output structure
  flattenStandaloneOutput();
}

buildElectron().catch((err) => {
  console.error(err);
  process.exit(1);
});
