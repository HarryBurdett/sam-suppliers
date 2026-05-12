/**
 * Processed-emails dedup tracking.
 *
 * Greenfield TS work. Used by the supplier scan-emails flow to avoid
 * re-extracting the same statement email twice. Keyed by Graph
 * message_id (immutable across mailboxes per Microsoft Graph spec).
 *
 * Stored in `processed_emails` (per-app DB).
 */
import type { Knex } from 'knex';
export interface ProcessedEmailEntry {
    id: number;
    message_id: string;
    supplier_code: string;
    subject: string;
    processed_at: string;
}
export declare function isEmailProcessed(appDb: Knex, messageId: string): Promise<boolean>;
export interface RecordProcessedInput {
    message_id: string;
    supplier_code?: string;
    subject?: string;
}
export interface RecordProcessedResponse {
    success: boolean;
    entry?: ProcessedEmailEntry;
    duplicate?: boolean;
    error?: string;
}
export declare function recordProcessedEmail(appDb: Knex, input: RecordProcessedInput): Promise<RecordProcessedResponse>;
export interface ListProcessedEmailsOptions {
    supplierCode?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
}
export interface ListProcessedEmailsResponse {
    success: boolean;
    entries: ProcessedEmailEntry[];
    count: number;
    error?: string;
}
export declare function listProcessedEmails(appDb: Knex, opts?: ListProcessedEmailsOptions): Promise<ListProcessedEmailsResponse>;
//# sourceMappingURL=processed-emails.d.ts.map