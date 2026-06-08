# Services Layer

25 service modules under `src/services/`. Each is a pure-ish module
exporting async functions that:

- Take `appDb: Knex` as the first param
- Take other typed dependencies (logger, lookup adapters, email
  sender) as additional params
- Return `{ success: boolean, ...data, error?: string }` shapes
- Throw nothing — errors are returned in the response shape

The router (`src/router.ts`) is the only consumer of services. No
service imports another service (with one exception: communications
helpers used by statement-actions).

## Index

| File | LOC | Exports | Purpose |
|---|---|---|---|
| `aged-creditors.ts` | 521 | `getAgedCreditorsSummary`, `getAgedCreditorsTrend`, `getAgedCreditorsDetail` | Aged creditors report (30/60/90/120+ days) |
| `aged-debt.ts` | 157 | `getAgedDebtSummary`, `getAgedDebtBySupplier` | Aged debt summary (legacy, simpler view) |
| `approved-emails.ts` | 200 | `listApprovedEmails`, `approveEmail`, `revokeEmail` | Sender allow-list per supplier |
| `automation-config.ts` | 214 | `getAutomationConfig`, `saveAutomationConfig` | Per-supplier automation rules |
| `change-audit.ts` | 203 | `recordChange`, `listChangeAudit`, `searchChangeAudit` | Operator-change audit log |
| `communications.ts` | 223 | `listCommunications`, `addCommunication`, `deleteCommunication` | Outbound email audit |
| `contacts.ts` | 165 | `listContacts`, `addContact`, `deleteContact` | Non-Opera supplier contacts |
| `default-email-ingest.ts` | 272 | `buildDefaultEmailIngest` | Wraps `ctx.emailIngest` → `supplierEmailAttachments` |
| `global-settings.ts` | 326 | `SUPPLIER_SETTINGS_DEFAULTS`, `getGlobalSupplierSettings`, `updateGlobalSupplierSettings` | Tenant-wide settings |
| `health-check.ts` | 183 | `runSuppliersHealthCheck` | Orphan-code check vs Opera pname |
| `misc-endpoints.ts` | 698 | `getCreditorsDashboard`, `getCreditorsReport`, `searchCreditors`, `getSupplierTransactions`, `getSupplierStatement`, `previewStatementResponse`, `extractStatementFromText`, `processStatementEmail`, `reconcileStatementByEmail` | Catch-all for endpoints not in their own service |
| `onboarding.ts` | 234 | `listOnboarding`, `getOnboarding`, `saveOnboarding` | New-supplier onboarding state |
| `opera-contacts.ts` | 563 | `getMergedContacts`, `createOperaContact`, `updateOperaContact`, `deleteOperaContact` | Opera-side contact CRUD (uses transactions) |
| `processed-emails.ts` | 205 | `isEmailProcessed`, `recordProcessedEmail`, `listProcessedEmails` | Email-redelivery dedup |
| `remittance-log.ts` | 179 | `getRemittanceLog`, `recordRemittance` | Remittance audit trail |
| `security.ts` | 398 | `listSecurityAlerts`, `verifySecurityAlert`, `listAuditLog`, `scanForChanges`, `listEmailFlags`, `listApprovedSenders`, `addApprovedSender`, `removeApprovedSender` | Bank-detail-change alerting + approved-senders mgmt |
| `statement-actions.ts` | 519 | `processStatement`, `acknowledgeStatement`, `approveStatement`, `editResponse`, `bulkApproveStatements` | Statement state-transition actions (the lifecycle engine) |
| `statement-lines.ts` | 369 | `listLines`, `addLines`, `updateLine`, `deleteLines`, `listOperaOnly` | Statement-line CRUD + Opera-only items |
| `statement-queue.ts` | 315 | `getStatementQueue`, `getStatementDashboard` | Queue UI + dashboard metrics |
| `supplier-config.ts` | 140 | `getSupplierConfig`, `saveSupplierConfig`, `syncSupplierConfig`, `getSupplierConfigDetail` | Per-supplier config JSON |
| `supplier-directory.ts` | 168 | `listSupplierDirectory` | Searchable supplier list (combines pname + per-app state) |
| `supplier-list.ts` | 136 | `listSuppliers`, `getSupplier` | Opera-backed supplier list |
| `supplier-overrides.ts` | 192 | `listOverrides`, `addOverride`, `deleteOverride` | Per-line operator overrides |
| `supplier-queries.ts` | 327 | `listQueries`, `resolveQuery`, `autoResolveQueries`, `listOverdueQueries`, `sendQueryReminder` | Query lifecycle + matching engine |
| `supplier-statements.ts` | 239 | `listStatements`, `getStatement` | Statement list + detail |

