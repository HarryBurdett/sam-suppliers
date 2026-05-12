/**
 * Supplier statement queue + dashboard + history.
 *
 * Faithful ports of:
 *   - get_supplier_statement_queue       (routes.py:3741-3778)
 *   - get_supplier_statements_dashboard  (routes.py:276-540 — header counts only)
 *   - get_supplier_statements_history    (routes.py:641-697)
 *
 * The Python implementations build joins against the same per-app
 * SQLite schema; this TS port targets the migration-002 columns.
 *
 * Returns simple DTOs so the frontend can render queue tables, the
 * dashboard tile counts, and a chronological history view.
 */
import type { Knex } from 'knex';
export interface QueueItem {
    id: number;
    supplier_code: string;
    statement_date: string | null;
    received_date: string | null;
    status: string;
    sender_email: string | null;
    opening_balance: number;
    closing_balance: number;
    currency: string;
    error_message: string | null;
    line_count: number;
    matched_count: number;
    query_count: number;
}
export interface QueueResponse {
    success: boolean;
    statements: QueueItem[];
    count: number;
    error?: string;
}
export declare function getStatementQueue(appDb: Knex): Promise<QueueResponse>;
export interface DashboardCounts {
    pending: number;
    processing: number;
    resolved: number;
    approved: number;
    total_open_queries: number;
    overdue_queries: number;
    total_disputes: number;
}
export interface DashboardResponse {
    success: boolean;
    counts: DashboardCounts;
    error?: string;
}
export declare function getStatementsDashboard(appDb: Knex): Promise<DashboardResponse>;
export interface HistoryItem extends QueueItem {
    approved_by: string | null;
    approved_at: string | null;
    sent_at: string | null;
}
export interface HistoryResponse {
    success: boolean;
    statements: HistoryItem[];
    count: number;
    error?: string;
}
export declare function getStatementHistory(appDb: Knex, opts?: {
    supplierCode?: string | null;
    limit?: number;
}): Promise<HistoryResponse>;
//# sourceMappingURL=statement-queue.d.ts.map