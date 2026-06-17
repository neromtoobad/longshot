// LONGSHOT agent runtime.
//
// The template compiler, the predict loop (the buy-or-skip-evidence decision under a budget), and
// the pool runner land in later phases. Phases 3.1/3.3 add the wallet module and paying client.

export * from "./template.js";
export * from "./predict.js";
export * from "./runner.js";
export * from "./store.js";
export * from "./pool-client.js";
export * from "./model/venice.js";
export * from "./wallet.js";
export * from "./paying/signers.js";
export * from "./paying/x402.js";
export * from "./paying/client.js";
export * from "./paying/purchases.js";

export const RUNTIME_NAME = "longshot-agent";
