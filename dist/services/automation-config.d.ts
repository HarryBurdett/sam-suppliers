/**
 * Per-supplier automation config.
 *
 * Controls whether incoming statements are auto-processed (without
 * operator review), the expected statement frequency, and the
 * matching-rules JSON used by the AI extractor.
 *
 * Stored in `supplier_automation_config` (per-app DB).
 * Greenfield TS port.
 */
import type { Knex } from 'knex';
export type StatementFrequency = 'weekly' | 'monthly' | 'quarterly' | 'on_demand';
export interface AutomationConfig {
    supplier_code: string;
    auto_process: boolean;
    frequency: StatementFrequency;
    matching_rules: Record<string, unknown>;
    updated_at: string;
}
export interface GetAutomationConfigResponse {
    success: boolean;
    config?: AutomationConfig;
    error?: string;
}
export declare function getAutomationConfig(appDb: Knex, supplierCode: string): Promise<GetAutomationConfigResponse>;
export interface SaveAutomationConfigInput {
    supplier_code: string;
    auto_process?: boolean;
    frequency?: string;
    matching_rules?: Record<string, unknown>;
}
export interface SaveAutomationConfigResponse {
    success: boolean;
    config?: AutomationConfig;
    error?: string;
}
export declare function saveAutomationConfig(appDb: Knex, input: SaveAutomationConfigInput): Promise<SaveAutomationConfigResponse>;
//# sourceMappingURL=automation-config.d.ts.map