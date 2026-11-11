// The keyboard shortcuts of the board navigator, kept free of the DOM so that they can be tested.

/**
 * Where a key moves the shown board to: left and right by one, Page Up and Down by ten, Home and End to the ends. The
 * result stays inside the list. Undefined for any other key.
 */
export function navigationKey(key: string, index: number, count: number): number | undefined {
  if (count <= 0) return undefined;
  let target: number;
  switch (key) {
    case "ArrowLeft":
      target = index - 1;
      break;
    case "ArrowRight":
      target = index + 1;
      break;
    case "PageUp":
      target = index - 10;
      break;
    case "PageDown":
      target = index + 10;
      break;
    case "Home":
      target = 0;
      break;
    case "End":
      target = count - 1;
      break;
    default:
      return undefined;
  }
  return Math.max(0, Math.min(count - 1, target));
}

/** A control the user types in or moves with the arrow keys: the shortcuts leave its keys alone. */
export function isEditable(target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Snapshots shown per second while playing. */
export const PLAY_SPEEDS = [1, 4, 16, 64] as const;
export const DEFAULT_PLAY_SPEED = 4;

/** Where playing starts: where the user is, or the beginning when that is the last board. */
export function playStart(index: number, count: number): number {
  return index >= count - 1 ? 0 : Math.max(0, index);
}

/** The board after this one while playing, or null at the end, where playing stops. */
export function playNext(index: number, count: number): number | null {
  return index + 1 < count ? index + 1 : null;
}

export const playDelayMs = (speed: number): number => 1000 / Math.max(1, speed);
