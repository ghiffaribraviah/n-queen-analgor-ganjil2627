#!/usr/bin/env node
// Compiles every solver, Solver/<category>/<name>.cpp, to WASM with emcc, each one into its own module under
// Solver/dist/<category>/<name>/, and writes Solver/dist/manifest.json.
// Default: runs emcc inside a pinned emscripten/emsdk Docker image.
// Use --native (or NQ_NATIVE=1) to use an emcc already on PATH instead.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { discoverSolvers } from "./discover.mjs";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const EMSDK_TAG = process.env.EMSDK_TAG ?? "5.0.5"; // pinned; override with EMSDK_TAG
const native =
  process.argv.includes("--native") || process.env.NQ_NATIVE === "1";

const cfg = JSON.parse(
  readFileSync(
    path.join(repo, "Tester/Configuration/tester.config.json"),
    "utf8",
  ),
);
const maxMemBytes = Math.round(cfg.solverMaxMemoryMB * 1024 * 1024);

const posix = (p) => p.split(path.sep).join("/");
const rel = (p) => posix(path.relative(repo, p));

function emccArgs(solver, outJs) {
  const sources = [solver.source, path.join(repo, "Tester/Harness/nqueen_runtime.cpp")];
  return [
    ...sources.map(rel),
    // Helper headers of the solvers that fail on purpose. Not every checkout has them.
    ...(existsSync(path.join(repo, "driver/check/fixtures")) ? ["-Idriver/check/fixtures"] : []),
    "-ITester/Harness",
    "-O2",
    "-std=c++17",
    "-sMODULARIZE=1",
    "-sEXPORT_ES6=1",
    "-sEXPORT_NAME=createSolver",
    // worker for the browser, node for the benchmark harness (see README note)
    "-sENVIRONMENT=worker,node",
    "-sALLOW_MEMORY_GROWTH=1",
    `-sMAXIMUM_MEMORY=${maxMemBytes}`,
    "-sSTACK_SIZE=1048576",
    "-sFILESYSTEM=0",
    // The harness in Tester/Harness/nqueen_runtime.cpp: the host writes the problem, times nq_solve, then reads the result.
    "-sEXPORTED_FUNCTIONS=_nq_alloc_input,_nq_prepare,_nq_solve,_nq_pack,_nq_result,_nq_count,_nq_bad,_nq_heap_top",
    "-sEXPORTED_RUNTIME_METHODS=HEAPU8",
    // Keeps function names in the name section, so a trap shows which function it was in. Does not slow the code down.
    "--profiling-funcs",
    "-o",
    rel(outJs),
  ];
}

function run(args) {
  if (native)
    return spawnSync("em++", args, {
      cwd: repo,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  const dockerArgs = ["run", "--rm", "-v", `${repo}:/src`, "-w", "/src"];
  if (process.platform !== "win32" && os.userInfo().uid >= 0) {
    dockerArgs.push("-u", `${os.userInfo().uid}:${os.userInfo().gid}`);
  }
  dockerArgs.push(`emscripten/emsdk:${EMSDK_TAG}`, "em++", ...args);
  return spawnSync("docker", dockerArgs, { cwd: repo, encoding: "utf8" });
}

// Nothing to build is an error before anything is touched.
const solvers = discoverSolvers(repo);
if (solvers.length === 0) {
  console.error("No solvers found. A solver is a .cpp directly in a folder of Solver/, as Solver/<category>/<name>.cpp.");
  process.exit(1);
}

// Check the toolchain before touching Solver/dist: without one, every solver would "fail" and the
// existing builds would be lost. The first Docker run also pulls the image here.
console.log(`Checking toolchain (${native ? "em++" : `Docker, emsdk ${EMSDK_TAG}`}) ...`);
const probe = run(["--version"]);
if (probe.error || probe.status !== 0) {
  console.error(
    `Toolchain not available. Solver/dist was left unchanged.\n${
      probe.error?.message ?? `${probe.stdout ?? ""}${probe.stderr ?? ""}`
    }`,
  );
  process.exit(1);
}

const distRoot = path.join(repo, "Solver/dist");
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  emsdk: native ? "native" : EMSDK_TAG,
  solvers: [],
};
let failed = 0;

for (const s of solvers) {
  const outDir = path.join(distRoot, s.category, s.name);
  mkdirSync(outDir, { recursive: true });
  const outJs = path.join(outDir, "solver.mjs");
  process.stdout.write(`Building ${s.id} ... `);
  const entry = { id: s.id, category: s.category, name: s.name, file: s.file, snapshots: s.snapshots };
  const r = run(emccArgs(s, outJs));
  if (r.error || r.status !== 0) {
    failed++;
    console.log("FAILED");
    const msg = r.error
      ? String(r.error.message)
      : `${r.stdout ?? ""}${r.stderr ?? ""}`;
    console.error(msg);
    manifest.solvers.push({ ...entry, ok: false, error: msg });
    continue;
  }
  console.log("ok");
  manifest.solvers.push({
    ...entry,
    ok: true,
    module: `/Solver/dist/${s.id}/solver.mjs`,
    wasm: `/Solver/dist/${s.id}/solver.wasm`,
  });
}

writeFileSync(
  path.join(distRoot, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log(
  `Manifest written: Solver/dist/manifest.json (${manifest.solvers.length - failed} ok, ${failed} failed)`,
);
process.exit(failed ? 1 : 0);
