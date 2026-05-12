/**
 * Supplier statement state-transition actions.
 *
 * Faithful ports of:
 *   - process_supplier_statement       (routes.py:4012)
 *   - acknowledge_supplier_statement   (routes.py:2611)
 *   - approve_supplier_statement       (routes.py:2450)
 *   - edit_statement_response          (routes.py:2783)
 *   - bulk_approve_statements          (routes.py:2834)
 *
 * Email send is delegated via `EmailSender` so tests don't hit the
 * SMTP relay; the route layer wraps `ctx.email.send`. The supplier
 * pname lookup runs against `operaDb`. Policy gates
 * (`never_communicate`) are enforced consistently across all
 * outbound paths.
 */
import type { Knex } from 'knex';
export interface EmailSender {
    send(opts: {
        to: string;
        subject: string;
        body: string;
        pdfPath?: string | null;
    }): Promise<{
        success: boolean;
        error?: string;
    }>;
}
export interface OperaSupplierLookup {
    /** Returns supplier display name, or the code if lookup fails. */
    resolveName(supplierCode: string): Promise<string>;
}
export interface PtranLine {
    pt_unique: string;
    pt_trref: string | null;
    pt_supref: string | null;
    pt_trtype: string | null;
    pt_trvalue: number;
    pt_trbal: number;
    pt_trdate: Date | string | null;
}
export interface PtranLookup {
    forSupplier(supplierCode: string): Promise<PtranLine[]>;
}
interface StatementRow {
    id: number;
    supplier_code: string;
    status: string;
    statement_date: string | Date | null;
    received_date: string | Date | null;
    sender_email: string | null;
    acknowledged_at: string | Date | null;
    response_text: string | null;
    response_subject: string | null;
    email_pdf_path: string | null;
}
export interface ProcessResponse {
    success: boolean;
    matched: number;
    query: number;
    unmatched: number;
    status?: string;
    error?: string;
}
export declare function processStatement(appDb: Knex, statementId: number, ptranLookup: PtranLookup): Promise<ProcessResponse>;
export interface AcknowledgeResponse {
    success: boolean;
    message?: string;
    email_sent?: boolean;
    recipient?: string | null;
    subject?: string;
    body?: string;
    email_error?: string;
    earliest_send_at?: string;
    policy_blocked?: boolean;
    error?: string;
}
export declare function acknowledgeStatement(appDb: Knex, email: EmailSender, supplierLookup: OperaSupplierLookup, statementId: number): Promise<AcknowledgeResponse>;
export interface ApproveInput {
    approvedBy: string;
    body?: string | null;
    subject?: string | null;
}
export interface ApproveResponse extends AcknowledgeResponse {
}
export declare function approveStatement(appDb: Knex, email: EmailSender, supplierLookup: OperaSupplierLookup, statementId: number, input: ApproveInput): Promise<ApproveResponse>;
export interface EditResponseInput {
    responseText: string;
    responseSubject?: string | null;
}
export interface EditResponseResponse {
    success: boolean;
    message?: string;
    statement?: StatementRow;
    error?: string;
}
export declare function editStatementResponse(appDb: Knex, statementId: number, input: EditResponseInput): Promise<EditResponseResponse>;
export interface BulkApproveInput {
    statementIds: number[];
    approvedBy: string;
}
export interface BulkApproveResponse {
    success: boolean;
    approved: number;
    failed: number;
    results: Array<{
        statement_id: number;
        success: boolean;
        error?: string;
    }>;
}
export declare function bulkApproveStatements(appDb: Knex, email: EmailSender, supplierLookup: OperaSupplierLookup, input: BulkApproveInput): Promise<BulkApproveResponse>;
export {};
//# sourceMappingURL=statement-actions.d.ts.map