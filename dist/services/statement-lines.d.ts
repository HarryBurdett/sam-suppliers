/**
 * Statement-line CRUD for the supplier statement reconciliation flow.
 *
 * Greenfield TS work. Used by:
 *   - extract-statement (writes line items extracted from PDF)
 *   - reconcile         (updates match_status as lines match Opera ptran)
 *   - statement detail UI (lists lines)
 *   - manual edits      (operator overrides match_status)
 *
 * The schema (statement_lines + statement_opera_only) already exists
 * via migration 001. This service exposes the CRUD primitives.
 *
 * Match status values:
 *   - 'unmatched'  initial state after extraction
 *   - 'matched'    matched to an Opera ptran row
 *   - 'disputed'   matched but operator flagged a discrepancy
 *
 * Statement-only items (`statement_opera_only`) are lines that appear
 * in the supplier statement but have no corresponding Opera ptran row
 * — typically missing invoices the supplier is asking us about.
 */
import type { Knex } from 'knex';
export type MatchStatus = 'matched' | 'unmatched' | 'disputed';
export interface StatementLine {
    id: number;
    statement_id: number;
    line_date: string;
    reference: string;
    description: string;
    amount: number;
    matched_opera_ref: string;
    match_status: MatchStatus;
}
export interface StatementOperaOnly {
    id: number;
    statement_id: number;
    reference: string;
    amount: number;
    reason: string;
}
export interface ListStatementLinesResponse {
    success: boolean;
    lines: StatementLine[];
    count: number;
    total_amount: number;
    matched_count: number;
    unmatched_count: number;
    disputed_count: number;
    error?: string;
}
export declare function listStatementLines(appDb: Knex, statementId: number): Promise<ListStatementLinesResponse>;
export interface NewStatementLine {
    line_date?: string | null;
    reference?: string;
    description?: string;
    amount: number;
    matched_opera_ref?: string;
    match_status?: MatchStatus;
}
export interface AddStatementLinesResponse {
    success: boolean;
    inserted: number;
    ids?: number[];
    error?: string;
}
export declare function addStatementLines(appDb: Knex, statementId: number, lines: NewStatementLine[]): Promise<AddStatementLinesResponse>;
export interface UpdateLineMatchInput {
    matched_opera_ref?: string | null;
    match_status?: MatchStatus;
}
export interface UpdateLineMatchResponse {
    success: boolean;
    updated?: boolean;
    error?: string;
}
export declare function updateStatementLineMatch(appDb: Knex, lineId: number, input: UpdateLineMatchInput): Promise<UpdateLineMatchResponse>;
export interface DeleteStatementLinesResponse {
    success: boolean;
    deleted: number;
    error?: string;
}
export declare function deleteStatementLines(appDb: Knex, statementId: number): Promise<DeleteStatementLinesResponse>;
export interface ListOperaOnlyResponse {
    success: boolean;
    items: StatementOperaOnly[];
    count: number;
    total_amount: number;
    error?: string;
}
export declare function listOperaOnlyItems(appDb: Knex, statementId: number): Promise<ListOperaOnlyResponse>;
//# sourceMappingURL=statement-lines.d.ts.map