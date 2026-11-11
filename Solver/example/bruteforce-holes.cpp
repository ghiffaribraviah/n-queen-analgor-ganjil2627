// Example solver for the Holes case: some cells are holes. A queen cannot stand on a hole, but attacks pass straight
// through it. Brute force over permutations. Read bruteforce-normal.cpp first: it explains how a solver is written, and
// this file only explains what is different here.
//
// ---- The function --------------------------------------------------------------------------------------------------
//   solveHoles(n, grid)    grid[r][c] is '.' for a free cell and 'H' for a hole (row first, 0-based).
// Each solution is a std::vector<int> of N entries: solution[r] is the column of the queen in row r. A board without a
// solution is answered with an empty list, and that is a correct answer: holes can make N queens impossible.
//
// ---- The idea ------------------------------------------------------------------------------------------------------
// Attacks pass through holes, so a hole changes nothing about rows, columns and diagonals. N queens still need exactly
// one queen in every row and a column of their own, and a candidate is still an ordering of the columns. The only new
// rule is that no queen may stand on a hole. So every ordering is tested twice: is a queen on a hole, and do two queens
// share a diagonal?
#include <algorithm>  // std::next_permutation
#include <cstdlib>    // std::abs
#include <numeric>    // std::iota
#include <string>

#include "nqueens.h"

namespace {

// A Debug run records at most the first 200 and the last 800 snapshots, so only the first rejected ordering and then
// every REJECT_EVERY-th one is shown. Lower it to see more of them.
const long long REJECT_EVERY = 1000;

// Looks for two queens on one diagonal. Returns true and says which rows they are in, or returns false if there is none.
bool sharedDiagonal(const std::vector<int>& cols, int& rowA, int& rowB) {
  const int n = static_cast<int>(cols.size());
  for (int i = 0; i < n; ++i) {
    for (int j = i + 1; j < n; ++j) {
      if (std::abs(cols[i] - cols[j]) == j - i) {
        rowA = i;
        rowB = j;
        return true;
      }
    }
  }
  return false;
}

}  // namespace

std::vector<std::vector<int>> solveHoles(int n, const std::vector<std::string>& grid) {
  std::vector<std::vector<int>> solutions;

  std::vector<int> cols(n);
  std::iota(cols.begin(), cols.end(), 0);  // 0, 1, 2, ... n-1: the first ordering

  long long rejected = 0;  // orderings turned down, only counted in a Debug run
  // Decides whether a rejected ordering gets a snapshot: the first one, then every REJECT_EVERY-th.
  auto showThisRejection = [&]() { return snapshotsEnabled() && (++rejected == 1 || rejected % REJECT_EVERY == 0); };

  do {
    // 1. Is a queen on a hole? Rows are looked at in order, so this finds the first one.
    int holeRow = -1;
    for (int r = 0; r < n; ++r) {
      if (grid[r][cols[r]] == 'H') {
        holeRow = r;
        break;
      }
    }

    int rowA = 0, rowB = 0;
    if (holeRow >= 0) {
      if (showThisRejection()) {
        // Only the queens above the hole are drawn: a snapshot with a queen on a hole would be flagged as a mistake.
        std::vector<std::pair<int, int>> above;
        for (int r = 0; r < holeRow; ++r) above.emplace_back(r, cols[r]);
        snapshot(above, "rejected: (" + std::to_string(holeRow) + "," + std::to_string(cols[holeRow]) + ") is a hole");
      }
    } else if (sharedDiagonal(cols, rowA, rowB)) {  // 2. Do two queens share a diagonal?
      if (showThisRejection()) {
        snapshot(nq::queensOf(cols), "rejected: the queens in rows " + std::to_string(rowA) + " and " +
                                         std::to_string(rowB) + " share a diagonal");
      }
    } else {
      solutions.push_back(cols);
      NQ_SNAPSHOT(nq::queensOf(cols), "solution " + std::to_string(solutions.size()));
    }
  } while (std::next_permutation(cols.begin(), cols.end()));

  return solutions;
}
