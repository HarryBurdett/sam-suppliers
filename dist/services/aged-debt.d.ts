/**
 * Per-supplier aged-debt analysis.
 *
 * Bucketed view of outstanding ptran balances split into:
 *   Current (0-30 days), 31-60, 61-90, Over 90 days.
 *
 * Mirrors the SQL pattern used by balance-check's creditors-aged
 * analysis but presented at the supplier level.
 *
 * Read-only against Opera SQL (NOLOCK).
 */
import type { Knex } from 'knex';
export interface AgedBucket {
    age_band: string;
    count: number;
    total: number;
}
export interface SupplierAgedRow {
    account: string;
    name: string;
    current_0_30: number;
    days_31_60: number;
    days_61_90: number;
    over_90: number;
    total: number;
}
export interface AgedDebtSummaryResponse {
    success: boolean;
    buckets: AgedBucket[];
    total: number;
    count: number;
    error?: string;
}
/**
 * Aggregate aged buckets across ALL active suppliers' ptran rows.
 */
export declare function getAgedDebtSummary(operaDb: Knex): Promise<AgedDebtSummaryResponse>;
export interface SupplierAgedResponse {
    success: boolean;
    suppliers: SupplierAgedRow[];
    count: number;
    error?: string;
}
/**
 * Per-supplier aged-debt: each supplier with their bucket totals.
 */
export declare function getAgedDebtBySupplier(operaDb: Knex): Promise<SupplierAgedResponse>;
//# sourceMappingURL=aged-debt.d.ts.map