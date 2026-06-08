# Reproduction Checklist

Ordered steps to reproduce sam-suppliers from scratch. Each step
references the spec doc with the precise details.

## 0. Prerequisites

- Node.js 20+
- npm
- SQLite (for standalone mode) — typically bundled with the `sqlite3`
  npm package
- Access to a SAM v1.6.6+ install OR willingness to run the standalone
  host

## 1. Scaffold the repo

Create the directory layout:

```
sam-suppliers/
├── manifest.json
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── README.md
├── docs/
│   ├── release-notes.md
│   ├── superpowers/specs/
│   └── spec/                       ← this directory
├── src/
│   ├── index.ts                    ← dual export (v2 register + v1 factory)
│   ├── app-context.ts              ← AppContext interface
│   ├── router.ts                   ← all 106 routes
│   ├── _shared/
│   │   └── sam-v2-shim.ts          ← v1 → v2 contract adapter
│   ├── services/                   ← 25 service modules
│   └── db/migrations/              ← 4 knex migrations (.ts)
├── frontend/
│   ├── index.html                  ← SPA entry
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts              ← SPA build, base:'./'
│   ├── postcss.config.cjs
│   ├── tailwind.config.cjs
│   └── src/
│       ├── index.tsx               ← mounts React at #root, reads window.__SAM_CONTEXT__
│       ├── Suppliers.tsx           ← top-tab nav
│       ├── api-shim.ts             ← apiClient + authFetch
│       ├── router-shim.tsx         ← useNavigate / useParams / Link
│       ├── ui-shim.ts              ← re-exports Card/Alert/etc.
│       ├── useHelp.ts              ← help-panel hook
│       ├── HelpPanel.tsx, Alert.tsx, Card.tsx, EmptyState.tsx,
│       │   LoadingState.tsx, PageHeader.tsx, StatusBadge.tsx
│       ├── sam.ts                  ← SamPluginContext type
│       ├── index.css               ← Tailwind directives
│       └── Supplier*.tsx           ← 11 page components
├── standalone/                     ← SAM-host harness
│   ├── server.ts
│   ├── config.ts
│   ├── auth.ts
│   ├── migrate.ts
│   ├── company-registry.ts
│   ├── opera-adapter.ts
│   ├── opera-adapter-mssql.ts
│   ├── opera-adapter-opera3.ts
│   ├── anthropic-llm-adapter.ts
│   └── public/login.html
├── dev-host/
│   └── server.ts                   ← in-memory SQLite, no auth
├── scripts/
│   └── pack-sap.mjs                ← .sap zip builder
└── tests/                          ← vitest, ~24 files, 214 tests
```

## 2. Author the manifest

→ [03-manifest.md](./03-manifest.md). Required:
`samContextVersion: 2`, `minSamVersion: 1.6.6`,
`backend.multiCompany: true`, `backend.separateDatabase: true`,
`backend.internalApiPrefix: "/api"`, `backend.routePrefix:
"/api/apps/suppliers"`, `frontend.entryComponent: "Suppliers"`.

## 3. Define `AppContext`

→ [02-architecture.md](./02-architecture.md) +
[11-external-services.md](./11-external-services.md).

Replicate `src/app-context.ts` verbatim — it's the runtime contract
between SAM and the plugin. Locally-declared structural types (no
import from `@ai-sam/shared`).

## 4. Write the 4 knex migrations

→ [04-data-model.md](./04-data-model.md). Files in lexical order:

- `001_initial_schema.ts` — base tables (settings, supplier_statements,
  statement_lines, processed_emails, supplier_config,
  supplier_contacts_ext, supplier_communications,
  supplier_change_audit, supplier_approved_emails,
  supplier_onboarding, supplier_remittance_log, supplier_queries,
  statement_opera_only, supplier_overrides, supplier_automation_config,
  supplier_automation_settings)
- `002_align_statements_queue.ts` — queue-shape additions
- `003_statement_actions.ts` — action-tracking columns
- `004_security_audit.ts` — security audit log

Important: place migrations under `src/db/migrations/` (NOT
`db/migrations/`) so the project's `tsc` build emits compiled `.js`
into `dist/db/migrations/` where SAM looks at install time.

## 5. Build the 25 services

