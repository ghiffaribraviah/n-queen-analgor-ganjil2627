// Finds the solvers: Solver/<category>/<name>.cpp. The category is the folder and the name is the file without .cpp. A .cpp
// that sits directly in a category folder is one solver, compiled into one module. Anything else (headers, subfolders,
// files outside a category) is not a solver. Solver/dist is the build output, not a category.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Folders of Solver/ that are not categories. */
const NOT_CATEGORIES = new Set(["dist"]);

const COMMENT_OR_STRING = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

/** The source with comments blanked and the text of strings and characters emptied, so that only code is left to search. */
export function codeOf(source) {
  return source.replace(COMMENT_OR_STRING, (m) => (m.startsWith("/") ? " " : m[0] === '"' ? '""' : "''"));
}

/** Whether the solver takes snapshots: it uses NQ_SNAPSHOT or calls snapshot(). */
export function usesSnapshots(source) {
  return /\bNQ_SNAPSHOT\b|\bsnapshot\s*\(/.test(codeOf(source));
}

const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The solvers under `<root>/Solver`, sorted by category and then name. `file` is the path of the source from `root`, with
 * forward slashes, and `source` is its full path.
 */
export function discoverSolvers(root) {
  const base = path.join(root, "Solver");
  if (!existsSync(base)) return [];
  const solvers = [];
  for (const category of readdirSync(base).sort(byCode)) {
    if (NOT_CATEGORIES.has(category) || category.startsWith(".")) continue;
    const dir = path.join(base, category);
    if (!statSync(dir).isDirectory()) continue;
    // By name, not by file name: "a.cpp" sorts after "a-b.cpp" because "." comes after "-", but "a" comes before "a-b".
    const entries = readdirSync(dir)
      .filter((e) => e.endsWith(".cpp"))
      .sort((a, b) => byCode(a.slice(0, -4), b.slice(0, -4)));
    for (const entry of entries) {
      const source = path.join(dir, entry);
      if (!statSync(source).isFile()) continue;
      const name = entry.slice(0, -".cpp".length);
      solvers.push({
        id: `${category}/${name}`,
        category,
        name,
        file: `Solver/${category}/${entry}`,
        source,
        snapshots: usesSnapshots(readFileSync(source, "utf8")),
      });
    }
  }
  return solvers;
}
