// The solutions a solver returned, as one flat byte buffer (the format the WASM harness packs).
//
//   cols   one queen per row. Solution i is the n bytes [i*n, (i+1)*n); byte r is the column of the queen in row r.
//   cells  any number of queens. Solution i is a record: a 16-bit little-endian queen count k, then k pairs of bytes
//          (row, column), sorted row by row. Records follow each other.
//
// Keeping the bytes flat avoids millions of small arrays: 2.3 million solutions of N=15 are 34 MB.
import { CELL_FREE } from "./terrain";

export type SolutionKind = "cols" | "cells";

export interface SolutionSet {
  kind: SolutionKind;
  n: number;
  count: number;
  data: Uint8Array;
  /** cells only: byte offset of each record. Built by indexSet(). */
  offsets?: Uint32Array;
}

/** Builds the record offsets of a cells set once. Throws RangeError when the buffer is shorter than it claims. */
export function indexSet(set: SolutionSet): Uint32Array {
  if (set.kind === "cols") throw new RangeError("Only cells sets have offsets");
  if (set.offsets) return set.offsets;
  const offsets = new Uint32Array(set.count);
  let at = 0;
  for (let i = 0; i < set.count; i++) {
    if (at + 2 > set.data.length) throw new RangeError("Result buffer is truncated");
    offsets[i] = at;
    at += 2 + 2 * (set.data[at]! | (set.data[at + 1]! << 8));
  }
  if (at > set.data.length) throw new RangeError("Result buffer is truncated");
  set.offsets = offsets;
  return offsets;
}

/** Byte range [start, end) of solution i. */
export function recordRange(set: SolutionSet, i: number): [number, number] {
  if (set.kind === "cols") return [i * set.n, (i + 1) * set.n];
  const start = indexSet(set)[i]!;
  return [start, start + 2 + 2 * (set.data[start]! | (set.data[start + 1]! << 8))];
}

/** Queens of solution i as (row, column), in row order. */
export function queensAt(set: SolutionSet, i: number): Array<[number, number]> {
  if (i < 0 || i >= set.count) throw new RangeError(`No solution ${i}`);
  const [start, end] = recordRange(set, i);
  const out: Array<[number, number]> = [];
  if (set.kind === "cols") {
    for (let r = 0; r < set.n; r++) out.push([r, set.data[start + r]!]);
  } else {
    for (let at = start + 2; at < end; at += 2)
      out.push([set.data[at]!, set.data[at + 1]!]);
  }
  return out;
}

/** Number of queens on solution i. */
export function queenCountAt(set: SolutionSet, i: number): number {
  if (set.kind === "cols") return set.n;
  const [start, end] = recordRange(set, i);
  return (end - start - 2) / 2;
}

/**
 * Solution i as N strings: 'Q' for a queen, the terrain character on blocked cells, 'x' elsewhere. A queen drawn on a
 * blocked cell wins, so the validator can report it. Queens off the board are skipped.
 */
export function boardAt(
  set: SolutionSet,
  i: number,
  terrain?: readonly string[],
): string[] {
  const n = set.n;
  const rows = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => {
      const t = terrain?.[r]?.[c];
      return t !== undefined && t !== CELL_FREE ? t : "x";
    }),
  );
  for (const [r, c] of queensAt(set, i)) if (r < n && c < n) rows[r]![c] = "Q";
  return rows.map((row) => row.join(""));
}

/** Builds a cols set from arrays of columns. For tests and small reference results. */
export function setFromColumns(n: number, solutions: ReadonlyArray<readonly number[]>): SolutionSet {
  const data = new Uint8Array(solutions.length * n);
  solutions.forEach((s, i) => data.set(s, i * n));
  return { kind: "cols", n, count: solutions.length, data };
}

/** Builds a cells set from lists of queens. Queens are sorted row by row, as the harness does. */
export function setFromQueens(
  n: number,
  boards: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): SolutionSet {
  const bytes: number[] = [];
  for (const board of boards) {
    const sorted = [...board].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    bytes.push(sorted.length & 255, sorted.length >> 8);
    for (const [r, c] of sorted) bytes.push(r, c);
  }
  return { kind: "cells", n, count: boards.length, data: Uint8Array.from(bytes) };
}
