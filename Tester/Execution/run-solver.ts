// Environment-neutral solver runner: no DOM, no `self`. The browser worker and the Node bench both wrap this, so a
// benchmark and a real run measure the same code path.
//
// One run: load the module, hand it the problem, time the solver's function, then pack and check what it returned.
// Only the call to nq_solve is timed. Passing the problem, packing the result and checking it are the tester's work.
// timeSolver is the same run without the packing and checking, for the repeated runs that only measure.
import { findDuplicates, firstInvalid } from "../Board/solution-check";
import { indexSet, type SolutionSet } from "../Board/solution-set";
import {
  CASE_ID,
  ENTRY_POINT,
  encodeInput,
  type ErrorKind,
  type RunProgress,
  type ProblemInput,
  type RunOutcome,
} from "./protocol";
import { SnapshotStore, type SnapshotState } from "./snapshot-store";

/** The exports of Tester/Harness/nqueen_runtime.cpp, as Emscripten gives them. */
export interface SolverModule {
  _nq_alloc_input(bytes: number): number;
  _nq_prepare(kase: number, debug: number): number;
  _nq_solve(): number;
  _nq_pack(): number;
  _nq_result(): number;
  _nq_count(): number;
  _nq_bad(which: number): number;
  /** Missing in a module built before the heap was measured. */
  _nq_heap_top?(): number;
  /** A getter in Emscripten: the view is replaced when memory grows, so read it again after every call. */
  readonly HEAPU8: Uint8Array;
}

export interface RunOptions {
  input: ProblemInput;
  /** Debug run: snapshot() is recorded. The caller should not judge the time. */
  debug: boolean;
  snapshotHead: number;
  snapshotTail: number;
  /** Instantiates the WASM module. Excluded from compute time. */
  loadModule: () => Promise<SolverModule>;
  /** Receives the messages of a run in progress: started, snapshots and solved. */
  emit: (msg: RunProgress) => void;
  /** Milliseconds, with sub-millisecond resolution. */
  now?: () => number;
  /** Where __nqHost is installed. Default: globalThis. */
  hostTarget?: object;
  /** How often snapshots are sent to the main thread while the solver runs. */
  flushMs?: number;
}

const defaultNow = (): number => performance.now();

function classify(e: unknown): ErrorKind {
  return (e as { name?: string } | null)?.name === "ExitStatus" ? "exit" : "trap";
}
const messageOf = (e: unknown): string =>
  String((e as { message?: string } | null)?.message ?? e);
const stackOf = (e: unknown): string | undefined => {
  const stack = (e as { stack?: string } | null)?.stack;
  return stack ? stack.split("\n").slice(0, 8).join("\n") : undefined;
};

const emptySet = (n: number, kind: SolutionSet["kind"]): SolutionSet => ({
  kind,
  n,
  count: 0,
  data: new Uint8Array(0),
});

type Failure = Extract<RunOutcome, { status: "error" }>;
type Solved =
  | { ok: true; mod: SolverModule; computeMs: number; heapPeakBytes?: number }
  | { ok: false; failure: Failure };

type SolveOptions = Pick<RunOptions, "input" | "debug" | "loadModule" | "emit" | "now">;

const heapTop = (mod: SolverModule): number | undefined =>
  typeof mod._nq_heap_top === "function" ? mod._nq_heap_top() : undefined;

/**
 * Loads a fresh module, hands it the problem and times the solver's function. The heap is read after the problem went
 * in and again right after the solver returned, before anything is packed: packing allocates too, and that is the
 * tester's memory. `extra` adds what a failure should carry besides its message, such as the snapshots seen so far.
 */
async function solveOnce(opts: SolveOptions, extra: () => { snapshots?: SnapshotState }): Promise<Solved> {
  const { input, debug, emit } = opts;
  const now = opts.now ?? defaultNow;

  let mod: SolverModule;
  try {
    mod = await opts.loadModule();
  } catch (e) {
    return {
      ok: false,
      failure: { status: "error", kind: "load", message: messageOf(e), stack: stackOf(e), computeMs: 0 },
    };
  }

  const bytes = encodeInput(input);
  let heapBefore: number | undefined;
  try {
    const at = mod._nq_alloc_input(bytes.length);
    mod.HEAPU8.set(bytes, at);
    if (mod._nq_prepare(CASE_ID[input.kase], debug ? 1 : 0) !== 0) {
      return {
        ok: false,
        failure: {
          status: "error",
          kind: "trap",
          message: "The problem could not be passed to the solver.",
          computeMs: 0,
        },
      };
    }
    heapBefore = heapTop(mod);
  } catch (e) {
    return {
      ok: false,
      failure: { status: "error", kind: classify(e), message: messageOf(e), stack: stackOf(e), computeMs: 0 },
    };
  }

  emit({ type: "started" });
  let failure: unknown;
  let code = 0;
  const t0 = now();
  try {
    code = mod._nq_solve();
  } catch (e) {
    failure = e;
  }
  const computeMs = now() - t0;
  emit({ type: "solved", computeMs });

  if (failure !== undefined) {
    return {
      ok: false,
      failure: {
        status: "error",
        kind: classify(failure),
        message: messageOf(failure),
        stack: stackOf(failure),
        computeMs,
        ...extra(),
      },
    };
  }
  if (code === 1) {
    return {
      ok: false,
      failure: {
        status: "error",
        kind: "missing",
        message: `The solver does not define ${ENTRY_POINT[input.kase]}`,
        computeMs,
        ...extra(),
      },
    };
  }
  if (code !== 0) {
    return {
      ok: false,
      failure: {
        status: "error",
        kind: "trap",
        message: `The solver call ended with code ${code}.`,
        computeMs,
        ...extra(),
      },
    };
  }

  const heapAfter = heapTop(mod);
  return {
    ok: true,
    mod,
    computeMs,
    ...(heapBefore !== undefined && heapAfter !== undefined
      ? { heapPeakBytes: Math.max(0, heapAfter - heapBefore) }
      : {}),
  };
}

