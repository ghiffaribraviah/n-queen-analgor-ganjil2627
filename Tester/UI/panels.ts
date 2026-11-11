// The configuration panel: which solver, which problem, and the board it is run on. The run controls are in run-panel.ts.
import { MAX_N, MIN_N } from "../Board/preplaced";
import { maxBlocked, parsePositions } from "../Board/positions";
import type { ProblemCase } from "../Board/terrain";
import { DEFAULT_SOLVER } from "../Configuration/budget";
import type { RunState, RunView } from "../Execution/run-controller";
import { h } from "./dom";
import { icon } from "./icons";

/** A solver as the manifest lists it: Solver/<category>/<name>.cpp. */
export interface SolverEntry {
  /** `category/name`: what a choice is made by, and where the build puts the module. */
  id: string;
  /** The folder the source is in. */
  category: string;
  /** The file name without .cpp. */
  name: string;
  /** The path of the source from the repository root. */
  file: string;
  ok: boolean;
  module?: string;
  error?: string;
}

const CASE_LABELS: ReadonlyArray<readonly [ProblemCase, string]> = [
  ["normal", "Normal"],
  ["preplaced", "Pre-placed"],
  ["holes", "Holes"],
  ["walled", "Walled"],
];
const CASE_NOTES: Partial<Record<ProblemCase, string>> = {
  preplaced: "Some queens are already placed and stay. Apply changes draws them from the seed.",
  holes:
    "Queens cannot stand on a hole, but they attack through it. Every row needs one queen. Draw the holes with H and a seed, and the board always keeps a solution. Or type them as row,column: typed holes are run as they are, so the board may have no solution, and the right answer is then an empty list.",
  walled:
    "Queens cannot stand on a wall or attack through it. The goal is as many queens as possible, and every board that reaches the maximum is returned. Type the walls as row,column, or draw them with W and a seed. Walls are drawn as pawns.",
};

export interface ConfigPanelOptions {
  solvers: SolverEntry[];
  initial: { n: number; solver: string; problemCase: ProblemCase };
  on: {
    problem(c: ProblemCase): void;
    resize(n: number): void;
    /** Preplaced: p queens. Holes and Walled: blockedCount blocked cells. Drawn from the seed. */
    place(r: { n: number; p: number; blockedCount: number; seed: number }): void;
    /** The user typed the blocked cells for a board of size n. */
    positions(n: number, text: string): void;
    solver(entry: SolverEntry): void;
  };
}

/** Which controls are off. While a run goes on, including the timed runs, only Stop is on. */
export function controlLocks(state: RunState, canRun: boolean): { config: boolean; run: boolean; stop: boolean } {
  const active = state === "Running" || state === "Measuring";
  return { config: active, run: active || !canRun, stop: !active };
}

const num = (s: string): number => (s.trim() === "" ? NaN : Number(s));

/** What the boxes say, as numbers, and the text of the positions. */
export interface ApplyForm {
  n: number;
  p: number;
  blockedCount: number;
  seed: number;
  text: string;
}
export type ApplyAction = "none" | "resize" | "place" | "positions";

/**
 * What Apply changes does, given what is typed now and what the board was made from. Typed positions win: when the
 * text of the positions was edited, it is the board, and H, W and the seed are ignored. Otherwise the board is drawn
 * again from what the problem case uses (N; N, P and the seed; N, H or W and the seed), and nothing is done when none of
 * those changed.
 */
export function applyAction(kase: ProblemCase, now: ApplyForm, applied: ApplyForm): ApplyAction {
  const nChanged = now.n !== applied.n;
  const seedChanged = now.seed !== applied.seed;
  switch (kase) {
    case "normal":
      return nChanged ? "resize" : "none";
    case "preplaced":
      return nChanged || now.p !== applied.p || seedChanged ? "place" : "none";
    case "holes":
    case "walled":
      if (now.text !== applied.text) return "positions";
      return nChanged || now.blockedCount !== applied.blockedCount || seedChanged ? "place" : "none";
  }
}

/** One step of a − or + button: from what is typed (or the minimum, if that is not a whole number), kept in range. */
export function stepValue(current: number, by: number, min: number, max: number): number {
  const base = Number.isInteger(current) ? current : min;
  return Math.max(min, Math.min(max, base + by));
}

/** A number box with − and + at its sides. They only change what is typed. */
function stepper(input: HTMLInputElement, what: string) {
  const down = h("button", { type: "button", "aria-label": `Decrease ${what}` }, "−");
  const up = h("button", { type: "button", "aria-label": `Increase ${what}` }, "+");
  return { el: h("div", { class: "stepper" }, down, input, up), down, up };
}
const field = (label: string, input: HTMLElement): HTMLElement =>
  h("label", { class: "field" }, h("span", {}, label), input);

