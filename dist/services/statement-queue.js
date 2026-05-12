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
function toDateOrNull(value) {
    if (!value)
        return null;
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime()))
            return null;
        return value.toISOString().slice(0, 10);
    }
    return String(value).slice(0, 10);
}
function mapQueueRow(row) {
    return {
        id: Number(row.id),
        supplier_code: row.supplier_code,
        statement_date: toDateOrNull(row.statement_date),
        received_date: toIsoOrNull(row.received_date),
        status: row.status ?? 'received',
        sender_email: row.sender_email,
        opening_balance: Number(row.opening_balance ?? 0),
        closing_balance: Number(row.closing_balance ?? 0),
        currency: row.currency ?? 'GBP',
        error_message: row.error_message,
        line_count: Number(row.line_count ?? 0),
        matched_count: Number(row.matched_count ?? 0),
        query_count: Number(row.query_count ?? 0),
    };
}
export async function getStatementQueue(appDb) {
    try {
        const rows = (await appDb('supplier_statements as ss')
            .leftJoin('statement_lines as sl', 'sl.statement_id', 'ss.id')
            .select('ss.id', 'ss.supplier_code', 'ss.statement_date', 'ss.received_date', 'ss.status', 'ss.sender_email', 'ss.opening_balance', 'ss.closing_balance', 'ss.currency', 'ss.error_message', appDb.raw('COUNT(sl.id) as line_count'), appDb.raw("SUM(CASE WHEN sl.status = 'Agreed' THEN 1 ELSE 0 END) as matched_count"), appDb.raw("SUM(CASE WHEN sl.status = 'Query' THEN 1 ELSE 0 END) as query_count"))
            .whereIn('ss.status', ['received', 'processing'])
            .groupBy('ss.id')
            .orderBy('ss.received_date', 'desc'));
        return {
            success: true,
            statements: rows.map(mapQueueRow),
            count: rows.length,
        };
    }
    catch (err) {
        return {
            success: false,
            statements: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function getStatementsDashboard(appDb) {
    try {
        const statementCounts = (await appDb('supplier_statements')
            .select('status')
            .count('id as total')
            .groupBy('status'));
        const counts = {
            pending: 0,
            processing: 0,
            resolved: 0,
            approved: 0,
            total_open_queries: 0,
            overdue_queries: 0,
            total_disputes: 0,
        };
        for (const row of statementCounts) {
            const total = Number(row.total ?? 0);
            switch (row.status) {
                case 'received':
                case 'pending':
                    counts.pending += total;
                    break;
                case 'processing':
                    counts.processing += total;
                    break;
                case 'resolved':
                    counts.resolved += total;
                    break;
                case 'approved':
                case 'sent':
                    counts.approved += total;
                    break;
                default:
                    counts.pending += total;
            }
        }
        const queryCounts = (await appDb('supplier_queries')
            .select('status')
            .count('id as total')
            .groupBy('status'));
        for (const row of queryCounts) {
            const total = Number(row.total ?? 0);
            if (row.status === 'open')
                counts.total_open_queries += total;
        }
        // Overdue: open for >7 days. Using SQLite julianday math equivalent via
        // generic comparison against 7-days-ago timestamp.
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const overdueRow = (await appDb('supplier_queries')
            .where({ status: 'open' })
            .andWhere('created_at', '<', sevenDaysAgo)
            .count('id as total')
            .first());
        counts.overdue_queries = Number(overdueRow?.total ?? 0);
        const disputesRow = (await appDb('supplier_overrides')
            .where({ override_type: 'dispute' })
            .count('id as total')
            .first());
        counts.total_disputes = Number(disputesRow?.total ?? 0);
        return { success: true, counts };
    }
    catch (err) {
        return {
            success: false,
            counts: {
                pending: 0,
                processing: 0,
                resolved: 0,
                approved: 0,
                total_open_queries: 0,
                overdue_queries: 0,
                total_disputes: 0,
            },
            error: err?.message ?? String(err),
        };
    }
}
export async function getStatementHistory(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 100;
        let query = appDb('supplier_statements as ss')
            .leftJoin('statement_lines as sl', 'sl.statement_id', 'ss.id')
            .select('ss.id', 'ss.supplier_code', 'ss.statement_date', 'ss.received_date', 'ss.status', 'ss.sender_email', 'ss.opening_balance', 'ss.closing_balance', 'ss.currency', 'ss.error_message', 'ss.approved_by', 'ss.approved_at', 'ss.sent_at', appDb.raw('COUNT(sl.id) as line_count'), appDb.raw("SUM(CASE WHEN sl.status = 'Agreed' THEN 1 ELSE 0 END) as matched_count"), appDb.raw("SUM(CASE WHEN sl.status = 'Query' THEN 1 ELSE 0 END) as query_count"))
            .whereIn('ss.status', ['approved', 'sent', 'resolved'])
            .groupBy('ss.id')
            .orderBy('ss.received_date', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.andWhere('ss.supplier_code', opts.supplierCode);
        }
        const rows = (await query);
        const items = rows.map((r) => ({
            ...mapQueueRow(r),
            approved_by: r.approved_by,
            approved_at: toIsoOrNull(r.approved_at),
            sent_at: toIsoOrNull(r.sent_at),
        }));
        return { success: true, statements: items, count: items.length };
    }
    catch (err) {
        return {
            success: false,
            statements: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=statement-queue.js.map