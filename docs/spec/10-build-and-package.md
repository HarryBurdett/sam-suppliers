# Build & Packaging

Two artifacts: the dist/ build output (what the standalone host
imports) and the `.sap` file (what SAM Central installs).

## Build pipeline

```sh
npm run build
```

Expands to:

```sh
tsc -p tsconfig.json \
  && cd frontend && npm install --no-audit --no-fund && npm run build
```

### Backend tsc

- Input: `src/**/*.ts` (per `tsconfig.json` `include`)
- Output: `dist/**/*.{js,d.ts,js.map,d.ts.map}`
- Compiler config: NodeNext modules, ES2022 target, strict, declarations + sourcemaps

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Critical:** because `rootDir: ./src` and `include: src/**/*`,
migrations MUST live under `src/db/migrations/`, not
`<repo-root>/db/migrations/`. Otherwise they don't compile into
`dist/db/migrations/*.js` and SAM's installer finds no migrations.

### Frontend Vite build

```sh
cd frontend && vite build
```

- Input: `frontend/index.html` + `frontend/src/**/*`
- Output: `frontend/dist/{index.html, assets/index-HASH.{js,css}}`
- Config: `base: './'`, no lib mode

Hash changes per content change. The output `index.html` references
the hashed assets via `./assets/index-HASH.{js,css}`.

## Output layout

```
dist/                                ← tsc output
├── index.js                         ← plugin entry (default factory + register export)
├── index.d.ts
├── app-context.{js,d.ts,...}
├── router.{js,d.ts,...}
├── _shared/
│   ├── sam-v2-shim.{js,d.ts,...}
│   ├── opera/
│   ├── posting/
│   └── string/
├── services/
│   └── <25 .js + .d.ts pairs>
└── db/
    └── migrations/
        ├── 001_initial_schema.{js,d.ts,...}
        ├── 002_align_statements_queue.{js,d.ts,...}
        ├── 003_statement_actions.{js,d.ts,...}
        └── 004_security_audit.{js,d.ts,...}

frontend/dist/                       ← Vite output
├── index.html
└── assets/
    ├── index-HASH.js
    ├── index-HASH.js.map
    └── index-HASH.css
```

## `.sap` packaging

```sh
npm run pack:sap
```

Expands to:

```sh
node scripts/pack-sap.mjs
```

The script:
1. Reads `manifest.json` for `id` + `version`
2. Runs `npm run build` (must complete clean)
3. Creates a zip:
   ```
   manifest.json
   frontend/
   └── (everything under frontend/dist/)
   backend/
   └── (everything under dist/)
   ```
4. Writes to `<repo-root>/<manifest.id>-<manifest.version>.sap`

Example output: `suppliers-1.0.0.sap` (~470 KB, 193 files).

`scripts/pack-sap.mjs` reference implementation:

```js
#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import AdmZip from 'adm-zip';

const ROOT = process.cwd();

async function readManifest() {
  return JSON.parse(await fs.readFile(path.join(ROOT, 'manifest.json'), 'utf-8'));
}

function build() {
  console.log('[pack:sap] running npm run build…');
  execSync('npm run build', { stdio: 'inherit', cwd: ROOT });
}

async function exists(p) { try { await fs.stat(p); return true; } catch { return false; } }

async function main() {
  const manifest = await readManifest();
  if (!manifest.id) throw new Error('manifest.json missing id');
  if (!manifest.version) throw new Error('manifest.json missing version');

  build();

  const zip = new AdmZip();
  zip.addLocalFile(path.join(ROOT, 'manifest.json'));

  const feDist = path.join(ROOT, 'frontend', 'dist');
  if (!await exists(feDist)) {
    throw new Error(`Frontend build output not found at ${feDist}`);
  }
  zip.addLocalFolder(feDist, 'frontend');

  const beDist = path.join(ROOT, 'dist');
  if (await exists(beDist)) {
    zip.addLocalFolder(beDist, 'backend');
  } else {
    console.warn('[pack:sap] no dist/ directory — packaging frontend-only');
  }

  const outPath = path.join(ROOT, `${manifest.id}-${manifest.version}.sap`);
  zip.writeZip(outPath);
  const sizeKb = ((await fs.stat(outPath)).size / 1024).toFixed(1);
  console.log(`[pack:sap] wrote ${outPath} (${sizeKb} KB)`);
}

main().catch((e) => { console.error('[pack:sap] failed:', e.message); process.exit(1); });
```

