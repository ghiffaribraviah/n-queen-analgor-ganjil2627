// Blocked cells of the Holes and Walled cases as a list of (row, column) positions, 0-based.
// The list is the single source of truth: Place fills it from (N, K, seed), the user may type it, and the grid given
// to the solver is derived from it.
import { MAX_N, MIN_N, randomSolution } from "./preplaced";
import { mulberry32, randInt } from "./rng";
import { CELL_FREE } from "./terrain";

export type Position = readonly [number, number];
export type BlockedKind = "hole" | "pawn";

/** Most blocked cells a board accepts. A guaranteed-solvable Holes board keeps N cells for the planted queens. */
export const maxBlocked = (
  n: number,
  kind: BlockedKind,
  solvable = false,
): number => (kind === "hole" && solvable ? n * n - n : n * n - 1);

export type ParseResult =
  | { ok: true; positions: Array<[number, number]>; duplicates: number }
  | { ok: false; message: string };

const SEPARATORS = /[\s;]*/y;
const PAIR = /\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?/y;

/**
 * Reads "0,3; 2,5" (also one pair per line, or "(0,3) (2,5)"). Positions are returned sorted row by row, without
 * duplicates. The first problem found is reported with its place in the text.
 */
export function parsePositions(text: string, n: number): ParseResult {
  const seen = new Set<number>();
  const positions: Array<[number, number]> = [];
  let duplicates = 0;
  let pos = 0;
  for (;;) {
    SEPARATORS.lastIndex = pos;
    SEPARATORS.exec(text);
    pos = SEPARATORS.lastIndex;
    if (pos >= text.length) break;
    PAIR.lastIndex = pos;
    const m = PAIR.exec(text);
    if (!m) {
      return {
        ok: false,
        message: `Cannot read a position at character ${pos + 1}: "${text.slice(pos, pos + 12)}". Write each position as row,column, for example 0,3; 2,5.`,
      };
    }
    pos = PAIR.lastIndex;
    const r = Number(m[1]);
    const c = Number(m[2]);
    if (r < 0 || c < 0 || r >= n || c >= n) {
      return {
        ok: false,
        message: `Position (${r},${c}) is outside the board: rows and columns go from 0 to ${n - 1}.`,
      };
    }
    const key = r * n + c;
    if (seen.has(key)) duplicates++;
    else {
      seen.add(key);
      positions.push([r, c]);
    }
  }
  positions.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { ok: true, positions, duplicates };
}

export const formatPositions = (positions: Iterable<Position>): string =>
  Array.from(positions, ([r, c]) => `${r},${c}`).join("; ");

/** N strings of N chars: '.' free and `mark` on every position. */
export function positionsToGrid(
  n: number,
  positions: Iterable<Position>,
  mark: string,
): string[] {
  const rows = Array.from({ length: n }, () =>
    new Array<string>(n).fill(CELL_FREE),
  );
  for (const [r, c] of positions) rows[r]![c] = mark;
  return rows.map((row) => row.join(""));
}

/** Inverse of positionsToGrid for one mark character. */
export function gridPositions(
  grid: readonly string[],
  mark: string,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (row[c] === mark) out.push([r, c]);
  });
  return out;
}

/**
 * K blocked cells drawn uniformly from the seed, sorted row by row. With `solvable` (holes only) a random solution is
 * planted first and kept free, so the board always has at least one solution. Pawns use the same draw as before, so
 * existing (N, K, seed) boards stay the same.
 */
export function generateBlocked(
  n: number,
  k: number,
  seed: number,
  kind: BlockedKind,
  opts: { solvable?: boolean } = {},
): Array<[number, number]> {
  if (!Number.isInteger(n) || n < MIN_N || n > MAX_N)
    throw new RangeError(`N must be an integer in [${MIN_N}, ${MAX_N}]`);
  const solvable = kind === "hole" && opts.solvable === true;
  const limit = maxBlocked(n, kind, solvable);
  if (!Number.isInteger(k) || k < 0 || k > limit)
    throw new RangeError(`K must be an integer in [0, ${limit}]`);
  if (!Number.isInteger(seed) || seed < 0)
    throw new RangeError("Seed must be a non-negative integer");

  const rng = mulberry32(seed);
  const reserved = new Set<number>();
  if (solvable)
    randomSolution(n, rng).forEach((c, r) => reserved.add(r * n + c));
  const cells: number[] = [];
  for (let i = 0; i < n * n; i++) if (!reserved.has(i)) cells.push(i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells
    .slice(0, k)
    .sort((a, b) => a - b)
    .map((i) => [Math.floor(i / n), i % n] as [number, number]);
}
