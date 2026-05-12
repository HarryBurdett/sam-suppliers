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
function r2(n) {
    return Math.round(n * 100) / 100;
}
export async function listRemittanceLog(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 100;
        let query = appDb('supplier_remittance_log')
            .orderBy('sent_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.fromDate) {
            query = query.andWhere('sent_at', '>=', opts.fromDate);
        }
        if (opts.toDate) {
            query = query.andWhere('sent_at', '<=', opts.toDate);
        }
        const rows = (await query);
        const entries = rows.map((r) => ({
            id: r.id,
            supplier_code: r.supplier_code,
            to_address: r.to_address ?? '',
            subject: r.subject ?? '',
            amount: Number(r.amount ?? 0),
            sent_at: dateToIso(r.sent_at),
        }));
        const totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);
        return {
            success: true,
            entries,
            count: entries.length,
            total_amount: r2(totalAmount),
        };
    }
    catch (err) {
        return {
            success: false,
            entries: [],
            count: 0,
            total_amount: 0,
            error: err?.message ?? String(err),
        };
    }
}
/**
 * Record that a remittance email was sent. Used by the
 * remittance-send flow once SAM email confirms delivery.
 */
export async function recordRemittance(appDb, input) {
    if (!input.supplier_code || !input.to_address) {
        return {
            success: false,
            error: 'supplier_code and to_address are required',
        };
    }
    if (!Number.isFinite(input.amount)) {
        return { success: false, error: 'amount must be a number' };
    }
    try {
        const inserted = await appDb('supplier_remittance_log')
            .insert({
            supplier_code: input.supplier_code,
            to_address: input.to_address,
            subject: input.subject ?? '',
            amount: input.amount,
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
                supplier_code: input.supplier_code,
                to_address: input.to_address,
                subject: input.subject ?? '',
                amount: input.amount,
                sent_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=remittance-log.js.map