→ [06-services.md](./06-services.md). Each is a pure-ish module:
exports async functions that take `appDb: Knex` (and sometimes other
dependencies) and return `{ success, ..., error? }` shapes. No
service module reaches outside its declared dependencies.

## 6. Author the router

→ [07-api-endpoints.md](./07-api-endpoints.md). One file:
`src/router.ts`. Imports every service function and wires the 106
routes. Pattern: a `getAppDb(req, res)` helper resolves
`ctx.db.app`; a `getOperaDb(req, res)` helper resolves
`ctx.db.getCompanyDb(req.operaCompany)`, returning 400 if no company
header, 503 if no Opera connection.

## 7. Write the v2 shim

→ [02-architecture.md](./02-architecture.md). Copy
`src/_shared/sam-v2-shim.ts` — it's app-agnostic except for the
`appId` constructor argument. The shim uses
`AsyncLocalStorage` + a JS Proxy to translate SAM 1.6.3+'s
per-request `useSamContext(req)` + `useSamServices(req)` into the v1
`AppContext` shape the existing router expects.

## 8. Author the entry point

→ [02-architecture.md](./02-architecture.md). `src/index.ts`:

```ts
export const register = createV2RegisterAdapter({
  appId: 'suppliers',
  createRouterV1: createRouter,
});
const factory: AppBackendFactory = (ctx) => { /* v1 */ };
export default factory;
```

## 9. Build the frontend

→ [08-frontend.md](./08-frontend.md). Order:

1. Set up Vite SPA (`base: './'`, no lib mode)
2. Author shared components (Card, Alert, etc.) + shims
   (`api-shim.ts`, `router-shim.tsx`, `ui-shim.ts`)
3. Author each of the 11 page components
4. Wire them into `Suppliers.tsx` as top-tab nav
5. Bootstrap in `index.tsx` — read `window.__SAM_CONTEXT__`, mount
   `<Suppliers context={ctx} />` at `#root`

## 10. Write the standalone runtime

→ [09-standalone-runtime.md](./09-standalone-runtime.md). For
local-dev and standalone deployments. Files:

- `standalone/config.ts` — env-var reader
- `standalone/auth.ts` — HMAC-cookie session, shared-password login
- `standalone/migrate.ts` — runs `src/db/migrations/*.ts` via tsx
- `standalone/company-registry.ts` — per-company knex + ctx
- `standalone/opera-adapter*.ts` — mssql, opera3, noop, composite
- `standalone/anthropic-llm-adapter.ts` — ctx.llm via Anthropic API
- `standalone/server.ts` — Express host with SPA shell

## 11. Write the build + package pipeline

→ [10-build-and-package.md](./10-build-and-package.md). Files:

- `package.json` — scripts: `build` (tsc + frontend vite),
  `dev` (tsx dev-host), `start` (tsx standalone), `test` (vitest),
  `pack:sap`, `lint`, `clean`
- `scripts/pack-sap.mjs` — produces `suppliers-<version>.sap` (zip
  of manifest + dist + frontend/dist)

## 12. Write the tests

→ [12-testing.md](./12-testing.md). Vitest, 24 files, 214 tests.
Per-service tests use a `makeAppDb(state)` mock that simulates Knex.
Migration smoke test runs every migration in lexical order against
in-memory SQLite.

## 13. Verify

```sh
npm install
npm run lint           # tsc --noEmit, must be clean
npm test               # 214 tests must pass
npm run build          # backend + frontend, must be clean
npm run pack:sap       # produces suppliers-1.0.0.sap
```

For dev-mode end-to-end:

```sh
PORT=3000 npm run dev
# open http://localhost:3000
# expect Suppliers UI with 11 tabs; all backend endpoints respond
```

For standalone end-to-end (per-company SQLite, no Opera):

```sh
mkdir -p data/DEMO
LOGIN_PASSWORD=test PORT=3002 OPERA_ADAPTER=noop npm start
# open http://localhost:3002, log in
# UI mounts, API responds
```

## 14. Deploy

→ [10-build-and-package.md](./10-build-and-package.md). The `.sap`
file from step 13 is the deliverable for installation into SAM
Central. SAM provisions the per-app MSSQL DB, runs migrations from
`backend/db/migrations/*.js`, and mounts the plugin at
`/api/apps/suppliers`.
