import type { AppBackendFactory } from './app-context.js';
export declare const register: (deps: {
    app: import("express").Router;
    useSamContext: import("./_shared/sam-v2-shim.js").UseSamContextFn;
    useSamServices: import("./_shared/sam-v2-shim.js").UseSamServicesFn;
    stableServices?: import("./_shared/sam-v2-shim.js").SamServicesShape;
}) => void;
declare const factory: AppBackendFactory;
export default factory;
//# sourceMappingURL=index.d.ts.map