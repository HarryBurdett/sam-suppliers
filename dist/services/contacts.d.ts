/**
 * Extended supplier contacts management.
 *
 * Stored in the per-app database (`supplier_contacts_ext`) — these
 * extend whatever Opera pname holds with role-tagged contacts
 * (e.g. "Accounts Payable", "Statement Sender", "Approver").
 *
 * Greenfield TS port — Python suppliers app didn't reach this feature.
 */
import type { Knex } from 'knex';
export interface SupplierContact {
    id: number;
    supplier_code: string;
    contact_email: string;
    contact_name: string;
    contact_role: string;
    updated_at: string;
}
export interface ListContactsResponse {
    success: boolean;
    contacts: SupplierContact[];
    count: number;
    error?: string;
}
export declare function listContacts(appDb: Knex, supplierCode: string): Promise<ListContactsResponse>;
export interface AddContactInput {
    supplier_code: string;
    contact_email: string;
    contact_name?: string;
    contact_role?: string;
}
export interface AddContactResponse {
    success: boolean;
    contact?: SupplierContact;
    error?: string;
}
export declare function addContact(appDb: Knex, input: AddContactInput): Promise<AddContactResponse>;
export interface DeleteContactResponse {
    success: boolean;
    message?: string;
    error?: string;
}
export declare function deleteContact(appDb: Knex, contactId: number): Promise<DeleteContactResponse>;
//# sourceMappingURL=contacts.d.ts.map