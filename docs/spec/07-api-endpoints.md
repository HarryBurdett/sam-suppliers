# API Endpoints

106 routes mounted under `/api/apps/suppliers/*` (SAM strips the
prefix to `/api/*` before forwarding). All routes:

- Use `req.user.tenantId` for tenant scoping (set by SAM auth or
  standalone auth middleware)
- Use `req.operaCompany` for Opera company scoping (set by SAM from
  `X-Opera-Company` header, or by standalone from the session
  cookie's `companyCode`)
- Return `application/json` with shape `{ success: boolean, ...data,
  error?: string }`
- Return HTTP 400 for "no company in context", 503 for "Opera
  unavailable", 500 for unhandled errors

Some paths have BOTH spellings (e.g.
`/api/suppliers/:code/contacts` and
`/api/supplier-contacts/:account`). This is intentional — the Python
legacy used one spelling, the SAM canonical paths use another, and
the opera-3 mirror middleware routes both via prefix-stripping.
Don't deduplicate; keep both registered.

## Index

Grouped by concern. Method + path + brief description.

### Plugin status / settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/suppliers/status` | Liveness probe; returns tenant, opera type |
| GET | `/api/suppliers/settings` | Same as `/api/supplier-settings` (back-compat) |
| POST | `/api/suppliers/settings` | Same as `POST /api/supplier-settings` |
| GET | `/api/supplier-settings` | Returns all 30 settings + defaults |
| POST | `/api/supplier-settings` | Bulk update settings; validation applies |
| GET | `/api/suppliers/health-check` | Run health checks (orphan codes, DB connectivity) |

### Suppliers (Opera-backed)

| Method | Path | Description |
|---|---|---|
| GET | `/api/suppliers` | List Opera suppliers (`pname`) |
| GET | `/api/suppliers/:code` | Single supplier detail |
| GET | `/api/suppliers/directory` | Supplier directory (combines pname + per-app state) |
| GET | `/api/supplier-directory` | Same — alt spelling |
| GET | `/api/supplier/account/first` | Returns first supplier account (for "select supplier" UI bootstrap) |
| GET | `/api/supplier/account/:account` | Account-by-code lookup |
| GET | `/api/suppliers/aged-debt` | Aged-debt summary |
| GET | `/api/suppliers/aged-debt/by-supplier` | Aged-debt grouped by supplier |
| GET | `/api/creditors/dashboard` | Creditors dashboard summary |
| GET | `/api/creditors/report` | Detailed creditors report |
| GET | `/api/creditors/search` | Creditor search (by name, code, balance) |
| GET | `/api/creditors/aged` | Aged-creditors summary (30/60/90/120+) |
| GET | `/api/creditors/aged/trend` | Aged-creditors trend over time |
| GET | `/api/creditors/aged/:account` | Per-supplier aged-creditors detail |
| GET | `/api/creditors/supplier/:account` | Supplier detail (creditors-view) |
| GET | `/api/creditors/supplier/:account/transactions` | Per-supplier `ptran` list |
| GET | `/api/creditors/supplier/:account/statement` | Per-supplier statement (computed from ptran) |

### Statements

| Method | Path | Description |
|---|---|---|
| GET | `/api/supplier-statements` | List statements (filters: supplier_code, from_date, to_date, limit) |
| GET | `/api/supplier-statements/:statement_id` | Statement detail (header + lines + opera-only) |
| GET | `/api/supplier-statements/:statement_id/lines` | Lines for a statement |
| GET | `/api/supplier-statements/:statement_id/pdf` | PDF binary (404 if no `email_pdf_path`) |
| GET | `/api/supplier-statements/queue` | Statement queue (status='received' or 'queued') |
| GET | `/api/supplier-statements/dashboard` | Statement dashboard metrics |
| GET | `/api/supplier-statements/history` | Historical statements (default 90 days) |
| GET | `/api/supplier-statements/reconciliations` | Statements with reconciliation status |
| GET | `/api/suppliers/statements` | Same as `/api/supplier-statements` (alt) |
| GET | `/api/suppliers/statements/:id` | Statement detail (alt) |
| GET | `/api/suppliers/statements/:id/lines` | Lines (alt) |
| GET | `/api/suppliers/statements/:id/opera-only` | Items in Opera ptran but not on statement |
| GET | `/api/suppliers/statements/:id/overrides` | Per-line operator overrides |
| POST | `/api/suppliers/statements/:id/lines` | Add lines (operator manual entry) |
| PATCH | `/api/suppliers/statement-lines/:line_id` | Update a single line |
| DELETE | `/api/suppliers/statements/:id/lines` | Delete lines (body: `{line_ids: number[]}`) |
| POST | `/api/suppliers/statements/:id/overrides` | Add override |
| DELETE | `/api/suppliers/overrides/:id` | Delete override |

### Statement actions

| Method | Path | Description |
|---|---|---|
| POST | `/api/supplier-statements/:id/process` | Mark `'processing'` |
| POST | `/api/supplier-statements/:statement_id/process` | Same — alt spelling |
| POST | `/api/supplier-statements/:id/acknowledge` | Send ack email + mark `'acknowledged'` |
| POST | `/api/supplier-statements/:statement_id/acknowledge` | Alt |
| POST | `/api/supplier-statements/:id/approve` | Send response email + mark `'approved'` |
| POST | `/api/supplier-statements/:statement_id/approve` | Alt |
| POST | `/api/supplier-statements/queue/bulk-approve` | Approve many in one call (body: `{ids, approved_by}`) |
| PUT | `/api/supplier-statements/:id/response` | Edit response (alt: same as edit-response) |
| PUT | `/api/supplier-statements/:statement_id/edit-response` | Edit response body/subject |
| POST | `/api/supplier-statements/:statement_id/preview-response` | LLM preview of response body |
| POST | `/api/supplier-statements/:statement_id/send-updated-status` | Send a status-update email |

### Statement extraction (LLM)

| Method | Path | Description |
|---|---|---|
| POST | `/api/supplier-statements/extract-from-text` | Body `{content}` → LLM extract → `{extraction: {supplier_code, statement_date, lines: [...]}}` |
| POST | `/api/supplier-statements/extract-from-file` | Body `{content}` (multipart not supported; expects pre-extracted text) |
| POST | `/api/supplier-statements/extract-from-email/:email_id` | Fetch attachment via `supplierEmailAttachments` → LLM extract |
| POST | `/api/supplier-statements/process-email/:email_id` | Create supplier_statements row from email (idempotent via processed_emails) |
| POST | `/api/supplier-statements/reconcile/:email_id` | Orchestrates extract + process + match |

### Queries / follow-ups

| Method | Path | Description |
|---|---|---|
| GET | `/api/supplier-queries` | List queries (filters: supplier_code, status) |
| GET | `/api/supplier-queries/overdue` | List overdue queries (older than `query_response_days`) |
| POST | `/api/supplier-queries/:query_id/resolve` | Mark resolved with notes |
| POST | `/api/supplier-queries/auto-resolve` | Auto-resolve by matching against Opera ptran |
| POST | `/api/supplier-queries/:query_id/send-reminder` | Send reminder email; bumps reminder_count |
| POST | `/api/supplier-queries/:query_id/remind` | Same — alt spelling |

### Contacts

| Method | Path | Description |
|---|---|---|
| GET | `/api/supplier-contacts/:account` | Merged contacts (Opera pname + supplier_contacts_ext) |
| POST | `/api/supplier-contacts/:account/opera` | Create Opera contact (writes to Opera via transaction) |
| PUT | `/api/supplier-contacts/:account/opera/:contact_id` | Update Opera contact |
| DELETE | `/api/supplier-contacts/:account/opera/:contact_id` | Delete Opera contact |
| GET | `/api/suppliers/:code/contacts` | List ext contacts for supplier |
| POST | `/api/suppliers/:code/contacts` | Add ext contact |
| DELETE | `/api/suppliers/contacts/:contact_id` | Delete ext contact |
| GET | `/api/suppliers/:code/approved-emails` | List approved senders |
| POST | `/api/suppliers/:code/approved-emails` | Approve an email |
| DELETE | `/api/suppliers/approved-emails/:record_id` | Revoke approval |

### Configuration (per-supplier)

| Method | Path | Description |
|---|---|---|
| GET | `/api/supplier-config` | List configs |
| GET | `/api/supplier-config/:account` | Get one |
| GET | `/api/supplier-config/:account/detail` | Get with computed fields |
| PUT | `/api/supplier-config/:account` | Update config_json |
| POST | `/api/supplier-config/sync` | Sync configs (e.g. seed missing rows) |
| GET | `/api/suppliers/:code/config` | Alt: get per-supplier config |
| PUT | `/api/suppliers/:code/config` | Alt: update per-supplier config |
| GET | `/api/suppliers/:code/automation` | Per-supplier automation rules |
| PUT | `/api/suppliers/:code/automation` | Update automation rules |
| GET | `/api/suppliers/onboarding` | List onboarding state |
| GET | `/api/suppliers/:code/onboarding` | Per-supplier onboarding |
| PUT | `/api/suppliers/:code/onboarding` | Update onboarding |

### Communications + audit

| Method | Path | Description |
|---|---|---|
| GET | `/api/suppliers/communications` | List all (filters: supplier_code, days) |
| GET | `/api/supplier-communications` | Same — alt spelling |
| GET | `/api/supplier-communications/:account` | Per-supplier communications |
| POST | `/api/suppliers/:code/communications` | Manual log entry |
| DELETE | `/api/suppliers/communications/:id` | Delete log entry |
| GET | `/api/suppliers/change-audit` | List operator-change audit (filters: supplier_code, days, field) |
| POST | `/api/suppliers/:code/change-audit` | Record a change |

### Remittance

| Method | Path | Description |
|---|---|---|
| GET | `/api/suppliers/remittance` | Remittance log (all suppliers, recent) |
| POST | `/api/suppliers/:code/remittance` | Record remittance + optionally send email |

### Email processing

| Method | Path | Description |
|---|---|---|
| GET | `/api/suppliers/processed-emails` | List processed emails (paginated) |
| POST | `/api/suppliers/processed-emails` | Record a processed email (idempotent) |
| GET | `/api/suppliers/processed-emails/:message_id/exists` | Boolean check |

### Security

| Method | Path | Description |
|---|---|---|
| GET | `/api/supplier-security/alerts` | List unverified change alerts |
| POST | `/api/supplier-security/alerts/:id/verify` | Mark alert verified |
| POST | `/api/supplier-security/alerts/:alert_id/verify` | Same — alt path |
| GET | `/api/supplier-security/audit` | Full audit log (filters: days, supplier_code, field) |
| POST | `/api/supplier-security/scan-changes` | Run a scan for unverified critical-field changes |
| GET | `/api/supplier-security/email-flags` | Emails flagged for review |
| GET | `/api/supplier-security/approved-senders` | List approved senders (all suppliers) |
| POST | `/api/supplier-security/approved-senders` | Add approved sender (admin) |
| DELETE | `/api/supplier-security/approved-senders/:sender_id` | Revoke approval |

## Request / response shapes (selected)

### `GET /api/suppliers/status`

```json
{ "success": true, "app": "suppliers", "tenant_id": "...", "opera_type": "opera-se", "message": "..." }
```

### `GET /api/supplier-settings`

```json
{
  "success": true,
  "settings": {
    "acknowledgment_delay_minutes": { "value": "0", "description": "..." },
    "processing_sla_hours": { "value": "24", "description": "..." },
    ...30 keys
  }
}
```

### `POST /api/supplier-settings`

Body:
```json
{ "processing_sla_hours": "8", "send_acknowledgement": "false" }
```

Response:
```json
{ "success": true, "message": "Settings saved" }
```

Validation errors:
```json
{ "success": false, "error": "follow_up_reminder_days (5 days) must be greater than query_response_days (7 days)" }
```

### `GET /api/supplier-statements`

Query params: `supplier_code?`, `from_date?`, `to_date?`, `limit?` (default 100)

```json
{
  "success": true,
  "statements": [
    {
      "id": 1,
      "supplier_code": "ABC001",
      "statement_date": "2026-05-31",
      "opening_balance": 0,
      "closing_balance": 4287.50,
      "source": "email",
      "source_ref": "42",
      "pdf_path": "",
      "imported_at": "2026-05-31T10:00:00Z"
    }
  ],
  "count": 1
}
```

### `POST /api/supplier-statements/:id/acknowledge`

Body: `{}` (no required fields)

Response:
```json
{
  "success": true,
  "message": "Statement acknowledged and email sent",
  "email_sent": true,
  "recipient": "accounts@supplier.com",
  "subject": "Statement Received - ABC Office Supplies - 2026-05-31",
  "body": "Dear ..."
}
```

Error path (policy blocked):
```json
{ "success": false, "error": "Communications disabled for supplier ABC001", "policy_blocked": true }
```

### `POST /api/supplier-statements/extract-from-text`

Body:
```json
{ "content": "STATEMENT\nABC Office Supplies Ltd\nDate: 2026-05-31\n..." }
```

Response (success):
```json
{
  "success": true,
  "extraction": {
    "supplier_code": "ABC001",
    "statement_date": "2026-05-31",
    "opening_balance": 0,
    "closing_balance": 4287.50,
    "currency": "GBP",
    "lines": [
      { "line_date": "2026-05-01", "reference": "INV-1001", "description": "Office supplies", "amount": 250.00 }
    ]
  }
}
```

Response (no LLM):
```json
{ "success": false, "error": "ctx.llm not configured" }
```

### `POST /api/supplier-statements/queue/bulk-approve`

Body:
```json
{ "ids": [1, 2, 3], "approved_by": "alice@example.com" }
```

Response:
```json
{
  "success": true,
  "approved": 2,
  "errors": [
    { "id": 3, "error": "Cannot approve from status 'failed'" }
  ]
}
```

### `GET /api/creditors/aged`

Response:
```json
{
  "success": true,
  "buckets": {
    "current": 1200.00,
    "30_days": 850.50,
    "60_days": 425.25,
    "90_days": 100.00,
    "120_plus": 0
  },
  "as_of": "2026-06-04"
}
```

## Header conventions

| Header | Set by | Read by |
|---|---|---|
| `X-Opera-Company` | SAM (or frontend api-shim in dev-host) | Plugin reads as `req.operaCompany` for `getCompanyDb()` |
| `Cookie: sam_session=...` | SAM auth flow | SAM auth middleware → `req.user` |
| `Cookie: sus_session=...` | Standalone login | Standalone auth middleware → `req.user` + `req.operaCompany` |
| `Content-Type: application/json` | Client | Plugin (express.json() parser) |

## Error codes

| Status | Meaning |
|---|---|
| 200 | Success (with `success: true` in body) |
| 400 | Bad request (missing required field, validation error) |
| 401 | Not authenticated (caught by SAM auth or standalone requireAuth) |
| 404 | Resource not found |
| 503 | Opera unavailable (`getCompanyDb` returned null) |
| 500 | Unhandled exception |

The body always carries `{ success: false, error: "..." }` for non-2xx
responses, except 401/404 which are typically empty bodies.

## Two-attempt forwarding (legacy)

Since `manifest.json` declares `internalApiPrefix: "/api"`, SAM uses
deterministic single-attempt forwarding: `/api/apps/suppliers/foo` →
`req.url = "/api/foo"` → reaches plugin router as `/api/foo`. The
router matches `/api/foo` routes. No two-attempt fallback needed.

If `internalApiPrefix` were omitted, SAM would try `req.url = '/foo'`
first, then retry with `'/api/foo'` if the first try 404s. The plugin
must call `next()` on unmatched routes for the retry to fire. The
current plugin DOES — it has no terminal 404 middleware in the router.
