# Release Notes

## 1.0.0 — SAM v2 compatibility

Initial SAM-compatible release. Targets SAM 1.6.6+.

### Added
- **SAM v2 plugin contract** via `src/_shared/sam-v2-shim.ts` — exposes
  `register({ app, useSamContext, useSamServices })` from `src/index.ts`
  alongside the existing v1 `default factory` export. The v1 factory is
  retained for the standalone host.
- **Multi-company manifest flag** (`backend.multiCompany: true`) — tells
  SAM the plugin can serve multiple Opera companies from one install.
- **Vite SPA frontend** — replaces the previous UMD lib-mode bundle.
  Built output (`frontend/dist/index.html` + `frontend/dist/assets/*`)
  matches SAM's iframe-mode expectations under `/apps/suppliers/`.
- **`.sap` packaging** — `npm run pack:sap` produces
  `suppliers-<version>.sap` for installation via SAM Central.
- **Standalone host** under `standalone/` — multi-company auto-discovery
  from `DATA_ROOT`, signed cookie auth, Opera SE + Opera 3 adapters,
  per-company opera.json mapping.
- **Dev host** under `dev-host/` — lightweight in-memory SQLite harness
  for frontend bring-up without Opera.
- **Settings tab** in the SPA — full surface of the legacy
  `supplier_automation_config` keys (timing, thresholds, notifications,
  automation, communications, onboarding, email templates).
- **30 settings keys** in `SUPPLIER_SETTINGS_DEFAULTS` (was 15) —
  brought into line with the legacy
  `sql_rag/supplier_statement_db.py` seed.

### Build
- `db/migrations/` moved to `src/db/migrations/` so the existing `tsc`
  build emits compiled `.js` files into `dist/db/migrations/`, where
  SAM's per-app DB provisioner looks at install time.

### Tests
- 214 tests passing (vitest).
