/**
 * Supplier change-audit log — track config changes per supplier.
 *
 * Greenfield TS work. Used whenever a supplier's automation flags,
 * onboarding stage, contacts, approved-emails, or matching rules are
 * modified. The other services (automation-config, onboarding,
 * contacts, etc.) call `recordChange()` so we have a complete audit
 * trail.
 *
 * Stored in `supplier_change_audit` (per-app DB), one row per field
 * change with `old_value` / `new_value` JSON-serialised when not
 * primitive.
 */
import type { Knex } from 'knex';
export interface ChangeAuditEntry {
    id: number;
    supplier_code: string;
    changed_field: string;
    old_value: string;
    new_value: string;
    changed_by: string;
    changed_at: string;
}
export interface ListChangeAuditOptions {
    supplierCode?: string | null;
    changedField?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
}
export interface ListChangeAuditResponse {
    success: boolean;
    entries: ChangeAuditEntry[];
    count: number;
    error?: string;
}
export declare function listChangeAudit(appDb: Knex, opts?: ListChangeAuditOptions): Promise<ListChangeAuditResponse>;
export interface RecordChangeInput {
    supplier_code: string;
    changed_field: string;
    old_value?: unknown;
    new_value?: unknown;
    changed_by?: string;
}
export interface RecordChangeResponse {
    success: boolean;
    entry?: ChangeAuditEntry;
    error?: string;
}
export declare function recordChange(appDb: Knex, input: RecordChangeInput): Promise<RecordChangeResponse>;
/**
 * Convenience: record a change only if the new value differs from the
 * old. Returns success=true with no entry when nothing changed —
 * keeps the audit log clean of no-op writes.
 */
export declare function recordChangeIfDifferent(appDb: Knex, input: RecordChangeInput): Promise<RecordChangeResponse>;
//# sourceMappingURL=change-audit.d.ts.map