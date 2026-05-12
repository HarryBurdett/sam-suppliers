/**
 * Supplier communications log — record + list inbound/outbound contacts.
 *
 * Greenfield TS work (no Python equivalent — the supplier app was
 * never finished in Python).
 *
 * Used by the supplier-portal UI to show a timeline of contacts:
 *   - email scanned from inbox (channel='email')
 *   - phone call logged manually (channel='phone')
 *   - portal note (channel='portal')
 *
 * Stored in `supplier_communications` (per-app DB).
 */
import type { Knex } from 'knex';
export type CommunicationChannel = 'email' | 'phone' | 'portal';
export interface CommunicationEntry {
    id: number;
    supplier_code: string;
    channel: CommunicationChannel;
    subject: string;
    content: string;
    sent_at: string;
}
export interface ListCommunicationsOptions {
    supplierCode?: string | null;
    channel?: CommunicationChannel | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
}
export interface ListCommunicationsResponse {
    success: boolean;
    entries: CommunicationEntry[];
    count: number;
    error?: string;
}
export declare function listCommunications(appDb: Knex, opts?: ListCommunicationsOptions): Promise<ListCommunicationsResponse>;
export interface RecordCommunicationInput {
    supplier_code: string;
    channel: string;
    subject?: string;
    content?: string;
    sent_at?: string;
}
export interface RecordCommunicationResponse {
    success: boolean;
    entry?: CommunicationEntry;
    error?: string;
}
export declare function recordCommunication(appDb: Knex, input: RecordCommunicationInput): Promise<RecordCommunicationResponse>;
export interface DeleteCommunicationResponse {
    success: boolean;
    deleted?: boolean;
    error?: string;
}
export declare function deleteCommunication(appDb: Knex, id: number): Promise<DeleteCommunicationResponse>;
//# sourceMappingURL=communications.d.ts.map