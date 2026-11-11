// The result column: a badge for how the run ended, what it was run on, the figures of the result (how many solutions,
// the best time, the heap peak) as tiles, and what to read between the lines. Pure functions make the text and the
// tiles, so that they can be tested; ResultPanel only puts them on the page.
import { formatDuration, formatTime, splitBytes, splitTime } from "../Configuration/budget";
import type { Rule } from "../Board/validator";
import type { ErrorKind, Measurement, SessionResult } from "../Execution/protocol";
import type { RunView } from "../Execution/run-controller";
import { isBelowResolution, isNoisy } from "../Execution/stats";
import { h } from "./dom";
import { icon, type IconName } from "./icons";

export const RULE_LABEL: Record<Rule, string> = {
  size: "board size",
  format: "a result has the wrong shape",
  "queen-count": "queen count",
  row: "two queens share a row",
  column: "two queens share a column",
  diagonal: "two queens share a diagonal",
  preplaced: "a preplaced queen was moved or removed",
  terrain: "a queen is on a hole or wall, or the board's terrain changed",
  duplicate: "the same solution was returned more than once",
};

export const KIND_LABEL: Record<ErrorKind, string> = {
  trap: "runtime failure (trap, out of memory or stack overflow)",
  exit: "the solver called exit()",
  load: "the module failed to load",
  missing: "the solver does not define the function for this case",
};

type Shown = Exclude<SessionResult, { status: "Cancelled" }>;
export type Tone = "ok" | "warn" | "bad";

/** One figure: a big value, its unit, a label, and a small line under it. */
export interface Tile {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  /** Shown on hover: the exact figure. */
  title?: string;
  /** Not a figure yet (being measured, not measured): drawn quietly. */
  muted?: boolean;
}

export interface ResultText {
  tone: Tone;
  title: string;
  /** What to read about the result, besides its figures. */
  lines: string[];
  /** The figures of the result itself. Time and memory come from measurementModel. */
  tiles: Tile[];
  /** Preformatted text, such as a stack. */
  detail?: string;
}

const num = (n: number): string => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string): string => `${num(n)} ${n === 1 ? one : many}`;

export interface Progress {
  done: number;
  total: number;
}

export interface MeasurementModel {
  tiles: Tile[];
  /** Small facts under the tiles: the minimum, the spread and the number of runs. */
  detail: string[];
  /** What the numbers cannot be trusted for, or why there are none. */
  notes: string[];
}

const TIME_LABEL = "Best time";
const HEAP_LABEL = "Heap peak";
const none = (): Tile[] => [
  { label: TIME_LABEL, value: "–", muted: true },
  { label: HEAP_LABEL, value: "–", muted: true },
];

/**
 * Time and memory. They come after the first run, as "measuring", and are replaced by the numbers when the last timed
 * run is done. A Debug run records snapshots, which takes time and memory, so it measures neither; a result that is
 * wrong has no speed worth showing, and so has no tiles.
 */
export function measurementModel(r: { debug: boolean; measurement: Measurement }, progress?: Progress): MeasurementModel {
  if (r.debug)
    return {
      tiles: none(),
      detail: [],
      notes: ["Time and memory are not measured in a Debug run: recording snapshots takes both."],
    };
  const m = r.measurement;
  switch (m.state) {
    case "skipped":
      return { tiles: [], detail: [], notes: [] };
    case "pending": {
      const p = progress ?? m;
      return {
        tiles: [
          { label: TIME_LABEL, value: "…", hint: `measuring, run ${p.done} of ${p.total}`, muted: true },
          { label: HEAP_LABEL, value: "…", muted: true },
        ],
        detail: [],
        notes: [],
      };
    }
    case "failed":
      return { tiles: none(), detail: [], notes: [`Time and memory not measured: ${m.reason}`] };
    case "done": {
      const t = m.metrics.time;
      const best = splitTime(t.minMs);
      const tiles: Tile[] = [
        { label: TIME_LABEL, value: best.value, unit: best.unit, title: `Exactly ${formatDuration(t.minMs)} (m:ss.fffff)` },
      ];
      if (m.metrics.heapPeakBytes !== undefined) {
        const heap = splitBytes(m.metrics.heapPeakBytes);
        tiles.push({ label: HEAP_LABEL, value: heap.value, unit: heap.unit });
      }
      const notes: string[] = [];
      // Under a millisecond the timer's own step is a large share of the time, so the spread is large whatever the
      // machine is doing, and "noisy" would say nothing more than "approximate" does.
      if (isBelowResolution(t)) notes.push("The solver took under 1 ms, so the time is only approximate.");
      else if (isNoisy(t))
        notes.push(
          `Noisy measurement: the spread is ${Math.round((t.madMs / t.medianMs) * 100)}% of the median. Close other programs and run again.`,
        );
      return {
        tiles,
        detail: [`median ${formatTime(t.medianMs)}`, `spread ${formatTime(t.madMs)}`, plural(t.samples, "run", "runs")],
        notes,
      };
    }
  }
}

const snapshotLine = (r: Shown): string[] =>
  r.snapshots && r.snapshots.entries.length > 0
    ? [`${plural(r.snapshots.total, "snapshot call", "snapshot calls")} recorded; Snapshots, under the board, shows them`]
    : [];

