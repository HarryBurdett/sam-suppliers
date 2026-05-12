const VALID_FREQUENCIES = new Set([
    'weekly',
    'monthly',
    'quarterly',
    'on_demand',
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
const DEFAULT_CONFIG = {
    auto_process: false,
    frequency: 'on_demand',
    matching_rules: {},
};
export async function getAutomationConfig(appDb, supplierCode) {
    if (!supplierCode) {
        return { success: false, error: 'supplier_code is required' };
    }
    try {
        const row = (await appDb('supplier_automation_config')
            .where({ supplier_code: supplierCode })
            .first());
        if (!row) {
            return {
                success: true,
                config: {
                    supplier_code: supplierCode,
                    ...DEFAULT_CONFIG,
                    updated_at: '',
                },
            };
        }
        let matchingRules = {};
        if (row.matching_rules_json) {
            try {
                const parsed = JSON.parse(row.matching_rules_json);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    matchingRules = parsed;
                }
            }
            catch {
                // Stored value isn't valid JSON — leave as default empty
            }
        }
        const freq = (row.frequency ?? 'on_demand');
        const validFreq = VALID_FREQUENCIES.has(freq) ? freq : 'on_demand';
        return {
            success: true,
            config: {
                supplier_code: row.supplier_code,
                auto_process: Boolean(row.auto_process),
                frequency: validFreq,
                matching_rules: matchingRules,
                updated_at: dateToIso(row.updated_at),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function saveAutomationConfig(appDb, input) {
    if (!input.supplier_code) {
        return { success: false, error: 'supplier_code is required' };
    }
    if (input.frequency !== undefined &&
        !VALID_FREQUENCIES.has(input.frequency)) {
        return {
            success: false,
            error: `frequency must be one of: ${[...VALID_FREQUENCIES].join(', ')}`,
        };
    }
    if (input.matching_rules !== undefined &&
        (typeof input.matching_rules !== 'object' || Array.isArray(input.matching_rules))) {
        return { success: false, error: 'matching_rules must be a JSON object' };
    }
    try {
        // Read existing to support partial-merge semantics
        const existing = (await appDb('supplier_automation_config')
            .where({ supplier_code: input.supplier_code })
            .first());
        let existingRules = {};
        if (existing?.matching_rules_json) {
            try {
                const parsed = JSON.parse(existing.matching_rules_json);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    existingRules = parsed;
                }
            }
            catch {
                // ignore
            }
        }
        const merged = {
            supplier_code: input.supplier_code,
            auto_process: input.auto_process ?? Boolean(existing?.auto_process ?? DEFAULT_CONFIG.auto_process),
            frequency: input.frequency ??
                (existing?.frequency ?? DEFAULT_CONFIG.frequency),
            matching_rules: input.matching_rules ?? existingRules,
            updated_at: new Date().toISOString(),
        };
        const dbRow = {
            supplier_code: merged.supplier_code,
            auto_process: merged.auto_process,
            frequency: merged.frequency,
            matching_rules_json: JSON.stringify(merged.matching_rules),
        };
        if (existing) {
            await appDb('supplier_automation_config')
                .where({ supplier_code: input.supplier_code })
                .update({ ...dbRow, updated_at: appDb.fn.now() });
        }
        else {
            await appDb('supplier_automation_config').insert(dbRow);
        }
        return { success: true, config: merged };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=automation-config.js.map