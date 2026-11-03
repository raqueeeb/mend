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

/**
 * The shortest edit script between two sequences.
 *
 * @param {string[]} before the first sequence
 * @param {string[]} after the second sequence
 * @param {object} [options] how to compare
 * @param {string[]} [options.beforeKeys] comparison keys for `before`
 * @param {string[]} [options.afterKeys] comparison keys for `after`
 * @param {number} [options.maxDistance] the give-up distance
 * @returns {{edits: Edit[], distance: number, minimal: boolean}} the script
 * @throws {UsageError} when either input is not an array
 */
export function diffSequences(before, after, options = {}) {
  if (!Array.isArray(before)) throw new UsageError('before must be an array');
  if (!Array.isArray(after)) throw new UsageError('after must be an array');

  const beforeKeys = options.beforeKeys ?? before;
  const afterKeys = options.afterKeys ?? after;
  const maxDistance = options.maxDistance ?? MAX_EDIT_DISTANCE;

  // Stripping the common prefix and suffix first is not an optimisation so
  // much as the reason the algorithm is usable at all: an edit in the middle
  // of a large file leaves a tiny problem behind, and D is measured on what
  // is left.
  let head = 0;
  while (head < beforeKeys.length && head < afterKeys.length
         && beforeKeys[head] === afterKeys[head]) head++;

  let tail = 0;
  while (tail < beforeKeys.length - head && tail < afterKeys.length - head
         && beforeKeys[beforeKeys.length - 1 - tail] === afterKeys[afterKeys.length - 1 - tail]) {
    tail++;
  }

  const middleBefore = beforeKeys.slice(head, beforeKeys.length - tail);
  const middleAfter = afterKeys.slice(head, afterKeys.length - tail);

  const { moves, distance, minimal } = search(middleBefore, middleAfter, maxDistance);

  const edits = [];
  const push = (operation, oldFrom, oldTo, newFrom, newTo) => {
    // An inserted run can only come from the second sequence; everything
    // else is shown as the first sequence had it, which matters when the
    // two compared equal through a folded key rather than by being equal.
    const tokens = operation === Operation.INSERT
      ? after.slice(newFrom, newTo)
      : before.slice(oldFrom, oldTo);
    if (tokens.length === 0) return;

    const last = edits[edits.length - 1];
    if (last && last.operation === operation) {
      edits[edits.length - 1] = new Edit(
        operation,
        [...last.tokens, ...tokens],
        last.oldStart,
        last.newStart,
      );
      return;
    }
    edits.push(new Edit(operation, tokens, oldFrom, newFrom));
  };

  if (head > 0) push(Operation.EQUAL, 0, head, 0, head);

  for (const move of moves) {
    push(
      move.operation,
      move.oldFrom + head,
      move.oldTo + head,
      move.newFrom + head,
      move.newTo + head,
    );
  }

  if (tail > 0) {
    push(
      Operation.EQUAL,
      before.length - tail,
      before.length,
      after.length - tail,
      after.length,
    );
  }

  return { edits, distance, minimal };
}

/**
 * Myers' greedy forward search over the middle section.
 *
 * Returns moves in order, as half-open ranges over both sequences.
 *
 * @param {string[]} before the first sequence, already trimmed
 * @param {string[]} after the second sequence, already trimmed
 * @param {number} maxDistance where to give up
 * @returns {{moves: object[], distance: number, minimal: boolean}} the path
 */
function search(before, after, maxDistance) {
  const n = before.length;
  const m = after.length;

  if (n === 0 && m === 0) return { moves: [], distance: 0, minimal: true };
  if (n === 0) {
    return { moves: [insertion(0, 0, m)], distance: m, minimal: true };
  }
  if (m === 0) {
    return { moves: [deletion(0, 0, n)], distance: n, minimal: true };
  }

  const ceiling = Math.min(n + m, maxDistance);
  const offset = ceiling + 1;
  // One entry per diagonal k, from -ceiling to +ceiling. A plain array with
  // an offset beats a Map here by enough to be worth the arithmetic.
  const v = new Int32Array(2 * ceiling + 3).fill(-1);
  v[offset + 1] = 0;

  const trace = [];

  for (let d = 0; d <= ceiling; d++) {
    trace.push(Int32Array.prototype.slice.call(v));

    for (let k = -d; k <= d; k += 2) {
      // Of the two ways to arrive on this diagonal, take the one that has
      // got further: down from k+1, or right from k-1.
      const down = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]);
      let x = down ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;

      // Then slide along the diagonal for as long as the tokens match. These
      // moves are free, which is what makes the search cheap.
      while (x < n && y < m && before[x] === after[y]) {
        x++;
        y++;
      }

      v[offset + k] = x;

      if (x >= n && y >= m) {
        return { moves: backtrack(trace, n, m, offset), distance: d, minimal: true };
      }
    }
  }

  // The ceiling was reached. Fall back to the honest answer: the whole
  // middle was replaced. Correct, not minimal, and it terminates.
  const moves = [];
  if (n > 0) moves.push(deletion(0, 0, n));
  if (m > 0) moves.push(insertion(n, 0, m));
  return { moves, distance: n + m, minimal: false };
}
