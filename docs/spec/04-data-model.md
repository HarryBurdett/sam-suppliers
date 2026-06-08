# Data Model — Per-App Database

Per-app DB schema. Four knex migrations, applied in lexical order.
Schema is dialect-agnostic (works on SQLite for standalone + MSSQL
for SAM provisioning).

## Migration order

| # | File | What it adds |
|---|---|---|
| 001 | `001_initial_schema.ts` | 14 base tables |
| 002 | `002_align_statements_queue.ts` | Queue columns on `supplier_statements`, `status` on `statement_lines`, new `supplier_queries` table |
| 003 | `003_statement_actions.ts` | Action-tracking columns on `supplier_statements`, contact-policy columns on `supplier_contacts_ext`, new `supplier_automation_settings` table |
| 004 | `004_security_audit.ts` | `verified*` columns on `supplier_change_audit` |

All `alterTable` operations check `hasColumn` first — migrations are
idempotent (safe to re-run).

## Tables (post-all-migrations)

### `settings`

Tenant-wide key/value. Plugin-scoped settings use prefix `global:`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | int | PK, autoincrement | |
| `key` | string(64) | NOT NULL, UNIQUE | e.g. `global:processing_sla_hours` |
| `value` | text | | string-serialized value |
| `updated_at` | timestamp | default NOW | |

### `supplier_statements`

Header row per imported statement. Most-read / most-mutated table.

| Column | Type | Constraints | Source |
|---|---|---|---|
| `id` | int | PK | 001 |
| `supplier_code` | string(32) | NOT NULL, INDEX | 001 |
| `statement_date` | date | INDEX | 001 |
| `opening_balance` | decimal(12,2) | | 001 |
| `closing_balance` | decimal(12,2) | | 001 |
| `source` | string(16) | | `'email'` \| `'file'` (001) |
| `source_ref` | string(500) | | email_id or file path (001) |
| `pdf_path` | string(1000) | | 001 |
| `imported_at` | timestamp | default NOW | 001 |
| `status` | string(32) | default `'received'`, INDEX | 002 |
| `received_date` | timestamp | default NOW, INDEX | 002 |
| `sender_email` | string(200) | | 002 |
| `currency` | string(3) | default `'GBP'` | 002 |
| `error_message` | text | | 002 |
| `acknowledged_at` | timestamp | | 002 |
| `processed_at` | timestamp | | 002 |
| `approved_by` | string(64) | | 002 |
| `approved_at` | timestamp | | 002 |
| `sent_at` | timestamp | | 002 |
| `response_text` | text | | operator-edited response body (003) |
| `response_subject` | string(500) | | operator-edited subject (003) |
| `email_pdf_path` | string(1000) | | PDF attached on approve (003) |

