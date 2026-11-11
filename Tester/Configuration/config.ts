import type { ProblemCase } from "../Board/terrain";

const CASES: readonly ProblemCase[] = ["normal", "preplaced", "holes", "walled"];

export interface TesterConfig {
  /**
   * Hard limit on the first run of a solver, in seconds: its module loading and its compute time. A first run that goes
   * over it is stopped and Failed.
   */
  cutoffSeconds: number;
  /**
   * The same limit for each of the timed runs that follow the first one. A timed run that goes over it only loses the
   * measurement: the status of the first run stands.
   */
  timedCutoffSeconds: number;
  /** WASM `MAXIMUM_MEMORY` used by the build script. A solver returns all its solutions from this memory. */
  solverMaxMemoryMB: number;
  /** A Debug run keeps the first `snapshotHead` and the last `snapshotTail` snapshot() calls. */
  snapshotHead: number;
  snapshotTail: number;
  /**
   * The solver whose answer a run is compared with, for each case, by id (`category/name`). Optional, and so is each
   * case: a case without one is not compared, and a run of it is only checked for validity.
   */
  referenceSolvers?: Partial<Record<ProblemCase, string>>;
}

/** The reference solver of a case, for the tools that cannot do without one (the benchmark and the check). */
export function referenceSolverOf(cfg: TesterConfig, kase: ProblemCase): string {
  const id = cfg.referenceSolvers?.[kase];
  if (!id) throw new Error(`tester.config.json has no referenceSolvers.${kase}`);
  return id;
}

export function validateConfig(raw: unknown): TesterConfig {
  const c = raw as Record<string, unknown>;
  const num = (k: keyof TesterConfig): number => {
    const v = c?.[k];
    if (typeof v !== "number" || !Number.isFinite(v))
      throw new Error(`config.${k} must be a finite number`);
    return v;
  };
  const cfg: TesterConfig = {
    cutoffSeconds: num("cutoffSeconds"),
    timedCutoffSeconds: num("timedCutoffSeconds"),
    solverMaxMemoryMB: num("solverMaxMemoryMB"),
    snapshotHead: num("snapshotHead"),
    snapshotTail: num("snapshotTail"),
  };
  if (cfg.cutoffSeconds <= 0)
    throw new Error("config.cutoffSeconds must be > 0");
  if (cfg.timedCutoffSeconds <= 0)
    throw new Error("config.timedCutoffSeconds must be > 0");
  if (cfg.solverMaxMemoryMB <= 0)
    throw new Error("config.solverMaxMemoryMB must be > 0");
  if (!Number.isInteger(cfg.snapshotHead) || cfg.snapshotHead < 0)
    throw new Error("config.snapshotHead must be an integer >= 0");
  if (!Number.isInteger(cfg.snapshotTail) || cfg.snapshotTail < 0)
    throw new Error("config.snapshotTail must be an integer >= 0");
  const refs = c?.["referenceSolvers"];
  if (refs !== undefined) {
    if (typeof refs !== "object" || refs === null || Array.isArray(refs))
      throw new Error("config.referenceSolvers must be an object");
    const out: Partial<Record<ProblemCase, string>> = {};
    for (const [kase, id] of Object.entries(refs)) {
      if (!CASES.includes(kase as ProblemCase))
        throw new Error(`config.referenceSolvers.${kase} is not a problem case (${CASES.join(", ")})`);
      if (typeof id !== "string" || id.trim() === "")
        throw new Error(`config.referenceSolvers.${kase} must be a solver id`);
      out[kase as ProblemCase] = id;
    }
    cfg.referenceSolvers = out;
  }
  return cfg;
}
