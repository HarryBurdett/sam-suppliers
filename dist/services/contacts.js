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
export async function listContacts(appDb, supplierCode) {
    try {
        const rows = (await appDb('supplier_contacts_ext')
            .where({ supplier_code: supplierCode })
            .orderBy('contact_role', 'asc'));
        const contacts = rows.map((r) => ({
            id: r.id,
            supplier_code: r.supplier_code,
            contact_email: r.contact_email ?? '',
            contact_name: r.contact_name ?? '',
            contact_role: r.contact_role ?? '',
            updated_at: dateToIso(r.updated_at),
        }));
        return { success: true, contacts, count: contacts.length };
    }
    catch (err) {
        return {
            success: false,
            contacts: [],
            count: 0,
            error: err?.message ?? String(err),
        };
    }
}
export async function addContact(appDb, input) {
    if (!input.supplier_code || !input.contact_email) {
        return {
            success: false,
            error: 'supplier_code and contact_email are required',
        };
    }
    // Basic email shape check — not authoritative, just a guard
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.contact_email)) {
        return { success: false, error: 'contact_email is not a valid email address' };
    }
    try {
        const inserted = await appDb('supplier_contacts_ext')
            .insert({
            supplier_code: input.supplier_code,
            contact_email: input.contact_email,
            contact_name: input.contact_name ?? '',
            contact_role: input.contact_role ?? '',
        })
            .returning('id');
        const id = Array.isArray(inserted) && inserted.length > 0
            ? typeof inserted[0] === 'object'
                ? inserted[0].id
                : Number(inserted[0])
            : 0;
        return {
            success: true,
            contact: {
                id,
                supplier_code: input.supplier_code,
                contact_email: input.contact_email,
                contact_name: input.contact_name ?? '',
                contact_role: input.contact_role ?? '',
                updated_at: new Date().toISOString(),
            },
        };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
export async function deleteContact(appDb, contactId) {
    try {
        const deleted = await appDb('supplier_contacts_ext').where({ id: contactId }).delete();
        if (deleted > 0) {
            return { success: true, message: 'Contact deleted' };
        }
        return { success: false, error: 'Contact not found' };
    }
    catch (err) {
        return { success: false, error: err?.message ?? String(err) };
    }
}
//# sourceMappingURL=contacts.js.map