**Status values:** `received` → `queued` → `processing` → `reconciled`
\| `has_queries` → `acknowledged` → `approved` → `completed`. Terminal
errors: `failed`, `error`. See
[01-overview.md](./01-overview.md#statement-lifecycle-status-field).

**Known gap (audit):** no unique constraint on
`(source, source_ref)`. Two concurrent process-email calls for the
same email can both insert. See `2026-06-04-statement-recovery-audit.md`.

### `statement_lines`

| Column | Type | Constraints | Source |
|---|---|---|---|
| `id` | int | PK | 001 |
| `statement_id` | int | FK → supplier_statements.id ON DELETE CASCADE, INDEX | 001 |
| `line_date` | date | | 001 |
| `reference` | string(100) | | 001 |
| `description` | string(500) | | 001 |
| `amount` | decimal(12,2) | | 001 |
| `matched_opera_ref` | string(64) | | 001 |
| `match_status` | string(16) | | `matched` \| `unmatched` \| `disputed` (001) |
| `status` | string(16) | default `'Pending'` | `Agreed` \| `Query` \| `Posted` \| `Pending` (002) |

`match_status` is the legacy column; `status` is the canonical column
the route layer reads. Both kept for back-compat with already-stored
data.

### `statement_opera_only`

Lines in Opera's `ptran` that are NOT on the supplier statement
(reverse of the usual "supplier said but we didn't see" check).

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `statement_id` | int | FK → supplier_statements.id ON DELETE CASCADE |
| `reference` | string(100) | |
| `amount` | decimal(12,2) | |
| `reason` | text | |

### `processed_emails`

Dedup for SAM email redelivery. Keyed on `message_id`.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `message_id` | string(200) | NOT NULL, UNIQUE |
| `supplier_code` | string(32) | |
| `subject` | string(500) | |
| `processed_at` | timestamp | default NOW |

### `supplier_config`

Per-supplier config JSON (overrides global automation defaults).

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL, UNIQUE |
| `config_json` | text | arbitrary JSON object |
| `updated_at` | timestamp | default NOW |

### `supplier_automation_config`

Per-supplier automation rules. Distinct from `supplier_automation_settings`
(migration 003) which is tenant-wide.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL, UNIQUE |
| `auto_process` | bool | default `false` |
| `frequency` | string(16) | `weekly` \| `monthly` |
| `matching_rules_json` | text | |
| `updated_at` | timestamp | default NOW |

### `supplier_automation_settings` (003)

Tenant-wide key/value for automation-related config keys. Overlaps
with `settings` but the action layer (`statement-actions.ts`) reads
specific keys from here:
`acknowledgment_template`, `acknowledgment_delay_minutes`,
`response_subject_template`.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `key` | string(64) | NOT NULL, UNIQUE |
| `value` | text | |
| `updated_at` | timestamp | default NOW |

### `supplier_overrides`

Per-line operator overrides.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `statement_id` | int | NOT NULL (no FK declared) |
| `line_id` | int | |
| `override_type` | string(16) | `accept` \| `reject` \| `dispute` |
| `reason` | text | |
| `created_at` | timestamp | default NOW |

### `supplier_contacts_ext`

Non-Opera supplier contacts (operator-added or auto-detected).

| Column | Type | Constraints | Source |
|---|---|---|---|
| `id` | int | PK | 001 |
| `supplier_code` | string(32) | NOT NULL, INDEX | 001 |
| `contact_email` | string(200) | | 001 |
| `contact_name` | string(200) | | 001 |
| `contact_role` | string(100) | | 001 |
| `updated_at` | timestamp | default NOW | 001 |
| `is_statement_contact` | bool | default `false` | 003 |
| `never_communicate` | bool | default `false` | 003 — per-contact opt-out |

### `supplier_onboarding`

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL, UNIQUE |
| `stage` | string(32) | |
| `notes` | text | |
| `updated_at` | timestamp | default NOW |

### `supplier_approved_emails`

Sender allow-list per supplier.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL |
| `email_address` | string(200) | NOT NULL |
| `approved_at` | timestamp | default NOW |
| INDEX | (`supplier_code`, `email_address`) | |

### `supplier_remittance_log`

Audit trail of remittance advice emails sent.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL, INDEX |
| `to_address` | string(200) | |
| `subject` | string(500) | |
| `amount` | decimal(12,2) | |
| `sent_at` | timestamp | default NOW |

### `supplier_change_audit`

Append-only log of supplier-master changes.

| Column | Type | Constraints | Source |
|---|---|---|---|
| `id` | int | PK | 001 |
| `supplier_code` | string(32) | NOT NULL | 001 |
| `changed_field` | string(64) | (Python uses `field_name`; route layer maps) | 001 |
| `old_value` | text | | 001 |
| `new_value` | text | | 001 |
| `changed_by` | string(64) | | 001 |
| `changed_at` | timestamp | default NOW | 001 |
| `verified` | bool | default `false`, INDEX | 004 — security review marker |
| `verified_by` | string(64) | | 004 |
| `verified_at` | timestamp | | 004 |

### `supplier_communications`

Audit log of outbound supplier emails.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL |
| `channel` | string(16) | `email` \| `phone` \| `portal` |
| `subject` | string(500) | |
| `content` | text | |
| `sent_at` | timestamp | default NOW |

**Known gap (audit):** no `email_sent` / `email_error` columns — when
email send fails after the DB row is written, the row says "sent"
when it wasn't. See `2026-06-04-allocation-integrity-audit.md`.

### `supplier_queries` (002)

Discrepancy queries raised against statement lines.

| Column | Type | Constraints |
|---|---|---|
| `id` | int | PK |
| `supplier_code` | string(32) | NOT NULL, INDEX |
| `statement_id` | int | INDEX |
| `line_id` | int | |
| `reference` | string(100) | |
| `amount` | decimal(12,2) | |
| `query_type` | string(32) | |
| `status` | string(16) | default `'open'`, INDEX. `open` \| `resolved` \| `cancelled` |
| `description` | text | |
| `resolution_notes` | text | |
| `resolved_by` | string(64) | |
| `resolved_at` | timestamp | |
| `created_at` | timestamp | default NOW |
| `reminder_sent_at` | timestamp | |
| `reminder_count` | int | default 0 |

## Opera tables (read-only)

Read via `ctx.db.getCompanyDb(code)`. Authoritative schema lives in
[opera-knowledge-ref](/Users/maccb/opera-knowledge-ref/packages/opera-knowledge/).

| Table | Used columns |
|---|---|
| `pname` | `sn_account`, `sn_name`, address fields, contact fields |
| `ptran` | `pt_unique`, `pt_trref`, `pt_supref`, `pt_trtype`, `pt_trvalue`, `pt_trbal`, `pt_trdate` |
| `palloc` | allocation status (used by reconciler) |
| `pnoml` | (reserved for future remittance posting) |

## Migration tracking

- **SAM mode:** SAM uses Knex's own `knex_migrations` tracking table.
- **Standalone mode:** `standalone/migrate.ts` uses a custom
  `_standalone_migrations` table (filename + applied_at), bypassing
  Knex's tracker. Reason: the standalone migrate runs .ts files via
  tsx, while Knex's tracker is geared toward `.js` files in dist/.

## Down migrations

All four migrations have idempotent `down` functions. Down order
reverses up order. Useful for local dev / test cleanup; not used in
SAM-managed deployment.
