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
export async function listApprovedEmails(appDb, supplierCode) {
    try {
        const rows = (await appDb('supplier_approved_emails')
            .where({ supplier_code: supplierCode })
            .orderBy('approved_at', 'desc'));
        const emails = rows.map((r) => ({
            id: r.id,
            supplier_code: r.supplier_code,
            email_address: r.email_address,
            approved_at: dateToIso(r.approved_at),
        }));
        return { success: true, emails, count: emails.length };
    }
    catch (err) {
        return {
            success: false,
            emails: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function approveEmail(appDb, input) {
    if (!input.supplier_code || !input.email_address) {
        return {
            success: false,
            error: 'supplier_code and email_address are required',
        };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email_address)) {
        return { success: false, error: 'email_address is not a valid email' };
    }
    // Idempotent — if already approved, return the existing row.
    try {
        const existing = (await appDb('supplier_approved_emails')
            .where({
            supplier_code: input.supplier_code,
            email_address: input.email_address,
        })
            .first());
        if (existing) {
            return {
                success: true,
                message: 'Email already approved',
                approved: {
                    id: existing.id,
                    supplier_code: existing.supplier_code,
                    email_address: existing.email_address,
                    approved_at: dateToIso(existing.approved_at),
                },
            };
        }
        const inserted = await appDb('supplier_approved_emails')
            .insert({
            supplier_code: input.supplier_code,
            email_address: input.email_address,
        })
            .returning('id');
        const id = Array.isArray(inserted) && inserted.length > 0
            ? typeof inserted[0] === 'object'
                ? inserted[0].id
                : Number(inserted[0])
            : 0;
        return {
            success: true,
            approved: {
                id,
                supplier_code: input.supplier_code,
                email_address: input.email_address,
                approved_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function revokeEmail(appDb, recordId) {
    try {
        const deleted = await appDb('supplier_approved_emails')
            .where({ id: recordId })
            .delete();
        if (deleted > 0) {
            return { success: true, message: 'Approved email revoked' };
        }
        return { success: false, error: 'Approved-email record not found' };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
/**
 * Convenience: check whether a sender is approved for a supplier.
 * Used by the inbox-scanning logic before auto-processing a statement.
 */
export async function isEmailApproved(appDb, supplierCode, emailAddress) {
    try {
        const row = await appDb('supplier_approved_emails')
            .where({
            supplier_code: supplierCode,
            email_address: emailAddress,
        })
            .first();
        return !!row;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=approved-emails.js.map