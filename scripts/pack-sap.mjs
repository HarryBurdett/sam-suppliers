#!/usr/bin/env node
// scripts/pack-sap.mjs — Build the SAM .sap package for this app.
//
// Output:
//   <repo-root>/<manifest.id>-<manifest.version>.sap
//     |
//     +-- manifest.json
//     +-- frontend/  (everything under frontend/dist/ — Vite SPA output)
//     +-- backend/   (everything under dist/ — tsc backend output)
//
// Run: `npm run pack:sap`
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import AdmZip from 'adm-zip';

const ROOT = process.cwd();

async function readManifest() {
  const raw = await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf-8');
  return JSON.parse(raw);
}

function build() {
  console.log('[pack:sap] running npm run build…');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
}

async function exists(p) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function main() {
  const manifest = await readManifest();
  if (!manifest.id) throw new Error('manifest.json missing id');
  if (!manifest.version) throw new Error('manifest.json missing version');

  build();

  const zip = new AdmZip();
  zip.addLocalFile(path.join(ROOT, 'manifest.json'));

  const feDist = path.join(ROOT, 'frontend', 'dist');
  if (!await exists(feDist)) {
    throw new Error(`Frontend build output not found at ${feDist}. Did \`npm run build\` succeed?`);
  }
  zip.addLocalFolder(feDist, 'frontend');

  const beDist = path.join(ROOT, 'dist');
  if (await exists(beDist)) {
    zip.addLocalFolder(beDist, 'backend');
  } else {
    console.warn('[pack:sap] no dist/ directory — packaging frontend-only.');
  }

  const outPath = path.join(ROOT, `${manifest.id}-${manifest.version}.sap`);
  zip.writeZip(outPath);
  const sizeKb = ((await fs.stat(outPath)).size / 1024).toFixed(1);
  console.log(`[pack:sap] wrote ${outPath} (${sizeKb} KB)`);
}

main().catch((e) => { console.error('[pack:sap] failed:', e.message); process.exit(1); });
