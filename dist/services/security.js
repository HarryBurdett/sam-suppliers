const SENSITIVE_FIELDS = ['pn_bankac', 'pn_banksor', 'pn_email'];
const BANK_FIELDS = new Set(['pn_bankac', 'pn_banksor']);
function toIso(value) {
    if (!value)
        return '';
    if (value instanceof Date)
        return value.toISOString();
    return String(value);
}
function mapAlert(row, nameMap) {
    return {
        id: Number(row.id),
        supplier_code: row.supplier_code,
        supplier_name: nameMap[row.supplier_code] ?? row.supplier_code,
        field: row.changed_field ?? '',
        old_value: row.old_value ?? '',
        new_value: row.new_value ?? '',
        changed_by: row.changed_by ?? '',
        changed_at: toIso(row.changed_at),
        verified: !!row.verified,
    };
}
export async function listSecurityAlerts(appDb, pnameProvider) {
    try {
        const rows = (await appDb('supplier_change_audit')
            .where({ verified: false })
            .orderBy('changed_at', 'desc'));
        const codes = Array.from(new Set(rows.map((r) => r.supplier_code).filter(Boolean)));
        const nameMap = await pnameProvider.resolveNames(codes);
        return {
            success: true,
            alerts: rows.map((r) => mapAlert(r, nameMap)),
            count: rows.length,
        };
    }
    catch (err) {
        return {
            success: false,
            alerts: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function verifySecurityAlert(appDb, alertId, verifiedBy) {
    if (!Number.isFinite(alertId) || alertId <= 0) {
        return { success: false, error: 'Invalid alert_id' };
    }
    try {
        const updated = await appDb('supplier_change_audit')
            .where({ id: alertId })
            .update({
            verified: true,
            verified_by: verifiedBy,
            verified_at: appDb.fn.now(),
        });
        if (!updated)
            return { success: false, error: 'Alert not found' };
        return { success: true, message: 'Alert verified' };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function listSecurityAuditLog(appDb, pnameProvider, days = 90) {
    try {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const rows = (await appDb('supplier_change_audit')
            .where('changed_at', '>=', cutoff)
            .orderBy('changed_at', 'desc'));
        const codes = Array.from(new Set(rows.map((r) => r.supplier_code).filter(Boolean)));
        const nameMap = await pnameProvider.resolveNames(codes);
        return {
            success: true,
            entries: rows.map((r) => mapAlert(r, nameMap)),
            count: rows.length,
        };
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
async function loadLastKnown(appDb) {
    const subquery = appDb('supplier_change_audit')
        .select('supplier_code', 'changed_field')
        .max({ id: 'id' })
        .groupBy('supplier_code', 'changed_field');
    // Knex doesn't have a portable way to express "row whose id is the
    // max in its group" without a subquery; emulate by iterating the
    // grouped maxes and resolving to rows.
    const groups = (await subquery);
    const ids = groups.map((g) => g.id).filter((n) => !!n);
    if (ids.length === 0)
        return new Map();
    const rows = (await appDb('supplier_change_audit')
        .whereIn('id', ids)
        .select('supplier_code', 'changed_field', 'new_value'));
    const map = new Map();
    for (const row of rows) {
        if (!row.supplier_code || !row.changed_field)
            continue;
        map.set(`${row.supplier_code}:${row.changed_field}`, row.new_value ?? '');
    }
    return map;
}
async function loadAutomationSetting(appDb, key) {
    try {
        const row = (await appDb('supplier_automation_settings')
            .where({ key })
            .first());
        return row?.value ?? null;
    }
    catch {
        return null;
    }
}
export async function scanSupplierChanges(appDb, pnameProvider, email) {
    try {
        const suppliers = await pnameProvider.snapshot();
        if (suppliers.length === 0) {
            return {
                success: true,
                changes_detected: 0,
                alerts_sent: 0,
                bank_changes: [],
            };
        }
        const lastKnown = await loadLastKnown(appDb);
        let changesDetected = 0;
        const bankChanges = [];
        for (const supplier of suppliers) {
            const account = (supplier.account ?? '').trim();
            if (!account)
                continue;
            for (const field of SENSITIVE_FIELDS) {
                const current = (supplier[field] ?? '').toString().trim();
                const key = `${account}:${field}`;
                const previous = lastKnown.get(key);
                if (previous !== undefined) {
                    if (current !== previous) {
                        await appDb('supplier_change_audit').insert({
                            supplier_code: account,
                            changed_field: field,
                            old_value: previous,
                            new_value: current,
                            changed_by: 'scan',
                            changed_at: appDb.fn.now(),
                            verified: false,
                        });
                        changesDetected += 1;
                        if (BANK_FIELDS.has(field)) {
                            bankChanges.push({
                                account,
                                name: supplier.name || account,
                                field,
                                old: previous,
                                new: current,
                            });
                        }
                    }
                }
                else if (current) {
                    // First-time observation — write a baseline row already
                    // verified so it doesn't appear as an alert.
                    await appDb('supplier_change_audit').insert({
                        supplier_code: account,
                        changed_field: field,
                        old_value: '',
                        new_value: current,
                        changed_by: 'scan_baseline',
                        changed_at: appDb.fn.now(),
                        verified: true,
                        verified_by: 'scan_baseline',
                        verified_at: appDb.fn.now(),
                    });
                }
            }
        }
        let alertsSent = 0;
        if (bankChanges.length > 0) {
            const recipientsRaw = await loadAutomationSetting(appDb, 'security_alert_recipients');
            const recipients = (recipientsRaw ?? '')
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s.length > 0);
            if (recipients.length > 0) {
                const lines = [
                    'SECURITY ALERT: Supplier Bank Detail Changes Detected',
                    '',
                    `Scan time: ${new Date().toISOString()}`,
                    `Changes detected: ${bankChanges.length}`,
                    '-'.repeat(60),
                ];
                for (const c of bankChanges) {
                    lines.push('');
                    lines.push(`Supplier: ${c.name} (${c.account})`);
                    lines.push(`  Field: ${c.field}`);
                    lines.push(`  Old value: ${c.old || '(empty)'}`);
                    lines.push(`  New value: ${c.new || '(empty)'}`);
                }
                lines.push('');
                lines.push('-'.repeat(60));
                lines.push('Please verify these changes are legitimate.');
                const body = lines.join('\n');
                const subject = `SECURITY ALERT: ${bankChanges.length} Supplier Bank Detail Change(s)`;
                for (const recipient of recipients) {
                    const r = await email.send({ to: recipient, subject, body });
                    if (r.success)
                        alertsSent += 1;
                }
            }
        }
        return {
            success: true,
            changes_detected: changesDetected,
            alerts_sent: alertsSent,
            bank_changes: bankChanges,
        };
    }
    catch (err) {
        return {
            success: false,
            changes_detected: 0,
            alerts_sent: 0,
            bank_changes: [],
            error: err?.message ?? String(err),
        };
    }
}
//# sourceMappingURL=security.js.map