function trim(s) {
    return (s ?? '').trim();
}
export async function listSupplierDirectory(operaDb, appDb, opts = {}) {
    const search = trim(opts.search ?? '');
    try {
        let q = operaDb('pname')
            .where('pn_dormant', 0)
            .orderBy('pn_name', 'asc');
        if (search) {
            const pattern = `%${search}%`;
            q = q
                .andWhere((qb) => {
                qb.where('pn_name', 'like', pattern).orWhere('pn_account', 'like', pattern);
            })
                .limit(100);
        }
        else {
            q = q.andWhere('pn_currbal', '<>', 0).limit(500);
        }
        const rows = (await q.select(operaDb.raw('RTRIM(pn_account) AS account'), operaDb.raw('RTRIM(pn_name) AS name'), operaDb.raw('RTRIM(pn_email) AS email'), operaDb.raw('RTRIM(pn_teleno) AS phone'), operaDb.raw('RTRIM(pn_contact) AS contact'), operaDb.raw('pn_currbal AS balance')));
        const accounts = (rows ?? [])
            .map((r) => trim(r.account))
            .filter(Boolean);
        const stmtMap = new Map();
        const senderMap = new Map();
        if (appDb && accounts.length > 0) {
            try {
                const stmtRows = (await appDb('supplier_statements')
                    .whereIn('supplier_code', accounts)
                    .groupBy('supplier_code')
                    .select('supplier_code', appDb.raw('COUNT(*) AS statement_count'), appDb.raw('MAX(imported_at) AS last_statement')));
                for (const r of stmtRows ?? []) {
                    const code = trim(r.supplier_code);
                    if (!code)
                        continue;
                    const last = r.last_statement instanceof Date
                        ? r.last_statement.toISOString()
                        : r.last_statement
                            ? String(r.last_statement)
                            : null;
                    stmtMap.set(code, {
                        count: Number(r.statement_count ?? 0),
                        last,
                    });
                }
            }
            catch {
                // best-effort
            }
            try {
                const senderRows = (await appDb('supplier_approved_emails')
                    .whereIn('supplier_code', accounts)
                    .groupBy('supplier_code')
                    .select('supplier_code', appDb.raw('COUNT(*) AS sender_count')));
                for (const r of senderRows ?? []) {
                    const code = trim(r.supplier_code);
                    if (!code)
                        continue;
                    senderMap.set(code, Number(r.sender_count ?? 0));
                }
            }
            catch {
                // best-effort
            }
        }
        const suppliers = (rows ?? []).map((r) => {
            const account = trim(r.account);
            const stmtInfo = stmtMap.get(account);
            return {
                account,
                name: trim(r.name),
                email: trim(r.email) || null,
                phone: trim(r.phone) || null,
                contact: trim(r.contact) || null,
                balance: Number(r.balance ?? 0),
                statement_count: stmtInfo?.count ?? 0,
                last_statement: stmtInfo?.last ?? null,
                approved_senders: senderMap.get(account) ?? 0,
            };
        });
        return { success: true, suppliers, count: suppliers.length };
    }
    catch (err) {
        return {
            success: false,
            suppliers: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=supplier-directory.js.map