// Main-thread state of the current board: Idle until a run starts, Running while the first run is going on, Measuring
// once its result is there and the timed runs go on, Done when the time and memory are in. There is no playback: the
// result is a set of boards that the UI browses.
import type {
  ProblemInput,
  ReferenceResult,
  SessionResult,
} from "./protocol";
import {
  Session,
  type SessionLike,
  type SessionOptions,
  type WorkerFactory,
} from "./session";
import type { SnapshotState } from "./snapshot-store";

export type RunState = "Idle" | "Running" | "Measuring" | "Done";

export interface RunProblem {
  input: ProblemInput;
  moduleUrl: string;
  cutoffSeconds: number;
  /** The limit of each timed run. Default: cutoffSeconds. */
  timedCutoffSeconds?: number;
  /** Debug run: snapshot() is recorded and the time is not measured. */
  debug: boolean;
  snapshotHead: number;
  snapshotTail: number;
  /** Timed runs after the first one. A Debug run is never repeated. */
  timedRuns: number;
  reference?: ReferenceResult;
}

export interface RunView {
  state: RunState;
  /** Set when Measuring or Done. Never a Cancelled result: Stop goes back to Idle. */
  result: Exclude<SessionResult, { status: "Cancelled" }> | null;
  /** Runs finished of the runs to make, while Measuring. */
  progress?: { done: number; total: number };
  /** Snapshots of a Debug run seen so far, while it is still running. */
  liveSnapshots?: SnapshotState;
}

export type SessionFactory = (o: SessionOptions) => SessionLike;

export interface RunControllerOptions {
  createWorker: WorkerFactory;
  sessionFactory?: SessionFactory;
}

export class RunController {
  private problem?: RunProblem;
  private session?: SessionLike;
  private state: RunState = "Idle";
  private result: RunView["result"] = null;
  private liveSnapshots?: SnapshotState;
  private progress?: RunView["progress"];
  private view: RunView = { state: "Idle", result: null };
  private readonly listeners = new Set<(v: RunView) => void>();

  constructor(private readonly o: RunControllerOptions) {}

  subscribe(fn: (v: RunView) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getView(): RunView {
    return this.view;
  }

  /** Sets the board to run. Stops a run in progress and forgets its result. */
  configure(problem: RunProblem): void {
    this.problem = problem;
    this.abandon();
    this.state = "Idle";
    this.result = null;
    this.liveSnapshots = undefined;
    this.progress = undefined;
    this.emit();
  }

  /** Runs the configured board. From Done it runs again. Does nothing while a run is in progress. */
  start(): void {
    const p = this.problem;
    if (!p || this.state === "Running" || this.state === "Measuring") return;
    this.result = null;
    this.liveSnapshots = undefined;
    this.progress = undefined;
    this.state = "Running";
    const make = this.o.sessionFactory ?? ((o) => new Session(o));
    const session: SessionLike = make({
      input: p.input,
      moduleUrl: p.moduleUrl,
      cutoffSeconds: p.cutoffSeconds,
      ...(p.timedCutoffSeconds !== undefined ? { timedCutoffSeconds: p.timedCutoffSeconds } : {}),
      debug: p.debug,
      snapshotHead: p.snapshotHead,
      snapshotTail: p.snapshotTail,
      timedRuns: p.timedRuns,
      reference: p.reference,
      createWorker: this.o.createWorker,
      onSnapshots: (state) => {
        if (this.session !== session) return;
        this.liveSnapshots = state;
        this.emit();
      },
      onResult: (result) => {
        if (this.session !== session) return;
        this.state = "Measuring";
        this.result = result;
        this.liveSnapshots = undefined;
        this.progress =
          result.measurement.state === "pending"
            ? { done: result.measurement.done, total: result.measurement.total }
            : undefined;
        this.emit();
      },
      onProgress: (done, total) => {
        if (this.session !== session) return;
        this.progress = { done, total };
        this.emit();
      },
      onFinish: (result) => {
        if (this.session !== session) return; // an older run
        this.session = undefined;
        this.liveSnapshots = undefined; // the final ones are in the result
        this.progress = undefined;
        if (result.status === "Cancelled") {
          this.state = "Idle";
          this.result = null;
        } else {
          this.state = "Done";
          this.result = result;
        }
        this.emit();
      },
    });
    this.session = session;
    this.emit();
    session.start();
  }

  /** Cancels the run in progress, also while it is being measured, and returns to Idle with no result. */
  stop(): void {
    if (this.state !== "Running" && this.state !== "Measuring") return;
    this.abandon();
    this.state = "Idle";
    this.result = null;
    this.liveSnapshots = undefined;
    this.progress = undefined;
    this.emit();
  }

  private abandon(): void {
    const s = this.session;
    this.session = undefined; // first, so its result is ignored
    s?.stop();
  }

  private emit(): void {
    this.view = {
      state: this.state,
      result: this.result,
      ...(this.progress ? { progress: this.progress } : {}),
      ...(this.liveSnapshots ? { liveSnapshots: this.liveSnapshots } : {}),
    };
    for (const fn of this.listeners) fn(this.view);
  }
}
