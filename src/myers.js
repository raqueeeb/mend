/**
 * The diff algorithm itself: Myers, 1986.
 *
 * The problem is to find the shortest edit script turning one sequence into
 * another. Phrased as a graph, it is a shortest path through an edit grid
 * where moving right deletes, moving down inserts, and moving diagonally
 * matches for free. The naive search is exponential; dynamic programming
 * over the whole grid is O(NM) in time and space, which for two
 * ten-thousand-line files is a hundred million cells.
 *
 * Myers' insight is to search by edit distance instead of by position. For
 * each distance D, record only the furthest point reachable on each diagonal
 * -- one number per diagonal, and only 2D+1 diagonals are reachable at
 * distance D. The first D that reaches the far corner is the answer, so the
 * cost is O((N+M)D): proportional to how *different* the inputs are rather
 * than to how long they are. Two nearly identical files are nearly free,
 * which is the case that actually happens.
 *
 * The trade is that two completely different files cost O((N+M)^2), so there
 * is a ceiling here, past which the result is still correct but no longer
 * minimal. See {@link MAX_EDIT_DISTANCE}.
 */

import { UsageError } from './errors.js';

/** What an edit does. */
export const Operation = {
  EQUAL: 'equal',
  INSERT: 'insert',
  DELETE: 'delete',
};

/**
 * The distance past which the search gives up on being minimal.
 *
 * Myers is O((N+M)D), which is a bargain when D is small and quadratic when
 * it is not. Two files with nothing in common hit the worst case, and a diff
 * tool that hangs on them is worse than one that says "these are different".
 * Past this distance the result is a correct edit script but not the
 * shortest one, and `diff()` reports that it gave up.
 */
export const MAX_EDIT_DISTANCE = 4000;

/**
 * One run of edits of the same kind.
 *
 * Runs rather than individual edits, because every consumer -- hunk
 * grouping, unified output, apply -- works in runs, and producing them here
 * means nobody downstream has to coalesce.
 */
export class Edit {
  /**
   * @param {string} operation one of {@link Operation}
   * @param {string[]} tokens the tokens this run covers
   * @param {number} oldStart where it starts in the first sequence
   * @param {number} newStart where it starts in the second
   */
  constructor(operation, tokens, oldStart, newStart) {
    this.operation = operation;
    this.tokens = tokens;
    this.oldStart = oldStart;
    this.newStart = newStart;
    Object.freeze(this);
  }

  /** How many tokens this run covers. */
  get length() {
    return this.tokens.length;
  }

  /** Whether this run is unchanged text. */
  get isEqual() {
    return this.operation === Operation.EQUAL;
  }

  toString() {
    const sign = { equal: ' ', insert: '+', delete: '-' }[this.operation];
    return `${sign}${this.length}@${this.oldStart},${this.newStart}`;
  }
}
