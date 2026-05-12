/**
 * Supplier statements — list and detail.
 *
 * Reads the per-app `supplier_statements` table (header) and joins
 * `statement_lines` for the detail view. Greenfield TS port (the
 * Python suppliers app is incomplete).
 *
 * Statement headers come from the AI extraction pipeline; line items
 * are populated when the user accepts the extraction.
 */
import type { Knex } from 'knex';
export interface StatementHeader {
    id: number;
    supplier_code: string;
    statement_date: string;
    opening_balance: number;
    closing_balance: number;
    source: string;
    source_ref: string;
    pdf_path: string;
    imported_at: string;
}
export interface StatementLine {
    id: number;
    statement_id: number;
    line_date: string;
    reference: string;
    description: string;
    amount: number;
    matched_opera_ref: string;
    match_status: string;
}
export interface ListStatementsOptions {
    supplierCode?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
}
export interface ListStatementsResponse {
    success: boolean;
    statements: StatementHeader[];
    count: number;
    error?: string;
}
export declare function listStatements(appDb: Knex, opts?: ListStatementsOptions): Promise<ListStatementsResponse>;
export interface OperaOnlyItem {
    id: number;
    statement_id: number;
    reference: string;
    amount: number;
    reason: string;
}
export interface StatementDetail {
    header: StatementHeader;
    lines: StatementLine[];
    opera_only: OperaOnlyItem[];
}
export interface GetStatementResponse {
    success: boolean;
    statement?: StatementDetail;
    error?: string;
}
export declare function getStatement(appDb: Knex, statementId: number): Promise<GetStatementResponse>;
//# sourceMappingURL=supplier-statements.d.ts.map