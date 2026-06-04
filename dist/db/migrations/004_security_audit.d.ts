/**
 * Migration 004 — verified columns on supplier_change_audit so the
 * security alert workflow can mark reviewed entries as cleared.
 *
 * Mirrors the runtime ALTER TABLE in Python's `_run_migrations`:
 *   - verified           (boolean, default false)
 *   - verified_by        (string)
 *   - verified_at        (timestamp)
 *
 * The Python code calls the field `field_name` while the existing TS
 * uses `changed_field` — the route layer maps between them, so no
 * column rename here.
 */
import type { Knex } from 'knex';
export declare function up(knex: Knex): Promise<void>;
export declare function down(knex: Knex): Promise<void>;
//# sourceMappingURL=004_security_audit.d.ts.map