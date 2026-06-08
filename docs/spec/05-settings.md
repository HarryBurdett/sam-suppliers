# Settings Catalogue

All 30 tenant-wide settings keys exposed via `/api/supplier-settings`.
Stored as `key = 'global:<name>'` rows in the `settings` table.
Defaults defined in `src/services/global-settings.ts:SUPPLIER_SETTINGS_DEFAULTS`.

## Read/write API

- `GET /api/supplier-settings` → `{ success, settings: { [key]: { value, description } } }`
- `POST /api/supplier-settings` body `{ [key]: value }` — bulk update;
  unknown keys silently skipped; validation rules below

## Validation

- `follow_up_reminder_days > query_response_days` — server-side check
  on update. When only one is supplied, the other is loaded from
  stored value to compare. Returns `{ success: false, error }` if
  violated.

## Settings groups

The frontend `SupplierSettings.tsx` page groups these into 7 sections.
The backend is flat — group is a UI concern.

### Timing

| Key | Default | Type | Description |
|---|---|---|---|
| `acknowledgment_delay_minutes` | `0` | int | Minutes between receipt and acknowledgement send |
| `processing_sla_hours` | `24` | int | Target hours to process a statement |
| `query_response_days` | `7` | int | Days for supplier to respond before overdue |
| `follow_up_reminder_days` | `14` | int | Interval between follow-up reminders. **Must exceed `query_response_days`** |
| `max_follow_up_reminders` | `3` | int | Reminder cap before manual escalation |
| `next_payment_run_date` | `''` | YYYY-MM-DD | Included in automated responses |

### Thresholds

| Key | Default | Type | Description |
|---|---|---|---|
| `large_discrepancy_threshold` | `500` | int (£) | Discrepancy amount above which extra approval is required |
| `require_approval_above` | `1000` | int (£) | Variance above which manual approval is required |
| `old_statement_threshold_days` | `14` | int | Statements older than this are flagged as out-of-date |
| `payment_notification_days` | `90` | int | Payment-history window shown in responses |

### Notifications

| Key | Default | Type | Description |
|---|---|---|---|
| `test_mode_enabled` | `false` | bool | When true, outbound supplier emails redirect to `test_mode_email` |
| `test_mode_email` | `''` | email | Test-mode redirect address |
| `security_alert_recipients` | `''` | csv emails | Notified on bank-detail change events |
| `response_cc_email` | `''` | email | CC'd on every supplier response (audit) |

### Automation

| Key | Default | Type | Description |
|---|---|---|---|
| `auto_process` | `true` | bool | Auto-reconcile statements on receipt |

### Communications

| Key | Default | Type | Description |
|---|---|---|---|
| `send_acknowledgement` | `true` | bool | Auto-reply to supplier statement emails |
| `send_agreed_response` | `true` | bool | Auto-reply when reconciliation succeeds |
| `send_query_response` | `true` | bool | Auto-send query emails |
| `send_follow_up_reminders` | `true` | bool | Auto-send follow-up reminders for unresolved queries |
| `auto_respond_if_reconciled` | `true` | bool | Send reconciled response without operator review |
| `require_approval_for_queries` | `true` | bool | Hold query emails for operator review before send |

### Onboarding

| Key | Default | Type | Description |
|---|---|---|---|
| `auto_create_supplier_from_email` | `false` | bool | Auto-create supplier contact when a new sender emails a statement |
| `require_sender_approval` | `true` | bool | New sender emails require operator approval before processing |
| `default_statement_format` | `auto` | enum | Expected format: `pdf` \| `csv` \| `auto` |

### Email templates

Templates use `{merge_field}` substitution. Merge fields available:

| Field | Source |
|---|---|
| `{contact_name}` | First Opera supplier contact, falls back to `{supplier_name}` |
| `{supplier_name}` | Opera `pname.sn_name` |
| `{statement_date}` | Formatted YYYY-MM-DD |
| `{their_balance}` | Statement closing balance with £ |
| `{our_balance}` | Opera ptran balance for the supplier |
| `{difference}` | Coloured (red/green) HTML span |
| `{agreed_count}` | Number of matched lines |
| `{query_count}` | Number of queried lines |
| `{query_table}` | Auto-generated HTML table of queried lines |
| `{payment_table}` | Auto-generated HTML table of recent payments |
| `{payment_schedule}` | Upcoming payment-run date text |
| `{company_sign_off}` | `response_sign_off` + optional `response_company_name` |

Template keys:

| Key | Default | Notes |
|---|---|---|
| `email_template_subject_agreed` | `Statement Confirmed — {supplier_name} — {statement_date}` | |
| `email_template_subject_query` | `Statement Response — {supplier_name} — {statement_date}` | |
| `email_template_agreed` | HTML, see below | Used when balance reconciles |
| `email_template_query` | HTML, see below | Used when items are queried |
| `response_sign_off` | `Regards,<br>Accounts Department` | HTML allowed; substituted as `{company_sign_off}` |
| `response_company_name` | `''` | Bold company name shown below sign-off (blank = hidden) |

Default `email_template_agreed`:
```html
<p>Dear {contact_name},</p>
<p>Thank you for your statement dated {statement_date}.</p>
<p>We confirm the balance of {their_balance} is agreed.</p>
{payment_schedule}
<p>Regards,<br>{company_sign_off}</p>
```

Default `email_template_query`:
```html
<p>Dear {contact_name},</p>
<p>Thank you for your statement dated {statement_date}.</p>
<table style="margin:12px 0;font-size:13px;">
<tr><td style="padding:4px 16px 4px 0;color:#666;">Balance per your statement:</td><td style="font-weight:bold;">{their_balance}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666;">Balance per our records:</td><td style="font-weight:bold;">{our_balance}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666;">Difference:</td><td style="font-weight:bold;">{difference}</td></tr>
</table>
<p>{agreed_count} item(s) agreed. The following {query_count} item(s) require your attention:</p>
{query_table}
<p>Please provide further details on the items listed above.</p>
{payment_table}
{payment_schedule}
<p>Regards,<br>{company_sign_off}</p>
```

## Storage shape

```
SELECT key, value FROM settings WHERE key LIKE 'global:%'
→ rows of (key, value) where key strips to a defaults map entry
```

Defaults are returned for any key without a stored row. Stored values
overlay defaults — operators don't need to set keys they want at
default.

## Code-of-record

`src/services/global-settings.ts` is the source of truth for the
defaults map. To add a key:

1. Add an entry to `SUPPLIER_SETTINGS_DEFAULTS` with `value` +
   `description`
2. Frontend `SupplierSettings.tsx` adds a `SettingConfig` entry in
   one of the `SETTINGS_GROUPS` (with `key`, `label`, `description`,
   `type`, `icon`, `prefix`/`suffix`/`placeholder` as appropriate)
3. If the key has validation rules, add them in
   `updateGlobalSupplierSettings`

## Tests

`tests/global-settings.test.ts` (11 tests) covers:
- Empty rows → full default set returned
- Stored values overlay defaults
- Non-`global:` rows ignored
- Insert vs update behaviour
- Non-string values coerced to strings
- `follow_up_reminder_days <= query_response_days` rejected
- Validation against stored value when only one is supplied
- Unknown keys silently skipped
