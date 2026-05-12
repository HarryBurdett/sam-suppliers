function toIsoOrNull(value) {
    if (!value)
        return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime()))
            return null;
        return value.toISOString();
    }
    return String(value);
}
function mapQueryRow(row) {
    const status = (row.status ?? 'open');
    return {
        id: Number(row.id),
        supplier_code: row.supplier_code,
        statement_id: row.statement_id !== null && row.statement_id !== undefined
            ? Number(row.statement_id)
            : null,
        line_id: row.line_id !== null && row.line_id !== undefined
            ? Number(row.line_id)
            : null,
        reference: row.reference ?? '',
        amount: Number(row.amount ?? 0),
        query_type: row.query_type ?? '',
        status,
        description: row.description ?? '',
        resolution_notes: row.resolution_notes,
        resolved_by: row.resolved_by,
        resolved_at: toIsoOrNull(row.resolved_at),
        created_at: toIsoOrNull(row.created_at) ?? '',
        reminder_sent_at: toIsoOrNull(row.reminder_sent_at),
        reminder_count: Number(row.reminder_count ?? 0),
    };
}
export async function listQueries(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 200;
        let query = appDb('supplier_queries')
            .orderBy('created_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.status) {
            query = query.andWhere({ status: opts.status });
        }
        const rows = (await query);
        return {
            success: true,
            queries: rows.map(mapQueryRow),
            count: rows.length,
        };
    }
    catch (err) {
        return {
            success: false,
            queries: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function resolveQuery(appDb, input) {
    if (!Number.isFinite(input.queryId) || input.queryId <= 0) {
        return { success: false, error: 'Invalid query_id' };
    }
    try {
        const updated = await appDb('supplier_queries')
            .where({ id: input.queryId })
            .andWhere({ status: 'open' })
            .update({
            status: 'resolved',
            resolved_by: input.resolvedBy,
            resolved_at: appDb.fn.now(),
            resolution_notes: input.notes ?? null,
        });
        if (!updated) {
            return { success: false, error: 'Query not found or already resolved' };
        }
        const row = (await appDb('supplier_queries')
            .where({ id: input.queryId })
            .first());
        return {
            success: true,
            query: row ? mapQueryRow(row) : undefined,
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function autoResolveQueries(appDb, lookup, resolvedBy) {
    try {
        const open = (await appDb('supplier_queries')
            .where({ status: 'open' })
            .select('id', 'supplier_code', 'reference', 'amount'));
        let resolved = 0;
        for (const q of open) {
            const ref = (q.reference ?? '').trim();
            if (!ref)
                continue;
            const amount = Number(q.amount ?? 0);
            const matched = await lookup.hasMatchingPosting({
                supplierCode: q.supplier_code,
                reference: ref,
                amountPounds: amount,
            });
            if (!matched)
                continue;
            await appDb('supplier_queries').where({ id: q.id }).update({
                status: 'resolved',
                resolved_by: resolvedBy,
                resolved_at: appDb.fn.now(),
                resolution_notes: 'auto-resolved: matching posting found in Opera',
            });
            resolved += 1;
        }
        return {
            success: true,
            resolved_count: resolved,
            scanned_count: open.length,
        };
    }
    catch (err) {
        return {
            success: false,
            resolved_count: 0,
            scanned_count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function listOverdueQueries(appDb, thresholdDays = 7) {
    try {
        const cutoff = new Date(Date.now() - thresholdDays * 24 * 60 * 60 * 1000).toISOString();
        const rows = (await appDb('supplier_queries')
            .where({ status: 'open' })
            .andWhere('created_at', '<', cutoff)
            .orderBy('created_at', 'asc'));
        return {
            success: true,
            queries: rows.map(mapQueryRow),
            count: rows.length,
            threshold_days: thresholdDays,
        };
    }
    catch (err) {
        return {
            success: false,
            queries: [],
            count: 0,
            threshold_days: thresholdDays,
            error: err?.message ?? String(err),
        };
    }
}
/**
 * Bumps reminder count + sets reminder_sent_at. The actual email send
 * is handled by the route layer using ctx.email — this function
 * commits the audit row.
 */
export async function recordReminderSent(appDb, input) {
    if (!Number.isFinite(input.queryId) || input.queryId <= 0) {
        return { success: false, error: 'Invalid query_id' };
    }
    try {
        const updated = await appDb('supplier_queries')
            .where({ id: input.queryId })
            .andWhere({ status: 'open' })
            .update({
            reminder_sent_at: appDb.fn.now(),
            reminder_count: appDb.raw('COALESCE(reminder_count, 0) + 1'),
        });
        if (!updated) {
            return { success: false, error: 'Query not found or already resolved' };
        }
        const row = (await appDb('supplier_queries')
            .where({ id: input.queryId })
            .first());
        return { success: true, query: row ? mapQueryRow(row) : undefined };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=supplier-queries.js.map