/**
 * Diffing text, and grouping the result into hunks.
 *
 * The algorithm produces one run per change. A patch wants something
 * coarser: changes that are near each other belong in the same hunk, with a
 * few unchanged lines of context either side so that the hunk can be located
 * again in a file that has since moved on.
 *
 * The rule for "near each other" is the one every diff tool uses and none
 * explains: two changes go in the same hunk when the gap between them is at
 * most twice the context size. Twice, because at exactly that gap the
 * trailing context of the first change and the leading context of the second
 * meet, and splitting there would print the same lines twice.
 */

import { Operation, diffSequences } from './myers.js';
import { Granularity, endsWithNewline, keys, split, usesCrlf } from './tokenize.js';
import { UsageError, requireText } from './errors.js';

/** How many unchanged lines surround a change by default. */
export const DEFAULT_CONTEXT = 3;

/**
 * Appended to the comparison key of a final line that has no newline after
 * it.
 *
 * Whether a file ends with a newline is part of its content: `diff` reports
 * a difference between "a" and "a\n", and so does this. Since the lines
 * themselves are identical, the difference has to live in the comparison
 * key -- which is also why the key is kept separate from the text in the
 * first place. Two NULs and a word, because no line of text contains that.
 */
const NO_NEWLINE_KEY = '\u0000\u0000no-newline';

/**
 * The comparison keys for one side, marking an absent final newline.
 *
 * @param {string[]} tokens the lines
 * @param {boolean} trailing whether the text ended with a newline
 * @param {object} options what to ignore
 * @returns {string[]} the keys
 */
function comparisonKeys(tokens, trailing, options) {
  const folded = keys(tokens, options);
  if (trailing || folded.length === 0) return folded;

  // A copy, because `keys` hands back the tokens themselves when there is
  // nothing to fold, and those are the lines the diff will show.
  const marked = folded.slice();
  marked[marked.length - 1] += NO_NEWLINE_KEY;
  return marked;
}
