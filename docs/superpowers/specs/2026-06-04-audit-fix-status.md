# Audit Fix Status — 2026-06-04

First-cut audit pass on sam-suppliers, modelled on bank-rec's
2026-05-15 audit-fix-status format. Three audit dimensions:

- `2026-06-04-allocation-integrity-audit.md` — 3 BLOCKER, 2 WEAK, 2 SOUND
- `2026-06-04-statement-recovery-audit.md` — 1 CRITICAL, 1 HIGH, 2 MEDIUM, 2 SOUND
- `2026-06-04-late-statement-handling-audit.md` — 2 GAP, 2 PARTIAL, 2 COVERED

15 findings total. Below: what was fixed in this pass vs deferred.

## Fixed + pushed (this pass)

| Severity | Item | Fix | Audit |
|---|---|---|---|
| WEAK | `recordProcessedEmail` check-then-insert race | Replaced the SELECT-then-INSERT pattern with `insert().onConflict('message_id').ignore().returning('id')`, falling back to a SELECT only when the conflict path fires. Eliminates the TOCTOU between check and insert. Test mock updated to model `onConflict.ignore()` semantics. | allocation-integrity |

That's the only fix landed in this pass. The audit pass itself — the
three findings docs — is the primary deliverable.

## Deferred — by impact tier

### CRITICAL / BLOCKER (3 items)

These are real correctness gaps under failure or concurrency, with
clear-but-non-trivial fixes. Each needs ~half a day with tests.

- **`extractStatementFromEmail` not idempotent** — re-running the LLM
  on the same email costs and drifts. Needs a
  `supplier_extraction_cache` table + service-layer cache check.
  (statement-recovery audit)
- **`acknowledgeStatement` non-atomic email + DB writes** — supplier
  can receive an acknowledgment email but our DB stays at
  `status='received'`, triggering re-send. Needs transaction wrapping
  + email-outcome flag on `supplier_communications`.
  (allocation-integrity audit)
- **`approveStatement` same shape** — same fix, same atomicity hole.
  (allocation-integrity audit)

### HIGH (1 item)

- **`processStatementEmail` duplicate-row race** — no unique index on
  `supplier_statements (source, source_ref)`, so two concurrent calls
  can both insert. Needs a migration + onConflict handling.
  (statement-recovery audit)

### MEDIUM / WEAK (4 items)

- `bulkApproveStatements` doesn't return per-statement results
  (allocation-integrity)
- `processStatement` has no status whitelist guard
  (allocation-integrity)
- Statement-line edits skip the change-audit table
  (statement-recovery)
- No archive/restore concept for `supplier_statements`
  (statement-recovery)

### GAP / PARTIAL (4 items)

These are feature-shape decisions, not pure bug fixes. They need
operator-facing policy choices before code:

- Closed-period gate on statement processing
- Duplicate-statement detection (`(supplier_code, statement_date)`
  uniqueness or warning)
- Out-of-order processing soft warning
- Bound query-reminder cycle against statement age
  (late-statement-handling audit, all four)

## Sound + covered (4 items — left as-is)

| Verification | Why solid |
|---|---|
| Knex query construction in list endpoints | Parameterised throughout; no SQL-injection surface |
| Migration idempotency | Standalone tracker + Knex's own tracker handle re-runs cleanly |
| Per-app DB scoping per company | Per-company SQLite under `<DATA_ROOT>/<code>/`; one company's bad write can't corrupt another's |
| Aged-creditors basis on `pt_trdate` | Report reflects Opera's transaction truth, immune to late statements |

## What this audit didn't cover

Honest limits:

- **No load / concurrency tests.** All findings are static-analysis +
  code-reading. A real audit needs fuzz / chaos / concurrent-request
  tests against a running plugin.
- **No Opera write-path review.** The plugin currently doesn't write
  to Opera (`getCompanyDb` is read-only in current flows). When/if
  `palloc`/`pnoml` writes land, they need their own audit.
- **No prompt-injection review on LLM extraction.** The extractor
  feeds supplier-controlled email text into `ctx.llm`. We should
  verify the prompt can't be hijacked to produce malicious JSON.
- **Frontend not audited.** XSS via supplier-controlled fields
  (subject, body) rendered in the SPA wasn't checked.

These belong in a follow-up pass.

## Estimated cleanup cost

- 3 CRITICAL/BLOCKER fixes: ~1.5 days (with tests)
- 1 HIGH fix: ~0.5 day
- 4 MEDIUM/WEAK fixes: ~1 day total
- 4 GAP/PARTIAL fixes: design + code, ~2–3 days total (varies with
  operator-policy decisions)

Total: ~5–7 days of focused work to reach the bank-rec equivalent
audit-fix posture (where the bulk of findings are addressed and the
remainder are explicitly accepted with documented rationale).
