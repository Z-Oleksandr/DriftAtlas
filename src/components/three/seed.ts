/**
 * Committed seed for the Force-Directed Graph simulation.
 *
 * Per code_rules §3 (FDG exception): the FDG runs `d3-force-3d` in the browser,
 * but determinism is preserved by seeding the simulation's LCG with this constant
 * and seeding initial node positions from a stable hash of the branch name. Any
 * change to this value invalidates committed/captured FDG figures.
 */
export const FDG_SEED = 0x5a017e1d;
