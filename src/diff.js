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