/** One run that only measures: what a repeated run needs, without packing or checking the result. */
export type TimedOutcome = { status: "timed"; computeMs: number; heapPeakBytes?: number } | Failure;

export async function timeSolver(
  opts: Pick<RunOptions, "input" | "loadModule" | "emit" | "now">,
): Promise<TimedOutcome> {
  const solved = await solveOnce({ ...opts, debug: false }, () => ({}));
  if (!solved.ok) return solved.failure;
  return {
    status: "timed",
    computeMs: solved.computeMs,
    ...(solved.heapPeakBytes !== undefined ? { heapPeakBytes: solved.heapPeakBytes } : {}),
  };
}

export async function runSolver(opts: RunOptions): Promise<RunOutcome> {
  const { input, debug, emit } = opts;
  const now = opts.now ?? defaultNow;
  const flushMs = opts.flushMs ?? 50;
  const target = (opts.hostTarget ?? globalThis) as Record<string, unknown>;
  const kind: SolutionSet["kind"] = input.kase === "walled" ? "cells" : "cols";

  const store = debug ? new SnapshotStore(opts.snapshotHead, opts.snapshotTail) : undefined;
  let lastFlush = -Infinity; // the first snapshot is sent at once: a solver that then gets stuck would never send another
  const snapshotsNow = () => (store ? { snapshots: store.state() } : {});

  // The solver calls this from inside WASM. It is only reached in a Debug run, never in the time-critical path of a
  // normal run.
  target.__nqHost = {
    snapshot(flat: Int32Array, label: string): void {
      if (!store) return;
      const queens: Array<[number, number]> = [];
      for (let i = 0; i + 1 < flat.length; i += 2) queens.push([flat[i]!, flat[i + 1]!]);
      store.push(label, queens);
      const t = now();
      if (t - lastFlush >= flushMs) {
        lastFlush = t;
        emit({ type: "snapshots", state: store.state() });
      }
    },
  };

  try {
    const solved = await solveOnce(opts, snapshotsNow);
    if (!solved.ok) return solved.failure;
    const { mod, computeMs, heapPeakBytes } = solved;

    // Pack and check. Not compute time, and the watchdog no longer applies.
    let packed: number;
    try {
      packed = mod._nq_pack();
    } catch (e) {
      return { status: "error", kind: classify(e), message: messageOf(e), stack: stackOf(e), computeMs, ...snapshotsNow() };
    }
    const common = { computeMs, ...(heapPeakBytes !== undefined ? { heapPeakBytes } : {}) };
    if (packed < 0) {
      return {
        status: "completed",
        ...common,
        set: emptySet(input.n, kind),
        invalid: formatProblem(mod, packed, input),
        duplicates: { count: 0 },
        ...snapshotsNow(),
      };
    }
    const at = mod._nq_result();
    const set: SolutionSet = {
      kind,
      n: input.n,
      count: mod._nq_count(),
      data: mod.HEAPU8.slice(at, at + packed), // a copy: the module's memory is not ours to transfer
    };
    if (kind === "cells") indexSet(set);

    const invalid = firstInvalid(set, { preplaced: input.preplaced, terrain: input.terrain });
    return {
      status: "completed",
      ...common,
      set,
      ...(invalid ? { invalid } : {}),
      duplicates: invalid ? { count: 0 } : findDuplicates(set),
      ...snapshotsNow(),
    };
  } finally {
    delete target.__nqHost;
  }
}

/** The harness could not pack the result. Says which solution had the wrong shape. */
function formatProblem(mod: SolverModule, code: number, input: ProblemInput) {
  const index = mod._nq_bad(0);
  const a = mod._nq_bad(1);
  const b = mod._nq_bad(2);
  const { n } = input;
  const board = index + 1;
  let message: string;
  if (input.kase === "walled") {
    message =
      code === -1
        ? `Board ${board} lists ${a} queens, more than a board can hold`
        : `Board ${board} has a queen at (${a},${b}), outside the ${n}x${n} board`;
  } else {
    message =
      code === -1
        ? `Solution ${board} has ${a} entries, but a solution needs exactly ${n}, one column for each row`
        : `Solution ${board}: row ${a} has column ${b}, outside 0 to ${n - 1}`;
  }
  return { index, rule: "format" as const, message, cells: [] as Array<[number, number]> };
}
