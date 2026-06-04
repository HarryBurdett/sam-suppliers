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
    // ---------- Ported from legacy supplier_automation_config seed ----------
    // (sql_rag/supplier_statement_db.py:376-442). Keys the legacy
    // SupplierSettings page exposes that the initial TS port did not yet
    // include — adding them so the operator sees the full surface in the
    // settings UI.
    next_payment_run_date: {
        value: '',
        description: 'Next scheduled payment run date (YYYY-MM-DD). Included in automated responses to suppliers.',
    },
    require_approval_above: {
        value: '1000',
        description: 'Require manual approval for responses whose variance exceeds this amount.',
    },
    test_mode_enabled: {
        value: 'false',
        description: 'When true, all outbound supplier emails are redirected to the test address below.',
    },
    test_mode_email: {
        value: '',
        description: 'All supplier emails are sent here instead of the real contact when test mode is on.',
    },
    response_cc_email: {
        value: '',
        description: 'CC email address copied on every supplier response (for audit).',
    },
    auto_process: {
        value: 'true',
        description: 'Automatically reconcile statements when they are received.',
    },
    auto_create_supplier_from_email: {
        value: 'false',
        description: 'Automatically create a supplier contact record when a new sender emails a statement.',
    },
    require_sender_approval: {
        value: 'true',
        description: 'New sender email addresses require operator approval before statements are processed.',
    },
    default_statement_format: {
        value: 'auto',
        description: 'Expected format for incoming statements (pdf, csv, or auto-detect).',
    },
    // ---------- Email templates ----------
    email_template_subject_agreed: {
        value: 'Statement Confirmed — {supplier_name} — {statement_date}',
        description: 'Subject line for outgoing emails when all items match.',
    },
    email_template_subject_query: {
        value: 'Statement Response — {supplier_name} — {statement_date}',
        description: 'Subject line for outgoing emails when items need attention.',
    },
    email_template_agreed: {
        value: `<p>Dear {contact_name},</p>
<p>Thank you for your statement dated {statement_date}.</p>
<p>We confirm the balance of {their_balance} is agreed.</p>
{payment_schedule}
<p>Regards,<br>{company_sign_off}</p>`,
        description: 'Email body template when balances agree. Supports merge fields ({contact_name}, {supplier_name}, {statement_date}, {their_balance}, {payment_schedule}, {company_sign_off}).',
    },
    email_template_query: {
        value: `<p>Dear {contact_name},</p>
<p>Thank you for your statement dated {statement_date}.</p>
<table style="margin:12px 0;font-size:13px;">
<tr><td style="padding:4px 16px 4px 0;color:#666;">Balance per your statement:</td><td style="font-weight:bold;">{their_balance}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666;">Balance per our records:</td><td style="font-weight:bold;">{our_balance}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666;">Difference:</td><td style="font-weight:bold;">{difference}</td></tr>
</table>
<p>{agreed_count} item(s) agreed. The following {query_count} item(s) require your attention:</p>
{query_table}
<p>Please provide further details on the items listed above.</p>
{payment_table}
{payment_schedule}
<p>Regards,<br>{company_sign_off}</p>`,
        description: 'Email body template when there are queries. Supports the same merge fields plus {query_count} and {query_table} (auto-inserted list).',
    },
    response_sign_off: {
        value: 'Regards,<br>Accounts Department',
        description: 'Email sign-off appended as {company_sign_off}. HTML allowed.',
    },
    response_company_name: {
        value: '',
        description: 'Company name shown below the sign-off (leave blank to hide).',
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