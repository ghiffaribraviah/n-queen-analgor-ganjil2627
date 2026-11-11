// Example solver for the Normal case: N queens on an empty N x N board, found by brute force over permutations.
// Read this file first: the other examples work the same way and only explain what differs.
//
// ---- How a solver is written ---------------------------------------------------------------------------------------
// * A solver is this one file. There is no main(). Include "nqueens.h" and define the function of the case you solve;
//   here that is solveNQueens. The tester compiles the file to WebAssembly, calls your function and checks the result.
// * The function gets the problem as its arguments and returns EVERY solution, like any N-Queens exercise.
// * A solution is a std::vector<int> with N entries: solution[r] is the column of the queen in row r. Rows and
//   columns are 0-based. Return each solution once; returning none at all is how you say "no solution".
// * Globals and statics are fine: every run starts in a fresh instance. Exceptions are not enabled.
// * Your function runs several times in a Run, and only the first result is checked, so it must give the same answer
//   every time.
// * snapshot() shows a board in the tester while you search. It does nothing in a normal run, so it costs nothing and
//   never changes the result or the time. Turn on "Debug run" in the app to record the snapshots and replay them.
//
// ---- The idea ------------------------------------------------------------------------------------------------------
// N queens on N rows need exactly one queen in each row, and no two of them may share a column. So a candidate is an
// ordering (a permutation) of the columns 0..N-1: cols[r] is the column of the queen in row r. Rows and columns are then
// fine by construction, and only the diagonals are left to check. Queens in rows i and j share a diagonal exactly when
// |cols[i] - cols[j]| == j - i.
//
// This solver builds every one of the N! orderings, one after the other, and keeps those without a shared diagonal.
// It is correct but slow: 12! is 479 million orderings, so a big board can run past the cutoff and end as Failed.
#include <algorithm>  // std::next_permutation
#include <cstdlib>    // std::abs
#include <numeric>    // std::iota
#include <string>

#include "nqueens.h"

namespace {  // names in here belong to this file only

// A Debug run records at most the first 200 and the last 800 snapshots, and there are far too many rejected orderings
// to show them all. So only the first one and then every REJECT_EVERY-th one is shown. Lower it to see more of them.
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

std::vector<std::vector<int>> solveNQueens(int n) {
  std::vector<std::vector<int>> solutions;

  std::vector<int> cols(n);
  std::iota(cols.begin(), cols.end(), 0);  // 0, 1, 2, ... n-1: the first ordering

  long long rejected = 0;  // orderings turned down, only counted in a Debug run
  do {
    int rowA = 0, rowB = 0;
    if (!sharedDiagonal(cols, rowA, rowB)) {
      solutions.push_back(cols);
      // nq::queensOf turns cols (one column per row) into the list of (row, column) that snapshot() takes.
      NQ_SNAPSHOT(nq::queensOf(cols), "solution " + std::to_string(solutions.size()));
    } else if (snapshotsEnabled() && (++rejected == 1 || rejected % REJECT_EVERY == 0)) {
      // NQ_SNAPSHOT(...) is just "if (snapshotsEnabled()) snapshot(...)". It is written out here so that a normal run
      // does not even count the rejected orderings. The two queens that clash are drawn in the conflict colour.
      snapshot(nq::queensOf(cols), "rejected: the queens in rows " + std::to_string(rowA) + " and " +
                                       std::to_string(rowB) + " share a diagonal");
    }
  } while (std::next_permutation(cols.begin(), cols.end()));  // the next ordering, false after the last one

  return solutions;
}
