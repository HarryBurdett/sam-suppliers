/**
 * Per-statement override flags — operator decisions on individual
 * statement lines (accept / reject / dispute) recorded with reasons.
 *
 * Greenfield TS work. The supplier_overrides table exists in
 * migration 001; this service is the missing CRUD wrapper.
 *
 * Used by the reconciliation UI to capture operator decisions that
 * differ from the AI/auto-matched defaults — e.g. accepting a
 * payment-difference, rejecting an invoice that the supplier claims
 * is outstanding but is in fact unpaid by design, or flagging a
 * dispute for the next supplier conversation.
 *
 * Stored in `supplier_overrides` (per-app DB).
 */
import type { Knex } from 'knex';
export type OverrideType = 'accept' | 'reject' | 'dispute';
export interface OverrideEntry {
    id: number;
    statement_id: number;
    line_id: number | null;
    override_type: OverrideType;
    reason: string;
    created_at: string;
}
export interface ListOverridesResponse {
    success: boolean;
    entries: OverrideEntry[];
    count: number;
    error?: string;
}
export declare function listOverrides(appDb: Knex, statementId: number): Promise<ListOverridesResponse>;
export interface RecordOverrideInput {
    statement_id: number;
    line_id?: number | null;
    override_type: string;
    reason?: string;
}
export interface RecordOverrideResponse {
    success: boolean;
    entry?: OverrideEntry;
    error?: string;
}
export declare function recordOverride(appDb: Knex, input: RecordOverrideInput): Promise<RecordOverrideResponse>;
export interface DeleteOverrideResponse {
    success: boolean;
    deleted?: boolean;
    error?: string;
}
export declare function deleteOverride(appDb: Knex, id: number): Promise<DeleteOverrideResponse>;
//# sourceMappingURL=supplier-overrides.d.ts.map