// Which queens attack each other on a partial or complete board. Used to colour snapshots and reported boards.
// Attacks pass through holes and stop at walls, the same rule as validator.ts.
import type { Position } from "./positions";

/** Every attacking pair. Queens off the board are ignored. */
export function attackingPairs(
  n: number,
  queens: readonly Position[],
  terrain?: readonly string[],
): Array<[Position, Position]> {
  const inside = queens.filter(
    ([r, c]) =>
      Number.isInteger(r) && Number.isInteger(c) && r >= 0 && c >= 0 && r < n && c < n,
  );
  const wallBetween = (r1: number, c1: number, r2: number, c2: number): boolean => {
    const dr = Math.sign(r2 - r1);
    const dc = Math.sign(c2 - c1);
    for (let r = r1 + dr, c = c1 + dc; r !== r2 || c !== c2; r += dr, c += dc) {
      if (terrain?.[r]?.[c] === "W") return true;
    }
    return false;
  };
  const pairs: Array<[Position, Position]> = [];
  for (let i = 0; i < inside.length; i++) {
    for (let j = i + 1; j < inside.length; j++) {
      const [r1, c1] = inside[i]!;
      const [r2, c2] = inside[j]!;
      const aligned =
        r1 === r2 || c1 === c2 || Math.abs(r1 - r2) === Math.abs(c1 - c2);
      if (aligned && !wallBetween(r1, c1, r2, c2))
        pairs.push([inside[i]!, inside[j]!]);
    }
  }
  return pairs;
}

/** Every queen that attacks, or is attacked by, another one. */
export function conflictingQueens(
  n: number,
  queens: readonly Position[],
  terrain?: readonly string[],
): Array<[number, number]> {
  const seen = new Set<number>();
  const out: Array<[number, number]> = [];
  for (const pair of attackingPairs(n, queens, terrain)) {
    for (const [r, c] of pair) {
      const key = r * n + c;
      if (!seen.has(key)) {
        seen.add(key);
        out.push([r, c]);
      }
    }
  }
  return out;
}
