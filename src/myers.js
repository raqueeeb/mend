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
