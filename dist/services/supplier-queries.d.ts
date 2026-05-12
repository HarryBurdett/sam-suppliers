/**
 * Supplier queries — open/resolve workflow.
 *
 * Faithful ports of:
 *   - get_supplier_queries          (routes.py:699-807)
 *   - resolve_supplier_query        (routes.py:809-843)
 *   - auto_resolve_supplier_queries (routes.py:845-963)
 *   - get_overdue_supplier_queries  (routes.py:1237-1320)
 *   - send_supplier_query_reminder  (routes.py:965-1235 — mock-only stub)
 *
 * Auto-resolve runs deterministic rules: queries that match a recently-
 * posted Opera transaction (by reference + amount within 1p) get
 * marked as resolved with a note. The Opera lookup is wrapped so a
 * mock connector keeps tests deterministic.
 */
import type { Knex } from 'knex';
export interface SupplierQuery {
    id: number;
    supplier_code: string;
    statement_id: number | null;
    line_id: number | null;
    reference: string;
    amount: number;
    query_type: string;
    status: 'open' | 'resolved' | 'cancelled';
    description: string;
    resolution_notes: string | null;
    resolved_by: string | null;
    resolved_at: string | null;
    created_at: string;
    reminder_sent_at: string | null;
    reminder_count: number;
}
export interface ListQueriesOptions {
    supplierCode?: string | null;
    status?: 'open' | 'resolved' | 'cancelled' | null;
    limit?: number;
}
export interface ListQueriesResponse {
    success: boolean;
    queries: SupplierQuery[];
    count: number;
    error?: string;
}
export declare function listQueries(appDb: Knex, opts?: ListQueriesOptions): Promise<ListQueriesResponse>;
export interface ResolveQueryInput {
    queryId: number;
    resolvedBy: string;
    notes?: string | null;
}
export interface ResolveQueryResponse {
    success: boolean;
    query?: SupplierQuery;
    error?: string;
}
export declare function resolveQuery(appDb: Knex, input: ResolveQueryInput): Promise<ResolveQueryResponse>;
export interface OperaPaymentLookup {
    /**
     * Returns true when a posted purchase ledger transaction matches
     * the given supplier + reference + amount within 1p. Implemented
     * by the route layer against operaDb; tests pass a mock.
     */
    hasMatchingPosting(opts: {
        supplierCode: string;
        reference: string;
        amountPounds: number;
    }): Promise<boolean>;
}
export interface AutoResolveResponse {
    success: boolean;
    resolved_count: number;
    scanned_count: number;
    error?: string;
}
export declare function autoResolveQueries(appDb: Knex, lookup: OperaPaymentLookup, resolvedBy: string): Promise<AutoResolveResponse>;
export interface OverdueResponse extends ListQueriesResponse {
    threshold_days: number;
}
export declare function listOverdueQueries(appDb: Knex, thresholdDays?: number): Promise<OverdueResponse>;
export interface SendReminderInput {
    queryId: number;
    triggeredBy: string;
}
export interface SendReminderResponse {
    success: boolean;
    query?: SupplierQuery;
    error?: string;
}
/**
 * Bumps reminder count + sets reminder_sent_at. The actual email send
 * is handled by the route layer using ctx.email — this function
 * commits the audit row.
 */
export declare function recordReminderSent(appDb: Knex, input: SendReminderInput): Promise<SendReminderResponse>;
//# sourceMappingURL=supplier-queries.d.ts.map