Dependency: `adm-zip` (devDependency).

## SAM installation flow

When the operator installs `suppliers-X.Y.Z.sap` via SAM Central:

1. SAM unzips the `.sap` to `/data/sam/apps/suppliers/`
2. SAM reads `manifest.json`, validates `id` matches Central's record
3. SAM provisions `ai_sam_app_suppliers` MSSQL DB (because
   `separateDatabase: true`)
4. SAM runs `knex.migrate.latest()` against the new DB pointing at
   `/data/sam/apps/suppliers/backend/db/migrations/*.js`
5. SAM sets env vars: `SAM_PLUGIN_MODE=true`, `APP_DB_*`, `OPERA_DB_*`
6. SAM `import()`s `/data/sam/apps/suppliers/backend/index.js`
7. SAM reads `samContextVersion: 2` from the manifest, calls
   `register({ app, useSamContext, useSamServices })` on the
   imported module
8. SAM serves `/data/sam/apps/suppliers/frontend/index.html` at
   `/apps/suppliers/` in an iframe, with assets at
   `/apps/suppliers/assets/index-HASH.{js,css}`

## Versioning

The `manifest.version` MUST match the git tag at release. Workflow:

1. Update `manifest.json` `version` + `package.json` `version` +
   `frontend/package.json` `version`
2. Update `docs/release-notes.md` with the new version
3. Commit + tag (`git tag v1.2.0`)
4. `npm run pack:sap` → produces `suppliers-1.2.0.sap`
5. Upload `.sap` to SAM Central
6. `git push origin main --tags`

## Reproducibility

The build is fully deterministic given the source — same inputs
produce same output (modulo timestamps in the .sap zip metadata).

The Vite hashed bundle filename is content-based, so identical
source → identical hash → identical filename. This means:

- Roll-forward upgrades are safe (changing one byte in the bundle
  produces a new filename; old cached assets don't conflict)
- The `.sap` files for two different builds with identical source
  differ only in zip metadata timestamps

## Testing the build

```sh
npm run lint          # tsc --noEmit, must produce no output
npm test              # 214 tests pass
npm run build         # tsc + vite, no errors
npm run pack:sap      # produces .sap, builds along the way
unzip -l suppliers-1.0.0.sap | tail -5
# expect: manifest.json, frontend/index.html, backend/index.js,
#         backend/db/migrations/*.js
```

## Common build failures

| Symptom | Cause | Fix |
|---|---|---|
| `dist/db/migrations/` empty | Migrations under `db/migrations/` instead of `src/db/migrations/` | Move them; update standalone/migrate.ts + tests/migrations.test.ts MIGRATIONS_DIR |
| `replaceAll is not a function` | Frontend tsconfig target < ES2021 | Set `"target": "ES2021"` + `"lib": ["ES2021", "DOM", "DOM.Iterable"]` |
| TS2345 `'{}' not assignable to string` | Strict null check on `||` chain in error message extraction | Use explicit branching, not `||` chains |
| `pack:sap` fails: "Frontend build output not found" | Ran pack:sap without first building | `npm run build` first, or rely on pack-sap's own build step |
| SAM install fails: "0 migrations applied" | dist/db/migrations missing | See first row |
| SAM install fails: "no register export" | manifest declares `samContextVersion: 2` but src/index.ts only exports default | Add `export const register = createV2RegisterAdapter({...})` |

## `.gitignore`

```
data/
.env
.env.local
*.log
.DS_Store
node_modules/
*.sap
```

`dist/` and `frontend/dist/` ARE committed (other SAM plugins follow
the same convention — pre-built output is part of the release).
