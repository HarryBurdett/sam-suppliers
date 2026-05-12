const VALID_STAGES = new Set([
    'discovered',
    'configured',
    'testing',
    'live',
    'paused',
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
const DEFAULT_STATE = {
    stage: 'discovered',
    notes: '',
};
export async function getOnboardingState(appDb, supplierCode) {
    if (!supplierCode) {
        return { success: false, error: 'supplier_code is required' };
    }
    try {
        const row = (await appDb('supplier_onboarding')
            .where({ supplier_code: supplierCode })
            .first());
        if (!row) {
            return {
                success: true,
                state: {
                    supplier_code: supplierCode,
                    ...DEFAULT_STATE,
                    updated_at: '',
                },
            };
        }
        const stage = (row.stage ?? 'discovered');
        const validStage = VALID_STAGES.has(stage) ? stage : 'discovered';
        return {
            success: true,
            state: {
                supplier_code: row.supplier_code,
                stage: validStage,
                notes: row.notes ?? '',
                updated_at: dateToIso(row.updated_at),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function listOnboardingStates(appDb, opts = {}) {
    if (opts.stage !== undefined && !VALID_STAGES.has(opts.stage)) {
        return {
            success: false,
            states: [],
            count: 0,
            error: `stage must be one of: ${[...VALID_STAGES].join(', ')}`,
        };
    }
    try {
        let query = appDb('supplier_onboarding').orderBy('supplier_code', 'asc');
        if (opts.stage) {
            query = query.where({ stage: opts.stage });
        }
        const rows = (await query);
        const states = rows.map((r) => {
            const stage = (r.stage ?? 'discovered');
            const validStage = VALID_STAGES.has(stage) ? stage : 'discovered';
            return {
                supplier_code: r.supplier_code,
                stage: validStage,
                notes: r.notes ?? '',
                updated_at: dateToIso(r.updated_at),
            };
        });
        return { success: true, states, count: states.length };
    }
    catch (err) {
        return {
            success: false,
            states: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function updateOnboardingState(appDb, input) {
    if (!input.supplier_code) {
        return { success: false, error: 'supplier_code is required' };
    }
    if (input.stage !== undefined && !VALID_STAGES.has(input.stage)) {
        return {
            success: false,
            error: `stage must be one of: ${[...VALID_STAGES].join(', ')}`,
        };
    }
    try {
        const existing = (await appDb('supplier_onboarding')
            .where({ supplier_code: input.supplier_code })
            .first());
        const merged = {
            supplier_code: input.supplier_code,
            stage: input.stage ??
                (existing?.stage ?? DEFAULT_STATE.stage),
            notes: input.notes ?? existing?.notes ?? DEFAULT_STATE.notes,
            updated_at: new Date().toISOString(),
        };
        if (existing) {
            await appDb('supplier_onboarding')
                .where({ supplier_code: input.supplier_code })
                .update({
                stage: merged.stage,
                notes: merged.notes,
                updated_at: appDb.fn.now(),
            });
        }
        else {
            await appDb('supplier_onboarding').insert({
                supplier_code: merged.supplier_code,
                stage: merged.stage,
                notes: merged.notes,
            });
        }
        return { success: true, state: merged };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=onboarding.js.map