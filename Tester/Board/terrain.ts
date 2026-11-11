// Board terrain for the Holes and Walled problem cases. A terrain is N strings of N chars: '.' free, 'H' hole,
// 'W' wall (drawn as a pawn). Neither blocked cell can hold a queen. Attacks pass through a hole and stop at a wall.
// The blocked cells themselves come from a list of positions: see positions.ts.
export const CELL_FREE = ".";
export const CELL_HOLE = "H";
export const CELL_WALL = "W";

export type Terrain = readonly string[];
export type ProblemCase = "normal" | "preplaced" | "holes" | "walled";

export const usesTerrain = (c: ProblemCase): boolean =>
  c === "holes" || c === "walled";