## Common patterns

### Response shape

```ts
interface ServiceResponse<T = unknown> {
  success: boolean;
  // Typed payload fields per service
  ...
  error?: string;
}
```

Services never throw — they catch internally and return
`{ success: false, error }`.

### `appDb` access

```ts
export async function listSomething(
  appDb: Knex,
  opts: ListOptions = {},
): Promise<ListResponse> {
  try {
    const rows = await appDb('table_name').where(...).select(...);
    return { success: true, items: rows.map(rowToShape) };
  } catch (err: any) {
    return { success: false, items: [], error: err?.message ?? String(err) };
  }
}
```

### Date normalization

Helpers `dateToYmd(d)` and `dateToIso(d)` defined per-service (or
imported from `_shared/`). Knex returns Date objects on MSSQL and
strings on SQLite; helpers normalize to ISO/YMD strings before
serialization.

### Opera lookups

Services that need Opera data take an adapter interface, not a Knex
directly. Example from `statement-actions.ts`:

```ts
export interface OperaSupplierLookup {
  resolveName(supplierCode: string): Promise<string>;
}

export interface PtranLookup {
  forSupplier(supplierCode: string): Promise<PtranLine[]>;
}
```

The router constructs the lookup from `ctx.db.getCompanyDb(code)` and
passes it in. This decouples the service from Knex, simplifies tests
(mock the lookup, not the entire Knex query builder).

### Email sender

Same pattern for email — services take an `EmailSender` interface, not
a `ctx.email` directly:

```ts
export interface EmailSender {
  send(opts: {
    to: string;
    subject: string;
    body: string;
    pdfPath?: string | null;
  }): Promise<{ success: boolean; error?: string }>;
}
```

### Communication-policy gates

`isCommunicationAllowed(appDb, supplierCode)` returns
`{ allowed: bool, reason?: string }` — checks `never_communicate`
on `supplier_contacts_ext`. Called from acknowledge/approve/reminder
paths.

## Service contracts (selected key services)

### `statement-actions.ts`

The state-transition engine. Five public functions, all with similar
shape:

```ts
processStatement(appDb, statementId): Promise<{ success, status?, error? }>
acknowledgeStatement(appDb, email, supplierLookup, statementId): Promise<AcknowledgeResponse>
approveStatement(appDb, email, supplierLookup, statementId, input): Promise<ApproveResponse>
editResponse(appDb, statementId, input): Promise<EditResponse>
bulkApproveStatements(appDb, email, supplierLookup, ids, input): Promise<BulkResponse>
```

`AcknowledgeResponse`:
```ts
{
  success: boolean;
  message?: string;
  email_sent?: boolean;
  email_error?: string;
  recipient?: string;
  subject?: string;
  body?: string;
  policy_blocked?: boolean;
  error?: string;
}
```

State transitions:
- `processStatement`: `* → 'processing'` (no current-status check;
  audit flagged)
- `acknowledgeStatement`: `* → 'acknowledged'`, requires
  `acknowledged_at IS NULL`
- `approveStatement`: status must be in `['reconciled',
  'acknowledged', 'queued', 'received']`; transitions to `'approved'`
- `editResponse`: updates `response_text` / `response_subject`
- `bulkApproveStatements`: loops `approveStatement` per ID

