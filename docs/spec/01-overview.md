# Overview — Domain Model & Lifecycle

## What the app does

Closes the gap between **what suppliers say we owe them** (statements
they email us) and **what our Opera Purchase Ledger says we owe them**
(posted `ptran` transactions for the supplier). When the two
reconcile, an agreed confirmation is sent. When they don't, a query
email lists the discrepancies; if unanswered, follow-up reminders
escalate. The operator can override matches, edit lines, and pay
suppliers via remittance advice.

## Domain entities

```
                      ┌─────────────────────────┐
                      │ Supplier (Opera pname)  │   ← read from Opera
                      │ • account (PK)          │
                      │ • name, address, etc.   │
                      └────────────┬────────────┘
                                   │ 1:N
                                   ▼
                      ┌─────────────────────────┐
                      │ Statement               │   ← per-app DB
                      │ • supplier_code         │
                      │ • statement_date        │
                      │ • opening_balance       │
                      │ • closing_balance       │
                      │ • status (lifecycle)    │
                      │ • source / source_ref   │
                      └────────────┬────────────┘
                                   │ 1:N
            ┌──────────────────────┼──────────────────────┐
            ▼                      ▼                      ▼
   ┌────────────────┐    ┌──────────────────┐   ┌──────────────────┐
   │ Statement line │    │ Statement query  │   │ Opera-only line  │
   │ • reference    │    │ • status         │   │ (ptran row not   │
   │ • amount       │    │ • reminder_count │   │  present on the  │
   │ • status:      │    │ • created_at     │   │  statement)      │
   │   Matched|     │    │ • resolved_at    │   └──────────────────┘
   │   Query|       │    └──────────────────┘
   │   Manual       │
   └────────────────┘
```

Supporting entities (per-app DB unless noted):

- **`processed_emails`** — message-id dedup for SAM email redelivery
- **`supplier_contacts_ext`** — non-Opera supplier contacts
  (operator-added or auto-detected from email senders)
- **`supplier_approved_emails`** — email addresses approved to send
  statements for a supplier
- **`supplier_config`** — per-supplier config JSON (overrides global
  automation defaults)
- **`supplier_automation_config`** (legacy) /
  **`supplier_automation_settings`** (current) — per-supplier
  automation toggles
- **`supplier_change_audit`** — append-only log of operator changes
- **`supplier_communications`** — outbound email audit
  (acknowledgments, queries, reminders, responses)
- **`supplier_onboarding`** — new-supplier setup tasks
- **`supplier_remittance_log`** — remittance advice send log
- **`supplier_overrides`** — operator-assigned per-line overrides
  (e.g. "this query line is actually a credit note we received")
- **`settings`** — key/value table, prefix `global:` for plugin-wide
  settings

Opera-resident entities (read-only via `getCompanyDb(code)`):

- **`pname`** — supplier master (account, name, address, contact
  fields)
- **`ptran`** — posted transactions (one row per invoice / credit
  note / payment)
- **`palloc`** — allocations (transaction → payment matches)
- **`pnoml`** — nominal lines (currently unused by this plugin; will
  matter when remittance posting lands)

## Statement lifecycle (status field)

```
            received
              │
              ▼
           queued ─────────► failed
              │
              ▼
          processing ─┬─────► error
                      │
              ┌───────┴───────┐
              ▼               ▼
          reconciled       has_queries
              │               │
              ▼               ▼
         acknowledged    acknowledged
              │               │
              ▼               ▼
           approved        approved      ← email response sent
              │               │
              └───────┬───────┘
                      ▼
                  completed
```

Triggers:

| Transition | Trigger | Side effects |
|---|---|---|
| (new) → received | Operator manual upload, or SAM email handler delivers a recognized statement | Insert `supplier_statements` row, `processed_emails` row |
| received → queued | `POST /api/supplier-statements/:id/process` | status update |
| queued → processing | Background scan or operator action | LLM extraction populates `statement_lines` |
| processing → reconciled / has_queries | Service: matching engine compares lines to `ptran` | Inserts `supplier_queries` rows for unmatched lines |
| reconciled → acknowledged | `POST /api/supplier-statements/:id/acknowledge` | Sends ack email, inserts `supplier_communications` |
| acknowledged → approved | `POST /api/supplier-statements/:id/approve` | Sends response email (agreed or query), inserts `supplier_communications` |
| approved → completed | Background close-out OR `PUT /api/supplier-statements/:id/edit-response` w/ status=completed | status update |
| any → failed/error | Service errors with explicit failure flag | status update; operator must intervene |

## Query lifecycle

```
   new           overdue          resolved
    │              │               (terminal)
    ▼              ▼
  pending ──► reminded ──► escalated ──► resolved
                 │            │
                 │ (each      │ (after
                 │  reminder  │  max_follow_up_
                 │  bumps     │  reminders, no
                 │  count)    │  more reminders;
                 │            │  operator must
                 ▼            │  act)
              resolved        ▼
                         operator_action_required
```

Driven by `query_response_days` and `follow_up_reminder_days` settings.

## Communication directionality

Inbound (consumed):

- **Supplier statement emails** — claimed via `ctx.emailIngest`,
  attachments fetched by message-id, body extracted via
  `getAttachmentText`, LLM extraction parses lines.
- **Operator API calls** — from the SAM portal iframe.

Outbound (produced):

- **Acknowledgment email** — "received your statement dated X"
- **Agreed response email** — "balance agreed; payment scheduled for
  Y"
- **Query email** — "the following items require clarification: ..."
- **Follow-up reminder** — escalating tone per reminder count
- **Remittance advice** — payment notification with PDF/email format
- **Security alert** — when supplier bank details change

All outbound go through `ctx.email.send()` (SAM) or
`config.email_provider` (standalone IMAP+SMTP, deferred).

Test mode: when `test_mode_enabled=true`, all outbound emails redirect
to `test_mode_email`.

## External read-only dependencies

- **Opera SQL pname** — supplier name + contact resolution
- **Opera SQL ptran** — transaction list per supplier (for matching)
- **Opera SQL palloc** — allocation status per transaction

Currently no Opera write paths. Remittance posting (which would write
to `palloc` / `pnoml`) is on the roadmap but not implemented.

## Configuration surface

Two layers:

1. **Global settings** — keys with `global:` prefix in `settings`
   table. 30 keys total (see [05-settings.md](./05-settings.md)).
   Tenant-wide defaults.
2. **Per-supplier overrides** — `supplier_config.config_json` and
   `supplier_automation_settings` rows. Override global defaults for
   specific suppliers.

Global settings cover: timing (SLA, response deadlines, reminder
intervals), thresholds (large-discrepancy, payment-window),
notifications (alert recipients, CC addresses), automation toggles
(auto-process, auto-respond, require-approval), test mode, email
templates (with merge fields), onboarding behaviour.

## Multi-tenancy / multi-company

- **SAM mode (v2 contract):** each `useSamContext(req)` call returns
  a per-connection ctx — same plugin instance serves multiple Opera
  companies via the shim.
- **Standalone mode:** one per-company `Knex` (SQLite) per
  subdirectory under `DATA_ROOT`. The signed session cookie carries
  `companyCode`. A dispatcher routes
  `/api/apps/suppliers/*` to the matching company's plugin router.

In both modes, the plugin reads `req.operaCompany` (set by SAM's
`X-Opera-Company` header middleware or the standalone auth
middleware) to know which Opera company's data to query.
