# Standalone Runtime

A SAM-host harness for running the plugin without SAM. Used for:

- On-prem deployments without SAM
- Local development against a real Opera SQL
- Multi-company testing without SAM Central

Lives entirely under `standalone/`. The plugin source under `src/` is
unchanged.

## Entry point

`tsx standalone/server.ts` (via `npm start`).

Boot sequence:

1. `loadConfig()` — read env vars
2. `discoverCompanies(DATA_ROOT)` — enumerate company subdirs
3. `loadOperaConfig()` — read `<dataRoot>/<code>/opera.json` per company
4. `selectAdapter()` — build the Opera adapter (noop / mssql / opera3 / composite)
5. `buildAnthropicLlm()` — wire ctx.llm if `ANTHROPIC_API_KEY` present
6. For each company, `loadCompany()` — open per-company SQLite, run
   migrations, build `AppContext`, call the plugin's v1 factory to
   build its Router
7. Mount Express app — `/healthz`, `/auth/*`, requireAuth, `/auth/me`,
   `/auth/system-info`, SPA `/` shell, `/api/apps/suppliers` dispatcher
8. `listen(PORT)`

## Files

### `config.ts`

```ts
interface StandaloneConfig {
  port: number;
  dataRoot: string;             // env DATA_ROOT, default ./data
  legacyDataRoot: string | null;
  legacyCompaniesDir: string | null;
  loginPassword: string;        // env LOGIN_PASSWORD — REQUIRED
  sessionSecret: string;        // env SESSION_SECRET or auto-generated to ./data/.session-secret
  operaAdapter: string;         // env OPERA_ADAPTER, default 'noop'
  mssql: MssqlEnv | null;
  opera3: Opera3Env | null;
  anthropicApiKey: string | null;  // env ANTHROPIC_API_KEY
  anthropicModel: string | null;   // env ANTHROPIC_MODEL (optional override)
  dataDir: string;
  trustProxy: string;
}
```

Env vars consumed:

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `DATA_ROOT` | Per-company subdir parent (default `./data`) |
| `LOGIN_PASSWORD` | Shared login password — REQUIRED, server refuses to boot without it |
| `SESSION_SECRET` | HMAC secret for session cookie. Auto-generated on first run if unset; stored in `./data/.session-secret` with 0600 perms |
| `OPERA_ADAPTER` | `noop` \| `mssql` \| `opera3` \| `composite` |
| `OPERA_SQL_HOST/PORT/USER/PASSWORD` | mssql adapter config |
| `OPERA_SQL_TRUST_CERT` | default `true` (LAN-friendly) |
| `OPERA_SQL_ENCRYPT` | default `true` |
| `OPERA3_AGENT_URL/KEY/DATA_PATH` | opera3 adapter config (scaffold only) |
| `ANTHROPIC_API_KEY` | Enables ctx.llm via Anthropic Messages API |
| `ANTHROPIC_MODEL` | Optional model override (default uses what the plugin asks for) |
| `LEGACY_DATA_ROOT` | Optional. Auto-discovers companies from a legacy Python data dir |
| `LEGACY_COMPANIES_DIR` | Optional. Seeds `opera.json` from legacy `<code>.json` files |
| `TRUST_PROXY` | Express `trust proxy` value. Default `'loopback, linklocal, uniquelocal'` |

### `auth.ts`

HMAC-signed cookie sessions. Cookie name: `sus_session`.

```
<base64url(JSON payload)>.<hex(HMAC-SHA256 over payload using session_secret)>
```

Payload:
```ts
interface SessionPayload {
  userId: string;        // "local"
  email: string;         // "local@standalone"
  companyCode: string;   // the per-DATA_ROOT subdir name
  issuedAt: number;      // epoch ms
}
```

Max age 30 days. Cookie reissued automatically at half-life (15 days).

Login endpoints (no auth):
- `GET /auth/companies` — returns `{ companies: [code, code, ...] }`
- `POST /auth/login` body `{ password, company }` — validates +
  issues session cookie
