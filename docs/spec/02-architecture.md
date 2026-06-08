# Architecture

## Plugin contracts (SAM v1 + v2 dual-export)

The plugin exports **both** contracts from `src/index.ts`:

```ts
// ── v2 contract (SAM 1.6.3+) ─────────────────────────────────────────
export const register = createV2RegisterAdapter({
  appId: 'suppliers',
  createRouterV1: createRouter,
});

// ── v1 contract (used by standalone) ──────────────────────────────────
const factory: AppBackendFactory = (ctx: AppContext) => {
  ctx.logger.info(`suppliers plugin loaded for tenant ${ctx.tenantId}`);
  return createRouter(ctx);
};
export default factory;
```

SAM 1.6.3+ calls `register({ app, useSamContext, useSamServices })`
because `samContextVersion: 2` in the manifest. Standalone host calls
the default factory directly with a hand-built `AppContext`.

Both paths converge on the same `createRouter(ctx: AppContext)`. The
v2 path goes through a shim that translates SAM v2's per-request hooks
into the v1 `AppContext` shape.

## The v2 shim

`src/_shared/sam-v2-shim.ts` (~234 LOC). Architecture:

```
┌────────── SAM 1.6.3+ side ──────────┐    ┌──── Plugin side ──────┐
│ register({                          │    │                        │
│   app: Router,                      │    │  createRouter(ctx) -->│
│   useSamContext(req),  ◄────────────┼────┤  reads ctx.db,        │
│   useSamServices(req)               │    │  ctx.logger, etc.     │
│ })                                  │    │                        │
└─────────────┬───────────────────────┘    └──────▲─────────────────┘
              │                                   │
              │ wraps incoming Request in:        │
              │   • ALS scope (per-request ctx)   │
              │   • Proxy ctx (translates ctx.db, │
              │     ctx.logger, etc.)             │
              ▼                                   │
        cachedRouter(req, res, next) ─────────────┘
        (built once on first request,
         using the stable services
         captured from useSamServices)
```

Two flavours of ctx field handled differently:

| Field | Origin | When evaluated |
|---|---|---|
| `appId`, `logger`, `email`, `llm`, `emailIngest`, `graph`, `createAIService`, `setSyncTrigger` | `useSamServices(req)` — SAM-wide singletons | **Once**, on first request; cached in closure |
| `db.{sam, app, operaSystem, getCompanyDb}`, `tenantId`, `operaType`, `config` | `useSamContext(req)` + `req.user` | **Per-request** via `AsyncLocalStorage` |

Reads outside an ALS scope throw a clear error — guards against
handlers that capture `ctx` in `setTimeout` / `setInterval` /
late-firing callbacks. Currently no such handlers exist in the
plugin, but the guard is cheap insurance.

The plugin's existing `createRouter(ctx)` factory is **untouched** by
the v2 migration — the shim makes `ctx.X` resolve through SAM's
per-request hooks via the Proxy without any service-layer changes.

## `AppContext` interface

Locally declared in `src/app-context.ts` (not imported from
`@ai-sam/shared`) so the same source tree compiles in both SAM-plugged
and standalone contexts. Shape:

```ts
interface AppContext {
  appId: string;                          // "suppliers"
  tenantId: string;                       // SAM tenant UUID; "standalone:<code>" in standalone
  config: Record<string, unknown>;        // tenant config; standalone passes { mailboxes: [] }
  operaType: 'opera-se' | 'opera-3' | null;
  db: {
    sam: Knex;                            // SAM's own DB (read-only convention)
    app: Knex | null;                     // per-app DB; null in some SAM configs
    operaSystem: Knex | null;             // Opera3SESystem master DB
    getCompanyDb: (code: string) => Knex | null;   // per-company Opera DB
  };
  logger: AppLogger;                      // info / warn / error / debug
  createAIService?: () => unknown;        // legacy hook; unused
  email?: SamEmailService;                // .send({to, subject, bodyHtml})
  llm?: SamLlmService;                    // .chat() / .stream() AsyncIterable
  emailIngest?: SamEmailIngestService;    // mailbox lifecycle
  graph?: SamGraphService;                // Microsoft Graph
  setSyncTrigger?: (handler) => void;     // sync hook
}
```

Express request augmentation (declared via global `namespace Express`
augmentation in `src/app-context.ts`):

```ts
namespace Express {
  interface Request {
    operaCompany?: string;                // set by SAM middleware from X-Opera-Company header
    user?: {                              // set by SAM authenticate middleware
      userId: string;
      email: string;
      role: 'admin' | 'user' | 'sam-admin';
      userType: 'sam-admin' | 'tenant-admin' | 'app-user';
      tenantId: string;
      appRole?: string | null;
      permissions: string[];
      tokenType?: string;
    };
  }
}
```

