const VALID_CHANNELS = new Set([
    'email',
    'phone',
    'portal',
]);
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
export async function listCommunications(appDb, opts = {}) {
    const limit = opts.limit ?? 200;
    if (opts.channel !== null &&
        opts.channel !== undefined &&
        !VALID_CHANNELS.has(opts.channel)) {
        return {
            success: false,
            entries: [],
            count: 0,
            error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}`,
        };
    }
    try {
        let query = appDb('supplier_communications')
            .orderBy('sent_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.channel) {
            query = query.where({ channel: opts.channel });
        }
        if (opts.fromDate) {
            query = query.andWhere('sent_at', '>=', opts.fromDate);
        }
        if (opts.toDate) {
            query = query.andWhere('sent_at', '<=', opts.toDate);
        }
        const rows = (await query);
        const entries = rows.map((r) => {
            const ch = (r.channel ?? '').toString();
            return {
                id: r.id,
                supplier_code: r.supplier_code,
                channel: VALID_CHANNELS.has(ch) ? ch : 'email',
                subject: r.subject ?? '',
                content: r.content ?? '',
                sent_at: dateToIso(r.sent_at),
            };
        });
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
export async function recordCommunication(appDb, input) {
    const supplierCode = (input.supplier_code ?? '').trim();
    const channel = (input.channel ?? '').trim();
    if (!supplierCode) {
        return { success: false, error: 'supplier_code is required' };
    }
    if (!VALID_CHANNELS.has(channel)) {
        return {
            success: false,
            error: `channel must be one of: ${[...VALID_CHANNELS].join(', ')}`,
        };
    }
    try {
        const sentAt = input.sent_at ?? new Date().toISOString();
        const inserted = await appDb('supplier_communications')
            .insert({
            supplier_code: supplierCode,
            channel,
            subject: (input.subject ?? '').slice(0, 500),
            content: input.content ?? '',
            sent_at: input.sent_at ?? appDb.fn.now(),
        })
            .returning('id');
        const id = Array.isArray(inserted) && inserted.length > 0
            ? typeof inserted[0] === 'object'
                ? inserted[0].id
                : Number(inserted[0])
            : 0;
        return {
            success: true,
            entry: {
                id,
                supplier_code: supplierCode,
                channel,
                subject: input.subject ?? '',
                content: input.content ?? '',
                sent_at: sentAt,
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function deleteCommunication(appDb, id) {
    if (!Number.isFinite(id) || id <= 0) {
        return { success: false, error: 'id must be a positive number' };
    }
    try {
        const removed = await appDb('supplier_communications')
            .where({ id })
            .delete();
        return { success: true, deleted: Number(removed) > 0 };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=communications.js.map