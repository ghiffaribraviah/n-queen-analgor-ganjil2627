// Example solver for the Walled case: some cells hold walls, and the goal is to place as many queens as possible.
// Brute force over every way to place queens. Read bruteforce-normal.cpp first: it explains how a solver is written, and
// this file only explains what is different here.
//
// ---- The function --------------------------------------------------------------------------------------------------
//   solveWalled(n, grid)    grid[r][c] is '.' for a free cell and 'W' for a wall (row first, 0-based). The tester
//                           draws a wall as a pawn.
// Return EVERY board that holds the largest possible number of queens, each as a list of (row, column). The queens of a
// board can be listed in any order. Boards with fewer queens than the best one you return are ignored.
//
// ---- The rules -----------------------------------------------------------------------------------------------------
// * A queen cannot stand on a wall, and walls never attack.
// * Two queens attack each other when they share a row, a column or a diagonal AND no wall stands on a cell between
//   them. So a wall blocks an attack only if it lies exactly on the line between the two queens.
// * Unlike the other cases, a row may hold any number of queens (or none), because a wall splits it into separate
//   stretches. That is why a solution is a list of positions and not one column per row.
//
// ---- The idea ------------------------------------------------------------------------------------------------------
// Go through the cells in order, row by row. For each free cell there are two choices: put a queen there, if no queen
// already placed attacks that cell, or leave it empty. Every way to fill the board is reached exactly once. When all
// cells are decided the board is complete, and it is kept if it holds as many queens as the best board so far (or more,
// in which case the boards kept before it are dropped).
//
// It is slow: the number of ways grows very fast with N, so a big board can run past the cutoff and end as Failed.
#include <cstdlib>  // std::abs
#include <string>

#include "nqueens.h"

namespace {

using Board = std::vector<std::pair<int, int>>;  // queens as (row, column)

// A Debug run records at most the first 200 and the last 800 snapshots, so only the first refused queen and then every
// REJECT_EVERY-th one is shown. Lower it to see more of them.
const long long REJECT_EVERY = 1000;

class Search {
 public:
  Search(int n, const std::vector<std::string>& grid) : n_(n), grid_(grid) {}

  std::vector<Board> run() {
    decide(0);
    return std::move(best_);
  }

 private:
  const int n_;
  const std::vector<std::string>& grid_;
  Board queens_;               // the queens placed so far, in the order of the cells
  std::vector<Board> best_;    // every board found so far with the most queens
  size_t bestSize_ = 0;        // how many queens those boards hold
  long long refused_ = 0;      // queens turned down, only counted in a Debug run

  static int sign(int x) { return (x > 0) - (x < 0); }

  // Do queens on (r1, c1) and (r2, c2) attack each other?
  bool attacks(int r1, int c1, int r2, int c2) const {
    const bool sameLine = r1 == r2 || c1 == c2 || std::abs(r1 - r2) == std::abs(c1 - c2);
    if (!sameLine) return false;
    // Walk from one queen towards the other, one cell at a time. A wall on the way blocks the attack.
    const int dr = sign(r2 - r1), dc = sign(c2 - c1);
    for (int r = r1 + dr, c = c1 + dc; r != r2 || c != c2; r += dr, c += dc) {
      if (grid_[r][c] == 'W') return false;
    }
    return true;
  }

  // Decides cell number `cell` (row * n + column) and, one after another, all the cells after it.
  void decide(int cell) {
    if (cell == n_ * n_) {
      finished();
      return;
    }
    const int r = cell / n_, c = cell % n_;

    if (grid_[r][c] != 'W') {
      // Choice 1: a queen here, unless one that is already on the board attacks this cell.
      const Board::value_type* attacker = nullptr;
      for (const auto& queen : queens_) {
        if (attacks(queen.first, queen.second, r, c)) {
          attacker = &queen;
          break;
        }
      }
      if (!attacker) {
        queens_.emplace_back(r, c);
        decide(cell + 1);
        queens_.pop_back();  // take the queen away again before trying the other choice
      } else if (snapshotsEnabled() && (++refused_ == 1 || refused_ % REJECT_EVERY == 0)) {
        // The queen that was turned down is drawn too, so that it and the queen that attacks it show in the conflict colour.
        Board shown = queens_;
        shown.emplace_back(r, c);
        snapshot(shown, "refused: (" + std::to_string(r) + "," + std::to_string(c) + ") is attacked by (" +
                            std::to_string(attacker->first) + "," + std::to_string(attacker->second) + ")");
      }
    }
    // Choice 2: no queen on this cell.
    decide(cell + 1);
  }

  // Every cell is decided: keep the board if it is among the best.
  void finished() {
    if (queens_.size() > bestSize_) {
      best_.clear();  // a better board makes all the ones kept before it worse than the best
      bestSize_ = queens_.size();
      best_.push_back(queens_);
      NQ_SNAPSHOT(queens_, "new record: " + std::to_string(bestSize_) + " queens");
    } else if (queens_.size() == bestSize_) {
      best_.push_back(queens_);
      NQ_SNAPSHOT(queens_, "another board with " + std::to_string(bestSize_) + " queens");
    }
  }
};

}  // namespace

std::vector<std::vector<std::pair<int, int>>> solveWalled(int n, const std::vector<std::string>& grid) {
  return Search(n, grid).run();
}