export class ConfigPanel {
  readonly el: HTMLElement;
  private readonly nIn = h("input", { type: "number", min: String(MIN_N), max: String(MAX_N), step: "1", "aria-label": "N" });
  private readonly pIn = h("input", { type: "number", min: "0", step: "1", "aria-label": "P" });
  private readonly blockedIn = h("input", { type: "number", min: "0", step: "1", "aria-label": "H" });
  private readonly nStep = stepper(this.nIn, "N");
  private readonly pStep = stepper(this.pIn, "P");
  private readonly blockedStep = stepper(this.blockedIn, "H");
  private readonly seedIn = h("input", { type: "number", min: "0", step: "1" });
  private readonly solverSel = h("select", { "aria-label": "Solver" });
  private readonly caseBtns = CASE_LABELS.map(([value, label]) =>
    h("button", { type: "button", "data-case": value, "aria-pressed": "false" }, label),
  );
  private kase: ProblemCase;
  private readonly caseNoteText = h("p", {});
  private readonly caseNote = h(
    "details",
    { class: "help" },
    h("summary", { "aria-label": "About this case", title: "About this case" }, "?"),
    this.caseNoteText,
  );
  private readonly pField = h("div", { class: "field" }, h("span", {}, "P (preplaced)"), this.pStep.el);
  private readonly blockedLabel = h("span", {}, "H");
  private readonly blockedField = h("div", { class: "field" }, this.blockedLabel, this.blockedStep.el);
  private readonly dice = h("button", { type: "button", class: "icon-btn", "aria-label": "Random seed" }, icon("dice"));
  private readonly seedField = h(
    "div",
    { class: "field" },
    h("span", {}, "Seed"),
    h("div", { class: "with-dice" }, this.seedIn, this.dice),
  );
  private readonly positionsIn = h("textarea", {
    class: "positions",
    rows: "2",
    spellcheck: "false",
    placeholder: "0,3; 2,5; 4,1",
    "aria-label": "Positions",
  });
  private readonly positionsLabel = h("span", {}, "Positions (row,column)");
  private readonly positionsMsg = h("p", { class: "msg", role: "status" });
  private readonly positionsField = h(
    "div",
    { class: "field" },
    this.positionsLabel,
    this.positionsIn,
    this.positionsMsg,
  );
  private readonly applyBtn = h("button", { type: "button", class: "btn apply" }, "Apply changes");
  private readonly msg = h("p", { class: "msg", role: "status" });
  private readonly buildErr = h("pre", { class: "build-error" });
  /** The source file of the solver that is chosen. */
  private readonly solverPath = h("p", { class: "solver-path" });
  /** What the board on the page was made from. Apply changes is off while the boxes still say the same. */
  private applied: ApplyForm = { n: 0, p: 0, blockedCount: 0, seed: 0, text: "" };
  /** The board cannot be changed while a run goes on. */
  private locked = false;

