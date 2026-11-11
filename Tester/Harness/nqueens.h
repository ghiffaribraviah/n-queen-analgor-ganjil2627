#pragma once
// What a solver can define, and the one call it can make. A solver is plain C++: it gets the problem as arguments
// and returns every solution. Define the functions for the cases you want to solve; the others can stay out.
//
// Coordinates are 0-based: row first, then column.
#include <string>
#include <utility>
#include <vector>

// Normal: N queens on an empty N x N board. solution[r] is the column of the queen in row r.
std::vector<std::vector<int>> solveNQueens(int n);

// Pre-placed: some queens are already on the board as (row, column) and must stay. Each solution lists all N rows.
std::vector<std::vector<int>> solvePreplaced(int n, const std::vector<std::pair<int, int>>& preplaced);

// Holes: grid[r][c] is '.' for a free cell or 'H' for a hole. No queen on a hole, but attacks pass through it.
// Each solution lists all N rows. A board without a solution is answered with an empty list.
std::vector<std::vector<int>> solveHoles(int n, const std::vector<std::string>& grid);

// Walled: grid[r][c] is '.' for a free cell or 'W' for a wall (drawn as a pawn). No queen on a wall, and attacks stop at it.
// Return every board that holds the largest possible number of queens, as lists of (row, column).
std::vector<std::vector<std::pair<int, int>>> solveWalled(int n, const std::vector<std::string>& grid);

// ---- Debugging -----------------------------------------------------------------------------------------------------
// snapshot() shows a board in the tester. It does nothing in a normal run, so it never changes the result or the time.
// In a Debug run every call is recorded (the first and the last ones are kept) and the time is not measured.
//
//   NQ_SNAPSHOT(queens, "label");   // the argument is only evaluated in a Debug run
//
// `queens` lists the queens as (row, column).
extern bool g_nq_debug;
inline bool snapshotsEnabled() { return g_nq_debug; }
void snapshot(const std::vector<std::pair<int, int>>& queens, const char* label = "");
inline void snapshot(const std::vector<std::pair<int, int>>& queens, const std::string& label) {
  snapshot(queens, label.c_str());  // so that a label can be built with std::to_string
}
#define NQ_SNAPSHOT(...)                      \
  do {                                        \
    if (snapshotsEnabled()) snapshot(__VA_ARGS__); \
  } while (0)

namespace nq {
// Helpers to build the argument of snapshot() from the usual representations.
inline std::vector<std::pair<int, int>> queensOf(const std::vector<int>& cols) {  // cols[r] = column of row r, -1 = none
  std::vector<std::pair<int, int>> queens;
  for (size_t r = 0; r < cols.size(); ++r)
    if (cols[r] >= 0) queens.emplace_back(static_cast<int>(r), cols[r]);
  return queens;
}
inline std::vector<std::pair<int, int>> queensOf(const std::vector<std::string>& grid) {  // cells holding 'Q'
  std::vector<std::pair<int, int>> queens;
  for (size_t r = 0; r < grid.size(); ++r)
    for (size_t c = 0; c < grid[r].size(); ++c)
      if (grid[r][c] == 'Q') queens.emplace_back(static_cast<int>(r), static_cast<int>(c));
  return queens;
}
}  // namespace nq
