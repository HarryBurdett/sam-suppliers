/**
 * Aged creditors — summary, trend, and per-supplier detail.
 *
 * Faithful port of `routes_aged.py` (apps/suppliers/api/routes_aged.py):
 *   - aged_creditors_summary  → GET /api/creditors/aged
 *   - aged_creditors_trend    → GET /api/creditors/aged/trend
 *   - aged_creditors_detail   → GET /api/creditors/aged/{account}
 *
 * Frontend consumers:
 *   - SupplierDashboard.tsx     calls /api/creditors/aged
 *   - SupplierAgedCreditors.tsx calls all three
 *
 * Aging method (matches legacy):
 *   - "days" mode (default): fixed-day buckets from pparm.pp_percday
 *     (or 30 if not set). Buckets: <p / <2p / <3p / 3p+ days.
 *   - "months" mode: calendar-month buckets (0 / 1 / 2 / 3+ months
 *     from transaction date).
 *
 * Detail endpoint uses a fixed 30/60/90/120+ scheme (legacy
 * `_classify_aging_bucket`).
 *
 * Knex query builder throughout — driver-agnostic so this works on
 * Opera SE (MSSQL) and Opera 3 (FoxPro via the Write Agent) without
 * change.
 */
import type { Knex } from 'knex';
type AgingBucket = 'days_90' | 'days_60' | 'days_30' | 'current' | 'days_120_plus';
interface SummaryBuckets {
    days_90: number;
    days_60: number;
    days_30: number;
    current: number;
    total: number;
    unallocated: number;
}
interface TrendBuckets extends SummaryBuckets {
    days_120_plus: number;
}
export interface AgedSupplier {
    account: string;
    name: string;
    days_90: number;
    days_60: number;
    days_30: number;
    current: number;
    balance: number;
    unallocated: number;
    currency: string;
    fc_rate: number;
    fc_balance: number;
}
export interface AgedSummaryResponse {
    success: boolean;
    summary: SummaryBuckets;
    suppliers: AgedSupplier[];
    period_mode: 'days' | 'months';
    period_label: string;
    column_labels: Record<string, string>;
    error?: string;
}
export declare function getAgedCreditorsSummary(operaDb: Knex): Promise<AgedSummaryResponse>;
export interface AgedTrendPoint extends TrendBuckets {
    month: string;
}
export interface AgedTrendResponse {
    success: boolean;
    trend: AgedTrendPoint[];
    error?: string;
}
export declare function getAgedCreditorsTrend(operaDb: Knex, months?: number): Promise<AgedTrendResponse>;
export interface AgedDetailRow {
    ref: string;
    date: string;
    amount: number;
    days_old: number;
}
export interface AgedDetailResponse {
    success: boolean;
    supplier?: {
        account: string;
        name: string;
    };
    aging?: Record<AgingBucket, AgedDetailRow[]>;
    totals?: TrendBuckets;
    error?: string;
}
export declare function getAgedCreditorsDetail(operaDb: Knex, account: string): Promise<AgedDetailResponse>;
export {};
//# sourceMappingURL=aged-creditors.d.ts.map