/// <reference types="vite/client" />
// Wires the config panel, the run controller, the board and the result together.
import "@fontsource/montserrat/latin-700.css";
import "@fontsource/montserrat/latin-800.css";
import "@fontsource/noto-sans/latin-400.css";
import "@fontsource/noto-sans/latin-500.css";
import "@fontsource/noto-sans/latin-600.css";
import "./styles.css";
import cfgRaw from "../Configuration/tester.config.json";
import { holesObviouslyUnsolvable } from "../Board/feasibility";
import {
  formatPositions,
  generateBlocked,
  parsePositions,
  positionsToGrid,
} from "../Board/positions";
import { generatePreplaced } from "../Board/preplaced";
import type { ProblemCase, Terrain } from "../Board/terrain";
import { validateConfig } from "../Configuration/config";
import { DEFAULT_SOLVER, TIMED_RUNS } from "../Configuration/budget";
import type { ProblemInput, ReferenceResult } from "../Execution/protocol";
import { measureReference, type ReferenceRun } from "../Execution/reference-run";
import { RunController, type RunProblem, type RunView } from "../Execution/run-controller";
import { browserWorkerFactory } from "../Execution/worker-factory";
import { applyTheme, loadTheme, otherTheme, type Theme } from "./theme";
import { BoardRenderer, paletteFromCss } from "../Visualization/renderer";
import { boardAriaLabel, buildRenderState, describeCell, type BoardScene } from "../Visualization/render-state";
import { BoardBrowser } from "./board-browser";
import { BoardCard } from "./board-card";
import { h } from "./dom";
import { icon } from "./icons";
import { ConfigPanel, type SolverEntry } from "./panels";
import { ResultPanel } from "./result-card";
import { RunPanel } from "./run-panel";
import { resultSources, type BrowserSource } from "./sources";

const fatal = (root: HTMLElement, msg: string): void =>
  root.replaceChildren(h("p", { class: "fatal" }, msg));

const NO_SOURCES: BrowserSource[] = [];

