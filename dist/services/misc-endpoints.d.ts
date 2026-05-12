/**
 * Suppliers miscellaneous endpoint ports — the long tail.
 *
 * Faithful ports of:
 *   - /api/creditors/* (dashboard, report, search, supplier/{a},
 *     supplier/{a}/statement, supplier/{a}/transactions)
 *   - /api/supplier-statements/{id}/pdf
 *   - /api/supplier-statements/{id}/preview-response (LLM)
 *   - /api/supplier-statements/{id}/send-updated-status
 *   - /api/supplier-statements/extract-from-email/{email_id} (LLM)
 *   - /api/supplier-statements/extract-from-file (LLM)
 *   - /api/supplier-statements/extract-from-text
 *   - /api/supplier-statements/process-email/{email_id}
 *   - /api/supplier-statements/reconcile/{email_id}
 *   - /api/supplier-statements/reconciliations
 *   - /api/supplier-security/email-flags
 *   - /api/supplier/account/first
 *   - /api/supplier/account/{account}
 */
import type { Knex } from 'knex';
export interface CreditorsSupplier {
    account: string;
    name: string;
    current_balance: number;
    credit_limit: number | null;
    contact_email: string | null;
}
export declare function getCreditorsDashboard(operaDb: Knex): Promise<{
    success: boolean;
    total_suppliers: number;
    total_outstanding: number;
    overdue_count: number;
    error?: string;
}>;
export declare function getCreditorsReport(operaDb: Knex): Promise<{
    success: boolean;
    suppliers: CreditorsSupplier[];
    error?: string;
}>;
export declare function searchCreditors(operaDb: Knex, query: string): Promise<{
    success: boolean;
    suppliers: CreditorsSupplier[];
    error?: string;
}>;
export declare function getCreditorsSupplier(operaDb: Knex, account: string): Promise<{
    success: boolean;
    supplier?: CreditorsSupplier;
    error?: string;
}>;
export interface CreditorTransaction {
    date: string;
    reference: string;
    type: string;
    value: number;
    balance: number;
    comment: string;
}
export declare function getCreditorsSupplierTransactions(operaDb: Knex, account: string): Promise<{
    success: boolean;
    transactions: CreditorTransaction[];
    error?: string;
}>;
export declare function getStatementPdf(appDb: Knex, statementId: number): Promise<{
    success: boolean;
    pdf_path?: string;
    filename?: string;
    error?: string;
}>;
export interface LlmService {
    chat(req: {
        messages: Array<{
            role: string;
            content: string;
        }>;
        model?: string;
        maxTokens?: number;
        temperature?: number;
    }): AsyncIterable<unknown>;
}
export declare function previewStatementResponse(appDb: Knex, llm: LlmService | null, statementId: number): Promise<{
    success: boolean;
    body?: string;
    subject?: string;
    error?: string;
}>;
export declare function sendUpdatedStatementStatus(appDb: Knex, statementId: number, status: string, by: string): Promise<{
    success: boolean;
    error?: string;
}>;
export interface SupplierStatementExtraction {
    supplier_code: string | null;
    statement_date: string | null;
    opening_balance: number | null;
    closing_balance: number | null;
    currency: string;
    lines: Array<{
        line_date: string | null;
        reference: string;
        description: string;
        amount: number;
    }>;
}
export declare function extractStatementFromText(llm: LlmService | null, content: string): Promise<{
    success: boolean;
    extraction?: SupplierStatementExtraction;
    error?: string;
}>;
export declare function processStatementEmail(appDb: Knex, emailId: number): Promise<{
    success: boolean;
    statement_id?: number;
    error?: string;
}>;
export declare function reconcileStatementByEmail(appDb: Knex, emailId: number): Promise<{
    success: boolean;
    statement_id?: number;
    status?: string;
    error?: string;
}>;
export interface ReconciliationSummary {
    id: number;
    supplier_code: string;
    statement_date: string;
    status: string;
    matched_count: number;
    query_count: number;
    approved_at: string | null;
}
export declare function listReconciliations(appDb: Knex): Promise<{
    success: boolean;
    reconciliations: ReconciliationSummary[];
    error?: string;
}>;
export interface EmailFlag {
    id: number;
    supplier_code: string;
    email_address: string;
    flag_type: string;
    flagged_at: string;
}
export declare function getFlaggedEmails(appDb: Knex): Promise<{
    success: boolean;
    flags: EmailFlag[];
    error?: string;
}>;
export declare function getSupplierAccountByCode(operaDb: Knex, account: string): Promise<{
    success: boolean;
    supplier?: {
        account: string;
        name: string;
        email: string;
        phone: string;
        address: string;
    };
    error?: string;
}>;
export declare function getFirstSupplierAccount(operaDb: Knex): ReturnType<typeof getSupplierAccountByCode>;
//# sourceMappingURL=misc-endpoints.d.ts.map