## Run modes

| Mode | How it boots | What provides `ctx` | Used for |
|---|---|---|---|
| **SAM-plugged (v2)** | SAM does `await import(distEntry)`, calls `register({...})`. Each request goes through the shim. | SAM's `useSamContext(req)` + `useSamServices(req)` (multi-connection, per-request) | Production tenants on SAM 1.6.3+ |
| **SAM-plugged (v1, legacy)** | SAM calls `default(ctx)` once at load. | SAM's plugin loader builds `AppContext` once. | SAM <1.6.3 (transitional; v1 path removed in SAM 1.7) |
| **Standalone (multi-company)** | `tsx standalone/server.ts`. Express host boots one plugin per company. | `standalone/company-registry.ts` builds `AppContext` per company from local config + adapters. | On-prem deployments, single-tenant installs without SAM |
| **Dev-host** | `tsx dev-host/server.ts`. Single in-memory SQLite, no auth. | Hardcoded stub `AppContext`. | Frontend development |

## Frontend mount

SAM v1.6+ serves plugins via iframe at `/apps/<appId>/`. The plugin
ships a **SPA bundle** at `frontend/dist/index.html` +
`frontend/dist/assets/index-HASH.{js,css}`. SAM (or the standalone
host) injects `window.__SAM_CONTEXT__ = {...}` into the HTML before
the bundle loads:

```html
<head>
  <script>window.__SAM_CONTEXT__ = { appId, user, currentCompany, api };</script>
  <script type="module" src="./assets/index-HASH.js"></script>
  <link rel="stylesheet" href="./assets/index-HASH.css">
</head>
<body><div id="root"></div></body>
```

`frontend/src/index.tsx`:
1. Reads `window.__SAM_CONTEXT__`
2. Falls back to a cookie-auth `api` client if none present
   (standalone dev convenience)
3. Calls `setSamContext(ctx)` on the api-shim
4. Mounts `<Suppliers context={ctx} />` at `#root`

## File layout (canonical)

```
src/
├── index.ts                          ← dual export
├── app-context.ts                    ← AppContext + req.user augmentation
├── router.ts                         ← 106 routes
├── _shared/
│   ├── sam-v2-shim.ts                ← v1↔v2 contract adapter
│   ├── index.ts                      ← _shared common exports
│   ├── opera/                        ← Opera-specific helpers
│   ├── posting/                      ← (reserved for future write paths)
│   └── string/                       ← string helpers
├── services/
│   └── <25 .ts files>                ← see services.md
└── db/migrations/
    ├── 001_initial_schema.ts
    ├── 002_align_statements_queue.ts
    ├── 003_statement_actions.ts
    └── 004_security_audit.ts
```

## Module / package settings

- `"type": "module"` in package.json (ESM throughout)
- `tsconfig.json`: `"module": "NodeNext"`, `"moduleResolution":
  "NodeNext"`, `"rootDir": "./src"`, `"outDir": "./dist"`,
  `"target": "ES2022"`, `strict: true`, `isolatedModules: true`,
  `noUncheckedIndexedAccess: true`
- All imports use `.js` extensions (NodeNext requirement) — TypeScript
  files import each other as `./router.js` not `./router`

## Plugin lifecycle (SAM-plugged)

Per the SAM plugin spec (`opera-knowledge-ref/docs/plugin-authoring.md`):

1. **Install** — SAM clones git, runs `npm install && npm run build`
2. **Provision** — if `separateDatabase: true`, SAM creates
   `ai_sam_app_suppliers` MSSQL DB, grants `db_owner`, runs every
   `.js` file in `<dist>/db/migrations` via `knex.migrate.latest()`
3. **Env-prep** — SAM sets `SAM_PLUGIN_MODE=true`, `APP_DB_*`,
   `OPERA_DB_*`
4. **Import** — `await import(distEntry)`
5. **Factory/Register** — v2 plugins: SAM calls `register({...})`.
   v1 plugins: SAM calls `default(ctx)`.
6. **Mount** — SAM mounts the router under `/api/apps/suppliers/*`
7. **Reload** — on update, SAM cache-busts the import (`?v=<ts>`)
   and re-runs steps 4-6 in-process
8. **Teardown** — no shutdown hook today

## Anti-patterns avoided

The plugin's `createRouter()` returns an Express **Router**, not an
Express **App**. So the four legacy anti-patterns (static file
serving, terminal 404, catch-all SPA route, Bearer-only auth) can't
apply at the plugin layer — they live in `standalone/server.ts` only.

The plugin never reads `process.env.SAM_PLUGIN_MODE` because it
doesn't need to — the standalone-only behaviour is in
`standalone/server.ts`, not in the plugin code.
