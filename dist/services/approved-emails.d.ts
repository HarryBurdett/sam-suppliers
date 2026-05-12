/**
 * Per-supplier approved-sender email management.
 *
 * Statements only get auto-processed if the sending email address
 * matches an approved entry — protects against spoofed statements.
 *
 * Stored in `supplier_approved_emails` (per-app DB, provisioned by
 * migration 001). Greenfield TS port.
 */
import type { Knex } from 'knex';
export interface ApprovedEmail {
    id: number;
    supplier_code: string;
    email_address: string;
    approved_at: string;
}
export interface ListApprovedEmailsResponse {
    success: boolean;
    emails: ApprovedEmail[];
    count: number;
    error?: string;
}
export declare function listApprovedEmails(appDb: Knex, supplierCode: string): Promise<ListApprovedEmailsResponse>;
export interface ApproveEmailInput {
    supplier_code: string;
    email_address: string;
}
export interface ApproveEmailResponse {
    success: boolean;
    approved?: ApprovedEmail;
    message?: string;
    error?: string;
}
export declare function approveEmail(appDb: Knex, input: ApproveEmailInput): Promise<ApproveEmailResponse>;
export interface RevokeEmailResponse {
    success: boolean;
    message?: string;
    error?: string;
}
export declare function revokeEmail(appDb: Knex, recordId: number): Promise<RevokeEmailResponse>;
/**
 * Convenience: check whether a sender is approved for a supplier.
 * Used by the inbox-scanning logic before auto-processing a statement.
 */
export declare function isEmailApproved(appDb: Knex, supplierCode: string, emailAddress: string): Promise<boolean>;
//# sourceMappingURL=approved-emails.d.ts.map