// Shared contract between the main thread, the worker and the environment-neutral runner. No DOM or worker globals.
import type { Duplicates, InvalidSolution } from "../Board/solution-check";
import type { SolutionSet } from "../Board/solution-set";
import type { ProblemCase } from "../Board/terrain";
import type { Rule } from "../Board/validator";
import type { SnapshotState } from "./snapshot-store";

/** Case numbers of nq_prepare() in Tester/Harness/nqueen_runtime.cpp. */
export const CASE_ID: Record<ProblemCase, number> = {
  normal: 0,
  preplaced: 1,
  holes: 2,
  walled: 3,
};

/** The function a solver must define for each case, as shown in error messages. */
export const ENTRY_POINT: Record<ProblemCase, string> = {
  normal: "std::vector<std::vector<int>> solveNQueens(int n)",
  preplaced:
    "std::vector<std::vector<int>> solvePreplaced(int n, const std::vector<std::pair<int, int>>& preplaced)",
  holes:
    "std::vector<std::vector<int>> solveHoles(int n, const std::vector<std::string>& grid)",
  walled:
    "std::vector<std::vector<std::pair<int, int>>> solveWalled(int n, const std::vector<std::string>& grid)",
};

/** The problem a solver is given. */
export interface ProblemInput {
  kase: ProblemCase;
  n: number;
  /** Queens already on the board, as (row, column). */
  preplaced: Array<[number, number]>;
  /** N strings of '.', 'H' (hole) or 'W' (wall). Left out on Normal and Pre-placed boards. */
  terrain?: readonly string[];
}

/** Input bytes of nq_prepare(): n | queen count (u16 LE) | (row, col) per queen | n*n grid characters. */
export function encodeInput(p: ProblemInput): Uint8Array {
  const { n } = p;
  const queens = p.preplaced.length;
  const out = new Uint8Array(3 + 2 * queens + n * n);
  out[0] = n;
  out[1] = queens & 255;
  out[2] = queens >> 8;
  p.preplaced.forEach(([r, c], i) => {
    out[3 + 2 * i] = r;
    out[4 + 2 * i] = c;
  });
  const grid = 3 + 2 * queens;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      out[grid + r * n + c] = (p.terrain?.[r]?.[c] ?? ".").charCodeAt(0);
  return out;
}

// ---- Outcome of one run in the worker --------------------------------------------------------------------------

export type ErrorKind =
  | "trap" // WASM trap, abort(), out of memory, stack overflow, any other runtime failure
  | "exit" // the solver called exit()
  | "load" // the module failed to load or instantiate
  | "missing"; // the solver does not define the function for this case

/** What repeated runs of one solver on one board say about its speed. */
export interface TimeStats {
  /**
   * The compute time: the fastest of the timed runs. Anything else running on the machine only ever makes a run slower,
   * so the fastest run is the one that is closest to the cost of the solver itself.
   */
  minMs: number;
  /** Median of the timed runs: what a typical run took, for comparing with the fastest. */
  medianMs: number;
  /** Median absolute deviation from the median. Unlike a standard deviation, one slow outlier hardly moves it. */
  madMs: number;
  /** Timed runs, not counting the warm-up. */
  samples: number;
  /** Compute time of the first run, which is left out of the statistics. */
  warmupMs: number;
}

export interface Metrics {
  time: TimeStats;
  /** The most heap the solver held at once, in bytes. Missing when the module was built without nq_heap_top. */
  heapPeakBytes?: number;
}

/** How far the measurement of a run has come. */
export type Measurement =
  | { state: "pending"; done: number; total: number }
  | { state: "done"; metrics: Metrics }
  | { state: "failed"; reason: string }
  /** Not measured: a Debug run, a result that is wrong, or a run that was not asked to be measured. */
  | { state: "skipped" };

