/**
 * Global supplier-automation settings (per-tenant).
 *
 * Faithful port of:
 *   - get_supplier_settings (apps/suppliers/api/routes.py:2167-2210)
 *   - update_supplier_settings (apps/suppliers/api/routes.py:2213-2278)
 *
 * Storage difference (not behavioural): the Python version reads
 * the supplier_automation_config table from supplier_statements.db
 * SQLite, with one (key, value, description) row per setting. We
 * store the same key/value pairs in the per-app `settings` table
 * (provisioned by migration 001) under the synthetic prefix
 * `global:` so they don't clash with other tenant-scoped settings.
 *
 * Public response shape matches the Python wrapper exactly:
 *   { settings: { [key]: { value, description } } }
 *
 * Validation: follow_up_reminder_days must be > query_response_days.
 * When only one of the two is supplied to the update, the other is
 * loaded from the existing settings to compare (matches Python).
 */
import type { Knex } from 'knex';
export declare const SUPPLIER_SETTINGS_DEFAULTS: Record<string, {
    value: string;
    description: string;
}>;
export interface SupplierSetting {
    value: string;
    description: string;
}
export interface GetSupplierSettingsResponse {
    success: boolean;
    settings: Record<string, SupplierSetting>;
    error?: string;
}
export interface UpdateSupplierSettingsResponse {
    success: boolean;
    message?: string;
    error?: string;
}
/**
 * Read all known supplier-automation settings, falling back to the
 * built-in defaults for any key that doesn't have a row yet.
 */
export declare function getGlobalSupplierSettings(appDb: Knex): Promise<GetSupplierSettingsResponse>;
export declare function updateGlobalSupplierSettings(appDb: Knex, patch: Record<string, string | number | boolean | null | undefined>): Promise<UpdateSupplierSettingsResponse>;
//# sourceMappingURL=global-settings.d.ts.map