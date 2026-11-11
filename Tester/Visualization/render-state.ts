// What the renderer draws for one board: the terrain, the preplaced queens that stay, the queens of the shown
// solution or snapshot, and the queens that attack each other.
import { conflictingQueens } from "../Board/conflicts";
import type { Position } from "../Board/positions";
import { conflictHighlight } from "./highlight";
import type { BlockedCell, QueenCell, RenderState } from "./renderer";

export interface BoardScene {
  n: number;
  /** The queens to draw. */
  queens: ReadonlyArray<Position>;
  /** N strings of '.', 'H' or 'W'. */
  terrain?: readonly string[];
  /** Queens that were on the board from the start: drawn locked. */
  preplaced?: ReadonlyArray<Position>;
  /** Extra cells to mark, such as the one a rule was broken at. */
  marks?: ReadonlyArray<Position>;
  /** The cell under the pointer. */
  hover?: Position;
}

export function buildRenderState(scene: BoardScene): RenderState {
  const { n, terrain } = scene;
  const locked = new Set((scene.preplaced ?? []).map(([r, c]) => r * n + c));
  const queens: QueenCell[] = scene.queens
    .filter(([r, c]) => r >= 0 && c >= 0 && r < n && c < n)
    .map(([r, c]) => ({ row: r, col: c, preplaced: locked.has(r * n + c) }));
  const blocked: BlockedCell[] = [];
  terrain?.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] === "H") blocked.push({ row: r, col: c, kind: "hole" });
      else if (row[c] === "W") blocked.push({ row: r, col: c, kind: "wall" });
    }
  });
  return {
    n,
    queens,
    blocked,
    highlight: conflictHighlight(conflictingQueens(n, scene.queens, terrain), scene.marks),
    ...(scene.hover ? { hover: { row: scene.hover[0], col: scene.hover[1] } } : {}),
  };
}

/** What stands on a cell, in words: "queen", "preplaced queen", "queen in conflict", "wall", "hole" or "empty". */
export function describeCell(scene: BoardScene, row: number, col: number): string {
  const { n, terrain } = scene;
  if (row < 0 || col < 0 || row >= n || col >= n) return "";
  const queen = scene.queens.some(([r, c]) => r === row && c === col);
  const kind = terrain?.[row]?.[col];
  if (kind === "H") return queen ? "hole with a queen on it" : "hole";
  if (kind === "W") return queen ? "wall with a queen on it" : "wall";
  if (!queen) return "empty";
  if (scene.preplaced?.some(([r, c]) => r === row && c === col)) return "preplaced queen";
  const inConflict = conflictingQueens(n, scene.queens, terrain).some(([r, c]) => r === row && c === col);
  return inConflict ? "queen in conflict" : "queen";
}

/** The text a screen reader gets for the board: what is shown, and where its queens stand (up to `limit`). */
export function boardAriaLabel(title: string, queens: ReadonlyArray<Position>, limit = 24): string {
  if (queens.length === 0) return `${title}. No queens.`;
  const shown = queens.slice(0, limit).map(([r, c]) => `(${r},${c})`).join(" ");
  const more = queens.length > limit ? ` and ${queens.length - limit} more` : "";
  return `${title}. ${queens.length} ${queens.length === 1 ? "queen" : "queens"}, as (row,column): ${shown}${more}.`;
}
