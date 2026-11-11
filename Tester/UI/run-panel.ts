// The run controls: the Debug run option, Run and Stop, and how far the run has come. They are the first card of the
// right column, so the button that is used most never moves when a result arrives under it.
import { formatElapsed } from "../Configuration/budget";
import type { RunState, RunView } from "../Execution/run-controller";
import { h } from "./dom";
import { controlLocks } from "./panels";

export interface RunPanelOptions {
  initial: { debug: boolean };
  on: {
    debug(on: boolean): void;
    run(): void;
    stop(): void;
  };
}

/** What the line above the bar says. */
export function runStatusText(state: RunState, progress?: { done: number; total: number }): string {
  switch (state) {
    case "Idle":
      return "Ready";
    case "Running":
      return "Running";
    case "Measuring":
      return progress ? `Measuring · run ${progress.done} of ${progress.total}` : "Measuring";
    case "Done":
      return "Finished";
  }
}

/** How full the bar is, 0 to 1, or undefined while the length of the wait is not known (the first run). */
export function runFraction(state: RunState, progress?: { done: number; total: number }): number | undefined {
  switch (state) {
    case "Idle":
      return 0;
    case "Running":
      return undefined;
    case "Measuring":
      return progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
    case "Done":
      return 1;
  }
}

const active = (state: RunState): boolean => state === "Running" || state === "Measuring";

export class RunPanel {
  readonly el: HTMLElement;
  private readonly debugChk = h("input", { type: "checkbox", id: "debug-run", role: "switch" });
  private readonly runBtn = h("button", { type: "button", class: "btn btn-primary" }, "Run");
  private readonly stopBtn = h("button", { type: "button", class: "btn" }, "Stop");
  private readonly statusText = h("span", { class: "run-status" });
  private readonly timeText = h("span", { class: "run-time" });
  private readonly barFill = h("i", {});
  private readonly bar = h("div", { class: "bar", role: "progressbar", "aria-label": "Run progress" }, this.barFill);
  private readonly notice = h("p", { class: "note warn", role: "status" });
  private startedAt = 0;
  private endedAt = 0;
  private state: RunState = "Idle";
  private ticker: number | undefined;

  constructor(o: RunPanelOptions) {
    this.debugChk.checked = o.initial.debug;
    this.debugChk.addEventListener("change", () => o.on.debug(this.debugChk.checked));
    this.runBtn.addEventListener("click", () => o.on.run());
    this.stopBtn.addEventListener("click", () => o.on.stop());
    this.el = h(
      "section",
      { class: "runbox" },
      h(
        "label",
        { class: "toggle", for: "debug-run" },
        h(
          "span",
          { class: "toggle-text" },
          h("b", {}, "Debug run"),
          h("span", { class: "muted" }, "Records snapshot() calls; time not measured"),
        ),
        this.debugChk,
      ),
      h("div", { class: "runbtns" }, this.runBtn, this.stopBtn),
      h("div", { class: "progress" }, h("div", { class: "meta" }, this.statusText, this.timeText), this.bar),
      this.notice,
    );
    this.update({ state: "Idle", result: null }, false, undefined);
  }

  /**
   * Follows the controller: while a run goes on only Stop is on, the bar shows how far it has come, and the timer
   * counts. `notice` says why Run is off when it is, for example while the reference solver is still working.
   */
  update(v: RunView, canRun: boolean, notice: string | undefined): void {
    const lock = controlLocks(v.state, canRun);
    this.runBtn.disabled = lock.run;
    this.stopBtn.disabled = lock.stop;
    this.debugChk.disabled = lock.config;

    const now = performance.now();
    if (v.state !== this.state) {
      if (v.state === "Running") this.startedAt = now;
      if (v.state === "Done") this.endedAt = now;
      this.state = v.state;
    }
    this.statusText.textContent = runStatusText(v.state, v.progress);
    const fraction = runFraction(v.state, v.progress);
    this.bar.classList.toggle("indeterminate", fraction === undefined);
    this.barFill.style.width = fraction === undefined ? "" : `${Math.round(fraction * 100)}%`;
    if (fraction !== undefined) this.bar.setAttribute("aria-valuenow", String(Math.round(fraction * 100)));
    else this.bar.removeAttribute("aria-valuenow");
    this.notice.hidden = !notice;
    this.notice.textContent = notice ?? "";
    this.tick();
    if (active(v.state)) {
      this.ticker ??= window.setInterval(() => this.tick(), 250);
    } else if (this.ticker !== undefined) {
      window.clearInterval(this.ticker);
      this.ticker = undefined;
    }
  }

  private tick(): void {
    const ms = active(this.state) ? performance.now() - this.startedAt : this.state === "Done" ? this.endedAt - this.startedAt : 0;
    this.timeText.textContent = this.state === "Idle" ? "" : formatElapsed(ms);
  }
}
