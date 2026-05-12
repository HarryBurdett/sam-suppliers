function dateToYmd(d) {
    if (!d)
        return '';
    if (d instanceof Date) {
        if (Number.isNaN(d.getTime()))
            return '';
        return d.toISOString().slice(0, 10);
    }
    return String(d).slice(0, 10);
}
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
export async function listStatements(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 100;
        let query = appDb('supplier_statements')
            .orderBy('statement_date', 'desc')
            .orderBy('imported_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.fromDate) {
            query = query.andWhere('statement_date', '>=', opts.fromDate);
        }
        if (opts.toDate) {
            query = query.andWhere('statement_date', '<=', opts.toDate);
        }
        const rows = (await query);
        const statements = rows.map((r) => ({
            id: r.id,
            supplier_code: r.supplier_code,
            statement_date: dateToYmd(r.statement_date),
            opening_balance: Number(r.opening_balance ?? 0),
            closing_balance: Number(r.closing_balance ?? 0),
            source: r.source ?? '',
            source_ref: r.source_ref ?? '',
            pdf_path: r.pdf_path ?? '',
            imported_at: dateToIso(r.imported_at),
        }));
        return { success: true, statements, count: statements.length };
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
export async function getStatement(appDb, statementId) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return { success: false, error: 'Invalid statement_id' };
    }
    try {
        const headerRow = (await appDb('supplier_statements')
            .where({ id: statementId })
            .first());
        if (!headerRow) {
            return { success: false, error: `Statement ${statementId} not found` };
        }
        const linesRows = (await appDb('statement_lines')
            .where({ statement_id: statementId })
            .orderBy('line_date', 'asc')
            .orderBy('id', 'asc'));
        const operaOnlyRows = (await appDb('statement_opera_only')
            .where({ statement_id: statementId }));
        const detail = {
            header: {
                id: headerRow.id,
                supplier_code: headerRow.supplier_code,
                statement_date: dateToYmd(headerRow.statement_date),
                opening_balance: Number(headerRow.opening_balance ?? 0),
                closing_balance: Number(headerRow.closing_balance ?? 0),
                source: headerRow.source ?? '',
                source_ref: headerRow.source_ref ?? '',
                pdf_path: headerRow.pdf_path ?? '',
                imported_at: dateToIso(headerRow.imported_at),
            },
            lines: linesRows.map((r) => ({
                id: r.id,
                statement_id: r.statement_id,
                line_date: dateToYmd(r.line_date),
                reference: r.reference ?? '',
                description: r.description ?? '',
                amount: Number(r.amount ?? 0),
                matched_opera_ref: r.matched_opera_ref ?? '',
                match_status: r.match_status ?? '',
            })),
            opera_only: operaOnlyRows.map((r) => ({
                id: r.id,
                statement_id: r.statement_id,
                reference: r.reference ?? '',
                amount: Number(r.amount ?? 0),
                reason: r.reason ?? '',
            })),
        };
        return { success: true, statement: detail };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=supplier-statements.js.map