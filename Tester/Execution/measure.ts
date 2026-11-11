// Environment-neutral measurement of one solver on one board, for the browser worker and the Node bench.
//
// The first run is the full run: it packs and checks the result, records snapshots in a Debug run, and its outcome is
// reported at once, so that the result can be shown while the rest is still going on. It is also the warm-up, and its
// time is left out of the statistics. Then comes a fixed number of timed runs, each in a fresh module, that only time the
// solver and read the heap. The time and memory are reported together when the last one is done.
import { WARMUP_RUNS } from "../Configuration/budget";
import type { MeasureReport } from "./protocol";
import { runSolver, timeSolver, type RunOptions } from "./run-solver";
import { summarize } from "./stats";

export type { MeasureReport };

export interface MeasureOptions extends Omit<RunOptions, "emit"> {
  /** Timed runs after the first one. 0 runs the solver once and measures nothing. A Debug run is never repeated. */
  timedRuns: number;
  report(msg: MeasureReport): void;
}

export async function measureSolver(opts: MeasureOptions): Promise<void> {
  const { report, timedRuns, ...run } = opts;
  const first = await runSolver({ ...run, emit: report });

  // A result that is wrong has no speed worth measuring, and nothing came back from a run that failed.
  const repeat =
    timedRuns > 0 &&
    !opts.debug &&
    first.status === "completed" &&
    !first.invalid &&
    first.duplicates.count === 0;
  report({ type: "outcome", outcome: first, timedRuns: repeat ? timedRuns : 0 });
  if (!repeat || first.status !== "completed") return;

  const total = WARMUP_RUNS + timedRuns;
  const times: number[] = [];
  const heaps: number[] = first.heapPeakBytes !== undefined ? [first.heapPeakBytes] : [];
  try {
    for (let i = 0; i < timedRuns; i++) {
      const out = await timeSolver({ ...run, emit: report });
      if (out.status === "error") {
        report({
          type: "metrics",
          measurement: { state: "failed", reason: `run ${WARMUP_RUNS + i + 1} of ${total}: ${out.message}` },
        });
        return;
      }
      times.push(out.computeMs);
      if (out.heapPeakBytes !== undefined) heaps.push(out.heapPeakBytes);
      report({ type: "measuring", done: WARMUP_RUNS + i + 1, total });
    }
  } catch (e) {
    report({
      type: "metrics",
      measurement: { state: "failed", reason: String((e as { message?: string } | null)?.message ?? e) },
    });
    return;
  }
  report({
    type: "metrics",
    measurement: {
      state: "done",
      metrics: {
        time: summarize(times, first.computeMs),
        ...(heaps.length > 0 ? { heapPeakBytes: Math.max(...heaps) } : {}),
      },
    },
  });
}
