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

/** One group of nearby changes, with its context. */
export class Hunk {
  /**
   * @param {object} fields the hunk's parts
   * @param {number} fields.oldStart the one-based first line in the old file
   * @param {number} fields.oldLines how many old lines it covers
   * @param {number} fields.newStart the one-based first line in the new file
   * @param {number} fields.newLines how many new lines it covers
   * @param {object[]} fields.changes the lines, each with an operation
   */
  constructor(fields) {
    this.oldStart = fields.oldStart;
    this.oldLines = fields.oldLines;
    this.newStart = fields.newStart;
    this.newLines = fields.newLines;
    this.changes = fields.changes;
    Object.freeze(this);
  }

  /** The `@@ -a,b +c,d @@` header, without a trailing newline. */
  get header() {
    return `@@ -${range(this.oldStart, this.oldLines)} +${range(this.newStart, this.newLines)} @@`;
  }

  /** How many lines in this hunk are changes rather than context. */
  get changedLines() {
    return this.changes.filter((change) => change.operation !== Operation.EQUAL).length;
  }

  toString() {
    return this.header;
  }
}

function range(start, count) {
  // A zero-length range is written with the line *before* it, which is how
  // every unified diff in the world does it and is why a pure insertion
  // reads as `-0,0` only when the file was empty.
  return count === 1 ? String(start) : `${start},${count}`;
}

/**
 * The result of diffing two texts.
 *
 * Carries the facts the patch format needs and that are easy to lose: how
 * each side ended, and whether the algorithm found a minimal answer.
 */
export class Diff {
  /**
   * @param {object} fields the diff's parts
   */
  constructor(fields) {
    this.hunks = fields.hunks;
    this.oldPath = fields.oldPath;
    this.newPath = fields.newPath;
    this.oldEndsWithNewline = fields.oldEndsWithNewline;
    this.newEndsWithNewline = fields.newEndsWithNewline;
    // How many lines each side has in total. Only the no-newline marker
    // needs them, and it needs them badly: the marker belongs after the last
    // line of a file, and a hunk cannot tell on its own whether it reaches
    // that far.
    this.oldTotal = fields.oldTotal;
    this.newTotal = fields.newTotal;
    this.crlf = fields.crlf;
    this.minimal = fields.minimal;
    this.distance = fields.distance;
    Object.freeze(this);
  }

  /** Whether the two texts were the same. */
  get isEmpty() {
    return this.hunks.length === 0;
  }

  /** How many lines were added. */
  get added() {
    return this.count(Operation.INSERT);
  }

  /** How many lines were removed. */
  get removed() {
    return this.count(Operation.DELETE);
  }

  /**
   * How many lines carry a given operation.
   *
   * @param {string} operation one of {@link Operation}
   * @returns {number} the count
   */
  count(operation) {
    return this.hunks.reduce(
      (total, hunk) => total + hunk.changes.filter((c) => c.operation === operation).length,
      0,
    );
  }

  /** A one-line summary, as a commit message footer might show it. */
  get summary() {
    if (this.isEmpty) return 'no changes';
    const parts = [];
    if (this.added > 0) parts.push(`+${this.added}`);
    if (this.removed > 0) parts.push(`-${this.removed}`);
    const where = this.hunks.length === 1 ? '1 hunk' : `${this.hunks.length} hunks`;
    return `${parts.join(' ')} in ${where}`;
  }
}
