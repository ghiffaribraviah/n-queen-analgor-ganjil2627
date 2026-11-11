// Compiled into every solver module. The host (a worker) drives it in four steps, so that only the solver's own
// function is timed:
//
//   nq_alloc_input(bytes)  the host writes the problem into the returned buffer
//   nq_prepare(case, debug) decodes the problem                                  (not timed)
//   nq_solve()             calls the solver's function and keeps what it returns (timed)
//   nq_pack()              flattens the result into bytes for the host            (not timed)
//
// The host reads nq_heap_top() after nq_prepare and again after nq_solve, before nq_pack: packing allocates too, and that
// is the tester's memory, not the solver's.
//
// Input bytes:  n | queen count (u16 LE) | (row, col) per queen | n*n grid chars ('.', 'H', 'P')
// Result bytes: see Tester/Board/solution-set.ts.
#include <algorithm>
#include <cstdint>
#include <cstdlib>

#include "nqueens.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#include <unistd.h>

EM_JS_DEPS(nq_host_deps, "$UTF8ToString");

EM_JS(void, nq_js_snapshot, (const int* pairs, int count, const char* label), {
  const host = globalThis.__nqHost;
  if (host && host.snapshot) host.snapshot(HEAP32.slice(pairs >> 2, (pairs >> 2) + 2 * count), UTF8ToString(label));
});
#else
// Native builds (for checking the harness without Emscripten) have no host.
static void nq_js_snapshot(const int*, int, const char*) {}
#endif

bool g_nq_debug = false;

void snapshot(const std::vector<std::pair<int, int>>& queens, const char* label) {
  if (!g_nq_debug) return;
  std::vector<int> flat;
  flat.reserve(queens.size() * 2);
  for (const auto& q : queens) {
    flat.push_back(q.first);
    flat.push_back(q.second);
  }
  nq_js_snapshot(flat.data(), static_cast<int>(queens.size()), label ? label : "");
}

// ---- Entry points the solver may leave out --------------------------------------------------------------------------
// A solver that defines one of these overrides the weak version below. Calling a missing one is reported, not a crash.
namespace {
bool g_missing = false;
}
#define NQ_WEAK __attribute__((weak))
NQ_WEAK std::vector<std::vector<int>> solveNQueens(int) { g_missing = true; return {}; }
NQ_WEAK std::vector<std::vector<int>> solvePreplaced(int, const std::vector<std::pair<int, int>>&) { g_missing = true; return {}; }
NQ_WEAK std::vector<std::vector<int>> solveHoles(int, const std::vector<std::string>&) { g_missing = true; return {}; }
NQ_WEAK std::vector<std::vector<std::pair<int, int>>> solveWalled(int, const std::vector<std::string>&) { g_missing = true; return {}; }

