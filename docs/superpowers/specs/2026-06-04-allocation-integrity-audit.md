# Allocation Integrity Audit — 2026-06-04

First-pass audit of the supplier-statement state-transition surface — the
analogue of bank-rec's posting-integrity audit. Covers acknowledge,
approve, process, query/follow-up flows and their interaction with
external side effects (email send) and the per-app DB.

Format mirrors bank-rec's
`docs/superpowers/specs/2026-05-15-audit-fix-status.md`: findings tagged
**BLOCKER** (data corruption / silent failure possible), **WEAK**
(unsafe under failure but recoverable), **SOUND** (verified correct).
Severity reflects the risk in the *current* port — many WEAKs are
faithful ports of legacy Python behaviour and not regressions.

---

## Scope

- `src/services/statement-actions.ts` (519 LOC) — acknowledge / approve /
  process / bulk-approve / edit-response
- `src/services/supplier-statements.ts` (239 LOC) — list / get
- `src/services/statement-lines.ts` (369 LOC) — line edits + status writes
- `src/services/statement-queue.ts` (315 LOC) — queue + reconciliation
- `src/services/communications.ts` (223 LOC) — supplier_communications
  inserts

External side effects in scope: `ctx.email.send()`, `ctx.llm.chat()`,
Opera `palloc` / `pnoml` writes (currently read-only via
`getCompanyDb`).

---

## Findings

### BLOCKER — `acknowledgeStatement` non-atomic email + DB update

[statement-actions.ts:294-311](../../../src/services/statement-actions.ts#L294)

```ts
const sendResult = await email.send({ to: recipient, subject, body });
const nowIso = new Date().toISOString();

await appDb('supplier_statements')
  .where({ id: statementId })
  .update({ status: 'acknowledged', acknowledged_at: nowIso, ... });

await appDb('supplier_communications').insert({ ... });
```

Three operations, no transaction:
1. Email send (external, irreversible)
2. Statement status update
3. Communications-row insert

Failure modes:
- **Email sends, status update fails**: supplier received an acknowledgment
  email but our DB still says `status='received'`. Next scheduled retry
  re-sends the acknowledgment — supplier gets duplicates.
- **Email sends, communications insert fails**: silent. The acknowledgment
  is gone from the audit trail; an operator looking at communications
  history sees nothing.
- **Status update succeeds, communications insert fails**: status is
  acknowledged but no audit row. Less critical but degrades the audit
  log's reliability.

The email is the outermost side effect and cannot be rolled back. The
two DB writes should be inside one transaction, with the email send
gated by transaction commit. A modest version: wrap the two DB writes
in `appDb.transaction()` and ensure the email-send error path is
explicitly handled (and surfaced to the caller, not silently logged).

A correct version: send the email AFTER the DB write commits, and
record `email_sent: true/false` in the communications row so the row
serves as both audit and replay marker. Then a retry policy can re-send
only the rows where `email_sent: false`.

**Recommended fix:** wrap both DB writes in a transaction; record
`email_sent` (boolean) + `email_error` (text) in
`supplier_communications`; have the retry path check that flag.

**Status:** Not fixed in this session. Flagging.

### BLOCKER — `approveStatement` same shape

[statement-actions.ts:340-460](../../../src/services/statement-actions.ts#L340)

Same pattern — email send, statement update, communications insert,
no transaction. Same three failure modes. Same recommended fix.

The approve flow has an additional risk dimension: the statement might
already be in `status='approved'` from a prior attempt. The current
code rejects approval from statuses not in `['reconciled',
'acknowledged', 'queued', 'received']` — this DOES guard against
double-approval, but only after the policy check and supplier-name
lookup have run. The earlier-failure window (network / Opera lookup
fail) leaves the statement in the prior status, which is recoverable
but operator-visible.

**Status:** Not fixed in this session.

### BLOCKER — `bulkApproveStatements` does no per-statement isolation

[statement-actions.ts:485-519](../../../src/services/statement-actions.ts#L485)

The bulk wrapper calls `approveStatement` in a loop. A failure mid-loop
leaves the batch in a partially-approved state — some statements have
gone through the (non-atomic) approve flow, others haven't. The HTTP
response surfaces the count, but operators can't tell which IDs
succeeded vs which need retry without inspecting per-statement state.

**Recommended fix:** return per-statement results from
`bulkApproveStatements`, not just `{ ok, errors }` counts. Caller can
then drive retry on the failed subset.

**Status:** Not fixed in this session.

### WEAK — `processStatement` updates status without prior status check

[statement-actions.ts:132-151](../../../src/services/statement-actions.ts#L132)

`processStatement` flips status to `'processing'` regardless of current
status. If the statement is already `'approved'` or `'completed'`,
this regresses it. Probably benign because the route layer wouldn't
normally call process on a terminal-state statement, but there's no
guard at the service layer.

**Recommended fix:** add a status whitelist check matching
`approveStatement`.

**Status:** Not fixed.

### WEAK — `recordProcessedEmail` check-then-insert race

[processed-emails.ts:67-100](../../../src/services/processed-emails.ts#L67)

```ts
const existing = await appDb('processed_emails')
  .where({ message_id: messageId })
  .first();
if (existing) return { duplicate: true, ... };

const inserted = await appDb('processed_emails').insert({...});
```

Classic TOCTOU. Between the `.first()` and the `.insert()`, a
concurrent request can insert the same `message_id`. The unique
constraint catches it — but the second insert throws, and the function
returns `success: false` with a confusing constraint-violation error
rather than `duplicate: true`.

This matters if SAM redelivers the same email rapidly (webhook + delta
poll concurrent) or if a manual reprocess and an automated process
race.

**Recommended fix:** `.insert(...).onConflict('message_id').ignore()`
returns the rows actually inserted (empty array on conflict), letting
us distinguish "I inserted" from "someone else got there first".

**Status:** Tractable — small fix. Not done in this session to keep
the audit pass scope tight.

### SOUND — Knex query construction in list endpoints

[supplier-statements.ts:76-118](../../../src/services/supplier-statements.ts#L76)

`listStatements` uses parameterised Knex builders throughout (no
string concatenation), and all user inputs flow through the query
builder's binding layer. No SQL injection surface.

### SOUND — Migration idempotency

[src/db/migrations/001_initial_schema.ts](../../../src/db/migrations/001_initial_schema.ts)

All `createTable` calls are unique-on-creation (Knex throws on
re-create); the standalone-host runner records migration filenames in
`_standalone_migrations` so re-runs are no-ops. SAM-side uses Knex's
own `knex_migrations` tracker.

---

## Summary

- **3 BLOCKER** findings (acknowledge atomicity, approve atomicity,
  bulk-approve isolation)
- **2 WEAK** findings (processStatement status guard,
  recordProcessedEmail race)
- **2 SOUND** verifications

The three BLOCKER findings share a single root cause: the legacy
Python port faithfully reproduces the "fire email, then update DB"
pattern which was already weak in Python. The fix shape is consistent
across all three:

1. Wrap DB writes in `appDb.transaction()`
2. Record the email outcome (`email_sent: bool`, `email_error: text`)
   alongside the audit row
3. Make the retry path consult the email outcome flag

Estimated effort: ~1 day for all three, including tests.

## Followup items (deferred)

- [ ] Wrap acknowledge in transaction; record email outcome
- [ ] Wrap approve in transaction; record email outcome
- [ ] Make bulk-approve return per-statement results
- [ ] Add status whitelist to processStatement
- [ ] Replace check-then-insert in recordProcessedEmail with
      onConflict.ignore
- [ ] Add tests covering each fix above (each should be one
      describe block with the failure mode reproduced)
