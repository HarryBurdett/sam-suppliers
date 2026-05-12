const PREFIX = 'global:';
export const SUPPLIER_SETTINGS_DEFAULTS = {
    acknowledgment_delay_minutes: {
        value: '0',
        description: 'Delay between receiving a supplier statement email and sending acknowledgement.',
    },
    processing_sla_hours: {
        value: '24',
        description: 'Target time to process a supplier statement.',
    },
    query_response_days: {
        value: '7',
        description: 'Days to give a supplier to respond to a query.',
    },
    follow_up_reminder_days: {
        value: '14',
        description: 'Days before sending a follow-up reminder. Must exceed query_response_days.',
    },
    max_follow_up_reminders: {
        value: '3',
        description: 'Maximum number of follow-up reminders per query.',
    },
    large_discrepancy_threshold: {
        value: '500',
        description: 'Discrepancy amount (£) above which extra approval is required.',
    },
    old_statement_threshold_days: {
        value: '14',
        description: 'Statements older than this are flagged as out of date during reconciliation.',
    },
    payment_notification_days: {
        value: '90',
        description: 'Days of payment history shown on the supplier statement.',
    },
    security_alert_recipients: {
        value: '',
        description: 'Comma-separated list of emails to notify on security events.',
    },
    send_acknowledgement: {
        value: 'true',
        description: 'When true, automatically reply to supplier statement emails.',
    },
    send_agreed_response: {
        value: 'true',
        description: 'When true, automatically reply when a statement reconciles cleanly.',
    },
    send_query_response: {
        value: 'true',
        description: 'When true, automatically send query emails to suppliers.',
    },
    send_follow_up_reminders: {
        value: 'true',
        description: 'When true, automatically send follow-up reminders for unresolved queries.',
    },
    auto_respond_if_reconciled: {
        value: 'true',
        description: 'When true, send a reconciled response automatically without operator review.',
    },
    require_approval_for_queries: {
        value: 'true',
        description: 'When true, every query email needs operator approval before sending.',
    },
};
/**
 * Read all known supplier-automation settings, falling back to the
 * built-in defaults for any key that doesn't have a row yet.
 */
export async function getGlobalSupplierSettings(appDb) {
    try {
        const rows = (await appDb('settings')
            .where('key', 'like', `${PREFIX}%`)
            .select('key', 'value'));
        const stored = new Map();
        for (const row of rows ?? []) {
            const k = (row.key ?? '').trim();
            if (k.startsWith(PREFIX)) {
                stored.set(k.slice(PREFIX.length), row.value ?? '');
            }
        }
        const settings = {};
        for (const [key, defaults] of Object.entries(SUPPLIER_SETTINGS_DEFAULTS)) {
            settings[key] = {
                value: stored.has(key) ? (stored.get(key) ?? '') : defaults.value,
                description: defaults.description,
            };
        }
        return { success: true, settings };
    }
    catch (err) {
        return {
            success: false,
            settings: {},
            error: err?.message ?? String(err),
        };
    }
}
async function readSingleValue(appDb, key) {
    try {
        const row = (await appDb('settings')
            .where({ key: `${PREFIX}${key}` })
            .first());
        return row?.value ?? null;
    }
    catch {
        return null;
    }
}
export async function updateGlobalSupplierSettings(appDb, patch) {
    // Validation: follow_up_reminder_days must be > query_response_days
    let followUp = patch.follow_up_reminder_days === undefined
        ? null
        : String(patch.follow_up_reminder_days);
    let responseDays = patch.query_response_days === undefined
        ? null
        : String(patch.query_response_days);
    if (followUp !== null || responseDays !== null) {
        if (followUp === null) {
            followUp =
                (await readSingleValue(appDb, 'follow_up_reminder_days')) ??
                    SUPPLIER_SETTINGS_DEFAULTS.follow_up_reminder_days.value;
        }
        if (responseDays === null) {
            responseDays =
                (await readSingleValue(appDb, 'query_response_days')) ??
                    SUPPLIER_SETTINGS_DEFAULTS.query_response_days.value;
        }
        const fu = Number(followUp);
        const rd = Number(responseDays);
        if (Number.isFinite(fu) && Number.isFinite(rd)) {
            if (fu <= rd) {
                return {
                    success: false,
                    error: `Follow-up reminder (${followUp} days) must be greater than query ` +
                        `response deadline (${responseDays} days)`,
                };
            }
        }
    }
    try {
        for (const [key, raw] of Object.entries(patch)) {
            if (raw === undefined)
                continue;
            // Reject unknown keys to avoid silent typos polluting the table
            if (!Object.prototype.hasOwnProperty.call(SUPPLIER_SETTINGS_DEFAULTS, key)) {
                continue;
            }
            const value = raw === null ? '' : String(raw);
            const fullKey = `${PREFIX}${key}`;
            const existing = (await appDb('settings')
                .where({ key: fullKey })
                .first());
            if (existing) {
                await appDb('settings')
                    .where({ key: fullKey })
                    .update({ value, updated_at: appDb.fn.now() });
            }
            else {
                await appDb('settings').insert({ key: fullKey, value });
            }
        }
        return { success: true, message: 'Settings updated' };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=global-settings.js.map