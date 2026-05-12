function dateToIso(d) {
    if (!d)
        return '';
    if (d instanceof Date) {
        if (Number.isNaN(d.getTime()))
            return '';
        return d.toISOString();
    }
    return String(d);
}
// ---------------------------------------------------------------------
// isProcessed — fast existence check used by scan-emails
// ---------------------------------------------------------------------
export async function isEmailProcessed(appDb, messageId) {
    const id = (messageId ?? '').trim();
    if (!id)
        return false;
    try {
        const row = (await appDb('processed_emails')
            .where({ message_id: id })
            .first());
        return !!row;
    }
    catch {
        // Treat lookup failure as "not processed" — caller will attempt
        // processing and the unique constraint catches dups on insert.
        return false;
    }
}
export async function recordProcessedEmail(appDb, input) {
    const messageId = (input.message_id ?? '').trim();
    if (!messageId) {
        return { success: false, error: 'message_id is required' };
    }
    try {
        const existing = (await appDb('processed_emails')
            .where({ message_id: messageId })
            .first());
        if (existing) {
            return {
                success: true,
                duplicate: true,
                entry: {
                    id: existing.id,
                    message_id: existing.message_id,
                    supplier_code: existing.supplier_code ?? '',
                    subject: existing.subject ?? '',
                    processed_at: dateToIso(existing.processed_at),
                },
            };
        }
        const inserted = await appDb('processed_emails')
            .insert({
            message_id: messageId,
            supplier_code: (input.supplier_code ?? '').slice(0, 32),
            subject: (input.subject ?? '').slice(0, 500),
        })
            .returning('id');
        const id = Array.isArray(inserted) && inserted.length > 0
            ? typeof inserted[0] === 'object'
                ? inserted[0].id
                : Number(inserted[0])
            : 0;
        return {
            success: true,
            duplicate: false,
            entry: {
                id,
                message_id: messageId,
                supplier_code: input.supplier_code ?? '',
                subject: input.subject ?? '',
                processed_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function listProcessedEmails(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 200;
        let query = appDb('processed_emails')
            .orderBy('processed_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.fromDate) {
            query = query.andWhere('processed_at', '>=', opts.fromDate);
        }
        if (opts.toDate) {
            query = query.andWhere('processed_at', '<=', opts.toDate);
        }
        const rows = (await query);
        const entries = rows.map((r) => ({
            id: r.id,
            message_id: r.message_id,
            supplier_code: r.supplier_code ?? '',
            subject: r.subject ?? '',
            processed_at: dateToIso(r.processed_at),
        }));
        return { success: true, entries, count: entries.length };
    }
    catch (err) {
        return {
            success: false,
            entries: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=processed-emails.js.map