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
function valueToString(v) {
    if (v === undefined || v === null)
        return '';
    if (typeof v === 'string')
        return v;
    if (typeof v === 'number' || typeof v === 'boolean')
        return String(v);
    try {
        return JSON.stringify(v);
    }
    catch {
        return String(v);
    }
}
export async function listChangeAudit(appDb, opts = {}) {
    try {
        const limit = opts.limit ?? 200;
        let query = appDb('supplier_change_audit')
            .orderBy('changed_at', 'desc')
            .limit(limit);
        if (opts.supplierCode) {
            query = query.where({ supplier_code: opts.supplierCode });
        }
        if (opts.changedField) {
            query = query.where({ changed_field: opts.changedField });
        }
        if (opts.fromDate) {
            query = query.andWhere('changed_at', '>=', opts.fromDate);
        }
        if (opts.toDate) {
            query = query.andWhere('changed_at', '<=', opts.toDate);
        }
        const rows = (await query);
        const entries = rows.map((r) => ({
            id: r.id,
            supplier_code: r.supplier_code,
            changed_field: r.changed_field ?? '',
            old_value: r.old_value ?? '',
            new_value: r.new_value ?? '',
            changed_by: r.changed_by ?? '',
            changed_at: dateToIso(r.changed_at),
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
export async function recordChange(appDb, input) {
    const supplierCode = (input.supplier_code ?? '').trim();
    const field = (input.changed_field ?? '').trim();
    if (!supplierCode) {
        return { success: false, error: 'supplier_code is required' };
    }
    if (!field) {
        return { success: false, error: 'changed_field is required' };
    }
    try {
        const oldStr = valueToString(input.old_value);
        const newStr = valueToString(input.new_value);
        const changedBy = (input.changed_by ?? '').trim();
        const inserted = await appDb('supplier_change_audit')
            .insert({
            supplier_code: supplierCode,
            changed_field: field,
            old_value: oldStr,
            new_value: newStr,
            changed_by: changedBy,
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
                changed_field: field,
                old_value: oldStr,
                new_value: newStr,
                changed_by: changedBy,
                changed_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
/**
 * Convenience: record a change only if the new value differs from the
 * old. Returns success=true with no entry when nothing changed —
 * keeps the audit log clean of no-op writes.
 */
export async function recordChangeIfDifferent(appDb, input) {
    const oldStr = valueToString(input.old_value);
    const newStr = valueToString(input.new_value);
    if (oldStr === newStr) {
        return { success: true };
    }
    return recordChange(appDb, input);
}
//# sourceMappingURL=change-audit.js.map