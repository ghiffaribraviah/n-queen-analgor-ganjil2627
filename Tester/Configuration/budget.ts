// The reference solver of each case, how far Find all solutions is practical, and how times are written.
import type { ProblemCase } from "../Board/terrain";

/**
 * The solver each case starts on, by id (`category/name`, from Solver/<category>/<name>.cpp): selected when the case is
 * chosen. It is only a starting point. Which solver gives the answer other solvers are compared with is a different
 * matter, and is set by `referenceSolvers` in tester.config.json.
 */
export const DEFAULT_SOLVER: Record<ProblemCase, string> = {
  normal: "example/bruteforce-normal",
  preplaced: "example/bruteforce-preplaced",
  holes: "example/bruteforce-holes",
  walled: "example/bruteforce-walled",
};

/**
 * A run is measured by running the solver more than once, each time in a fresh WASM instance. The first run also
 * checks the result, and counts as a warm-up: runs of a few milliseconds or less are measurably slower the first time.
 */
export const WARMUP_RUNS = 1;
/** Timed runs after the warm-up. The fastest of them is the compute time. */
export const TIMED_RUNS = 7;

/** Up to 3 decimals, trailing zeros trimmed. */
export const formatTimeout = (s: number): string =>
  String(Number(s.toFixed(3)));

/**
 * A compute time in microseconds, milliseconds or seconds: "230 µs", "3.52 ms", "35.2 ms", "352 ms", "1.23 s", "12.3 s",
 * "123 s". Three digits or so, and the step to the next unit is taken after rounding (0.9996 ms is "1.00 ms", and
 * 999.6 ms is "1.00 s").
 */
export function splitTime(ms: number): { value: string; unit: "µs" | "ms" | "s" } {
  const t = Math.max(0, ms);
  const us = t * 1000;
  if (us < 999.5) return { value: String(Math.round(us)), unit: "µs" };
  if (t < 9.995) return { value: t.toFixed(2), unit: "ms" };
  if (t < 99.95) return { value: t.toFixed(1), unit: "ms" };
  if (t < 999.5) return { value: String(Math.round(t)), unit: "ms" };
  const s = t / 1000;
  if (s < 9.995) return { value: s.toFixed(2), unit: "s" };
  if (s < 99.95) return { value: s.toFixed(1), unit: "s" };
  return { value: Math.round(s).toLocaleString("en-US"), unit: "s" };
}

export function formatTime(ms: number): string {
  const { value, unit } = splitTime(ms);
  return `${value} ${unit}`;
}

/** "512 B", "968 KB", "1.37 MB", as a number and a unit. */
export function splitBytes(bytes: number): { value: string; unit: "B" | "KB" | "MB" } {
  if (bytes < 1024) return { value: String(Math.round(bytes)), unit: "B" };
  if (bytes < 1024 * 1024) return { value: String(Math.round(bytes / 1024)), unit: "KB" };
  return { value: (bytes / (1024 * 1024)).toFixed(2), unit: "MB" };
}

export function formatBytes(bytes: number): string {
  const { value, unit } = splitBytes(bytes);
  return `${value} ${unit}`;
}

/** m:ss.fffff. Fraction of a second with 5 digits (10 µs resolution). */
export function formatDuration(ms: number): string {
  const units = Math.max(0, Math.round(ms * 100)); // 1 unit = 10 µs
  const min = Math.floor(units / 6_000_000);
  const rest = units % 6_000_000;
  const sec = Math.floor(rest / 100_000);
  const frac = rest % 100_000;
  return `${min}:${String(sec).padStart(2, "0")}.${String(frac).padStart(5, "0")}`;
}

/** m:ss for a timer that counts the seconds a run has taken so far. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
