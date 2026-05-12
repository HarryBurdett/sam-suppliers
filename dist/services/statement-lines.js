const VALID_STATUSES = new Set([
    'matched',
    'unmatched',
    'disputed',
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
function r2(n) {
    return Math.round(n * 100) / 100;
}
export async function listStatementLines(appDb, statementId) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return {
            success: false,
            lines: [],
            count: 0,
            total_amount: 0,
            matched_count: 0,
            unmatched_count: 0,
            disputed_count: 0,
            error: 'statement_id is required (positive number)',
        };
    }
    try {
        const rows = (await appDb('statement_lines')
            .where({ statement_id: statementId })
            .orderBy('line_date', 'asc')
            .orderBy('id', 'asc'));
        const lines = rows.map((r) => {
            const ms = (r.match_status ?? 'unmatched');
            return {
                id: r.id,
                statement_id: r.statement_id,
                line_date: dateToIso(r.line_date),
                reference: r.reference ?? '',
                description: r.description ?? '',
                amount: Number(r.amount ?? 0),
                matched_opera_ref: r.matched_opera_ref ?? '',
                match_status: VALID_STATUSES.has(ms) ? ms : 'unmatched',
            };
        });
        const total = lines.reduce((s, l) => s + l.amount, 0);
        const matched = lines.filter((l) => l.match_status === 'matched').length;
        const unmatched = lines.filter((l) => l.match_status === 'unmatched').length;
        const disputed = lines.filter((l) => l.match_status === 'disputed').length;
        return {
            success: true,
            lines,
            count: lines.length,
            total_amount: r2(total),
            matched_count: matched,
            unmatched_count: unmatched,
            disputed_count: disputed,
        };
    }
    catch (err) {
        return {
            success: false,
            lines: [],
            count: 0,
            total_amount: 0,
            matched_count: 0,
            unmatched_count: 0,
            disputed_count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function addStatementLines(appDb, statementId, lines) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return {
            success: false,
            inserted: 0,
            error: 'statement_id is required (positive number)',
        };
    }
    if (!Array.isArray(lines) || lines.length === 0) {
        return { success: true, inserted: 0, ids: [] };
    }
    // Validate match_status values up-front; refuse on bad input rather
    // than silently coercing.
    for (const l of lines) {
        if (l.match_status && !VALID_STATUSES.has(l.match_status)) {
            return {
                success: false,
                inserted: 0,
                error: `match_status must be one of: ${[...VALID_STATUSES].join(', ')}`,
            };
        }
        if (!Number.isFinite(l.amount)) {
            return {
                success: false,
                inserted: 0,
                error: 'each line.amount must be a finite number',
            };
        }
    }
    try {
        const ids = [];
        for (const l of lines) {
            const inserted = await appDb('statement_lines')
                .insert({
                statement_id: statementId,
                line_date: l.line_date ?? null,
                reference: (l.reference ?? '').slice(0, 100),
                description: (l.description ?? '').slice(0, 500),
                amount: l.amount,
                matched_opera_ref: (l.matched_opera_ref ?? '').slice(0, 64) || null,
                match_status: l.match_status ?? 'unmatched',
            })
                .returning('id');
            const id = Array.isArray(inserted) && inserted.length > 0
                ? typeof inserted[0] === 'object'
                    ? inserted[0].id
                    : Number(inserted[0])
                : 0;
            ids.push(id);
        }
        return { success: true, inserted: ids.length, ids };
    }
    catch (err) {
        return { success: false, inserted: 0, error: err?.message ?? String(err) };
    }
}
export async function updateStatementLineMatch(appDb, lineId, input) {
    if (!Number.isFinite(lineId) || lineId <= 0) {
        return { success: false, error: 'line_id is required (positive number)' };
    }
    if (input.match_status && !VALID_STATUSES.has(input.match_status)) {
        return {
            success: false,
            error: `match_status must be one of: ${[...VALID_STATUSES].join(', ')}`,
        };
    }
    const update = {};
    if (input.matched_opera_ref !== undefined) {
        update.matched_opera_ref = input.matched_opera_ref ?? null;
    }
    if (input.match_status) {
        update.match_status = input.match_status;
    }
    if (Object.keys(update).length === 0) {
        return { success: false, error: 'No fields to update' };
    }
    try {
        const updated = await appDb('statement_lines').where({ id: lineId }).update(update);
        return { success: true, updated: Number(updated) > 0 };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function deleteStatementLines(appDb, statementId) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return {
            success: false,
            deleted: 0,
            error: 'statement_id is required (positive number)',
        };
    }
    try {
        const deleted = await appDb('statement_lines')
            .where({ statement_id: statementId })
            .delete();
        return { success: true, deleted: Number(deleted) };
    }
    catch (err) {
        return { success: false, deleted: 0, error: err?.message ?? String(err) };
    }
}
export async function listOperaOnlyItems(appDb, statementId) {
    if (!Number.isFinite(statementId) || statementId <= 0) {
        return {
            success: false,
            items: [],
            count: 0,
            total_amount: 0,
            error: 'statement_id is required (positive number)',
        };
    }
    try {
        const rows = (await appDb('statement_opera_only')
            .where({ statement_id: statementId })
            .orderBy('id', 'asc'));
        const items = rows.map((r) => ({
            id: r.id,
            statement_id: r.statement_id,
            reference: r.reference ?? '',
            amount: Number(r.amount ?? 0),
            reason: r.reason ?? '',
        }));
        const total = items.reduce((s, i) => s + i.amount, 0);
        return {
            success: true,
            items,
            count: items.length,
            total_amount: r2(total),
        };
    }
    catch (err) {
        return {
            success: false,
            items: [],
            count: 0,
            total_amount: 0,
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=statement-lines.js.map