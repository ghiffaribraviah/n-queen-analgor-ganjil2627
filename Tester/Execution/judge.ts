// Turns what a finished run returned into a status. Pure: the browser, the Node bench and the tests all use it.
import { findMissing } from "../Board/solution-check";
import {
  indexSet,
  queenCountAt,
  queensAt,
  type SolutionSet,
} from "../Board/solution-set";
import type { ProblemCase } from "../Board/terrain";
import { WARMUP_RUNS } from "../Configuration/budget";
import type {
  Measurement,
  ReferenceResult,
  RunOutcome,
  SessionResult,
} from "./protocol";

export interface JudgeContext {
  kase: ProblemCase;
  /** The reference run on the same board, when there is one. Without it the run is only checked for validity. */
  reference?: ReferenceResult;
  debug: boolean;
  /** Timed runs that follow this one, as the worker said. 0: the result is not measured. */
  timedRuns: number;
}

/**
 * Queens on the best returned boards, and how many boards have that many. On Walled a smaller board is allowed and
 * ignored, because only boards with the most queens are asked for. Elsewhere every solution has N queens.
 */
export function bestOf(set: SolutionSet): { queens: number; count: number } {
  if (set.count === 0) return { queens: 0, count: 0 };
  if (set.kind === "cols") return { queens: set.n, count: set.count };
  indexSet(set);
  let queens = 0;
  let count = 0;
  for (let i = 0; i < set.count; i++) {
    const q = queenCountAt(set, i);
    if (q > queens) {
      queens = q;
      count = 1;
    } else if (q === queens) count++;
  }
  return { queens, count };
}

export function judge(
  out: Extract<RunOutcome, { status: "completed" }>,
  ctx: JudgeContext,
): SessionResult {
  const { set } = out;
  // Time and memory are not known yet when timed runs are still to come: the result is shown first.
  const measurement: Measurement =
    ctx.timedRuns > 0
      ? { state: "pending", done: WARMUP_RUNS, total: WARMUP_RUNS + ctx.timedRuns }
      : { state: "skipped" };
  const common = {
    debug: ctx.debug,
    measurement,
    ...(out.snapshots ? { snapshots: out.snapshots } : {}),
  };

  if (out.invalid) {
    return {
      status: "Invalid Solution",
      set,
      index: out.invalid.rule === "format" && set.count === 0 ? -1 : out.invalid.index,
      rule: out.invalid.rule,
      message: out.invalid.message,
      ...(out.invalid.cells ? { cells: out.invalid.cells } : {}),
      ...common,
    };
  }
  if (out.duplicates.count > 0 && out.duplicates.first) {
    const { index, of } = out.duplicates.first;
    return {
      status: "Invalid Solution",
      set,
      index,
      rule: "duplicate",
      message: `Solution ${index + 1} is the same as solution ${of + 1}${
        out.duplicates.count > 1 ? ` (${out.duplicates.count} repeats in all)` : ""
      }`,
      ...common,
    };
  }

  const { queens, count } = bestOf(set);
  const ref = ctx.reference;
  if (!ref) {
    return { status: "Successful", set, queens, count, compared: false, ...common };
  }

  if (ctx.kase === "walled") {
    if (queens < ref.queens) {
      const referenceBoard = ref.set && ref.set.count > 0 ? queensAt(ref.set, 0) : undefined;
      return {
        status: "Suboptimal",
        set,
        queens,
        maximum: ref.queens,
        ...(referenceBoard ? { referenceBoard } : {}),
        ...common,
      };
    }
  }

  if (count < ref.count) {
    const at = ref.set ? findMissing(set, ref.set) : undefined;
    return {
      status: "Incomplete",
      set,
      found: count,
      expected: ref.count,
      ...(at !== undefined && ref.set ? { missing: queensAt(ref.set, at) } : {}),
      ...common,
    };
  }
  return { status: "Successful", set, queens, count, compared: true, ...common };
}