export function describeResult(r: Shown, ctx: { walled: boolean }): ResultText {
  const boards = ctx.walled ? "Boards" : "Solutions";
  switch (r.status) {
    case "Successful":
      return {
        tone: "ok",
        title: r.status,
        tiles:
          r.count > 0
            ? [
                { label: boards, value: num(r.count) },
                { label: "Queens", value: String(r.queens) },
              ]
            : [],
        lines: [
          ...(r.count === 0
            ? [r.compared ? "No solutions, and the reference solver found none either" : "No solutions were returned"]
            : []),
          ...(r.compared
            ? []
            : [
                ctx.walled
                  ? "Not compared with the reference solver, so the number of queens is not checked against the maximum"
                  : "Not compared with the reference solver, so the count is not checked",
              ]),
          ...snapshotLine(r),
        ],
      };
    case "Suboptimal":
      return {
        tone: "warn",
        title: r.status,
        tiles: [
          { label: "Queens", value: String(r.queens), hint: `maximum ${r.maximum}` },
          { label: "Boards returned", value: num(r.set.count) },
        ],
        lines: [
          `${r.queens} queens on a valid board, but the maximum is ${r.maximum}`,
          ...(r.referenceBoard ? ["Reference board, under the board, shows one with more queens"] : []),
          ...snapshotLine(r),
        ],
      };
    case "Incomplete":
      return {
        tone: "warn",
        title: r.status,
        tiles: [{ label: `${boards} found`, value: num(r.found), hint: `of ${num(r.expected)}` }],
        lines: [
          ...(r.missing ? ["Missing solution, under the board, shows one that was left out"] : []),
          ...snapshotLine(r),
        ],
      };
    case "Invalid Solution":
      return {
        tone: "bad",
        title: r.status,
        tiles: [],
        lines: [`Rule broken: ${RULE_LABEL[r.rule]}`, r.message, ...snapshotLine(r)],
      };
    case "Failed":
      return {
        tone: "bad",
        title: r.status,
        tiles: [],
        lines: [`Exceeded the cutoff (${formatDuration(r.cutoffSeconds * 1000)})`, ...snapshotLine(r)],
      };
    case "Execution Error":
      return {
        tone: "bad",
        title: r.status,
        tiles: [],
        lines: [`Error: ${KIND_LABEL[r.kind]}`, r.message, ...snapshotLine(r)],
        ...(r.stack ? { detail: r.stack } : {}),
      };
  }
}

const TONE_ICON: Record<Tone, IconName> = { ok: "check", warn: "warn", bad: "cross" };

export interface ResultContext {
  walled: boolean;
}

/**
 * The right column's card: the title Result with how the run ended as a badge (Successful, Failed, ...), then what a
 * reader needs. A run that ended well shows its figures: the counts, the best time and the heap peak. A run that
 * went wrong shows the error, and no figures, since a wrong or missing result has no speed worth showing.
 * Rebuilt only when something changed.
 */
export class ResultPanel {
  readonly el: HTMLElement;
  private last: { result: unknown; done: number | undefined; state: string; walled: boolean } | undefined;

  constructor() {
    this.el = h("div", { class: "resultpanel", "aria-live": "polite" });
  }

  update(v: RunView, ctx: ResultContext): void {
    const key = { result: v.result, done: v.progress?.done, state: v.state, walled: ctx.walled };
    const l = this.last;
    if (l && l.result === key.result && l.done === key.done && l.state === key.state && l.walled === key.walled) return;
    this.last = key;

    const r = v.result;
    if (!r) {
      const running = v.state === "Running";
      this.el.replaceChildren(
        this.card(
          this.badge(running ? "run" : "idle", running ? "Running" : "No result yet"),
          h(
            "p",
            { class: "muted" },
            running
              ? "The first run is going on. Its result appears as soon as it is checked."
              : "Run a solver to see its result here.",
          ),
        ),
      );
      return;
    }

    const d = describeResult(r, { walled: ctx.walled });
    if (d.tone === "bad") {
      // An error: what went wrong, and the stack if there is one. No figures.
      this.el.replaceChildren(
        this.card(
          this.badge(d.tone, d.title),
          h("div", { class: "errorbox" }, ...d.lines.map((t) => h("p", {}, t))),
          ...(d.detail ? [h("pre", { class: "stack" }, d.detail)] : []),
        ),
      );
      return;
    }

    const meas = "measurement" in r ? measurementModel(r, v.progress) : { tiles: [], detail: [], notes: [] };
    const tiles = [...d.tiles, ...meas.tiles];
    this.el.replaceChildren(
      this.card(
        this.badge(d.tone, d.title),
        ...d.lines.map((t) => h("p", { class: "line" }, t)),
        ...(tiles.length > 0 ? [h("div", { class: "tiles" }, ...tiles.map((t) => this.tile(t)))] : []),
        ...(meas.detail.length > 0 ? [h("div", { class: "detail" }, ...meas.detail.map((t) => h("span", {}, t)))] : []),
        ...meas.notes.map((t) => h("p", { class: "note warn" }, t)),
      ),
    );
  }

  private card(badge: HTMLElement, ...body: HTMLElement[]): HTMLElement {
    return h("section", { class: "result-card" }, h("div", { class: "result-top" }, h("h2", {}, "Result"), badge), ...body);
  }

  private badge(tone: Tone | "run" | "idle", title: string): HTMLElement {
    const name: IconName = tone === "run" || tone === "idle" ? "dot" : TONE_ICON[tone];
    return h("span", { class: `badge ${tone}` }, icon(name), title);
  }

  private tile(t: Tile): HTMLElement {
    const value = h("b", {}, t.value, ...(t.unit ? [h("small", {}, t.unit)] : []));
    return h(
      "div",
      { class: `tile${t.muted ? " muted-tile" : ""}`, ...(t.title ? { title: t.title } : {}) },
      value,
      h("span", {}, t.label),
      ...(t.hint ? [h("em", {}, t.hint)] : []),
    );
  }
}
