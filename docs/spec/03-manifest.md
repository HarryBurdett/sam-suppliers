# `manifest.json` Specification

The plugin's installation contract with SAM. Authoritative copy:

```json
{
  "id": "suppliers",
  "name": "Supplier Reconciliation",
  "description": "Supplier statement reconciliation. Scans the customer's mailbox for supplier statements, extracts line items via AI, and reconciles against the Opera Purchase Ledger.",
  "version": "1.0.0",
  "samContextVersion": 2,
  "author": "IntSys",
  "category": "finance",
  "type": "full-stack",
  "minSamVersion": "1.6.6",
  "frontend": {
    "entryComponent": "Suppliers",
    "basePath": "/suppliers",
    "navLabel": "Suppliers",
    "navIcon": "Truck",
    "requiredSharedDeps": ["react", "react-dom", "react-router-dom"]
  },
  "backend": {
    "routePrefix": "/api/apps/suppliers",
    "requiresDatabase": true,
    "databaseType": "opera-se",
    "separateDatabase": true,
    "multiCompany": true,
    "internalApiPrefix": "/api"
  },
  "permissions": [
    "opera:read",
    "opera:write",
    "sam:config:read"
  ],
  "consumes": {
    "email-ingest": true,
    "llm": true
  }
}
```

## Field-by-field

### Top-level

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable machine ID. Must match SAM Central's `applications.app_id`. Also the namespace for `/api/apps/<id>` and the per-app DB name `ai_sam_app_<id>`. |
| `name` | string | Human-readable name shown in SAM admin UI |
| `description` | string | Shown on the apps catalog |
| `version` | semver | MUST match the git tag at release time |
| `samContextVersion` | int | `2` selects the v2 plugin contract (per-request `useSamContext`/`useSamServices`). Required for SAM 1.6+. |
| `author` | string | "IntSys" |
| `category` | string | "finance" |
| `type` | enum | `"full-stack"` (has both backend and frontend). Alt: `"frontend-only"`. |
| `minSamVersion` | semver | "1.6.6" — minimum SAM version the plugin runs on. SAM refuses to install onto older hosts. |

### `frontend`

| Field | Type | Notes |
|---|---|---|
| `entryComponent` | string | "Suppliers" — top-level React component name (informational; the SPA mounts at `#root` regardless) |
| `basePath` | string | "/suppliers" — the URL slug under `/apps/` where SAM serves the iframe |
| `navLabel` | string | "Suppliers" — sidebar label. Drop "(DEV)" before release. |
| `navIcon` | string | "Truck" — Lucide icon name |
| `requiredSharedDeps` | string[] | `["react", "react-dom", "react-router-dom"]` — informational; SAM's iframe-mode SPA bundles its own copies via `import { createRoot } from 'react-dom/client'`. |

### `backend`

| Field | Type | Notes |
|---|---|---|
| `routePrefix` | string | "/api/apps/suppliers" — outer mount path. SAM strips this before forwarding the request to the plugin router. |
| `requiresDatabase` | bool | `true` — advisory, not enforced |
| `databaseType` | enum | "opera-se" — informational; the plugin works on opera-3 too via `ctx.operaType` and the opera-3 adapter |
| `separateDatabase` | bool | `true` — SAM provisions `ai_sam_app_suppliers` MSSQL DB and runs migrations from `<dist>/db/migrations/*.js` at install time |
| `multiCompany` | bool | `true` — declares the plugin can serve multiple Opera companies from one installed instance |
| `internalApiPrefix` | string | "/api" — when set, SAM rewrites `req.url` from `/api/apps/suppliers/foo` to `/api/foo` before forwarding (deterministic, single-attempt). When unset, SAM falls back to two-attempt forwarding. |

### `permissions`

Declarative permissions the plugin requires. Advisory in current SAM
versions but reserved for future enforcement.

| Permission | What it covers |
|---|---|
| `opera:read` | Read `pname`, `ptran`, `palloc` |
| `opera:write` | Reserved for remittance posting (not yet implemented) |
| `sam:config:read` | Read tenant config from `ctx.config` |

### `consumes`

Declares which optional SAM services the plugin uses. SAM uses this to
decide which middlewares to install + which env vars to set.

| Key | What it indicates |
|---|---|
| `email-ingest: true` | Plugin uses `ctx.emailIngest.{listMyMailboxes, claimMailbox, registerHandler, fetchAttachment, getAttachmentText}` |
| `llm: true` | Plugin uses `ctx.llm.chat()` for statement extraction + response previews |

## Out-of-manifest dependencies

The plugin also uses (but doesn't declare in `consumes`):

- `ctx.email` — for outbound supplier emails
- `ctx.db.sam` — for cross-app queries (rare; mostly unused)

These are always available on the SAM ctx, so no declaration needed.

## What changes per environment

- `version` bumps per release (must match git tag)
- `navLabel` adds "(DEV)" suffix in dev-deploy variants if desired

Everything else is stable across builds.

## SAM Central admin view (what users see)

The manifest fields surface in SAM's admin UI:

- Apps catalog: `name`, `description`, `category`, `version`,
  `author`, `navIcon`
- Install dialog: `permissions`, `consumes`, `minSamVersion`,
  `requiresDatabase`
- Sidebar: `navLabel`, `navIcon` (when the user has been granted the
  app)

## Validation

SAM validates the manifest on install. Common rejection reasons:

- `id` doesn't match SAM Central's expected ID
- `version` doesn't match the git tag
- `minSamVersion > current SAM version`
- Missing `frontend.entryComponent` for `type: "full-stack"`
