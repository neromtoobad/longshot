// LONGSHOT agent runtime.
//
// The template compiler, the predict loop (the buy-or-skip-evidence decision under a budget), and
// the pool runner land in later phases. Phase 3.1 adds the per-agent wallet module.

export * from "./wallet.js";

export const RUNTIME_NAME = "longshot-agent";
