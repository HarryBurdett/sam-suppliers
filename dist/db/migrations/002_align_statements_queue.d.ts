/**
 * Migration 002 — align supplier_statements with the queue/queries
 * surface.
 *
 * Extends `supplier_statements` to mirror the columns
 * `apps/suppliers/api/routes.py:get_supplier_statement_queue` reads
 * (status, received_date, sender_email, currency, error_message,
 * acknowledged_at, processed_at, approved_by, approved_at, sent_at)
 * and adds the `supplier_queries` table that the queries dashboard
 * needs.
 *
 * `match_status` on statement_lines is renamed to `status` to mirror
 * the Python column the queue endpoint references — kept in addition
 * to the legacy column for backward compatibility with already-stored
 * data.
 */
import type { Knex } from 'knex';
export declare function up(knex: Knex): Promise<void>;
export declare function down(knex: Knex): Promise<void>;
//# sourceMappingURL=002_align_statements_queue.d.ts.map