/**
 * Migration 003 — fields needed for the statement-action endpoints
 * (acknowledge / approve / process / edit-response / bulk-approve).
 *
 * Mirrors columns the Python supplier_statements.db gains over time
 * via runtime ALTER TABLE in `_run_migrations`:
 *   - supplier_statements.response_text   (operator-edited body)
 *   - supplier_statements.response_subject (operator-edited subject)
 *   - supplier_statements.email_pdf_path   (PDF attached on approve)
 *   - supplier_contacts_ext.is_statement_contact
 *   - supplier_contacts_ext.never_communicate (per-contact opt-out)
 *
 * Adds a key/value `supplier_automation_config` shape that the
 * acknowledge endpoint relies on (acknowledgment_template,
 * acknowledgment_delay_minutes, response_subject_template). The
 * existing per-supplier table (migration 001) is for per-supplier
 * rules — this is for tenant-wide config keys.
 */
import type { Knex } from 'knex';
export declare function up(knex: Knex): Promise<void>;
export declare function down(knex: Knex): Promise<void>;
//# sourceMappingURL=003_statement_actions.d.ts.map