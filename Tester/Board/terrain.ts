// Board terrain for the Holes and Walled problem cases. A terrain is N strings of N chars: '.' free, 'H' hole,
// 'P' pawn. Neither blocked cell can hold a queen. Attacks pass through a hole and stop at a pawn.
// The blocked cells themselves come from a list of positions: see positions.ts.
export const CELL_FREE = ".";
export const CELL_HOLE = "H";
export const CELL_PAWN = "P";

export type Terrain = readonly string[];
export type ProblemCase = "normal" | "preplaced" | "holes" | "walled";

export const usesTerrain = (c: ProblemCase): boolean =>
  c === "holes" || c === "walled";
