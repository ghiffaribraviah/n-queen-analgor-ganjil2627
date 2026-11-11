// Main-thread session: one worker, one id. Owns the watchdog and turns the worker's outcome into a status.
// The worker blocks while the solver runs, so the cutoff is a timer on this side that terminates it.
//
// A run has two phases. The first run's outcome is judged at once and handed to onResult, so that the result can be
// shown while the worker goes on with the timed runs. onFinish comes when the measurement is done, with the same result
// plus the time and memory. A run that is not measured finishes straight away.
import { judge } from "./judge";
import type {
  FromWorker,
  MeasuredResult,
  ProblemInput,
  ReferenceResult,
  SessionResult,
  ToWorker,
} from "./protocol";
import type { SnapshotState } from "./snapshot-store";

export interface WorkerLike {
  postMessage(msg: ToWorker, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((e: { data: FromWorker }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}
export type WorkerFactory = () => WorkerLike;

export interface SessionOptions {
  input: ProblemInput;
  moduleUrl: string;
  /** Hard limit on the first run in seconds: loading its module and its compute time. Exceeding it gives Failed. */
  cutoffSeconds: number;
  /** The limit of each timed run after the first. Exceeding it only spoils the measurement. Default: cutoffSeconds. */
  timedCutoffSeconds?: number;
  /** Debug run: snapshot() is recorded and the time is not measured. */
  debug: boolean;
  snapshotHead: number;
  snapshotTail: number;
  /** Timed runs after the first one. 0, the default, runs the solver once. A Debug run is never repeated. */
  timedRuns?: number;
  /** The reference run on this board. Without it the result is only checked for validity. */
  reference?: ReferenceResult;
  createWorker: WorkerFactory;
  /** The judged result of the first run, while the timed runs are still to come. Not called when there are none. */
  onResult?: (result: MeasuredResult) => void;
  /** `done` of `total` runs are finished, the first one included. */
  onProgress?: (done: number, total: number) => void;
  /** The final result. For a measured run it comes after onResult, and has the time and memory. */
  onFinish: (result: SessionResult) => void;
  /** Snapshots recorded so far in a Debug run. */
  onSnapshots?: (state: SnapshotState) => void;
  /** Milliseconds. Default performance.now(). */
  now?: () => number;
}

export interface SessionLike {
  start(): void;
  stop(): void;
}

let nextSessionId = 1;

export class Session implements SessionLike {
  readonly id = nextSessionId++;
  private worker?: WorkerLike;
  private loadTimer?: ReturnType<typeof setTimeout>;
  private runTimer?: ReturnType<typeof setTimeout>;
  private finished = false;
  private started = false;
  private runStartedAt = 0;
  private snapshots?: SnapshotState;
  /** The judged first run, while the timed runs are going on. */
  private measuring?: MeasuredResult;
  private runsDone = 0;
  private readonly now: () => number;

  constructor(private readonly o: SessionOptions) {
    this.now = o.now ?? (() => performance.now());
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** The limit that applies now: the first run's until its result is judged, the timed runs' after. */
  private get limitSeconds(): number {
    return this.measuring ? (this.o.timedCutoffSeconds ?? this.o.cutoffSeconds) : this.o.cutoffSeconds;
  }

  start(): void {
    if (this.worker || this.finished) throw new Error("Session already started");
    const w = this.o.createWorker();
    this.worker = w;
    w.onmessage = (e) => this.handle(e.data);
    w.onerror = (e) => {
      const message = e.message ?? "Worker error";
      if (this.measuring) return this.measurementFailed(message);
      this.finish({
        status: "Execution Error",
        kind: this.started ? "trap" : "load",
        message,
        computeMs: 0,
        debug: this.o.debug,
        ...(this.snapshots ? { snapshots: this.snapshots } : {}),
      });
    };
    w.postMessage({
      type: "start",
      sessionId: this.id,
      moduleUrl: this.o.moduleUrl,
      input: this.o.input,
      debug: this.o.debug,
      snapshotHead: this.o.snapshotHead,
      snapshotTail: this.o.snapshotTail,
      timedRuns: this.o.debug ? 0 : (this.o.timedRuns ?? 0),
    });
    // Compute time has not started while the module loads, so a hanging load would never reach the cutoff otherwise.
    this.armLoadTimer();
  }

  /** User Stop, or the board changed. The solver never learns about it. A result already shown is dropped too. */
  stop(): void {
    this.finish({ status: "Cancelled" });
  }

  private handle(msg: FromWorker): void {
    if (this.finished || msg.sessionId !== this.id) return; // stale message
    switch (msg.type) {
      case "started":
        this.started = true;
        clearTimeout(this.loadTimer);
        clearTimeout(this.runTimer);
        this.runStartedAt = this.now();
        this.runTimer = setTimeout(() => this.overCutoff(this.now() - this.runStartedAt), this.limitSeconds * 1000);
        return;
      case "snapshots":
        this.snapshots = msg.state;
        this.o.onSnapshots?.(msg.state);
        return;
      case "solved":
        // The solver has returned. Packing and checking the result take as long as they take.
        clearTimeout(this.runTimer);
        if (msg.computeMs > this.limitSeconds * 1000) this.overCutoff(msg.computeMs);
        return;
      case "outcome": {
        const out = msg.outcome;
        if (this.measuring) {
          // Not part of the protocol, but a worker that crashed outside the runner reports it this way.
          if (out.status === "error") this.measurementFailed(out.message);
          return;
        }
        if (out.status === "error") {
          const snapshots = out.snapshots ?? this.snapshots;
          this.finish({
            status: "Execution Error",
            kind: out.kind,
            message: out.message,
            ...(out.stack ? { stack: out.stack } : {}),
            computeMs: out.computeMs,
            debug: this.o.debug,
            ...(snapshots ? { snapshots } : {}),
          });
          return;
        }
        const result = judge(out, {
          kase: this.o.input.kase,
          reference: this.o.reference,
          debug: this.o.debug,
          timedRuns: msg.timedRuns,
        });
        if ("measurement" in result && result.measurement.state === "pending") {
          this.measuring = result;
          this.runsDone = result.measurement.done;
          this.armLoadTimer(); // the next run loads a module of its own
          this.o.onResult?.(result);
          return;
        }
        this.finish(result);
        return;
      }
      case "measuring":
        if (!this.measuring) return;
        this.runsDone = msg.done;
        this.armLoadTimer();
        this.o.onProgress?.(msg.done, msg.total);
        return;
      case "metrics":
        if (!this.measuring) return;
        this.finish({ ...this.measuring, measurement: msg.measurement });
        return;
    }
  }

  private armLoadTimer(): void {
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      const limit = this.limitSeconds;
      const message = `The module did not finish loading within ${limit} s. A static initializer may be hanging.`;
      if (this.measuring) return this.measurementFailed(message);
      this.finish({
        status: "Execution Error",
        kind: "load",
        message,
        computeMs: 0,
        debug: this.o.debug,
      });
    }, this.limitSeconds * 1000);
  }

  /** A run went over the cutoff. In the first run that is the status Failed; later it only spoils the measurement. */
  private overCutoff(elapsedMs: number): void {
    if (this.measuring) {
      this.measurementFailed(`exceeded the cutoff of ${this.limitSeconds} s`);
      return;
    }
    this.finish({
      status: "Failed",
      cutoffSeconds: this.o.cutoffSeconds,
      elapsedMs,
      debug: this.o.debug,
      ...(this.snapshots ? { snapshots: this.snapshots } : {}),
    });
  }

  /** The result of the first run stands: only its time and memory are lost. */
  private measurementFailed(reason: string): void {
    const m = this.measuring!;
    const total = m.measurement.state === "pending" ? m.measurement.total : this.runsDone + 1;
    this.finish({
      ...m,
      measurement: { state: "failed", reason: `run ${this.runsDone + 1} of ${total}: ${reason}` },
    });
  }

  private finish(result: SessionResult): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.loadTimer);
    clearTimeout(this.runTimer);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.o.onFinish(result);
  }
}
