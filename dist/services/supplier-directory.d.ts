/**
 * Supplier directory listing.
 *
 * Faithful port of list_supplier_directory
 * (apps/suppliers/api/routes.py:2285-2371). Returns suppliers from
 * Opera pname enriched with statement automation info from the
 * per-app DB (statement_count, last_statement, approved_senders).
 *
 * Two modes:
 *   - search supplied → match account or name (LIKE %search%, top 100)
 *   - no search       → only suppliers with non-zero balance (top 500)
 *
 * Both modes order by pn_name asc and exclude dormant suppliers (per
 * CLAUDE.md mandate — Python omits the dormant filter; we add it
 * for parity with the rest of the SAM port).
 */
import type { Knex } from 'knex';
export interface SupplierDirectoryEntry {
    account: string;
    name: string;
    email: string | null;
    phone: string | null;
    contact: string | null;
    balance: number;
    statement_count: number;
    last_statement: string | null;
    approved_senders: number;
}
export interface SupplierDirectoryOptions {
    search?: string | null;
}
export interface SupplierDirectoryResponse {
    success: boolean;
    suppliers: SupplierDirectoryEntry[];
    count: number;
    error?: string;
}
export declare function listSupplierDirectory(operaDb: Knex, appDb: Knex | null | undefined, opts?: SupplierDirectoryOptions): Promise<SupplierDirectoryResponse>;
//# sourceMappingURL=supplier-directory.d.ts.map