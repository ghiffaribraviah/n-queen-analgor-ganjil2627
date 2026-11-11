// The boards a finished run lets the user browse: the returned solutions, a board that shows what was wrong, and the
// snapshots of a Debug run. Pure, so the lists can be tested without a browser. Items are made on demand, because a
// run can return millions of solutions.
import { queensAt } from "../Board/solution-set";
import type { SolutionSet } from "../Board/solution-set";
import type { Position } from "../Board/positions";
import type { SessionResult } from "../Execution/protocol";
import { omittedCount, snapshotProblems, type SnapshotState } from "../Execution/snapshot-store";

export interface BrowserItem {
  label: string;
  queens: Array<[number, number]>;
  /** Cells to mark, such as the one a rule was broken at. */
  marks?: Array<[number, number]>;
  note?: string;
}

/** The two things a run lets the user look at: what the solver returned (and boards that explain it), and snapshots. */
export type BoardGroup = "result" | "snapshot";

export interface BrowserSource {
  id: string;
  title: string;
  /** A short name for the chip that picks this list among the others of its group. */
  chip: string;
  group: BoardGroup;
  count: number;
  at(i: number): BrowserItem;
  /** The item shown first. Default 0. */
  initial?: number;
}

type Shown = Exclude<SessionResult, { status: "Cancelled" }>;
const num = (n: number): string => n.toLocaleString("en-US");

function single(
  id: string,
  title: string,
  chip: string,
  label: string,
  queens: Array<[number, number]>,
  note?: string,
): BrowserSource {
  return { id, title, chip, group: "result", count: 1, at: () => ({ label, queens, ...(note ? { note } : {}) }) };
}

function solutionsSource(
  set: SolutionSet,
  walled: boolean,
  flagged?: { index: number; cells?: Array<[number, number]>; message: string },
): BrowserSource {
  const word = walled ? "Board" : "Solution";
  return {
    id: "solutions",
    title: walled ? "Returned boards" : "Returned solutions",
    chip: "Returned",
    group: "result",
    count: set.count,
    initial: flagged && flagged.index >= 0 && flagged.index < set.count ? flagged.index : 0,
    at(i) {
      const item: BrowserItem = { label: `${word} ${num(i + 1)} of ${num(set.count)}`, queens: queensAt(set, i) };
      if (flagged && i === flagged.index) {
        if (flagged.cells?.length) item.marks = flagged.cells;
        item.note = flagged.message;
      }
      return item;
    },
  };
}

/** Snapshots of a Debug run. Opens on the last one, which is where a crash or a stuck search left off. */
export function snapshotSource(
  state: SnapshotState,
  n: number,
  terrain?: readonly string[],
): BrowserSource | undefined {
  if (state.entries.length === 0) return undefined;
  const omitted = omittedCount(state);
  return {
    id: "snapshots",
    title:
      omitted > 0
        ? `Snapshots (${num(state.entries.length)} of ${num(state.total)} kept)`
        : `Snapshots (${num(state.total)})`,
    chip: "Snapshots",
    group: "snapshot",
    count: state.entries.length,
    initial: state.entries.length - 1,
    at(i) {
      const s = state.entries[i]!;
      const problems = snapshotProblems(n, s.queens, terrain);
      return {
        label: `Snapshot ${num(s.call)}${s.label ? `: ${s.label}` : ""}`,
        queens: s.queens,
        ...(problems.length ? { note: problems.join(". ") } : {}),
      };
    },
  };
}

export function resultSources(
  result: Shown,
  ctx: { n: number; terrain?: readonly string[]; walled: boolean },
): BrowserSource[] {
  const out: BrowserSource[] = [];
  const snapshots = result.snapshots && snapshotSource(result.snapshots, ctx.n, ctx.terrain);
  switch (result.status) {
    case "Successful":
      if (result.set.count > 0) out.push(solutionsSource(result.set, ctx.walled));
      break;
    case "Suboptimal":
      if (result.set.count > 0) out.push(solutionsSource(result.set, ctx.walled));
      if (result.referenceBoard)
        out.push(
          single(
            "reference",
            "Reference board",
            "Reference board",
            `A board with ${result.maximum} queens`,
            result.referenceBoard,
            "The reference solver proved that no board holds more.",
          ),
        );
      break;
    case "Incomplete":
      if (result.set.count > 0) out.push(solutionsSource(result.set, ctx.walled));
      if (result.missing)
        out.push(
          single(
            "missing",
            "A missing solution",
            "Missing solution",
            "A solution that was not returned",
            result.missing,
            "The reference solver found this one, and the result does not hold it.",
          ),
        );
      break;
    case "Invalid Solution":
      if (result.set.count > 0 && result.index >= 0)
        out.push(solutionsSource(result.set, ctx.walled, result));
      break;
    default:
      break;
  }
  if (snapshots) out.push(snapshots);
  return out;
}

/** The switch under the board: Results holds the lists of the result group, Snapshots those of the snapshot group. */
export type BrowseMode = "results" | "snapshots";

export const groupOfMode = (mode: BrowseMode): BoardGroup => (mode === "snapshots" ? "snapshot" : "result");

/** The lists a mode shows, in order. */
export const sourcesOf = (sources: readonly BrowserSource[], mode: BrowseMode): BrowserSource[] =>
  sources.filter((s) => s.group === groupOfMode(mode));

/**
 * The mode a new result opens in: Results, unless there is nothing to show there (a run that failed, or a solver that
 * returned no solution but took snapshots), where Snapshots is all there is.
 */
export function initialMode(sources: readonly BrowserSource[]): BrowseMode {
  return sources.some((s) => s.group === "result") ? "results" : "snapshots";
}

export type { Position };
