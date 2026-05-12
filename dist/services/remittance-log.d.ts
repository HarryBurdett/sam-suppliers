/**
 * Supplier remittance log — audit trail of remittance emails sent.
 *
 * Each remittance send creates a row here so we have a permanent
 * record of who got paid, how much, when, and to which email
 * address. Used by the audit-trail UI and the duplicate-send
 * guard in the remittance flow.
 *
 * Stored in `supplier_remittance_log` (per-app DB).
 * Greenfield TS port.
 */
import type { Knex } from 'knex';
export interface RemittanceLogEntry {
    id: number;
    supplier_code: string;
    to_address: string;
    subject: string;
    amount: number;
    sent_at: string;
}
export interface ListRemittanceOptions {
    supplierCode?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
}
export interface ListRemittanceResponse {
    success: boolean;
    entries: RemittanceLogEntry[];
    count: number;
    total_amount: number;
    error?: string;
}
export declare function listRemittanceLog(appDb: Knex, opts?: ListRemittanceOptions): Promise<ListRemittanceResponse>;
export interface RecordRemittanceInput {
    supplier_code: string;
    to_address: string;
    subject: string;
    amount: number;
}
export interface RecordRemittanceResponse {
    success: boolean;
    entry?: RemittanceLogEntry;
    error?: string;
}
/**
 * Record that a remittance email was sent. Used by the
 * remittance-send flow once SAM email confirms delivery.
 */
export declare function recordRemittance(appDb: Knex, input: RecordRemittanceInput): Promise<RecordRemittanceResponse>;
//# sourceMappingURL=remittance-log.d.ts.map