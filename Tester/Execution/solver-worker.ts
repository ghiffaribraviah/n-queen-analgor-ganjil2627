// Browser worker adapter: a thin shell over the environment-neutral runSolver().
import { measureSolver } from "./measure";
import type { SolverModule } from "./run-solver";
import type { FromWorker, ToWorker } from "./protocol";

const ctx = self as unknown as {
  postMessage(msg: FromWorker, transfer?: Transferable[]): void;
};

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type !== "start") return;
  const { sessionId, moduleUrl } = msg;
  try {
    await measureSolver({
      input: msg.input,
      debug: msg.debug,
      snapshotHead: msg.snapshotHead,
      snapshotTail: msg.snapshotTail,
      timedRuns: msg.timedRuns,
      loadModule: async (): Promise<SolverModule> => {
        const { default: createSolver } = await import(/* @vite-ignore */ moduleUrl);
        return createSolver({ locateFile: (f: string) => new URL(f, moduleUrl).href });
      },
      report: (m) => {
        // The result can be tens of megabytes: hand over the buffers instead of copying them.
        const transfer: Transferable[] = [];
        if (m.type === "outcome" && m.outcome.status === "completed") {
          transfer.push(m.outcome.set.data.buffer);
          if (m.outcome.set.offsets) transfer.push(m.outcome.set.offsets.buffer);
        }
        ctx.postMessage({ ...m, sessionId }, transfer);
      },
    });
  } catch (err) {
    // measureSolver reports solver failures as outcomes; anything reaching here is a host bug.
    ctx.postMessage({
      type: "outcome",
      sessionId,
      timedRuns: 0,
      outcome: {
        status: "error",
        kind: "trap",
        message: String((err as Error)?.message ?? err),
        computeMs: 0,
      },
    });
  }
};
