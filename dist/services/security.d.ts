/**
 * Supplier security — alerts and change-detection scan.
 *
 * Faithful ports of:
 *   - list_security_alerts        (routes.py:1574)
 *   - verify_security_alert       (routes.py:1621)
 *   - list_security_audit_log     (routes.py:1657)
 *   - scan_supplier_changes       (routes.py:1706)
 *   - get_flagged_emails          (routes.py:1934 — stub: depends on
 *                                  email_storage tables not in scope here)
 *
 * The scan compares the current `pname` snapshot against the latest
 * `supplier_change_audit` row per (supplier, field) — anything that
 * differs gets a new audit row and (for bank fields) drives an email
 * alert to the security recipients list. First-time observations are
 * recorded as a `scan_baseline` row and auto-verified so they don't
 * appear as alerts.
 */
import type { Knex } from 'knex';
export interface SupplierSnapshot {
    account: string;
    name: string;
    pn_bankac: string;
    pn_banksor: string;
    pn_email: string;
}
export interface OperaPnameProvider {
    /** Reads pname or pname.dbf — engine-agnostic. */
    snapshot(): Promise<SupplierSnapshot[]>;
    /** Returns supplier display name keyed by code, or {} if not available. */
    resolveNames(codes: string[]): Promise<Record<string, string>>;
}
export interface SecurityEmailSender {
    send(opts: {
        to: string;
        subject: string;
        body: string;
    }): Promise<{
        success: boolean;
        error?: string;
    }>;
}
export interface SecurityAlert {
    id: number;
    supplier_code: string;
    supplier_name: string;
    field: string;
    old_value: string;
    new_value: string;
    changed_by: string;
    changed_at: string;
    verified: boolean;
}
export interface AlertsResponse {
    success: boolean;
    alerts: SecurityAlert[];
    count: number;
    error?: string;
}
export declare function listSecurityAlerts(appDb: Knex, pnameProvider: OperaPnameProvider): Promise<AlertsResponse>;
export interface VerifyAlertResponse {
    success: boolean;
    message?: string;
    error?: string;
}
export declare function verifySecurityAlert(appDb: Knex, alertId: number, verifiedBy: string): Promise<VerifyAlertResponse>;
export interface AuditResponse {
    success: boolean;
    entries: SecurityAlert[];
    count: number;
    error?: string;
}
export declare function listSecurityAuditLog(appDb: Knex, pnameProvider: OperaPnameProvider, days?: number): Promise<AuditResponse>;
export interface BankChange {
    account: string;
    name: string;
    field: string;
    old: string;
    new: string;
}
export interface ScanResponse {
    success: boolean;
    changes_detected: number;
    alerts_sent: number;
    bank_changes: BankChange[];
    error?: string;
}
export declare function scanSupplierChanges(appDb: Knex, pnameProvider: OperaPnameProvider, email: SecurityEmailSender): Promise<ScanResponse>;
//# sourceMappingURL=security.d.ts.map