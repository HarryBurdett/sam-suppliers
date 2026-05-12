/**
 * Supplier onboarding state.
 *
 * Each supplier passes through stages as the operator sets up
 * their statement-processing workflow:
 *   1. discovered      — first statement received
 *   2. configured      — automation rules + approved senders set
 *   3. testing         — running auto-process in dry-run mode
 *   4. live            — fully automated
 *   5. paused          — temporarily disabled
 *
 * Stored in `supplier_onboarding` (one row per supplier).
 * Greenfield TS port.
 */
import type { Knex } from 'knex';
export type OnboardingStage = 'discovered' | 'configured' | 'testing' | 'live' | 'paused';
export interface OnboardingState {
    supplier_code: string;
    stage: OnboardingStage;
    notes: string;
    updated_at: string;
}
export interface GetOnboardingResponse {
    success: boolean;
    state?: OnboardingState;
    error?: string;
}
export declare function getOnboardingState(appDb: Knex, supplierCode: string): Promise<GetOnboardingResponse>;
export interface ListOnboardingOptions {
    stage?: OnboardingStage;
}
export interface ListOnboardingResponse {
    success: boolean;
    states: OnboardingState[];
    count: number;
    error?: string;
}
export declare function listOnboardingStates(appDb: Knex, opts?: ListOnboardingOptions): Promise<ListOnboardingResponse>;
export interface UpdateOnboardingInput {
    supplier_code: string;
    stage?: string;
    notes?: string;
}
export declare function updateOnboardingState(appDb: Knex, input: UpdateOnboardingInput): Promise<GetOnboardingResponse>;
//# sourceMappingURL=onboarding.d.ts.map