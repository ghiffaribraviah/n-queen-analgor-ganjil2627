// Snapshots recorded by snapshot() in a Debug run. A search can call it millions of times, so only the first `head`
// and the last `tail` are kept, and the calls in between are only counted.
import type { Position } from "../Board/positions";

export interface Snapshot {
  /** 1-based number of the snapshot() call. */
  call: number;
  label: string;
  queens: Array<[number, number]>;
}

/** What a worker sends to the main thread: the bounded store as it stands, and how many calls there were. */
export interface SnapshotState {
  entries: Snapshot[];
  total: number;
}

export class SnapshotStore {
  private readonly head: Snapshot[] = [];
  private readonly ring: Array<Snapshot | undefined>;
  private ringNext = 0;
  private ringCount = 0;
  private calls = 0;

  constructor(
    private readonly headMax: number,
    private readonly tailMax: number,
  ) {
    if (!Number.isInteger(headMax) || headMax < 0 || !Number.isInteger(tailMax) || tailMax < 0)
      throw new RangeError("head and tail must be integers >= 0");
    this.ring = new Array<Snapshot | undefined>(tailMax);
  }

  get total(): number {
    return this.calls;
  }

  push(label: string, queens: Array<[number, number]>): void {
    const snap: Snapshot = { call: ++this.calls, label, queens };
    if (this.head.length < this.headMax) {
      this.head.push(snap);
    } else if (this.tailMax > 0) {
      this.ring[this.ringNext] = snap;
      this.ringNext = (this.ringNext + 1) % this.tailMax;
      this.ringCount = Math.min(this.ringCount + 1, this.tailMax);
    }
  }

  /** Kept snapshots in call order: the first ones, then the last ones. */
  entries(): Snapshot[] {
    const tail: Snapshot[] = [];
    const first = this.ringCount < this.tailMax ? 0 : this.ringNext;
    for (let i = 0; i < this.ringCount; i++)
      tail.push(this.ring[(first + i) % this.tailMax]!);
    return [...this.head, ...tail];
  }

  state(): SnapshotState {
    return { entries: this.entries(), total: this.calls };
  }
}

/** Snapshot calls that were not kept. */
export const omittedCount = (s: SnapshotState): number => s.total - s.entries.length;

/**
 * What is wrong with a snapshot, in words. A queen off the board or two queens on one cell mean the argument is
 * malformed; a queen on a hole or pawn is the solver's mistake. Neither stops the run.
 */
export function snapshotProblems(
  n: number,
  queens: readonly Position[],
  terrain?: readonly string[],
): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const [r, c] of queens) {
    if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0 || r >= n || c >= n) {
      problems.push(`The queen at (${r},${c}) is outside the ${n}x${n} board`);
      continue;
    }
    if (seen.has(r * n + c)) problems.push(`Two queens are at (${r},${c})`);
    seen.add(r * n + c);
    const t = terrain?.[r]?.[c];
    if (t === "H") problems.push(`The queen at (${r},${c}) is on a hole`);
    if (t === "P") problems.push(`The queen at (${r},${c}) is on a pawn`);
  }
  return problems;
}
