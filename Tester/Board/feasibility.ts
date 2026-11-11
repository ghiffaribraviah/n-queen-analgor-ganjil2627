// Cheap checks that show a Holes board has no solution, so the reference search need not run.
import { CELL_HOLE } from "./terrain";

/**
 * N queens need N rows and N columns of their own, so every row and column needs a free cell, and the free cells must
 * give each row a column of its own (a perfect matching). Returns the reason when that fails. A board that passes can
 * still have no solution, because diagonals are not looked at.
 */
export function holesObviouslyUnsolvable(
  grid: readonly string[],
): string | undefined {
  const n = grid.length;
  const free = (r: number, c: number): boolean => grid[r]![c] !== CELL_HOLE;
  for (let r = 0; r < n; r++) {
    if (!Array.from({ length: n }, (_, c) => free(r, c)).some(Boolean))
      return `Row ${r} is all holes, so it cannot hold a queen.`;
  }
  for (let c = 0; c < n; c++) {
    if (!Array.from({ length: n }, (_, r) => free(r, c)).some(Boolean))
      return `Column ${c} is all holes, so no queen can stand in it.`;
  }
  const columnOwner = new Array<number>(n).fill(-1);
  const assign = (r: number, visited: Uint8Array): boolean => {
    for (let c = 0; c < n; c++) {
      if (!free(r, c) || visited[c]) continue;
      visited[c] = 1;
      if (columnOwner[c] === -1 || assign(columnOwner[c]!, visited)) {
        columnOwner[c] = r;
        return true;
      }
    }
    return false;
  };
  for (let r = 0; r < n; r++) {
    if (!assign(r, new Uint8Array(n)))
      return "The free cells cannot give every row a column of its own.";
  }
  return undefined;
}