// ---- State ---------------------------------------------------------------------------------------------------------
namespace {
enum Case { kNormal = 0, kPreplaced = 1, kHoles = 2, kWalled = 3 };

std::vector<uint8_t> g_input;
std::vector<uint8_t> g_packed;
int g_n = 0;
int g_case = 0;
int g_count = 0;
long g_bad[3] = {0, 0, 0};
std::vector<std::pair<int, int>> g_preplaced;
std::vector<std::string> g_grid;
std::vector<std::vector<int>> g_cols;
std::vector<std::vector<std::pair<int, int>>> g_cells;

// Solutions of one queen per row: n bytes each. Returns the byte count, -1 for a solution of the wrong length and -2 for
// a column off the board. g_bad says which: solution index, then the length (or row), then the value.
int packColumns() {
  const size_t n = static_cast<size_t>(g_n);
  for (size_t i = 0; i < g_cols.size(); ++i) {
    if (g_cols[i].size() != n) {
      g_bad[0] = static_cast<long>(i), g_bad[1] = static_cast<long>(g_cols[i].size()), g_bad[2] = 0;
      return -1;
    }
    for (size_t r = 0; r < n; ++r) {
      const int v = g_cols[i][r];
      if (v < 0 || v >= g_n) {
        g_bad[0] = static_cast<long>(i), g_bad[1] = static_cast<long>(r), g_bad[2] = v;
        return -2;
      }
    }
  }
  g_packed.resize(g_cols.size() * n);
  for (size_t i = 0; i < g_cols.size(); ++i)
    for (size_t r = 0; r < n; ++r) g_packed[i * n + r] = static_cast<uint8_t>(g_cols[i][r]);
  g_count = static_cast<int>(g_cols.size());
  std::vector<std::vector<int>>().swap(g_cols);
  return static_cast<int>(g_packed.size());
}

// Boards of any number of queens: a u16 count, then (row, col) pairs sorted row by row.
int packCells() {
  size_t bytes = 0;
  for (size_t i = 0; i < g_cells.size(); ++i) {
    if (g_cells[i].size() > 65535) {
      g_bad[0] = static_cast<long>(i), g_bad[1] = static_cast<long>(g_cells[i].size()), g_bad[2] = 0;
      return -1;
    }
    for (const auto& q : g_cells[i]) {
      if (q.first < 0 || q.second < 0 || q.first >= g_n || q.second >= g_n) {
        g_bad[0] = static_cast<long>(i), g_bad[1] = q.first, g_bad[2] = q.second;
        return -2;
      }
    }
    bytes += 2 + 2 * g_cells[i].size();
  }
  g_packed.resize(bytes);
  size_t at = 0;
  for (auto& board : g_cells) {
    std::sort(board.begin(), board.end());
    g_packed[at++] = static_cast<uint8_t>(board.size() & 255);
    g_packed[at++] = static_cast<uint8_t>(board.size() >> 8);
    for (const auto& q : board) {
      g_packed[at++] = static_cast<uint8_t>(q.first);
      g_packed[at++] = static_cast<uint8_t>(q.second);
    }
  }
  g_count = static_cast<int>(g_cells.size());
  std::vector<std::vector<std::pair<int, int>>>().swap(g_cells);
  return static_cast<int>(g_packed.size());
}
}  // namespace

extern "C" {

uint8_t* nq_alloc_input(int bytes) {
  g_input.assign(static_cast<size_t>(bytes), 0);
  return g_input.data();
}

// Returns 0, or -1 when the input is shorter than its header says.
int nq_prepare(int kase, int debug) {
  g_case = kase;
  g_nq_debug = debug != 0;
  g_missing = false;
  const size_t len = g_input.size();
  if (len < 3) return -1;
  g_n = g_input[0];
  const size_t queens = g_input[1] | (g_input[2] << 8);
  const size_t cells = static_cast<size_t>(g_n) * g_n;
  if (len < 3 + 2 * queens + cells) return -1;
  g_preplaced.clear();
  for (size_t i = 0; i < queens; ++i)
    g_preplaced.emplace_back(g_input[3 + 2 * i], g_input[4 + 2 * i]);
  g_grid.assign(g_n, std::string(g_n, '.'));
  const uint8_t* grid = g_input.data() + 3 + 2 * queens;
  for (int r = 0; r < g_n; ++r)
    for (int c = 0; c < g_n; ++c) g_grid[r][c] = static_cast<char>(grid[r * g_n + c]);
  return 0;
}

// Returns 0, 1 when the solver does not define the function for this case, or -2 for an unknown case.
int nq_solve() {
  switch (g_case) {
    case kNormal: g_cols = solveNQueens(g_n); break;
    case kPreplaced: g_cols = solvePreplaced(g_n, g_preplaced); break;
    case kHoles: g_cols = solveHoles(g_n, g_grid); break;
    case kWalled: g_cells = solveWalled(g_n, g_grid); break;
    default: return -2;
  }
  return g_missing ? 1 : 0;
}

int nq_pack() {
  g_packed.clear();
  g_count = 0;
  return g_case == kWalled ? packCells() : packColumns();
}

// The top of the heap. The allocator never gives memory back, so the difference between two readings is the most heap
// the solver held at once, even if it freed some of it. 0 where there is no Emscripten allocator to ask.
int nq_heap_top() {
#ifdef __EMSCRIPTEN__
  return static_cast<int>(reinterpret_cast<size_t>(sbrk(0)));
#else
  return 0;
#endif
}

const uint8_t* nq_result() { return g_packed.data(); }
int nq_count() { return g_count; }
long nq_bad(int which) { return which >= 0 && which < 3 ? g_bad[which] : 0; }

}  // extern "C"
