// Independent validator (design section 9). Shares NO code with Board: it re-derives everything
// from a plain string[] snapshot with a naive pairwise scan.
export type Rule =
  | 'size'
  | 'format'
  | 'queen-count'
  | 'row'
  | 'column'
  | 'diagonal'
  | 'preplaced'
  | 'terrain'
  | 'duplicate';

/** `cells` are the cells the message is about, so they can be marked on the board. */
export type ValidationResult =
  | { ok: true }
  | { ok: false; rule: Rule; message: string; cells?: Array<[number, number]> };

export function validateBoard(
  snapshot: string[],
  n: number,
  preplaced: ReadonlyArray<readonly [number, number]> = [],
  terrain?: readonly string[], // N strings: '.', 'H' (hole) or 'P' (pawn)
  anyQueenCount = false, // Walled: any number of queens is valid; how many is judged separately
): ValidationResult {
  if (snapshot.length !== n || snapshot.some((r) => r.length !== n)) {
    return { ok: false, rule: 'size', message: `Board snapshot is not ${n}x${n}` };
  }
  const isPawn = (r: number, c: number): boolean => terrain?.[r]?.[c] === 'P';
  if (terrain) {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const t = terrain[r]?.[c];
        const s = snapshot[r]![c];
        if (t === 'H' || t === 'P') {
          const name = t === 'H' ? 'hole' : 'pawn';
          if (s === 'Q') return { ok: false, rule: 'terrain', message: `Queen at (${r},${c}) is on a ${name}`, cells: [[r, c]] };
          if (s !== t) return { ok: false, rule: 'terrain', message: `The ${name} at (${r},${c}) is missing`, cells: [[r, c]] };
        } else if (s === 'H' || s === 'P') {
          return { ok: false, rule: 'terrain', message: `Unexpected blocked cell at (${r},${c})`, cells: [[r, c]] };
        }
      }
    }
  }
  const pawnBetween = (r1: number, c1: number, r2: number, c2: number): boolean => {
    const dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
    for (let r = r1 + dr, c = c1 + dc; r !== r2 || c !== c2; r += dr, c += dc) {
      if (isPawn(r, c)) return true;
    }
    return false;
  };

  const queens: Array<[number, number]> = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) if (snapshot[r]![c] === 'Q') queens.push([r, c]);

  if (!anyQueenCount && queens.length !== n) {
    return { ok: false, rule: 'queen-count', message: `Expected ${n} queens, found ${queens.length}` };
  }
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      const [r1, c1] = queens[i]!, [r2, c2] = queens[j]!;
      const sameRow = r1 === r2, sameCol = c1 === c2, sameDiag = Math.abs(r1 - r2) === Math.abs(c1 - c2);
      if ((!sameRow && !sameCol && !sameDiag) || pawnBetween(r1, c1, r2, c2)) continue;
      const cells: Array<[number, number]> = [[r1, c1], [r2, c2]];
      if (sameRow) return { ok: false, rule: 'row', message: `Queens (${r1},${c1}) and (${r2},${c2}) share row ${r1}`, cells };
      if (sameCol) return { ok: false, rule: 'column', message: `Queens (${r1},${c1}) and (${r2},${c2}) share column ${c1}`, cells };
      return { ok: false, rule: 'diagonal', message: `Queens (${r1},${c1}) and (${r2},${c2}) share a diagonal`, cells };
    }
  }
  for (const [r, c] of preplaced) {
    if (snapshot[r]?.[c] !== 'Q') {
      return { ok: false, rule: 'preplaced', message: `Preplaced queen at (${r},${c}) is missing`, cells: [[r, c]] };
    }
  }
  return { ok: true };
}
