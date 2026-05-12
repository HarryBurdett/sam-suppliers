const VALID_TYPES = new Set([
    'accept',
    'reject',
    'dispute',
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
export async function listOverrides(appDb, statementId) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return {
            success: false,
            entries: [],
            count: 0,
            error: 'statement_id is required (positive number)',
        };
    }
    try {
        const rows = (await appDb('supplier_overrides')
            .where({ statement_id: statementId })
            .orderBy('created_at', 'desc'));
        const entries = rows.map((r) => {
            const t = (r.override_type ?? 'accept');
            return {
                id: r.id,
                statement_id: r.statement_id,
                line_id: r.line_id ?? null,
                override_type: VALID_TYPES.has(t) ? t : 'accept',
                reason: r.reason ?? '',
                created_at: dateToIso(r.created_at),
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
export async function recordOverride(appDb, input) {
    if (!Number.isFinite(input.statement_id) || input.statement_id <= 0) {
        return { success: false, error: 'statement_id is required (positive)' };
    }
    const ot = (input.override_type ?? '').trim();
    if (!VALID_TYPES.has(ot)) {
        return {
            success: false,
            error: `override_type must be one of: ${[...VALID_TYPES].join(', ')}`,
        };
    }
    const lineId = input.line_id !== undefined && input.line_id !== null
        ? Number(input.line_id)
        : null;
    if (lineId !== null && (!Number.isFinite(lineId) || lineId <= 0)) {
        return { success: false, error: 'line_id must be a positive number' };
    }
    try {
        const inserted = await appDb('supplier_overrides')
            .insert({
            statement_id: input.statement_id,
            line_id: lineId,
            override_type: ot,
            reason: input.reason ?? '',
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
                statement_id: input.statement_id,
                line_id: lineId,
                override_type: ot,
                reason: input.reason ?? '',
                created_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function deleteOverride(appDb, id) {
    if (!Number.isFinite(id) || id <= 0) {
        return { success: false, error: 'id is required (positive number)' };
    }
    try {
        const removed = await appDb('supplier_overrides').where({ id }).delete();
        return { success: true, deleted: Number(removed) > 0 };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=supplier-overrides.js.map