export async function mountApp(root: HTMLElement): Promise<void> {
  let cfg;
  try {
    cfg = validateConfig(cfgRaw);
  } catch (e) {
    return fatal(root, `tester.config.json: ${(e as Error).message}`);
  }
  let solvers: SolverEntry[];
  try {
    const res = await fetch("/Solver/dist/manifest.json");
    if (!res.ok) throw new Error("not found");
    solvers = (await res.json()).solvers as SolverEntry[];
  } catch {
    return fatal(root, "Solver/dist/manifest.json not found. Run npm run build:solvers first.");
  }
  if (solvers.length === 0) return fatal(root, "No solvers in the manifest.");
  if (solvers.some((s) => typeof s.id !== "string"))
    return fatal(root, "Solver/dist/manifest.json is from an older build, before solvers were found as Solver/<category>/<name>.cpp. Run npm run build:solvers.");

  // ---- state ---------------------------------------------------------------------------------
  let cur = { n: 8, p: 0, k: 0, seed: 0 };
  let problemCase: ProblemCase = "normal";
  // The page opens on the solver of the first case, not on whichever solver the manifest lists first.
  let solver =
    solvers.find((s) => s.ok && s.id === DEFAULT_SOLVER[problemCase]) ?? solvers.find((s) => s.ok) ?? solvers[0]!;
  let debug = false;
  /** Holes or pawns, as (row, column). The one source of truth: a draw from the seed fills it, the user may type it. */
  let blocked: Array<[number, number]> = [];
  let preplaced: Array<[number, number]> = [];
  let terrain: Terrain | undefined;

  const moduleUrl = (s: SolverEntry): string =>
    s.module ? new URL(s.module, location.origin).href : "";
  const walled = (): boolean => problemCase === "walled";
  const input = (): ProblemInput => ({
    kase: problemCase,
    n: cur.n,
    preplaced,
    ...(terrain ? { terrain } : {}),
  });

  // ---- reference solver --------------------------------------------------------------------------
  let reference: ReferenceResult | undefined;
  let referenceFailed = false;
  let referenceRun: ReferenceRun | undefined;
  let referenceStart = 0;
  const referenceCache = new Map<string, ReferenceResult>(); // a board's answer never changes

  const ready = (): boolean => reference !== undefined || referenceFailed;
  const canRun = (): boolean => solver.ok && ready();
  const blockReason = (): string | undefined => {
    if (!solver.ok)
      return `Solver "${solver.id}" failed to build. Fix the error shown under the solver list and run npm run build:solvers.`;
    if (ready()) return undefined;
    const seconds = Math.round((performance.now() - referenceStart) / 1000);
    return `Running the reference solver on this board (${seconds} s).`;
  };
  const makeProblem = (): RunProblem => ({
    input: input(),
    moduleUrl: moduleUrl(solver),
    cutoffSeconds: cfg.cutoffSeconds,
    timedCutoffSeconds: cfg.timedCutoffSeconds,
    debug,
    snapshotHead: cfg.snapshotHead,
    snapshotTail: cfg.snapshotTail,
    timedRuns: TIMED_RUNS,
    reference,
  });

  const ctrl = new RunController({ createWorker: browserWorkerFactory });

  // Runs the reference solver on the current board unless its answer is already known.
  const prepareReference = (): void => {
    const old = referenceRun;
    referenceRun = undefined; // first, so the result of the old run is ignored
    old?.cancel();
    reference = undefined;
    referenceFailed = false;
    referenceStart = performance.now();
    if (problemCase === "holes" && terrain) {
      // a board that can be seen to have no solution needs no search
      if (holesObviouslyUnsolvable(terrain)) {
        reference = { queens: 0, count: 0 };
        return;
      }
    }
    const key = JSON.stringify([problemCase, cur.n, preplaced, blocked]);
    reference = referenceCache.get(key);
    if (reference) return;
    // A case without a reference solver in the config, or whose reference is not built, is only checked for validity.
    const referenceId = cfg.referenceSolvers?.[problemCase];
    const yardstick = referenceId ? solvers.find((s) => s.ok && s.id === referenceId) : undefined;
    if (!yardstick) {
      referenceFailed = true;
      return;
    }
    const run = measureReference({
      input: input(),
      moduleUrl: moduleUrl(yardstick),
      cutoffSeconds: cfg.cutoffSeconds,
      createWorker: browserWorkerFactory,
    });
    referenceRun = run;
    void run.done.then((result) => {
      if (referenceRun !== run) return; // the board changed in the meantime
      referenceRun = undefined;
      reference = result;
      referenceFailed = !result;
      if (result) referenceCache.set(key, result);
      ctrl.configure(makeProblem()); // now with the reference attached
    });
  };

  const apply = (): void => {
    terrain =
      problemCase === "holes"
        ? positionsToGrid(cur.n, blocked, "H")
        : walled()
          ? positionsToGrid(cur.n, blocked, "P")
          : undefined;
    preplaced =
      problemCase === "preplaced" ? generatePreplaced(cur.n, cur.p, cur.seed).queens : [];
    prepareReference();
    ctrl.configure(makeProblem());
  };

  // ---- UI --------------------------------------------------------------------------------------
  const panel = new ConfigPanel({
    solvers,
    initial: { n: cur.n, solver: solver.id, problemCase },
    on: {
      problem: (c) => {
        problemCase = c;
        cur = { ...cur, p: 0, k: 0 };
        blocked = [];
        apply();
      },
      resize: (n) => {
        cur = { ...cur, n, p: 0, k: 0 };
        blocked = [];
        apply();
      },
      place: ({ n, p, k, seed }) => {
        if (problemCase === "preplaced") {
          cur = { n, p, k: 0, seed };
          blocked = [];
        } else {
          cur = { n, p: 0, k, seed };
          blocked = generateBlocked(n, k, seed, walled() ? "pawn" : "hole", {
            solvable: problemCase === "holes", // drawn holes always leave a solution; typed ones are run as they are
          });
          panel.setPositions(formatPositions(blocked));
        }
        apply();
      },
      positions: (n, text) => {
        const parsed = parsePositions(text, n);
        if (!parsed.ok) return;
        cur = { ...cur, n, p: 0, k: parsed.positions.length };
        blocked = parsed.positions;
        panel.setPositions(formatPositions(blocked));
        apply();
      },
      solver: (s) => {
        solver = s;
        apply();
      },
    },
  });
  const runPanel = new RunPanel({
    initial: { debug },
    on: {
      debug: (on) => {
        debug = on;
        ctrl.configure(makeProblem());
      },
      run: () => {
        if (canRun()) ctrl.start();
      },
      stop: () => ctrl.stop(),
    },
  });

  // On a narrow window the configuration folds away, so that the board is the first thing on the page.
  const fold = h("details", { class: "config-fold", open: "" }, h("summary", {}, "Configuration"), panel.el);
  const narrow = window.matchMedia("(max-width: 899px)");
  const syncFold = (): void => {
    fold.open = !narrow.matches;
  };
  narrow.addEventListener("change", syncFold);
  syncFold();

  const themeButton = h("button", { class: "theme-toggle", type: "button" });
  let theme: Theme = loadTheme();
  applyTheme(theme, false); // index.html already did this before the first paint; this covers a page without that script
  const showTheme = (): void => {
    // the button names what a click does, and shows the theme it leads to
    themeButton.replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
    themeButton.setAttribute("aria-label", `Switch to the ${otherTheme(theme)} theme`);
    themeButton.title = `Switch to the ${otherTheme(theme)} theme`;
  };
  showTheme();

  const canvas = h("canvas", { class: "board", role: "img", "aria-label": "Board" });
  const result = new ResultPanel();
  const boardCard = new BoardCard();
  const browser = new BoardBrowser(() => schedule());
  root.replaceChildren(
    h("div", { class: "topbar" }, h("h1", { class: "brand" }, h("i", { class: "logo" }, icon("logo")), "N-Queen Tester"), themeButton),
    ...(crossOriginIsolated
      ? []
      : [
          h(
            "p",
            { class: "note warn" },
            "crossOriginIsolated is false, so the browser rounds timers and compute times are less precise. Serve via Vite (npm run dev) so the COOP/COEP headers are sent; do not open via file://.",
          ),
        ]),
    h(
      "div",
      { class: "app" },
      h("div", { class: "col left" }, fold),
      h("div", { class: "col mid" }, h("div", { class: "board-wrap" }, canvas), browser.el),
      h("div", { class: "col right" }, runPanel.el, h("div", { class: "right-scroll" }, result.el), boardCard.el),
    ),
  );
  const renderer = new BoardRenderer(canvas, paletteFromCss()); // after mounting: it sizes itself from the parent
  // The numbers in the gutter follow the page's theme, and use a font that may still be loading.
  themeButton.addEventListener("click", () => {
    theme = otherTheme(theme);
    applyTheme(theme);
    showTheme();
    renderer.setPalette(paletteFromCss());
  });
  void document.fonts?.load("700 16px Montserrat").then(() => renderer.invalidate());

  let hover: { row: number; col: number } | undefined;
  const setHover = (cell: { row: number; col: number } | null): void => {
    if (cell?.row === hover?.row && cell?.col === hover?.col) return;
    hover = cell ?? undefined;
    schedule();
  };
  canvas.addEventListener("pointermove", (e) => setHover(renderer.cellAt(e.clientX, e.clientY)));
  canvas.addEventListener("pointerleave", () => setHover(null));

  // Browsable boards, rebuilt only when the result changes. The result of the first run and the same result with its
  // time and memory are two objects but one set of boards, so the user keeps their place when the measurement ends.
  let shownKey: unknown;
  let sources = NO_SOURCES;
  const keyOf = (r: RunView["result"]): unknown => (r && "set" in r ? r.set : r);

  // Repaint at most once per frame.
  let raf = 0;
  const paint = (): void => {
    raf = 0;
    const v = ctrl.getView();
    const key = keyOf(v.result);
    if (key !== shownKey) {
      shownKey = key;
      sources = v.result ? resultSources(v.result, { n: cur.n, terrain, walled: walled() }) : NO_SOURCES;
    }
    browser.setSources(v.result ? sources : NO_SOURCES, key);

    const live = v.state === "Running" ? v.liveSnapshots?.entries.at(-1) : undefined;
    browser.setLive(live ? `Live: snapshot ${live.call.toLocaleString("en-US")}${live.label ? `, ${live.label}` : ""}` : undefined);
    const item = browser.current;
    const scene: BoardScene = {
      n: cur.n,
      queens: live ? live.queens : item ? item.queens : preplaced,
      terrain,
      preplaced,
      ...(item?.marks && !live ? { marks: item.marks } : {}),
      ...(hover ? { hover: [hover.row, hover.col] as [number, number] } : {}),
    };
    renderer.setState(buildRenderState(scene));
    boardCard.setCell(hover ? `(${hover.row},${hover.col}) · ${describeCell(scene, hover.row, hover.col)}` : undefined);
    canvas.setAttribute("aria-label", boardAriaLabel(live ? "Latest snapshot" : item?.label ?? "Board", scene.queens));

    panel.setControls(v);
    runPanel.update(v, canRun(), blockReason());
    result.update(v, { walled: walled() });
  };
  const schedule = (): void => {
    if (!raf) raf = requestAnimationFrame(paint);
  };
  ctrl.subscribe(schedule);
  apply(); // emits, so the first paint happens through the normal path

  // Keeps the elapsed time moving while a long reference search runs.
  setInterval(() => {
    if (referenceRun) schedule();
  }, 1000);
}
