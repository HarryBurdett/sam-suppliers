/**
 * Supplier listing — read Opera pname for the dropdown / supplier picker.
 *
 * Read-only against Opera. NO writes to pname (third-party system).
 *
 * The Python suppliers app is incomplete; this TS implementation is
 * the source of truth for new supplier features going forward.
 */
import type { Knex } from 'knex';
export interface SupplierSummary {
    account: string;
    name: string;
    current_balance: number;
    dormant: boolean;
    email: string;
    phone: string;
}
export interface SuppliersListResponse {
    success: boolean;
    suppliers: SupplierSummary[];
    count: number;
    error?: string;
}
/**
 * List active suppliers from Opera pname.
 *
 * Excludes dormant accounts by default (per CLAUDE.md: "Dormant accounts
 * excluded from matching — pn_dormant = 0 filter on supplier queries").
 */
export declare function listSuppliers(operaDb: Knex, opts?: {
    includeDormant?: boolean;
}): Promise<SuppliersListResponse>;
/**
 * Get a single supplier with detail — used for the supplier-page header.
 */
export declare function getSupplier(operaDb: Knex, supplierCode: string): Promise<{
    success: boolean;
    supplier?: SupplierSummary & {
        address: string;
    };
    error?: string;
}>;
//# sourceMappingURL=supplier-list.d.ts.map