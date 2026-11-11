// Runs the reference solver of a case on one board. Its answer (the number of solutions, or the most queens on Walled)
// is what other solvers are compared with. It goes through Session, the same path as a solver run, in the browser and
// in the Node bench, which also wants its time and so asks for timed runs.
import type { ProblemInput, ReferenceResult } from "./protocol";
import {
  Session,
  type SessionLike,
  type SessionOptions,
  type WorkerFactory,
} from "./session";

/** Reference solutions are kept for showing a missing one only up to this many bytes (N=15 Normal is 34 MB). */
export const REFERENCE_SET_LIMIT_BYTES = 64 * 1024 * 1024;

export interface ReferenceRun {
  /** undefined if the reference solver did not finish (stopped, cutoff, or an error). */
  done: Promise<ReferenceResult | undefined>;
  /** Stops the search. `done` then resolves with undefined. */
  cancel(): void;
}

export interface ReferenceBoard {
  input: ProblemInput;
  moduleUrl: string;
  cutoffSeconds: number;
  /** The limit of each timed run, when timedRuns asks for some. Default: cutoffSeconds. */
  timedCutoffSeconds?: number;
  createWorker: WorkerFactory;
  /** Timed runs after the first one. The default, 0, is for the app, which only needs the answer. */
  timedRuns?: number;
}

export type SessionMaker = (o: SessionOptions) => SessionLike;

export function measureReference(
  board: ReferenceBoard,
  makeSession: SessionMaker = (o) => new Session(o),
): ReferenceRun {
  let session: SessionLike | undefined;
  const done = new Promise<ReferenceResult | undefined>((resolve) => {
    const s = makeSession({
      input: board.input,
      moduleUrl: board.moduleUrl,
      cutoffSeconds: board.cutoffSeconds,
      ...(board.timedCutoffSeconds !== undefined ? { timedCutoffSeconds: board.timedCutoffSeconds } : {}),
      createWorker: board.createWorker,
      debug: false,
      snapshotHead: 0,
      snapshotTail: 0,
      timedRuns: board.timedRuns ?? 0,
      onFinish: (r) => {
        if (r.status === "Successful") {
          resolve({
            queens: r.queens,
            count: r.count,
            ...(r.set.data.byteLength <= REFERENCE_SET_LIMIT_BYTES ? { set: r.set } : {}),
            ...(r.measurement.state === "done" ? { metrics: r.measurement.metrics } : {}),
          });
        } else resolve(undefined);
      },
    });
    session = s;
    s.start();
  });
  return { done, cancel: () => session?.stop() };
}
