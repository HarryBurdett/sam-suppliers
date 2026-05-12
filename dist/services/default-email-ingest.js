function pickField(obj, ...keys) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null)
            return v;
    }
    return undefined;
}
function stripHtml(s) {
    return s
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function extractBodyText(raw) {
    const direct = pickField(raw, 'body_text', 'bodyText');
    if (direct)
        return direct;
    const directHtml = pickField(raw, 'body_html', 'bodyHtml');
    if (directHtml)
        return stripHtml(directHtml);
    const body = pickField(raw, 'body');
    if (body && typeof body === 'object') {
        const ct = pickField(body, 'contentType', 'content_type');
        const content = pickField(body, 'content');
        if (!content)
            return null;
        if (ct?.toLowerCase().includes('html'))
            return stripHtml(content);
        return content;
    }
    return null;
}
export function createDefaultEmailIngestAdapter(options) {
    const log = options.logger ?? console;
    const cap = options.cacheSize ?? 1_000;
    const cache = new Map();
    const byGraphId = new Map();
    let nextId = 1;
    /** mailboxId → detach function returned by registerHandler */
    const handlers = new Map();
    /** detach functions for ownership/activity subscriptions */
    const eventDetachers = [];
    function evictIfFull() {
        while (cache.size > cap) {
            const oldest = cache.keys().next().value;
            if (oldest === undefined)
                break;
            const m = cache.get(oldest);
            cache.delete(oldest);
            if (m)
                byGraphId.delete(m.graphMessageId);
        }
    }
    function ingest(raw) {
        const graphId = pickField(raw, 'id', 'message_id', 'messageId') ?? '';
        if (graphId && byGraphId.has(graphId)) {
            const id = byGraphId.get(graphId);
            return cache.get(id);
        }
        const id = nextId++;
        const msg = {
            id,
            graphMessageId: graphId,
            raw,
            bodyText: extractBodyText(raw),
        };
        cache.set(id, msg);
        if (graphId)
            byGraphId.set(graphId, id);
        evictIfFull();
        return msg;
    }
    function attachHandler(mailboxId) {
        if (handlers.has(mailboxId))
            return;
        const detach = options.emailIngest.registerHandler(mailboxId, (...args) => {
            ingest(args[0]);
            return undefined;
        });
        handlers.set(mailboxId, detach);
    }
    function detachHandler(mailboxId) {
        const d = handlers.get(mailboxId);
        if (d) {
            try {
                d();
            }
            catch {
                // ignore
            }
            handlers.delete(mailboxId);
        }
    }
    function applyMailboxList(rows) {
        for (const r of rows) {
            const id = typeof r.id === 'string' ? r.id : null;
            if (!id)
                continue;
            attachHandler(id);
        }
        log.info?.(`[suppliers email-ingest] attached to ${handlers.size} mailbox(es)`);
    }
    if (options.initialMailboxes) {
        applyMailboxList(options.initialMailboxes);
    }
    else {
        Promise.resolve(options.emailIngest.listMyMailboxes())
            .then((rows) => {
            applyMailboxList(rows.map((r) => ({
                id: typeof r.id === 'string' ? r.id : undefined,
                email_address: typeof r.email_address === 'string' ? r.email_address : null,
            })));
        })
            .catch((err) => {
            log.warn?.(`[suppliers email-ingest] listMyMailboxes failed: ${err instanceof Error ? err.message : String(err)}`);
        });
    }
    try {
        const detachOwnership = options.emailIngest.onOwnershipChange(async (event) => {
            const e = event;
            if (!e?.mailboxId)
                return;
            if (e.newOwnerAppId === options.appId &&
                e.previousOwnerAppId !== options.appId) {
                attachHandler(e.mailboxId);
            }
            else if (e.previousOwnerAppId === options.appId &&
                e.newOwnerAppId !== options.appId) {
                detachHandler(e.mailboxId);
            }
        });
        eventDetachers.push(detachOwnership);
    }
    catch {
        // optional in some SAM versions
    }
    const attachments = {
        async fetchAttachment({ emailId, attachmentId }) {
            const m = cache.get(emailId);
            if (!m)
                return null;
            if (!attachmentId) {
                return { text: m.bodyText ?? '' };
            }
            try {
                const result = await options.emailIngest.getAttachmentText(m.raw, attachmentId);
                return { text: result.text };
            }
            catch (err) {
                log.error?.(`[suppliers email-ingest] getAttachmentText failed for email ${emailId}/${attachmentId}: ${err instanceof Error ? err.message : String(err)}`);
                return null;
            }
        },
    };
    async function shutdown() {
        for (const d of eventDetachers.splice(0)) {
            try {
                d();
            }
            catch {
                // ignore
            }
        }
        for (const [, d] of handlers) {
            try {
                d();
            }
            catch {
                // ignore
            }
        }
        handlers.clear();
        cache.clear();
        byGraphId.clear();
    }
    return { attachments, shutdown };
}
//# sourceMappingURL=default-email-ingest.js.map