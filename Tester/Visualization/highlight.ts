// Colours and the highlight shapes the board renderer draws. A highlight is a list of cells in the project's
// convention: x = row, y = column.
export const COLORS = {
  light: "#eaedd1",
  dark: "#769556",
  valid: "#f5c839",
  conflict: "#c67863",
} as const;

export type HighlightKind = "none" | "conflict";

export interface HighlightCell {
  x: number;
  y: number;
  fill: "valid" | "conflict" | null;
  outline: boolean;
}

export interface Highlight {
  kind: HighlightKind;
  cells: HighlightCell[];
}

export const NO_HIGHLIGHT: Highlight = { kind: "none", cells: [] };

/**
 * Paints cells in the conflict colour. `marks` are cells the validator pointed at (a queen on a hole, a missing
 * preplaced queen): they get an outline too, because there may be no queen to paint.
 */
export function conflictHighlight(
  conflicting: ReadonlyArray<readonly [number, number]>,
  marks: ReadonlyArray<readonly [number, number]> = [],
): Highlight {
  const cells = new Map<number, HighlightCell>();
  const key = (r: number, c: number): number => r * 1000 + c;
  for (const [r, c] of conflicting) cells.set(key(r, c), { x: r, y: c, fill: "conflict", outline: false });
  for (const [r, c] of marks) cells.set(key(r, c), { x: r, y: c, fill: "conflict", outline: true });
  return cells.size ? { kind: "conflict", cells: [...cells.values()] } : NO_HIGHLIGHT;
}