  constructor(private readonly o: ConfigPanelOptions) {
    const i = o.initial;
    this.nIn.value = String(i.n);
    this.pIn.value = "0";
    this.blockedIn.value = "0";
    this.seedIn.value = "0";
    this.applied = { n: i.n, p: 0, blockedCount: 0, seed: 0, text: "" };
    // One group for each folder of Solver/, in the order of the manifest (sorted by the build), and the solvers in it by name.
    for (const category of [...new Set(o.solvers.map((x) => x.category))]) {
      const group = h("optgroup", { label: category });
      for (const s of o.solvers.filter((x) => x.category === category))
        group.append(h("option", { value: s.id }, s.name + (s.ok ? "" : " (build failed)")));
      this.solverSel.append(group);
    }
    this.solverSel.value = i.solver;
    this.kase = i.problemCase;
    this.paintCase();

    const on = o.on;
    for (const el of [this.nIn, this.pIn, this.blockedIn, this.seedIn]) el.addEventListener("input", () => this.refresh());
    this.positionsIn.addEventListener("input", () => this.refresh());
    for (const b of this.caseBtns) b.addEventListener("click", () => this.chooseCase(b.dataset.case as ProblemCase));
    this.nStep.down.addEventListener("click", () => this.step(this.nIn, -1, MIN_N, MAX_N));
    this.nStep.up.addEventListener("click", () => this.step(this.nIn, 1, MIN_N, MAX_N));
    this.pStep.down.addEventListener("click", () => this.step(this.pIn, -1, 0, this.maxP()));
    this.pStep.up.addEventListener("click", () => this.step(this.pIn, 1, 0, this.maxP()));
    this.blockedStep.down.addEventListener("click", () => this.step(this.blockedIn, -1, 0, this.read().limit));
    this.blockedStep.up.addEventListener("click", () => this.step(this.blockedIn, 1, 0, this.read().limit));
    this.dice.addEventListener("click", () => {
      this.seedIn.value = String(Math.floor(Math.random() * 10000));
      this.refresh();
    });
    this.onCaseChosen = () => {
      this.pIn.value = "0";
      this.blockedIn.value = "0";
      this.applied = { ...this.applied, p: 0, blockedCount: 0 }; // the app starts the new case with no queens and no cells
      this.setPositions("");
      const solver = this.o.solvers.find((s) => s.id === DEFAULT_SOLVER[this.problemCase()]);
      if (solver) {
        this.solverSel.value = solver.id;
        on.solver(solver);
      }
      this.showSolverError();
      on.problem(this.problemCase());
    };
    this.applyBtn.addEventListener("click", () => this.apply());
    // The explanation opens over the card, not inside it, so the card does not grow. It closes with Escape or a click elsewhere.
    document.addEventListener("click", (e) => {
      if (this.caseNote.open && !this.caseNote.contains(e.target as Node)) this.caseNote.open = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.caseNote.open = false;
    });
    this.solverSel.addEventListener("change", () => {
      this.showSolverError();
      on.solver(this.selected());
    });

    this.el = h(
      "div",
      { class: "config-stack" },
      h("section", { class: "config" }, h("h2", {}, "Solver"), this.solverSel, this.solverPath, this.buildErr),
      h(
        "section",
        { class: "config" },
        h("div", { class: "card-head" }, h("h2", {}, "Problem"), this.caseNote),
        h("div", { class: "cases", role: "group", "aria-label": "Problem case" }, ...this.caseBtns),
        h(
          "div",
          { class: "row-np" },
          h("div", { class: "field" }, h("span", {}, "N"), this.nStep.el),
          this.pField,
          this.blockedField,
        ),
        this.seedField,
        this.positionsField,
        this.applyBtn,
        this.msg,
      ),
    );
    this.refresh();
    this.showSolverError();
  }

  private form(): ApplyForm {
    const r = this.read();
    return { n: r.n, p: r.p, blockedCount: r.blockedCount, seed: r.seed, text: this.positionsIn.value };
  }

  private apply(): void {
    const r = this.read();
    const action = applyAction(this.kase, this.form(), this.applied);
    if (this.applyBtn.disabled || action === "none") return;
    const on = this.o.on;
    if (action === "resize") on.resize(r.n);
    else if (action === "place") on.place({ n: r.n, p: r.p, blockedCount: r.blockedCount, seed: r.seed });
    else {
      const parsed = parsePositions(this.positionsIn.value, r.n);
      if (!parsed.ok) return;
      this.blockedIn.value = String(parsed.positions.length); // H or W now says how many cells there are
      on.positions(r.n, this.positionsIn.value);
    }
    // The app has set the text of the positions through setPositions; the numbers are read from the boxes.
    const now = this.form();
    this.applied = { ...now, text: this.applied.text };
    this.refresh();
  }

  /** Set in the constructor: what choosing a case does. */
  private onCaseChosen: () => void = () => {};

  private chooseCase(c: ProblemCase): void {
    if (c === this.kase || this.locked) return;
    this.kase = c;
    this.paintCase();
    this.onCaseChosen();
  }

  private paintCase(): void {
    for (const b of this.caseBtns) b.setAttribute("aria-pressed", String(b.dataset.case === this.kase));
  }

  /** Most preplaced queens: one row stays free. */
  private maxP(): number {
    const r = this.read();
    return (r.nOk ? r.n : MAX_N) - 1;
  }

  /** The − and + of a number: they only change what is typed, and Apply changes applies it. */
  private step(input: HTMLInputElement, by: number, min: number, max: number): void {
    input.value = String(stepValue(num(input.value), by, min, max));
    this.refresh();
  }

  selected(): SolverEntry {
    return this.o.solvers.find((s) => s.id === this.solverSel.value)!;
  }

  /** The blocked cells as the app holds them. Marks them as applied, so Apply stays off until they are edited. */
  setPositions(text: string): void {
    this.positionsIn.value = text;
    this.applied = { ...this.applied, text };
    this.refresh();
  }

