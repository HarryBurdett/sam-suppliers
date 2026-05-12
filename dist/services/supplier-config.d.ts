/**
 * Per-supplier configuration JSON.
 *
 * Holds arbitrary supplier-specific settings (matching tolerances,
 * statement-template hints, etc.). One JSON blob per supplier in
 * the per-app `supplier_config` table.
 *
 * Greenfield TS port — Python suppliers app didn't reach this.
 */
import type { Knex } from 'knex';
export interface SupplierConfigResponse {
    success: boolean;
    supplier_code?: string;
    config?: Record<string, unknown>;
    updated_at?: string;
    error?: string;
}
export declare function getSupplierConfig(appDb: Knex, supplierCode: string): Promise<SupplierConfigResponse>;
export interface SaveSupplierConfigInput {
    supplier_code: string;
    config: Record<string, unknown>;
}
/**
 * Replace (or insert) the per-supplier config blob.
 *
 * Whole-document replacement. If you want partial-merge semantics,
 * read first, merge in the caller, then save.
 */
export declare function saveSupplierConfig(appDb: Knex, input: SaveSupplierConfigInput): Promise<SupplierConfigResponse>;
//# sourceMappingURL=supplier-config.d.ts.map