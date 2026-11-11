# N-Queen Algorithm Tester & Visualizer

A local browser app for testing N-Queens solvers written in C++. A solver is a plain function: it gets the problem as arguments and returns every solution, like any N-Queens exercise. Solvers are compiled to WebAssembly and run in a Web Worker. The app times the function over several runs and measures its memory, checks everything it returned, and lets you browse the returned solutions and the board where something went wrong. Four example solvers come with it, one for each problem case, and you write your own.

- UI: vanilla TypeScript + Vite, no UI library. Dark by default, with a light theme chosen with the sun/moon button in the header (the choice is kept in the browser). Montserrat and Noto Sans are served from `node_modules` (`@fontsource`), so the app needs no network once installed.
- Solvers: C++17 compiled with Emscripten (Docker or a native emsdk).
- Board size N = 4 to 12.
- Problem cases: Normal, Pre-placed (P = 0 to N-1 locked queens), Holes and Walled.

## Prerequisites

- Node.js >= 20 (LTS)
- One of the following C++/WASM toolchains:
  - **Docker** (default): image `emscripten/emsdk`, roughly 800 MB compressed, pulled on first build. On Windows this needs Docker Desktop with WSL2.
  - **Native emsdk** (no Docker): see [Native emsdk setup](#native-emsdk-setup). Needs Git; emsdk bundles its own Python on Windows.

## Quick start

```
npm install
npm run build:solvers   # compiles every Solver/<category>/<name>.cpp into Solver/dist/
npm run dev             # open the printed URL
```

Do **not** open `index.html` via `file://`. Serve it through Vite, which sends the COOP/COEP headers. Without them (`crossOriginIsolated` is false) the app still works, but the browser rounds timers, so compute times are less precise, and the app shows a warning.

With a native toolchain: `npm run build:solvers -- --native`.

The app runs on your own computer through `npm run dev`; there is no deployment.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with COOP/COEP headers |
| `npm run build:solvers` | Compiles all solvers to WASM, writes `Solver/dist/manifest.json`. If the toolchain is not available it stops and leaves `Solver/dist` unchanged |
| `npm run build` | Type-checks and builds the app |
| `npm run typecheck` | TypeScript check |

## Using the app

The window has three zones: the configuration on the left, the board and its navigator in the middle, and the run controls and the result on the right. Below 1200 px there are two columns, with the run controls under the configuration and the result under the board; below 900 px everything is one column, with the board first, the configuration folded under its heading and the run controls pinned to the bottom of the window.

**Configuration** (left)

- **Solver**: any solver in the manifest. The list has a group for each folder of `Solver/`, named like the folder, and a solver is named like its file, without `.cpp`; the path of the file is written under the list. Choosing a problem case selects its example solver; you can pick another afterwards. A solver that does not define the function of the chosen case ends as Execution Error and says which function is missing. A solver that failed to build is still listed, marked "(build failed)", with the compiler output shown below the list; it cannot be run.
- **Problem**: the case, chosen with four buttons (see [Problem cases](#problem-cases)). The **?** next to the title explains the case.
- **N**: board size, 4 to 12, typed or stepped with the minus and plus buttons.
- **P** (Pre-placed): the number of locked queens, 0 to N-1. They are drawn from the seed.
- **H** (Holes) or **W** (Walled) and **Positions**: the blocked cells, as many as H or W says. See [Holes and walls](#holes-and-walls).
- **Seed**: Pre-placed queens, holes and walls come from a seeded PRNG, so a board can be reproduced from (N, P, seed), (N, H, seed) or (N, W, seed). The die button picks a random seed.
- **Apply changes**: nothing in the boxes above changes the board until this is pressed (choosing a case is the exception: it applies at once). If the text of the positions was edited, that text is the board, and H, W and the seed are ignored; otherwise the board is drawn again from N (Normal), N, P and the seed (Pre-placed), N, H and the seed (Holes), or N, W and the seed (Walled).

**Run controls** (top of the right column)

- **Debug run**: a switch. It records the solver's `snapshot()` calls and measures neither time nor memory. See [Snapshots and Debug runs](#snapshots-and-debug-runs).
- **Run** runs the solver on the board: a first run, whose result is shown at once, and seven timed runs after it that measure time and memory. See [Time, memory and the cutoff](#time-memory-and-the-cutoff).
- **Stop** cancels the run, also while the timed runs go on, and returns to Ready with no result. While a run goes on, every other control is off, so that the board cannot be changed under it.

**The board** (middle): the queens of the shown solution. The numbers of the rows and columns are in a gutter above and to the left of the board; the cell under the pointer is lit and its numbers light up. Queens that attack each other are painted in the conflict colour. Solver queens are black, preplaced queens are blue with a gold padlock, walls are drawn as wooden pawns, and holes are recessed cells with a cross.

**Browsing a result** (under the board): the result is shown as soon as the first run is done, while the timed runs still go on. A switch picks what to look at:

| Switch | What it holds |
| --- | --- |
| Results | Everything the solver returned (boards on Walled). For an Invalid Solution it opens at the wrong one, with the cells that broke the rule marked and a note under the controls |
| Snapshots | Debug run: the recorded `snapshot()` calls. Opens on the last one. It is dimmed, with a hint, when there are none |

Inside a list: first, previous, next and last, a slider, and **Go to**. The arrow keys move by one, Page Up and Page Down by ten, Home and End to the ends, unless a text field has the focus. On Snapshots, **Play** steps through the recorded snapshots at 1, 4, 16 or 64 a second like a replay of the search.

**The result** (right, under the run controls): one card titled Result, with how the run ended as a badge. A run that was checked shows its figures as tiles: the number of solutions or boards, the queens, the best time and the heap peak, with the median, the spread and the number of runs under them. A run that went wrong shows the error instead, in a red box, and no figures.

## Problem cases

| Case | Goal | Blocked cells | Do attacks pass? | Queens per row |
| --- | --- | --- | --- | --- |
| Normal | Every arrangement of N queens | None | - | Exactly 1 |
| Pre-placed | Every arrangement of N queens that keeps the P locked ones | None, but P queens are locked in place | - | Exactly 1 |
| Holes | Every arrangement of N queens | Holes (pale, with a cross) | Yes | Exactly 1 |
| Walled | Every board with as many queens as possible | Walls (drawn as pawns) | No | Any, because a wall splits its row into separate segments |

A solver returns **all** solutions. A wall only stops an attack if it lies on the line between two queens. A diagonal that passes the corner between two walls is not blocked. Walls never attack.

### Holes and walls

Holes and walls are both a list of positions, `(row, column)` and 0-based. The list is the single source of truth for the board:

- **Apply changes** draws H (Holes) or W (Walled) positions from (N, H or W, seed) and fills the Positions box with them.
- You can type the positions instead, as `0,3; 2,5; 4,1`, one pair per line, or `(0,3) (2,5)`. If the text was edited, **Apply changes** reads it and makes it the board. A position outside the board, or text that cannot be read, is reported with its place in the text; repeated positions are ignored. A board made this way is labelled "typed positions" and the seed does not describe it.
- Holes drawn from H and a seed always have a solution. H is then at most N*N-N. Typed holes are run as they are, so a board can have no solution, and then the right answer is an empty list.
- Walled: every draw is a valid problem, because the goal is the maximum number of queens.

## Result statuses

| Status | Meaning |
| --- | --- |
| Successful | Every returned solution is valid and none is repeated. Shows the count, the queens, the compute time and the heap peak. **This copy of the tester has no reference solver, so the count is not compared with the right one** (the result says so), and on Walled the boards are valid but not known to be the best |
| Suboptimal | Walled: the boards are valid, but they hold fewer queens than the maximum. Only reported when there is a reference solver to say what the maximum is |
| Incomplete | Fewer solutions returned than there are. Only reported when there is a reference solver to say how many there are |
| Failed | The compute time of the first run exceeded the cutoff. The worker is terminated |
| Invalid Solution | A returned solution breaks a rule: queen count, shared column or diagonal (or row, on Walled), a preplaced queen that was moved, a queen on a hole or wall, a result of the wrong shape, or the same solution twice. Shows the rule, the board and the marked cells |
| Execution Error | A WASM trap (out of memory, stack overflow, `abort()`), `exit()`, module load failure, or a solver that does not define the function for the case. Shows the message and the top of the stack |
| Cancelled | You pressed Stop. The app goes back to Ready with no result |

Success is decided by what the solver returned, never by anything else. Each returned solution is checked by a fast loop that finds the first wrong one; the rule and the message then come from `Tester/Board/validator.ts`, a naive checker that shares no code with it.

A **result of the wrong shape** is a solution that does not have exactly N entries, a column outside 0 to N-1, or (on Walled) a queen outside the board. It is reported as Invalid Solution with the rule "a result has the wrong shape".

**Checking the count yourself.** Because Successful does not say that you found every solution, compare the count with the known one. For Normal, the number of solutions of the N-Queens problem is ([OEIS A000170](https://oeis.org/A000170)):

| N | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Solutions | 2 | 10 | 4 | 40 | 92 | 352 | 724 | 2,680 | 14,200 |

For the other cases there is no table: the count depends on the board. Check your solver on the Normal case first, and with P = 0 on Pre-placed, H = 0 on Holes and W = 0 on Walled, where the answers must be the Normal ones (on Walled with no walls, the boards are the Normal solutions).

## Snapshots and Debug runs

Without a trace, you cannot see how a search went wrong. `snapshot()` lets a solver show a board where it wants to:

```cpp
NQ_SNAPSHOT(nq::queensOf(cols), "dead end at row 3");   // cols[r] = column of the queen in row r, -1 = none
snapshot(queens, "label");                              // queens: std::vector<std::pair<int,int>> as (row, column)
snapshot(queens, "row " + std::to_string(r));           // the label can be a std::string too
```

- In a normal run `snapshot()` does nothing, and `NQ_SNAPSHOT` does not even evaluate its argument, so neither changes the result or the time.
- In a **Debug run** every call is recorded. A search can call it millions of times, so only the first `snapshotHead` (200) and the last `snapshotTail` (800) are kept, and the rest is only counted. Snapshots are sent to the page while the solver runs (the first at once, then at most every 50 ms), so a solver stopped at the cutoff, or one that crashes, still shows its last snapshots. The calls made in the last moments before it got stuck can be missing.
- A Debug run still checks the result and gives the status, but it runs only once and **its time and memory are not measured**, because recording takes time and memory. Snapshots, under the board, replays them with Play.
- A queen off the board, or two queens on one cell, make a snapshot "malformed"; a queen on a hole or wall is the solver's mistake. The note under the navigator says so. Neither stops the run.
- `nq::queensOf` turns a `std::vector<int>` (one column per row) or a `std::vector<std::string>` (cells with `'Q'`) into the list `snapshot` takes.

## Time, memory and the cutoff

A run of a solver is **1 + 7 runs**, one after the other, each in a fresh WASM instance:

1. The **first run** is the full one: the result is checked, snapshots are recorded in a Debug run, and the status and the boards are shown at once. It is also the warm-up. Runs of a few milliseconds were measurably slower the first time, so its time is left out.
2. **Seven timed runs** only time the solver and read the heap. While they go on, the tiles for time and heap say `measuring, run 3 of 8` and the boards can be browsed. When the last one is done they are replaced by the numbers:

```
Best time  35.0 ms            Heap peak  0.97 MB
median 35.2 ms · spread 90 µs · 7 runs
```

Times are written in microseconds, milliseconds or, from a thousand milliseconds, seconds, with about three digits: `230 µs`, `3.52 ms`, `35.2 ms`, `352 ms`, `1.23 s`, `12.3 s`, `123 s`. Hovering over the best time shows the exact figure as m:ss.fffff.

**Compute time** is the fastest of the seven timed runs. Whatever else runs on the computer (a browser tab, an editor, the browser itself) can only make a run slower, never faster, so the fastest run is the one closest to what the solver costs by itself. The **median** is shown under it, so that a typical run can be compared with the best one. One run is the time from the call to the solver's function until it returns. Passing the problem in, packing the result, checking it, loading the module and starting the worker are not counted. The **spread** is the median absolute deviation from the median; unlike a standard deviation, one slow run hardly moves it.

- If the spread is over 5% of the median, the result says the measurement is noisy. Close other programs and run again.
- Under 1 ms the result says just that the time is approximate: the timer's own step (5 µs in Chrome when the page is cross-origin isolated, coarser otherwise) is then a large share of the time.
- Times differ between computers, so compare solvers on one computer.

**Heap peak** is the most heap your function held at once, even if it freed some of it again, and the highest of the eight runs. It is read from the top of the Emscripten heap (`sbrk`) before and right after your function, and before the result is packed, because packing allocates too and that memory is the tester's. What your function allocates counts, and so does the result it returns. The stack (fixed at 1 MB) and global or static arrays do not, because they are part of the module.

**When time and memory are not measured**

- A Debug run is not repeated, because recording snapshots takes time and memory.
- A result that is wrong (Invalid Solution, or the same solution twice) is not repeated, and shows no time: the speed of a wrong answer means little.
- A run that ended as Failed or Execution Error has no result to measure.
- If a timed run goes wrong (cutoff, trap, a module that does not load), the status stays that of the first run, and a note says `Time and memory not measured: run 4 of 8: …`.

A Run takes about eight times as long as one run of the solver. Stop cancels all of it.

The **cutoff** stops a run that does not return, and it is two limits. `cutoffSeconds` (default 15 s) is for the first run only: if the first run goes over it, the worker is terminated and the status is Failed. `timedCutoffSeconds` (default 600 s, 10 minutes) is for each of the timed runs, and a timed run that goes over it only fails the measurement. A solver that needs more than 15 s on a board therefore ends as Failed, and one that finishes in time is measured even if a later run is a little slower.

Board size is limited to N=12. A solver returns every solution from memory, and the number of solutions grows about 5 to 6 times for each step of N.

## Configuration

`Tester/Configuration/tester.config.json` is validated at startup. An invalid value stops the app with a message. It is not editable from the UI.

| Key | Default | Meaning |
| --- | --- | --- |
| `cutoffSeconds` | 15 | Hard limit on the first run of a solver, its module loading and its compute time; above it the worker is terminated and the status is Failed |
| `timedCutoffSeconds` | 600 | The same limit for each timed run after the first; above it only the measurement fails |
| `solverMaxMemoryMB` | 512 | WASM `MAXIMUM_MEMORY` used by the build script. A solver returns all its solutions from this memory |
| `snapshotHead` | 200 | A Debug run keeps this many of the first `snapshot()` calls |
| `snapshotTail` | 800 | ... and this many of the last ones |

## Writing a solver

A solver is one file, `Solver/<category>/<name>.cpp`. The folder is the category it is listed under in the app, and the file name, without `.cpp`, is its name there: `Solver/mine/fast.cpp` is the solver `fast` in the group `mine`. Make a new folder for a new category. Each `.cpp` directly in a category folder is compiled into one WASM module, and nothing else in `Solver/` is a solver: not a header, not a subfolder of a category, not a file outside a category. The solver is in one file, because that is all it needs. Define the function for each case you want to solve; the others can stay out:

```cpp
#include "nqueens.h"

// Normal: solution[r] is the column of the queen in row r. Return every solution.
std::vector<std::vector<int>> solveNQueens(int n) {
  std::vector<std::vector<int>> found;
  // ... search ...
  return found;
}
```

**Start with the examples** in `Solver/example/`. They are written to be read, with comments on how a solver is written, and they take snapshots.

### The functions (`Tester/Harness/nqueens.h`)

```cpp
// Normal
std::vector<std::vector<int>> solveNQueens(int n);
// Pre-placed: queens already on the board as (row, column), which every solution keeps
std::vector<std::vector<int>> solvePreplaced(int n, const std::vector<std::pair<int, int>>& preplaced);
// Holes: grid[r][c] is '.' (free) or 'H' (hole)
std::vector<std::vector<int>> solveHoles(int n, const std::vector<std::string>& grid);
// Walled: grid[r][c] is '.' (free) or 'W' (wall, drawn as a pawn). Every board with the most queens, as (row, column) lists
std::vector<std::vector<std::pair<int, int>>> solveWalled(int n, const std::vector<std::string>& grid);
```

- Coordinates are 0-based, row first.
- A solution of Normal, Pre-placed and Holes is a `std::vector<int>` of exactly N entries: the column of the queen in each row. It lists all N rows, preplaced ones included. A board without a solution is answered with an empty list.
- A Walled board lists its queens in any order. On Walled you return **every board with the largest number of queens**; boards with fewer queens than the best one you return are ignored.
- Return each solution once. A repeated solution is an Invalid Solution.
- A wall on a Walled board is `'W'`. Earlier versions of this tester marked it with `'P'`: a Walled solver written for those must compare with `'W'` now, or it sees no walls and its answer is rejected.
- A solver that does not define the function of the selected case ends as Execution Error, with the signature that was expected.

### Rules

- No `main`, threads, file or network I/O. `exit()` ends the run as Execution Error.
- Globals and statics are fine: every run gets a fresh WASM instance, and static initializers run before timing starts.
- C++ exceptions are not enabled. A `throw` aborts the run as Execution Error. To enable them, add the Emscripten exception flag to `emccArgs` in `driver/scripts/build-solvers.mjs`.
- Memory is limited by `solverMaxMemoryMB`; running out of it is an Execution Error.
- The result is moved out of your function, so destroying it is not timed. Whatever your function allocates and frees itself is.
- Your function is run eight times for every Run, each in a fresh instance. Only the first run's result is checked, so it must give the same result every time. The heap it holds at once is shown as its memory (see [Time, memory and the cutoff](#time-memory-and-the-cutoff)).

### Build and run

```
npm run build:solvers
npm run dev
```

The script rebuilds every solver in full each time (no incremental builds). Compile errors are printed verbatim and also shown in the UI under the solver list. Your solver appears in the dropdown under its folder's name. Solvers are built with `--profiling-funcs`, which keeps function names, so the stack of a trap names your functions. It does not slow the code down.

### The example solvers

Choosing a problem case selects its example solver. Each is one file, defines only the function of its own case, and takes snapshots: of every solution, of candidates that were turned down (the first and then every 1,000th, with the reason) and, on Walled, of every board that reaches the best so far. Using one on another case ends as Execution Error.

| Solver | For | Search |
| --- | --- | --- |
| `example/bruteforce-normal` | Normal | Every one of the N! orderings of the columns, then a check of the diagonals |
| `example/bruteforce-preplaced` | Pre-placed | The same, over the free columns and rows only |
| `example/bruteforce-holes` | Holes | The same, rejecting a queen on a hole first |
| `example/bruteforce-walled` | Walled | Every way to fill the board: a queen on each free cell, if nothing attacks it, or no queen |

They are written to be clear, not to be fast. Measured in Node on one computer, one run of the Normal solver took about 8 s at N=12 and the Holes solver about 12 s, so a first run can come close to the 15 s cutoff there. The Walled solver took 2 to 4 s at N=10 and from 10 s to over a minute at N=11, which goes over the cutoff and ends as Failed.

## Native emsdk setup

### Windows (PowerShell)

```
git clone https://github.com/emscripten-core/emsdk.git C:\emsdk
cd C:\emsdk
.\emsdk install latest
.\emsdk activate latest
.\emsdk_env.ps1
em++ --version
```

If PowerShell blocks the script (execution policy), use `cmd /k "C:\emsdk\emsdk_env.bat"` instead and run the build from that shell.

### Linux / macOS

```
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
em++ --version
```

### Build with the native toolchain

```
npm run build:solvers -- --native
```

(or set `NQ_NATIVE=1`). The build must run in the same terminal where `emsdk_env` was loaded, because it only sets PATH for that session. To make it permanent: `emsdk activate latest --permanent` (on Windows, from an Administrator PowerShell), then reopen your terminals.

Notes:

- The build script calls `em++`, not `emcc`. Plain `emcc` does not link the C++ standard library for `.cpp` files and fails with `undefined symbol: operator new` and similar errors.
- With `--native`, the Docker tag is ignored and `manifest.json` records `"emsdk": "native"`. Compute times depend on the compiler version, so note which emsdk version you used.
- Docker builds use the pinned tag `5.0.5`. Override it with `EMSDK_TAG=x.y.z npm run build:solvers`, and verify the tag exists on Docker Hub.
- Solvers are compiled with `-sENVIRONMENT=worker,node`.

## How it works

- Each run gets its own Web Worker. The main thread does not share memory with it: it waits for messages, and a timer on the main thread terminates the worker at the cutoff.
- The harness in `Tester/Harness/nqueen_runtime.cpp` is compiled into every solver. The host drives it in four steps: it writes the problem into the module's memory (`nq_alloc_input`), the harness decodes it (`nq_prepare`), the host times `nq_solve`, which calls the solver's function and moves what it returns into a static, and `nq_pack` flattens it. Only `nq_solve` is timed. The host also reads the heap top (`nq_heap_top`) after `nq_prepare` and again after `nq_solve`, before `nq_pack`, so that packing is not counted as the solver's memory. The functions a solver leaves out are replaced by weak stubs, so a missing one is reported instead of crashing.
- The result is one flat byte buffer, not millions of small arrays (`Tester/Board/solution-set.ts`): N bytes per solution for one queen per row, or a record of queen count plus (row, column) pairs on Walled. The worker copies it out of the module's memory and hands the buffer to the main thread without copying it again.
- Checking the result runs in the worker after the timing: a fast loop with stamped tables finds the first wrong solution; duplicates are found by sorting a 53-bit hash of each solution and comparing equal hashes byte by byte, so a collision never counts.
- The worker (`Tester/Execution/measure.ts`) runs the solver 1 + 7 times and reports `started` and `solved` around every run, so the cutoff timer runs between them in each of the eight. It reports the outcome of the first run as soon as it is checked; the session judges it at once and shows it. A timed run that goes over the cutoff or fails only spoils the measurement: the status of the first run stands. Checking the result takes as long as it takes.
- Stop terminates the worker, also while the timed runs go on, and drops the result that was shown. While a run goes on every other control is off, so that the board cannot be changed under it.

## Project layout

```
index.html                    entry page
driver/
  main.ts                     mounts the app
  vite.config.ts              COOP/COEP headers for the dev server
  scripts/build-solvers.mjs   emcc/em++ wrapper (Docker or native), writes the manifest
  scripts/discover.mjs        finds the solvers: every .cpp directly in a folder of Solver/
Tester/
  Board/                      positions and generators, solution sets and their checks, validator, conflicts, PRNG
  Configuration/              tester.config.json, config, run counts and time and size formats
  Harness/                    nqueens.h (what a solver includes) and nqueen_runtime.cpp (the C++ side of a run, compiled into every solver)
  Execution/                  run controller, session, runner, measurement and its statistics, judge, snapshot store, worker adapter
  Visualization/              board renderer, the pieces it draws, render state, highlight
  UI/                         app wiring, config panel, run panel, board browser and its keys, result column, board card, icons, styles
Solver/
  example/                    bruteforce-normal, -preplaced, -holes, -walled: the examples to read
  <category>/<name>.cpp       your solvers: the folder is the category in the app, the file its name
  dist/                       build output and manifest.json (generated, git-ignored)
```

## Credits

- Ghiffari Bravia Hisham `https://github.com/ghiffaribraviah`
- Muhammad Syafiq Romadhon `https://github.com/koniro-kishi`
