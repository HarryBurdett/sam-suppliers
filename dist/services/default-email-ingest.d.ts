/**
 * Default suppliers email-ingest adapter.
 *
 * Bridges SAM's `ctx.emailIngest` onto the suppliers plugin's
 * `supplierEmailAttachments` adapter shape:
 *
 *   fetchAttachment({ emailId, attachmentId? })
 *     → { text?, bytes? } | null
 *
 * Behaviour:
 *   - When `attachmentId` is supplied, calls `ctx.emailIngest
 *     .getAttachmentText(msg, attachmentId)` and returns
 *     { text, bytes? }
 *   - When `attachmentId` is NOT supplied, returns the email's plain
 *     body text (stripped of HTML if only HTML is available).
 *
 * Subscribes to claimed mailboxes via `registerHandler` and stores
 * each ingested message under a sequential numeric ID — same pattern
 * as the bank-reconcile and gocardless defaults. Activates when
 * `ctx.emailIngest` is wired AND the tenant configures at least one
 * mailbox via `ctx.config.mailboxes`.
 */
import type { SamEmailIngestService } from '../app-context.js';
export interface SupplierEmailAttachmentsAdapter {
    fetchAttachment(opts: {
        emailId: number;
        attachmentId?: string;
    }): Promise<{
        text?: string;
        bytes?: Uint8Array;
    } | null>;
}
interface IngestOptions {
    emailIngest: SamEmailIngestService;
    /**
     * App ID. Used only to filter `onOwnershipChange` events.
     */
    appId: string;
    /**
     * Optional starter mailbox list. When omitted (the production
     * path), the adapter calls `listMyMailboxes()` itself.
     */
    initialMailboxes?: Array<{
        id: string;
        email_address?: string | null;
    }>;
    cacheSize?: number;
    logger?: {
        info: (m: string, ...a: unknown[]) => void;
        warn: (m: string, ...a: unknown[]) => void;
        error: (m: string, ...a: unknown[]) => void;
    };
}
export interface DefaultEmailIngestAdapter {
    attachments: SupplierEmailAttachmentsAdapter;
    shutdown: () => Promise<void>;
}
export declare function createDefaultEmailIngestAdapter(options: IngestOptions): DefaultEmailIngestAdapter;
export {};
//# sourceMappingURL=default-email-ingest.d.ts.map