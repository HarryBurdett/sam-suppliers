# sam-suppliers — Reproduction Specification

This directory specifies the supplier-management plugin in enough
detail to reproduce it from scratch. A competent TypeScript engineer
following these documents should arrive at a functionally equivalent
application without referring to the source.

Spec snapshot: **v1.0.0** (2026-06-04).

## What the app is

A SAM (AI-SAM platform) plugin that automates supplier-statement
reconciliation against Opera Purchase Ledger:

- Scans operator mailboxes (via `ctx.emailIngest`) for supplier
  statement emails
- AI-extracts statement line items from PDFs / email bodies (via
  `ctx.llm`)
- Reconciles extracted lines against Opera `ptran` (posted
  transactions) for the supplier
- Manages a query / follow-up reminder lifecycle for unresolved lines
- Sends acknowledgment / agreed / query response emails (via
  `ctx.email`)
- Generates remittance advice + creditor reporting
- Maintains supplier contacts, approved senders, and security audit

Backend: TypeScript / Express router, ~10K LOC, runs as a SAM v2
plugin (`samContextVersion: 2`) or under a standalone host.

Frontend: React 18 / Vite SPA, ~5K LOC, mounted by SAM in an iframe at
`/apps/suppliers/`.

Per-app SQLite (standalone) or per-app MSSQL (SAM). Opera SE access
via Knex (mssql); Opera 3 via HTTP agent (scaffolded).

## How to read this spec

| # | Doc | When to read |
|---|---|---|
| 00 | [reproduction-checklist.md](./00-reproduction-checklist.md) | Start here — ordered build steps |
| 01 | [overview.md](./01-overview.md) | Domain model + lifecycle (suppliers → statements → lines → queries → responses) |
| 02 | [architecture.md](./02-architecture.md) | SAM v1/v2 plugin contract, dual export, standalone vs plugin mode |
| 03 | [manifest.md](./03-manifest.md) | `manifest.json` field-by-field |
| 04 | [data-model.md](./04-data-model.md) | Every table, every column, every constraint |
| 05 | [settings.md](./05-settings.md) | All 30 settings keys + defaults + descriptions |
| 06 | [services.md](./06-services.md) | 25 service modules, exported functions, behaviour |
| 07 | [api-endpoints.md](./07-api-endpoints.md) | All 106 routes — method, path, request, response |
| 08 | [frontend.md](./08-frontend.md) | 11 pages, shared components, API shim, router shim |
| 09 | [standalone-runtime.md](./09-standalone-runtime.md) | Multi-company host, auth, Opera adapters, LLM adapter |
| 10 | [build-and-package.md](./10-build-and-package.md) | tsc + Vite + `.sap` packaging pipeline |
| 11 | [external-services.md](./11-external-services.md) | Shape and semantics of every `ctx.*` service the plugin consumes |
| 12 | [testing.md](./12-testing.md) | Test strategy + fixture patterns |

## Out of scope

This spec captures the **behaviour** of the app, not its provenance.
It doesn't reproduce:

- The legacy Python source it was ported from (`apps/suppliers/`)
- The audit findings against the current implementation (those live
  under [../superpowers/specs/](../superpowers/specs/))
- The git history or release process

To rebuild bug-for-bug — including the known atomicity holes flagged
in the audit — the implementer should treat the audit docs as
*deliberately deferred fixes* and reproduce the current weak
behaviour, then apply the audit fixes.

## Authoritative references

When this spec disagrees with the source, the source wins. Specific
files referenced often:

- `manifest.json` — plugin manifest
- `src/index.ts` — entry point (dual export: v2 register + v1 factory)
- `src/router.ts` — full HTTP API surface
- `src/services/*.ts` — service-layer implementations
- `src/db/migrations/00X_*.ts` — schema-of-record
- `frontend/src/Suppliers.tsx` — top-tab nav + page composition
- `standalone/server.ts` — standalone host entry point

## Versioning

This spec describes v1.0.0. When the implementation evolves, the spec
should evolve with it — each section is small enough to update
section-by-section. Tag new spec versions at the same git tag as the
implementation they describe.
