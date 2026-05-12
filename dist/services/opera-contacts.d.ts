/**
 * Opera zcontacts CRUD for supplier-contact management.
 *
 * Faithful port of the 4 legacy endpoints in
 * `apps/suppliers/api/routes_contacts.py`:
 *   - GET    /api/supplier-contacts/{account}
 *   - POST   /api/supplier-contacts/{account}/opera
 *   - PUT    /api/supplier-contacts/{account}/opera/{contact_id}
 *   - DELETE /api/supplier-contacts/{account}/opera/{contact_id}
 *
 * Reads/writes Opera's `zcontacts` table (zc_module='P' for purchase
 * ledger). All writes use Opera's `nextid` table to allocate IDs
 * (Opera SQL SE convention; never `MAX(id)+1`). All writes also log
 * to the per-app `supplier_change_audit` table.
 *
 * The legacy local-extension overlay (is_statement_contact,
 * is_payment_contact, preferred_contact_method, notes, security
 * fields) is preserved at the read layer using whatever columns
 * SAM's `supplier_contacts_ext` table has — fields the schema
 * doesn't yet support are returned as defaults rather than blocking
 * the read.
 *
 * Knex query builder throughout — driver-agnostic so the same code
 * serves Opera SE (MSSQL) and Opera 3 (FoxPro via the Write Agent).
 */
import type { Knex } from 'knex';
export interface MergedContact {
    source?: 'opera' | 'local';
    zc_id: string;
    zc_account: string;
    zc_name: string;
    zc_title: string;
    zc_forename: string;
    zc_surname: string;
    zc_role: string;
    zc_email: string;
    zc_phone: string;
    zc_mobile: string;
    zc_fax: string;
    zc_module: string;
    local_extension_id: number | null;
    is_statement_contact: boolean;
    is_payment_contact: boolean;
    is_query_contact: boolean;
    preferred_contact_method: string;
    notes: string | null;
}
export interface MergedContactsResponse {
    success: boolean;
    account: string;
    contacts: MergedContact[];
    opera_count: number;
    local_count: number;
    error?: string;
}
export declare function getMergedContacts(operaDb: Knex, appDb: Knex | null, account: string): Promise<MergedContactsResponse>;
export interface OperaContactCreateInput {
    name?: string;
    title?: string;
    role?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    fax?: string;
}
export interface OperaContactCRUDResponse {
    success: boolean;
    contact_id?: number;
    contact?: Record<string, unknown>;
    error?: string;
}
export declare function createOperaContact(operaDb: Knex, appDb: Knex | null, account: string, body: OperaContactCreateInput): Promise<OperaContactCRUDResponse>;
export interface OperaContactUpdateInput {
    name?: string;
    title?: string;
    role?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    fax?: string;
}
export declare function updateOperaContact(operaDb: Knex, appDb: Knex | null, account: string, contactId: number, body: OperaContactUpdateInput): Promise<OperaContactCRUDResponse>;
export interface OperaContactDeleteResponse {
    success: boolean;
    deleted?: boolean;
    error?: string;
}
export declare function deleteOperaContact(operaDb: Knex, appDb: Knex | null, account: string, contactId: number): Promise<OperaContactDeleteResponse>;
//# sourceMappingURL=opera-contacts.d.ts.map