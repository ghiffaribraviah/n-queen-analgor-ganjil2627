export interface DiscoveredSolver {
  /** `category/name`, which is also where the build writes it: Solver/dist/<id>/ */
  id: string;
  /** The folder of the source, directly under Solver/. */
  category: string;
  /** The file name without .cpp. */
  name: string;
  /** Path of the source from the repository root, with forward slashes. */
  file: string;
  /** Full path of the source. */
  source: string;
  /** The solver uses NQ_SNAPSHOT or calls snapshot(). */
  snapshots: boolean;
}
export function codeOf(source: string): string;
export function usesSnapshots(source: string): boolean;
export function discoverSolvers(root: string): DiscoveredSolver[];