**Audit gap:** none of these wrap email send + DB write in a
transaction. See `2026-06-04-allocation-integrity-audit.md`.

### `misc-endpoints.ts`

Bucket for endpoints that don't justify their own service file:

- **Creditors dashboard / report / search** — aggregate Opera-side
  data into UI-friendly shapes
- **Supplier transactions / statement** — per-supplier `ptran` reads
- **`previewStatementResponse`** — LLM-generated response preview
- **`extractStatementFromText`** — LLM-driven statement extraction
  (called by `/extract-from-text`, `/extract-from-file`,
  `/extract-from-email/:email_id`)
- **`processStatementEmail`** — idempotent (check-then-insert) wrapper
  that creates a `supplier_statements` row from an email ID
- **`reconcileStatementByEmail`** — orchestrates extract → process →
  match

**LLM call signature** (from `extractStatementFromText`):
```ts
const stream = llm.chat({
  messages: [{ role: 'user', content: `${EXTRACTION_PROMPT}\n\n${content}` }],
  model: 'claude-sonnet-4',     // standalone adapter aliases to claude-sonnet-4-6
  maxTokens: 4000,
  temperature: 0.2,
});
```

Chunks are `string` | `{text}` | `{delta: {text}}` — accumulated into
a single string, JSON parsed (after stripping `^```(?:json)?\s*` and
`\s*```$`).

### `supplier-queries.ts`

Matching engine + query lifecycle.

```ts
listQueries(appDb, opts: { supplierCode?, status? }): Promise<ListQueriesResponse>
resolveQuery(appDb, queryId, input: { resolvedBy, notes? }): Promise<ResolveResponse>
autoResolveQueries(appDb, operaDb): Promise<AutoResolveResponse>  // matches against ptran by ref+amount within 1p
listOverdueQueries(appDb, days): Promise<ListQueriesResponse>
sendQueryReminder(appDb, email, queryId): Promise<ReminderResponse>
```

`autoResolveQueries`: walks open queries, checks Opera `ptran` for
matching `(supplier_code, reference, amount±1p)` — when found, marks
query resolved with `resolved_by='auto'` and reasoning in
`resolution_notes`.

### `health-check.ts`

`runSuppliersHealthCheck(appDb, operaDb): Promise<HealthCheckResponse>`

Returns:
```ts
{
  success: true,
  checks: [
    { name: 'orphan_supplier_codes', status: 'ok' | 'warn', detail: ... },
    { name: 'supplier_db_present', status: ..., detail: ... },
    ...
  ]
}
```

Used by the dashboard's health-check widget. Each check runs
independently and reports its own status — one check failing doesn't
fail the whole report.

### `default-email-ingest.ts`

Wraps `ctx.emailIngest` into the simpler `supplierEmailAttachments`
shape:

```ts
interface SupplierEmailAttachmentsAdapter {
  fetchAttachment(opts: {
    emailId: number;
    attachmentId?: string;
  }): Promise<{ text?: string; bytes?: Uint8Array } | null>;
}
```

When `attachmentId` is supplied, calls
`ctx.emailIngest.getAttachmentText(msg, attachmentId)`. When not,
returns the email's plain-text body (HTML stripped).

Subscribes to `registerHandler` on each claimed mailbox, caches
ingested messages in a small (default 1000-entry) LRU keyed by a
sequential numeric ID. `fetchAttachment({emailId})` looks up the
cached message by that ID.

Activates only when `ctx.emailIngest` is present AND
`ctx.config.mailboxes` is non-empty.

## Testing

Each service has a matching `tests/<service>.test.ts`. Tests use a
hand-rolled `makeAppDb(state)` mock that simulates the Knex query
builder for the operations the service uses (where, andWhere, first,
insert, update, delete, etc.). See [12-testing.md](./12-testing.md)
for the mock pattern.

Test coverage:
- 24 test files, 214 tests
- Every service has a test file except `default-email-ingest.ts`
  (deferred — complex event-based interface)
- `migrations.test.ts` runs all 4 migrations against in-memory SQLite
