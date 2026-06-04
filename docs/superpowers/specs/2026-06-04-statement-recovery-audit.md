# Statement Recovery Audit — 2026-06-04

First-pass audit of the recovery surface — what happens when a
statement is reprocessed, an email is redelivered, or extraction
needs to re-run. Analogue of bank-rec's restore-recovery audit.

## Scope

- `src/services/processed-emails.ts` — email-redelivery dedup
- `src/services/statement-queue.ts` — queue / reprocess flow
- `src/router.ts` — `/extract-from-email/:email_id`,
  `/process-email/:email_id`, `/reconcile/:email_id`,
  `/statements/:id/reprocess`
- `src/services/misc-endpoints.ts` — `extractStatementFromText`,
  `processStatementEmail`

External side effects: `ctx.llm.chat()` cost, supplier statements
written to per-app DB, file attachments fetched via
`supplierEmailAttachments`.

---

## Findings

### CRITICAL — `extractStatementFromEmail` not idempotent

[router.ts:2412-2440](../../../src/router.ts#L2412)

The route fetches the attachment, calls `extractStatementFromText`
(LLM), and returns the parsed extraction. It does NOT check whether a
statement has already been extracted from this email. Repeated calls
re-run the LLM and re-extract — paid each time, with no caching of the
prior result.

This matters two ways:
1. **Cost**: extraction is an LLM call. SAM-redelivered messages
   (webhook + delta poll) can trigger this twice for the same email
   if the consumer doesn't dedup at the route layer.
2. **Correctness drift**: the LLM is non-deterministic. Re-extracting
   the same email can produce slightly different line items, which can
   confuse downstream reconciliation if the operator opens an old
   statement and the lines don't match what they remember.

The `processed_emails` table exists for exactly this purpose but
`extractStatementFromEmail` doesn't consult it. The route returns the
extraction *blob* without persisting; persistence happens later in a
separate route (`/process-email`).

**Recommended fix:** add an extraction-cache keyed by
`(email_id, attachment_id)` — either as a column on `processed_emails`
or a dedicated `supplier_extraction_cache` table (which exists in
legacy Python — see `supplier_extraction_cache.db` referenced in
src/db/migrations/001_initial_schema.ts header). Return the cached
extraction if present; otherwise extract and cache.

**Status:** Not fixed. Cache table would need a migration.

### HIGH — Re-`processStatementEmail` is silently a no-op-then-insert

[misc-endpoints.ts:processStatementEmail](../../../src/services/misc-endpoints.ts)
[router.ts:2453-2459](../../../src/router.ts#L2453)

`processStatementEmail` checks for an existing
`supplier_statements` row where `source='email' AND source_ref=emailId`
— if present, returns it; otherwise inserts a queued statement.

But: `source_ref` on `supplier_statements` is **not unique** (the
column has no constraint per migration 001). So if two
`/process-email` calls race for the same `email_id`, both can see
"no existing" and both can insert — silently creating two statements
for one email.

**Recommended fix:** add a unique index on
`(source, source_ref)` for `supplier_statements`. Then either:
- Catch the constraint violation and treat as "duplicate, return
  existing"
- Use `onConflict(['source', 'source_ref']).ignore()` and then
  re-query for the row that owns the slot.

**Status:** Not fixed. Needs a migration.

### MEDIUM — No archive/restore concept for statements

[router.ts](../../../src/router.ts) — no `/restore` or `/archive`
endpoints exist for `supplier_statements`.

Bank-rec built a complete archive/restore flow (the audit doc cites
the ARCHIVE-row false-orphan fix). Suppliers has no equivalent — when
a statement is deleted, it's gone, no recovery. This is a missing
feature rather than a bug, but for parity with bank-rec the absence
is worth noting.

**Recommended:** add `archived_at` timestamp column + a soft-delete
endpoint, mirroring bank-rec's pattern. Operator wants to undo a wrong
delete should be able to.

**Status:** Not fixed. Feature-scope work, not an audit fix.

### MEDIUM — Statement-line edits don't write to change_audit

[statement-lines.ts](../../../src/services/statement-lines.ts) — line
edits (`updateStatementLine`, `deleteStatementLine`) update rows
without writing to the `supplier_change_audit` table.

The change_audit table exists (migration 001 line ~95-105) and is used
by some contact-edit paths. Statement-line edits bypass it. An
operator who changes a line's status from `Query` to `Matched` and
later wants to see who did that — can't.

**Recommended:** route all statement_line writes through a
`recordChange` helper that writes to change_audit. Use the same
helper for other writes that should be audited.

**Status:** Not fixed.

### SOUND — `recordProcessedEmail` does check for prior insertion

The function DOES check before inserting (the TOCTOU race noted in
the allocation-integrity audit is a refinement, not a correctness
hole). Email redelivery via SAM's webhook should land in the
`duplicate: true` branch most of the time.

### SOUND — Per-app DB scoped per company

`standalone/company-registry.ts` builds a per-company SQLite under
`<DATA_ROOT>/<code>/suppliers.sqlite`. A bad write to one company's
DB cannot corrupt another company's data. This is robust isolation.

---

## Summary

- **1 CRITICAL** (extraction not idempotent — burns LLM cost)
- **1 HIGH** (process-email duplicate-row race — silent data
  corruption under concurrency)
- **2 MEDIUM** (missing archive/restore, missing line-edit audit
  trail)
- **2 SOUND**

The CRITICAL and HIGH are both fixable with a small migration + a
service-layer change. The MEDIUM findings are scope additions, not
bug fixes.

## Followup items (deferred)

- [ ] Migration: add `supplier_extraction_cache` table (mirror
      legacy Python)
- [ ] `extractStatementFromEmail`: check cache before LLM call;
      populate cache on success
- [ ] Migration: add unique index on `supplier_statements
      (source, source_ref)`
- [ ] `processStatementEmail`: handle constraint violation as
      "duplicate, return existing"
- [ ] Migration: add `archived_at` to `supplier_statements`
- [ ] Routes: `POST /api/supplier-statements/:id/archive` +
      `POST /api/supplier-statements/:id/restore`
- [ ] Statement-line edits: route through a `recordChange` helper
- [ ] Tests covering each above
