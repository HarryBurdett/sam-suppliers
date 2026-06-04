# Late-Statement Handling Audit — 2026-06-04

First-pass audit of how the suppliers app handles statements arriving
late, out-of-period, or out-of-sequence. Analogue of bank-rec's
out-of-sequence audit.

## Scope

- `src/services/statement-queue.ts` — queue + reconciliation ordering
- `src/services/aged-creditors.ts` — period-based reporting
- `src/services/statement-actions.ts` — status transitions
- `src/db/migrations/001_initial_schema.ts` — schema constraints
- `src/services/global-settings.ts` — `old_statement_threshold_days`,
  `payment_notification_days`

---

## Findings

### GAP — No closed-period check on statement processing

[statement-actions.ts:processStatement](../../../src/services/statement-actions.ts#L132)
[statement-queue.ts](../../../src/services/statement-queue.ts) — full
file

A statement for `statement_date='2024-01-15'` arriving today is
processed identically to one for `'2026-05-20'`. There is no:
- Period-end gate (Opera Purchase Ledger has period-end-locks; we
  don't consult them)
- Year-end gate
- Operator-configurable "don't process statements older than X
  months" rule

The plugin reads `old_statement_threshold_days` from settings (default
14) but uses it only for **flagging** in the queue UI — not for
**gating** processing. A reconciliation against a closed-period
statement can post allocations that operators didn't intend to.

(Suppliers doesn't currently write allocations to Opera —
`getCompanyDb` is read-only in the current flow. But the architecture
treats `getCompanyDb` as a write-capable Knex, and feature additions
that do `palloc` writes will inherit this hole.)

**Recommended fix:** add a check at the start of `processStatement`:
- If `statement_date < (today - max_age_days)`, refuse with a clear
  error or require an `override: true` flag.
- `max_age_days` driven by a settings key (probably reuse
  `old_statement_threshold_days` but make the semantics
  "soft warning" → "hard reject" configurable).

**Status:** Not fixed. Needs operator-configurable policy design
before code.

### GAP — Concurrent statements for same supplier+period not detected

[supplier-statements.ts:listStatements](../../../src/services/supplier-statements.ts)

No uniqueness constraint exists on
`(supplier_code, statement_date)` in `supplier_statements`. Two
statements with the same supplier code and date can coexist —
typically from an operator re-uploading a PDF or from SAM
redelivering, but possible from a supplier sending duplicate emails
too.

Bank-rec catches this via period-overlap + closing-balance checks.
Suppliers has nothing equivalent.

**Recommended fix:** at minimum, when listing statements for a
supplier, warn when multiple statements exist for the same period.
A stricter fix: unique constraint on
`(supplier_code, statement_date)` and a route option to "replace
existing" — but this would break legitimate re-upload workflows
unless the existing row is archived (see statement-recovery audit).

**Status:** Not fixed. Tied to the archive/restore work.

### PARTIAL — Out-of-order statement processing within a supplier

A supplier sends statements every month. If the May statement is
processed before April (because April was stuck waiting on a query
resolution), the reconciliation logic happily compares May's
closing balance against May's `ptran` snapshot — which already
reflects whatever happened in April. The audit log doesn't surface
"this was processed out of order."

The aged-creditors view (`aged-creditors.ts`) computes ages from
`ptran` transaction dates, not from statement dates, so the report
itself stays correct. But operators expecting to see statements
processed in chronological order will be confused.

**Recommended:** soft check — emit a `warnings: [...]` entry on the
process response when a statement for an older date is processed
after a newer one for the same supplier. Bank-rec calls this
pattern out explicitly in its out-of-sequence audit deferral.

**Status:** Not fixed. Soft check; low priority.

### PARTIAL — Query/follow-up reminder cycle not bounded against statement age

[supplier-queries.ts](../../../src/services/supplier-queries.ts) +
[router.ts: send-reminder handler](../../../src/router.ts)

The follow-up reminder flow uses `query_response_days` (default 7) and
`max_follow_up_reminders` (default 3). It does NOT check the
underlying statement's age — so a query raised on a 6-month-old
statement still triggers reminders.

For an aged statement that was eventually closed by other means
(supplier confirmed via phone, operator manually marked agreed), the
unresolved query keeps firing reminders.

**Recommended:** at reminder-send time, check
`statement.age_days > old_statement_threshold_days`. If older, skip
the reminder and mark the query as `auto_abandoned` with a clear
reason in the audit log.

**Status:** Not fixed.

### COVERED — Statement-date sorting in list endpoints

`listStatements` and `listSupplierDirectory` both sort by
`statement_date DESC` then `imported_at DESC`. UI consumers see
newest-first by default, which is the right behaviour for
operators triaging late arrivals.

### COVERED — Aged-creditors based on transaction dates, not statement dates

[aged-creditors.ts](../../../src/services/aged-creditors.ts) computes
bucket membership from `pt_trdate`. A late-arriving statement
doesn't shift the report — the report reflects Opera's transaction
truth, not the statement's claimed truth.

---

## Summary

- **2 GAP** findings (closed-period gate, duplicate-statement
  detection)
- **2 PARTIAL** findings (out-of-order processing within supplier,
  unbounded query reminders on old statements)
- **2 COVERED** verifications

None of the GAPs are catastrophic in the current read-only-Opera
posture, but they become real risks if/when the plugin writes
allocations back to Opera. The PARTIAL findings are operator-UX
issues, not data-integrity holes.

## Followup items (deferred)

- [ ] Design + implement closed-period / aged-statement gate at
      `processStatement`
- [ ] Decide policy on duplicate-statement detection (see
      `statement-recovery-audit` archive/restore work for the
      enabling primitive)
- [ ] Emit `warnings: [...]` on out-of-order statement processing
- [ ] Bound query-reminder cycle against statement age
- [ ] Tests covering each above
