// Checks a whole set of returned solutions. The fast loop only finds the first solution that is wrong; what is wrong
// with it is then worked out by validator.ts, the independent naive checker, so the message never comes from this file.
import {
  boardAt,
  indexSet,
  queensAt,
  recordRange,
  type SolutionSet,
} from "./solution-set";
import { validateBoard, type Rule } from "./validator";

export interface CheckContext {
  preplaced: ReadonlyArray<readonly [number, number]>;
  terrain?: readonly string[];
}

export interface InvalidSolution {
  /** 0-based index of the first wrong solution. */
  index: number;
  rule: Rule;
  message: string;
  cells?: Array<[number, number]>;
}

/** First wrong solution of the set, or undefined when every one is a valid board. */
export function firstInvalid(
  set: SolutionSet,
  ctx: CheckContext,
): InvalidSolution | undefined {
  const index =
    set.kind === "cols" && !ctx.terrain?.some((row) => row.includes("P"))
      ? firstInvalidColumn(set, ctx)
      : firstInvalidCells(set, ctx);
  if (index === undefined) return undefined;
  return explain(set, index, ctx);
}

/** Fast path: one queen per row, no pawns. Stamps avoid clearing the diagonal tables for every solution. */
function firstInvalidColumn(set: SolutionSet, ctx: CheckContext): number | undefined {
  const { n, count, data } = set;
  const fixed = new Int16Array(n).fill(-1);
  for (const [r, c] of ctx.preplaced) fixed[r] = c;
  const hole = new Uint8Array(n * n);
  ctx.terrain?.forEach((row, r) => {
    for (let c = 0; c < n; c++) if (row[c] === "H") hole[r * n + c] = 1;
  });
  const col = new Int32Array(n);
  const down = new Int32Array(2 * n);
  const up = new Int32Array(2 * n);
  for (let i = 0; i < count; i++) {
    const stamp = i + 1;
    const base = i * n;
    for (let r = 0; r < n; r++) {
      const c = data[base + r]!;
      if (c >= n) return i;
      const d = r - c + n - 1;
      const u = r + c;
      if (col[c] === stamp || down[d] === stamp || up[u] === stamp) return i;
      col[c] = down[d] = up[u] = stamp;
      if (hole[r * n + c] || (fixed[r]! >= 0 && fixed[r] !== c)) return i;
    }
  }
  return undefined;
}

/** General path: every solution is turned into a board and given to the naive validator. */
function firstInvalidCells(set: SolutionSet, ctx: CheckContext): number | undefined {
  for (let i = 0; i < set.count; i++) if (problemWith(set, i, ctx)) return i;
  return undefined;
}

type Problem = { rule: Rule; message: string; cells?: Array<[number, number]> };

function problemWith(set: SolutionSet, i: number, ctx: CheckContext): Problem | undefined {
  const n = set.n;
  const seen = new Set<number>();
  for (const [r, c] of queensAt(set, i)) {
    if (r >= n || c >= n) {
      return {
        rule: "format",
        message: `Solution ${i + 1}: a queen at (${r},${c}) is outside the ${n}x${n} board`,
        cells: [],
      };
    }
    if (seen.has(r * n + c)) {
      return {
        rule: "format",
        message: `Solution ${i + 1}: two queens are listed at (${r},${c})`,
        cells: [[r, c]],
      };
    }
    seen.add(r * n + c);
  }
  const v = validateBoard(
    boardAt(set, i, ctx.terrain),
    n,
    ctx.preplaced,
    ctx.terrain,
    set.kind === "cells",
  );
  return v.ok ? undefined : v;
}

function explain(set: SolutionSet, index: number, ctx: CheckContext): InvalidSolution {
  const n = set.n;
  if (set.kind === "cols") {
    // The fast path cannot see this one, and the validator has no way to draw a column that is off the board.
    for (let r = 0; r < n; r++) {
      const c = set.data[index * n + r]!;
      if (c >= n) {
        return {
          index,
          rule: "format",
          message: `Solution ${index + 1}: row ${r} has column ${c}, outside 0 to ${n - 1}`,
          cells: [],
        };
      }
    }
  }
  const p = problemWith(set, index, ctx);
  if (!p) {
    throw new Error(
      `The fast checker rejected solution ${index + 1}, but the validator accepts it`,
    );
  }
  return { index, ...p };
}

// ---- duplicates and differences ---------------------------------------------------------------------------------

/** 53-bit hash of the bytes of solution i, exact in a double so a Float64Array can sort the hashes natively. */
function hashOf(set: SolutionSet, i: number): number {
  const [start, end] = recordRange(set, i);
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x9e3779b9 | 0;
  for (let at = start; at < end; at++) {
    const b = set.data[at]!;
    h1 = Math.imul(h1 ^ b, 0x01000193);
    h2 = Math.imul(h2 + b + 1, 0x85ebca6b);
    h2 ^= h2 >>> 13;
  }
  return (h1 >>> 0) * 2097152 + ((h2 >>> 0) & 0x1fffff);
}

function hashes(set: SolutionSet): Float64Array {
  if (set.kind === "cells") indexSet(set);
  const out = new Float64Array(set.count);
  for (let i = 0; i < set.count; i++) out[i] = hashOf(set, i);
  return out;
}

function sameBytes(set: SolutionSet, i: number, j: number): boolean {
  const [a, aEnd] = recordRange(set, i);
  const [b, bEnd] = recordRange(set, j);
  if (aEnd - a !== bEnd - b) return false;
  for (let k = 0; k < aEnd - a; k++) if (set.data[a + k] !== set.data[b + k]) return false;
  return true;
}

export interface Duplicates {
  /** Solutions that repeat an earlier one. */
  count: number;
  /** The first repeat: solution `index` equals the earlier solution `of`. */
  first?: { index: number; of: number };
}

/**
 * Finds repeated solutions. Hashes are sorted, and only solutions whose hash occurs twice are compared byte by byte, so
 * a hash collision never counts as a duplicate. Needs cells records sorted row by row.
 */
export function findDuplicates(set: SolutionSet): Duplicates {
  if (set.count < 2) return { count: 0 };
  const all = hashes(set);
  const sorted = all.slice().sort();
  const shared = new Set<number>();
  for (let i = 1; i < sorted.length; i++) if (sorted[i] === sorted[i - 1]) shared.add(sorted[i]!);
  if (shared.size === 0) return { count: 0 };

  const buckets = new Map<number, number[]>();
  let count = 0;
  let first: Duplicates["first"];
  for (let i = 0; i < set.count; i++) {
    const h = all[i]!;
    if (!shared.has(h)) continue;
    const seen = buckets.get(h) ?? [];
    const of = seen.find((j) => sameBytes(set, i, j));
    if (of === undefined) seen.push(i);
    else {
      count++;
      first ??= { index: i, of };
    }
    buckets.set(h, seen);
  }
  return first ? { count, first } : { count };
}

/**
 * Index of the first solution of `reference` that `set` does not hold, or undefined when there is none. Both sets must
 * be of the same kind and N. A hash collision can hide a missing solution, which is why the count, not this, decides
 * whether a set is complete.
 */
export function findMissing(set: SolutionSet, reference: SolutionSet): number | undefined {
  const held = hashes(set).sort();
  const has = (h: number): boolean => {
    let lo = 0;
    let hi = held.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (held[mid]! < h) lo = mid + 1;
      else if (held[mid]! > h) hi = mid - 1;
      else return true;
    }
    return false;
  };
  if (reference.kind === "cells") indexSet(reference);
  for (let j = 0; j < reference.count; j++) if (!has(hashOf(reference, j))) return j;
  return undefined;
}