  /** Follows the controller: while a run goes on, the board and the solver cannot be changed. */
  setControls(v: RunView): void {
    const lock = controlLocks(v.state, true);
    if (lock.config === this.locked) return;
    this.locked = lock.config;
    for (const el of [
      this.solverSel,
      ...this.caseBtns,
      this.nIn,
      this.nStep.down,
      this.nStep.up,
      this.pIn,
      this.pStep.down,
      this.pStep.up,
      this.blockedIn,
      this.blockedStep.down,
      this.blockedStep.up,
      this.seedIn,
      this.dice,
      this.positionsIn,
    ])
      el.disabled = lock.config;
    this.refresh(); // Apply changes also depends on whether what is typed is valid
  }

  private problemCase(): ProblemCase {
    return this.kase;
  }

  private read() {
    const n = num(this.nIn.value);
    const p = num(this.pIn.value);
    const blockedCount = num(this.blockedIn.value);
    const seed = num(this.seedIn.value);
    const c = this.problemCase();
    const nOk = Number.isInteger(n) && n >= MIN_N && n <= MAX_N;
    const pOk = nOk && Number.isInteger(p) && p >= 0 && p <= n - 1;
    const limit = nOk && (c === "holes" || c === "walled")
      ? maxBlocked(n, c === "holes" ? "hole" : "wall", c === "holes") // drawn holes always leave a solution
      : 0;
    const blockedOk = nOk && Number.isInteger(blockedCount) && blockedCount >= 0 && blockedCount <= limit;
    const seedOk = Number.isInteger(seed) && seed >= 0;
    return { n, p, blockedCount, seed, nOk, pOk, blockedOk, seedOk, limit };
  }

  private refresh(): void {
    const c = this.problemCase();
    const preplaced = c === "preplaced";
    const blocked = c === "holes" || c === "walled";
    this.pField.hidden = !preplaced;
    this.blockedField.hidden = !blocked;
    this.seedField.hidden = !preplaced && !blocked;
    this.positionsField.hidden = !blocked;
    this.positionsLabel.textContent = c === "holes" ? "Holes (row,column)" : "Walls (row,column)";
    this.blockedLabel.textContent = c === "holes" ? "H (holes)" : "W (walls)";
    const name = c === "holes" ? "H" : "W";
    this.blockedIn.setAttribute("aria-label", name);
    this.blockedStep.down.setAttribute("aria-label", `Decrease ${name}`);
    this.blockedStep.up.setAttribute("aria-label", `Increase ${name}`);
    this.caseNote.hidden = !CASE_NOTES[c];
    this.caseNoteText.textContent = CASE_NOTES[c] ?? "";

    const r = this.read();
    if (r.nOk) {
      this.pIn.max = String(r.n - 1);
      this.blockedIn.max = String(r.limit);
    }
    const parsed = blocked && r.nOk ? parsePositions(this.positionsIn.value, r.n) : undefined;
    const action = applyAction(c, this.form(), this.applied);
    // What the action needs to be right: it is only asked of the boxes that the action reads.
    const notes: string[] = [];
    if (!r.nOk) notes.push(`N must be an integer from ${MIN_N} to ${MAX_N}.`);
    let valid = r.nOk;
    if (action === "place") {
      if (preplaced && r.nOk && !r.pOk) notes.push(`P must be an integer from 0 to ${r.n - 1}.`);
      if (blocked && r.nOk && !r.blockedOk) notes.push(`${c === "holes" ? "H" : "W"} must be an integer from 0 to ${r.limit}.`);
      if (!r.seedOk) notes.push("Seed must be a non-negative integer.");
      valid &&= r.seedOk && (blocked ? r.blockedOk : r.pOk);
    } else if (action === "positions") {
      valid &&= parsed?.ok === true;
      if (valid && (r.blockedCount !== this.applied.blockedCount || r.seed !== this.applied.seed))
        notes.push(`The typed positions are used; ${c === "holes" ? "H" : "W"} and the seed are ignored.`);
    }
    this.msg.textContent = notes.join(" ");
    this.applyBtn.disabled = this.locked || action === "none" || !valid;

    if (parsed) {
      this.positionsMsg.textContent = !parsed.ok
        ? parsed.message
        : parsed.duplicates > 0
          ? `${parsed.positions.length} positions. ${parsed.duplicates} repeated ${parsed.duplicates === 1 ? "one is" : "ones are"} ignored.`
          : `${parsed.positions.length} positions.`;
      this.positionsMsg.classList.toggle("err", !parsed.ok);
    }
  }

  private showSolverError(): void {
    const s = this.selected();
    this.buildErr.hidden = s.ok;
    this.buildErr.textContent = s.ok ? "" : `Build failed:\n${s.error ?? "unknown error"}`;
    this.solverPath.textContent = s.file;
  }
}
