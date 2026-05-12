/**
 * Suppliers data-integrity health check.
 *
 * Faithful port of `apps/suppliers/logic/health_check.py`. Verifies
 * the suppliers app's local data still references valid Opera codes:
 *   - Supplier codes in our app DB → exist in Opera pname?
 *
 * Storage difference (not a behavioural amendment): the Python
 * version reads supplier_statements.db SQLite; we read the per-app
 * MSSQL tables (supplier_statements / supplier_config) provisioned
 * by the suppliers migration.
 */
import type { Knex } from 'knex';
export interface HealthCheckItem {
    name: string;
    description: string;
    passed: boolean;
    total_checked?: number;
    orphan_count?: number;
    orphans?: Array<Record<string, unknown>>;
    severity: 'info' | 'warning' | 'error';
}
export interface HealthCheckResult {
    app: string;
    healthy: boolean;
    summary: string;
    checks: HealthCheckItem[];
    metadata: Record<string, unknown>;
}
export declare function runSuppliersHealthCheck(opts: {
    operaDb: Knex;
    appDb?: Knex | null;
}): Promise<HealthCheckResult>;
//# sourceMappingURL=health-check.d.ts.map