export type RunOutcome =
  | {
      status: "completed";
      computeMs: number;
      /** Heap the solver held at once during this run, when the module can tell. */
      heapPeakBytes?: number;
      set: SolutionSet;
      /** The first returned solution that is wrong, if any. */
      invalid?: InvalidSolution;
      duplicates: Duplicates;
      snapshots?: SnapshotState;
    }
  | {
      status: "error";
      kind: ErrorKind;
      message: string;
      /** The top of the JavaScript stack, which names the solver's functions when the module has names. */
      stack?: string;
      computeMs: number;
      snapshots?: SnapshotState;
    };

// ---- Messages between Session and the worker --------------------------------------------------------------------

export interface StartMessage {
  type: "start";
  sessionId: number;
  moduleUrl: string;
  input: ProblemInput;
  /** Debug run: snapshot() calls are recorded, and the time is not judged. */
  debug: boolean;
  snapshotHead: number;
  snapshotTail: number;
  /** Timed runs after the first one. 0 runs the solver once and measures nothing. */
  timedRuns: number;
}
export type ToWorker = StartMessage;

/** What a run reports while it is going on. The worker adds the session id. */
export type RunProgress =
  | { type: "started" }
  | { type: "snapshots"; state: SnapshotState }
  | { type: "solved"; computeMs: number };

/**
 * Everything a worker reports about one measured solver. The first run's outcome comes at once, so that the result can
 * be shown while the timed runs still go on; the time and memory follow when the last of them is done.
 */
export type MeasureReport =
  | RunProgress
  /** `timedRuns` is how many timed runs follow: 0 when this run is not measured further. */
  | { type: "outcome"; outcome: RunOutcome; timedRuns: number }
  /** `done` of `total` runs are finished, the first one included. */
  | { type: "measuring"; done: number; total: number }
  | { type: "metrics"; measurement: Extract<Measurement, { state: "done" | "failed" }> };

export type FromWorker = MeasureReport & { sessionId: number };

// ---- What the reference solver found, and what a run is judged as ------------------------------------------------

export interface ReferenceResult {
  /** Queens on the best board: N, or the maximum on Walled. */
  queens: number;
  /** Solutions found (boards with the most queens on Walled). */
  count: number;
  /** The solutions themselves, kept when they are small enough to show a missing one. */
  set?: SolutionSet;
  /** Only when the reference run was asked to be measured, as the benchmark does. The app needs just the answer. */
  metrics?: Metrics;
}

interface Timed {
  /** A Debug run records snapshots, so its time and memory are not measured. */
  debug: boolean;
  measurement: Measurement;
  snapshots?: SnapshotState;
}

export type SessionResult =
  | ({
      status: "Successful";
      set: SolutionSet;
      queens: number;
      count: number;
      /** The result was compared with a reference run. */
      compared: boolean;
    } & Timed)
  | ({
      status: "Suboptimal";
      set: SolutionSet;
      queens: number;
      maximum: number;
      /** A board with the most queens, when the reference run kept its solutions. */
      referenceBoard?: Array<[number, number]>;
    } & Timed)
  | ({
      status: "Incomplete";
      set: SolutionSet;
      found: number;
      expected: number;
      /** A solution the reference run found and this one does not hold. */
      missing?: Array<[number, number]>;
    } & Timed)
  | ({
      status: "Invalid Solution";
      set: SolutionSet;
      /** 0-based index of the wrong solution in `set`, or -1 when the shape of the result was wrong. */
      index: number;
      rule: Rule;
      message: string;
      cells?: Array<[number, number]>;
    } & Timed)
  | {
      status: "Failed";
      cutoffSeconds: number;
      elapsedMs: number;
      debug: boolean;
      snapshots?: SnapshotState;
    }
  | {
      status: "Execution Error";
      kind: ErrorKind;
      message: string;
      stack?: string;
      computeMs: number;
      debug: boolean;
      snapshots?: SnapshotState;
    }
  | { status: "Cancelled" };

/** A result of a run that finished and was judged: the ones that carry a measurement. */
export type MeasuredResult = Extract<SessionResult, { measurement: Measurement }>;
