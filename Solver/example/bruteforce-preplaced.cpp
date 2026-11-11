// Example solver for the Pre-placed case: some queens are already on the board and every solution must keep them.
// Brute force over permutations. Read bruteforce-normal.cpp first: it explains how a solver is written, and this file
// only explains what is different here.
//
// ---- The function --------------------------------------------------------------------------------------------------
//   solvePreplaced(n, preplaced)    preplaced lists the locked queens as (row, column), 0-based.
// Each solution is a std::vector<int> of N entries, one per row, and it includes the locked queens: solution[r] is the
// column of the queen in row r, and in a row with a locked queen it is that queen's column.
//
// ---- The idea ------------------------------------------------------------------------------------------------------
// As in the Normal case, a candidate is an ordering of the columns, and only the diagonals are left to check. The locked
// queens already fix some rows and use up some columns, so only the other rows and columns are shuffled: the free
// columns are permuted over the free rows, and the locked queens are copied into every candidate. With P locked queens
// that is (N - P)! candidates.
#include <algorithm>  // std::next_permutation
#include <cstdlib>    // std::abs
#include <string>

#include "nqueens.h"

namespace {

// A Debug run records at most the first 200 and the last 800 snapshots, so only the first rejected candidate and then
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

std::vector<std::vector<int>> solvePreplaced(int n, const std::vector<std::pair<int, int>>& preplaced) {
  std::vector<std::vector<int>> solutions;

  // fixedCol[r] is the column of the locked queen in row r, or -1 when the row is free.
  std::vector<int> fixedCol(n, -1);
  std::vector<char> columnTaken(n, 0);
  for (const auto& queen : preplaced) {
    fixedCol[queen.first] = queen.second;
    columnTaken[queen.second] = 1;
  }

  std::vector<int> freeRows, freeCols;  // the rows without a locked queen, and the columns no locked queen uses
  for (int i = 0; i < n; ++i) {
    if (fixedCol[i] < 0) freeRows.push_back(i);
    if (!columnTaken[i]) freeCols.push_back(i);  // collected in increasing order, which next_permutation needs
  }
  if (freeRows.size() != freeCols.size()) return solutions;  // two locked queens in one row or column: no solution

  std::vector<int> cols = fixedCol;  // the candidate: the locked queens, plus the free columns once they are placed
  long long rejected = 0;            // candidates turned down, only counted in a Debug run
  do {
    for (size_t i = 0; i < freeRows.size(); ++i) cols[freeRows[i]] = freeCols[i];

    int rowA = 0, rowB = 0;
    if (!sharedDiagonal(cols, rowA, rowB)) {
      solutions.push_back(cols);
      // The locked queens are part of cols, so they are on every snapshot.
      NQ_SNAPSHOT(nq::queensOf(cols), "solution " + std::to_string(solutions.size()));
    } else if (snapshotsEnabled() && (++rejected == 1 || rejected % REJECT_EVERY == 0)) {
      // Written out instead of NQ_SNAPSHOT so that a normal run does not even count the rejected candidates.
      snapshot(nq::queensOf(cols), "rejected: the queens in rows " + std::to_string(rowA) + " and " +
                                       std::to_string(rowB) + " share a diagonal");
    }
  } while (std::next_permutation(freeCols.begin(), freeCols.end()));

  return solutions;
}