- `POST /auth/logout` — clears cookie

Rate limit: 10 failed attempts per IP per 15min window, then 429.
Failed attempts force-sleep 1000ms (timing attack mitigation).

`requireAuth(config)` middleware:
- Verifies cookie HMAC
- Rejects if missing/invalid (302 → `/login.html` for HTML requests,
  401 JSON for API requests)
- Populates `req.user`, `req.standaloneCompany`, `req.operaCompany`
- Re-issues cookie at half-life

### `migrate.ts`

Idempotent runner. Imports each `.ts` file in `src/db/migrations/` in
lexical order via tsx (which transpiles on-the-fly). Records applied
filenames in `_standalone_migrations` table.

Each migration runs in its own transaction together with the tracker
insert — a mid-migration failure leaves the DB clean.

**Critical:** the migrations live in `src/db/migrations/`, NOT
`db/migrations/`. This is so the project's `tsc` build emits them
into `dist/db/migrations/*.js` for SAM's installer.

### `company-registry.ts`

`discoverCompanies(dataRoot, legacyDataRoot?)` — returns sorted
company codes (subdirs of dataRoot, plus any seeded from legacyDataRoot).

`loadOperaConfig(dataRoot, legacyCompaniesDir, code)` — reads
`<dataRoot>/<code>/opera.json`:
```json
{ "database": "Opera3SECompany00I", "operaVersion": "SE" }
```

Optionally seeds from `<legacyCompaniesDir>/<code>.json` on first run.

`loadCompany(code, opts)` — builds a `CompanyInstance`:
- Opens `<dataRoot>/<code>/suppliers.sqlite` (better-sqlite3 via knex)
- Runs migrations
- Optionally seeds `supplier_settings.json` legacy data
- Opens in-memory SQLite for `db.sam` (mostly unused)
- Builds `AppContext` with `getCompanyDb` delegating to the
  Opera adapter
- Optionally attaches `ctx.llm` if provided
- Calls `factory(ctx)` → Router

`CompanyInstance` = `{ code, ctx, router, appDb, samDb }`.

### `opera-adapter.ts` + variants

```ts
interface OperaAdapter {
  getCompanyDb(code: string): Knex | null;
  operaType: 'opera-se' | 'opera-3' | null;
  destroy?: () => Promise<void>;
  invalidateCompany?: (code, mapping) => Promise<void>;
}
```

Built by `selectAdapter({ name, mssql?, opera3?, logger })`:

- `noop` — returns `null` for every `getCompanyDb` call. Lets the
  server boot without Opera.
- `mssql` (`opera-adapter-mssql.ts`) — builds a Knex MSSQL pool per
  company. `tedious` driver. Connection params from env vars; per-
  company database name from `opera.json`. Companies with
  `operaVersion: "3"` are silently skipped.
- `opera3` (`opera-adapter-opera3.ts`) — scaffold; logs a warning,
  returns null. Real implementation would route via HTTP to an
  out-of-process VFP agent.
- `composite` — dispatches per company by `operaVersion`. SE → mssql,
  3 → opera3.

### `anthropic-llm-adapter.ts`

Implements `LlmService` (chat + stream) backed by `@anthropic-ai/sdk`.

```ts
buildAnthropicLlm({ apiKey, modelOverride?, logger? }): LlmService
```

- Maps stale model names: `claude-sonnet-4` → `claude-sonnet-4-6`,
  `claude-opus-4` → `claude-opus-4-8`, etc.
- `ANTHROPIC_MODEL` env override wins when set
- Strips `temperature` on Opus 4.7+ (rejected by API)
- Yields `{text}` chunks from `content_block_delta` SSE events
- Ignores `tools` arg with a warning (not supported in the simple
  adapter)

Default model: `claude-sonnet-4-6`. Default max_tokens: 4000.

### `server.ts`

Express host. Route order matters:

