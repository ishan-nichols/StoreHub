#!/usr/bin/env node
/**
 * build-electron.mjs
 *
 * Stages a clean Electron app directory and invokes electron-builder.
 * This sidesteps the pnpm monorepo peer-dep noise that electron-builder's
 * internal npm scanner produces when run directly from the workspace root.
 *
 * Usage:
 *   node scripts/build-electron.mjs [--publish]
 */

import { execSync }           from 'child_process';
import { cpSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import path                   from 'path';
import { fileURLToPath }      from 'url';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const ROOT        = path.resolve(__dirname, '..');
const STAGE       = path.join(ROOT, 'dist', 'electron-stage');
const DIST_PUBLIC = path.join(ROOT, 'dist', 'public');
const ELECTRON    = path.join(ROOT, 'electron');
const ESBUILD     = path.resolve(ROOT, '../../node_modules/.pnpm/esbuild@0.27.3/node_modules/esbuild/bin/esbuild');

const publish = process.argv.includes('--publish');

// ── 1. Bundle main process ─────────────────────────────────────────────────
console.log('[1/4] Bundling Electron main process…');
execSync(
  `${ESBUILD} electron/main.cjs --bundle --platform=node --target=node20 --external:electron --format=cjs --outfile=electron/main.bundle.cjs`,
  { cwd: ROOT, stdio: 'inherit' },
);

// ── 2. Stage clean app directory ───────────────────────────────────────────
console.log('[2/4] Staging clean app directory…');
if (existsSync(STAGE)) rmSync(STAGE, { recursive: true });
mkdirSync(STAGE, { recursive: true });

// Minimal package.json — zero listed deps (all bundled into main.bundle.cjs)
writeFileSync(path.join(STAGE, 'package.json'), JSON.stringify({
  name:        'storehub-pos',
  version:     '1.0.0',
  description: 'StoreHub POS — smart point-of-sale for retail',
  author:      'StoreHub',
  main:        'electron/main.bundle.cjs',
  private:     true,
}, null, 2));

// Copy electron runtime files
cpSync(ELECTRON, path.join(STAGE, 'electron'), { recursive: true });

// Copy pre-built web app
mkdirSync(path.join(STAGE, 'dist', 'public'), { recursive: true });
cpSync(DIST_PUBLIC, path.join(STAGE, 'dist', 'public'), { recursive: true });

// ── 3. Build electron-builder config ──────────────────────────────────────
console.log('[3/4] Writing electron-builder config…');

// Read the installed electron version from the pnpm store
const electronPkg = JSON.parse(
  await import('fs').then(fs =>
    fs.promises.readFile(
      path.resolve(ROOT, '../../node_modules/.pnpm/electron@42.2.0/node_modules/electron/package.json'), 'utf8'
    )
  )
);
const electronVersion = electronPkg.version;
console.log(`    electron version: ${electronVersion}`);

const builderConfig = {
  appId:           'com.storehub.app',
  productName:     'StoreHub POS',
  copyright:       'Copyright © 2025 StoreHub',
  electronVersion,           // explicit — avoids scanning node_modules for it
  npmRebuild:      false,
  // Paths are relative to directories.app (the staged dir)
  files: [
    'electron/main.bundle.cjs',
    'electron/preload.cjs',
    'electron/kiosk-pin.html',
    'electron/assets/**/*',
    'dist/public/**/*',
    'package.json',
  ],
  extraMetadata: { main: 'electron/main.bundle.cjs' },
  win: {
    // On Linux: zip only (NSIS requires Wine). On Windows: both zip + nsis.
    target: process.platform === 'linux'
      ? [{ target: 'zip',  arch: ['x64'] }]
      : [{ target: 'zip',  arch: ['x64'] }, { target: 'nsis', arch: ['x64'] }],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
  },
  publish: publish ? {
    provider:    'github',
    owner:       'ishan-nichols',
    repo:        'StoreHub',
    releaseType: 'release',
  } : null,
  directories: {
    output:         path.join(ROOT, 'dist', 'electron-dist'),
    buildResources: path.join(ELECTRON, 'assets'),
    app:            STAGE,       // source files come from the clean staged dir
  },
};

const configPath = path.join(ROOT, 'dist', 'electron-builder-gen.json');
writeFileSync(configPath, JSON.stringify(builderConfig, null, 2));

// ── 4. Package + zip ──────────────────────────────────────────────────────
console.log('[4/4] Packaging and zipping…');

// Step 4a: Run electron-builder in --dir mode (creates win-unpacked, no Wine needed)
const dirConfig = { ...builderConfig, win: { target: [{ target: 'dir', arch: ['x64'] }] } };
const dirConfigPath = path.join(ROOT, 'dist', 'electron-builder-dir.json');
writeFileSync(dirConfigPath, JSON.stringify(dirConfig, null, 2));

try {
  execSync(
    `npx electron-builder --win --config ${dirConfigPath} --publish never`,
    { cwd: ROOT, stdio: 'inherit', env: { ...process.env } },
  );
} catch {
  // electron-builder may exit non-zero but still produce win-unpacked — check below
}

const unpackedDir = path.join(ROOT, 'dist', 'electron-dist', 'win-unpacked');
const { statSync } = await import('fs');
if (!existsSync(unpackedDir) || !statSync(unpackedDir).isDirectory()) {
  throw new Error('win-unpacked was not created — build failed');
}

// Step 4b: Zip win-unpacked ourselves — write Python script to a temp file
const distDir   = path.join(ROOT, 'dist', 'electron-dist');
const zipOut    = path.join(distDir, 'StoreHub-POS-win32-x64.zip');
const pyScript  = path.join(distDir, '_mkzip.py');
console.log(`\n  Creating zip → ${zipOut}`);

writeFileSync(pyScript, [
  'import zipfile, os, sys',
  'src, out = sys.argv[1], sys.argv[2]',
  'with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:',
  '    for root, dirs, files in os.walk(src):',
  '        for f in files:',
  '            full = os.path.join(root, f)',
  '            arc  = os.path.relpath(full, os.path.dirname(src))',
  '            zf.write(full, arc)',
  'mb = os.path.getsize(out) // 1024 // 1024',
  'print(f"  Created {out} ({mb} MB)")',
].join('\n'));

execSync(`python3 "${pyScript}" "${unpackedDir}" "${zipOut}"`, { stdio: 'inherit' });

console.log('\nBuild complete!');
console.log(`  Portable zip: dist/electron-dist/StoreHub-POS-win32-x64.zip`);
console.log('  Extract on Windows and run "StoreHub POS.exe"');
console.log('  For a full installer (.exe), use the GitHub Actions deploy-windows.yml workflow.');