1. `express.json({limit:'10mb'})`
2. `GET /healthz` — public
3. `GET /login.html` — public (serves `public/login.html`)
4. `/assets/*` — public (serves `frontend/dist/assets/`)
5. `/auth/login`, `/auth/logout`, `/auth/companies` — public
6. `requireAuth` middleware — everything below requires session
7. `GET /auth/me` — returns user + company
8. `GET /` — SPA shell (reads `frontend/dist/index.html`, injects
   `<script>window.__SAM_CONTEXT__ = {...}</script>` before `</head>`)
9. `GET /auth/system-info` — operator-visible diagnostic
10. `PUT /auth/system-info` — edit per-company opera.json
11. `/api/apps/suppliers/*` → dispatcher → per-company plugin router

Dispatcher (`makeDispatcher(companies)`):
- Reads `req.standaloneCompany` from the session
- Looks up the matching `CompanyInstance`
- Forwards to its plugin router

Shutdown: SIGTERM/SIGINT drains all Knex pools (appDb + samDb per
company + Opera adapter), then `process.exit(0)`.

### `public/login.html`

Standalone-only HTML form (not part of the SPA bundle). Renders:
- Company dropdown (populated from `/auth/companies`)
- Password input
- Sign-in button

Submits to `POST /auth/login`. On success, redirects to `/`.

## Dev-host

`dev-host/server.ts` (npm run dev). Lightweight in-memory variant:

- One company ("DEMO"), no auth
- In-memory SQLite for both `db.app` and `db.sam`
- Stubs `req.user` + `req.operaCompany='DEMO'` on every request
- Same SPA shell + `__SAM_CONTEXT__` injection pattern
- No login.html, no `/auth/login` etc.

For pure frontend development. No `ctx.llm`, no `ctx.email`, no
`ctx.emailIngest`.

## File layout

```
standalone/
├── server.ts                  Express host
├── config.ts                  Env → StandaloneConfig
├── auth.ts                    Cookie sessions + login routes
├── migrate.ts                 Runs src/db/migrations/*.ts via tsx
├── company-registry.ts        Per-company AppContext builder
├── opera-adapter.ts           Adapter selector
├── opera-adapter-mssql.ts     opera-se via tedious
├── opera-adapter-opera3.ts    Opera 3 HTTP agent (scaffold)
├── anthropic-llm-adapter.ts   ctx.llm via Anthropic API
└── public/
    └── login.html             Operator login form

dev-host/
└── server.ts                  In-memory dev harness
```

## Multi-company data layout

```
<DATA_ROOT>/
├── COMPANY_A/
│   ├── opera.json             { "database": "Opera3SECompany00A", "operaVersion": "SE" }
│   └── suppliers.sqlite       per-app DB
├── COMPANY_B/
│   ├── opera.json
│   └── suppliers.sqlite
└── COMPANY_C/
    ├── opera.json
    └── suppliers.sqlite

<DATA_ROOT>/.session-secret    HMAC key (auto-generated, 0600)
```

Operator session cookie carries `companyCode` → dispatcher routes to
the matching plugin instance.

## IMAP adapter

**Deferred to a follow-up.** See
[`../superpowers/specs/2026-06-04-imap-adapter-design.md`](../superpowers/specs/2026-06-04-imap-adapter-design.md).

Without IMAP wired, standalone mode can't drive the email-ingest
path. Workarounds: manual statement upload via `/extract-from-text`,
or deploy under SAM which provides `ctx.emailIngest`.

## Package scripts

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && cd frontend && npm install --no-audit --no-fund && npm run build",
    "dev": "tsx dev-host/server.ts",
    "start": "tsx standalone/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "pack:sap": "node scripts/pack-sap.mjs"
  }
}
```

## Dependencies (`package.json`)

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.100.1",
    "cookie": "^1.1.1",
    "express": "^4.19.2",
    "knex": "^3.1.0",
    "tedious": "^19.2.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.11.0",
    "adm-zip": "^0.5.17",
    "sqlite3": "^6.0.1",
    "tsx": "^4.22.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
```
