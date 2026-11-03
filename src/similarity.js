/**
 * How alike two texts are, and where exactly they differ.
 *
 * Two uses, both of which fall out of the diff rather than needing their own
 * algorithm. A similarity ratio answers "is this the same file, renamed?" --
 * which is how rename detection works in a version control system. An inline
 * diff answers "which words in this line changed?" -- which is what turns a
 * pair of `-`/`+` lines into something a reader can scan.
 */

import { Operation, commonLength, diffSequences } from './myers.js';
import { Granularity, split } from './tokenize.js';
import { requireText } from './errors.js';

/**
 * How similar two texts are, from 0 to 1.
 *
 * The measure is twice the common subsequence over the total length, which
 * is the ratio `difflib` uses and the one rename detection is tuned against.
 * Two identical texts are 1, two texts with nothing in common are 0, and the
 * threshold where a file counts as "the same file, edited" is conventionally
 * around 0.5.
 *
 * @param {string} before the first text
 * @param {string} after the second text
 * @param {object} [options] how to compare
 * @param {string} [options.granularity] line, word or character
 * @returns {number} the ratio, between 0 and 1
 */
export function similarity(before, after, options = {}) {
  requireText(before, 'before');
  requireText(after, 'after');

  const granularity = options.granularity ?? Granularity.LINE;
  const left = split(before, granularity);
  const right = split(after, granularity);

  const total = left.length + right.length;
  // Two empty texts are identical, and dividing by zero would say otherwise.
  if (total === 0) return 1;

  return (2 * commonLength(left, right)) / total;
}

/**
 * Whether two texts are similar enough to be the same file, edited.
 *
 * @param {string} before the first text
 * @param {string} after the second text
 * @param {number} [threshold] how similar they must be
 * @returns {boolean} true when the ratio meets the threshold
 */
export function isRename(before, after, threshold = 0.5) {
  return similarity(before, after) >= threshold;
}

/**
 * The word-level difference between two single lines.
 *
 * Returns runs over both lines, which a renderer turns into highlighting.
 * Word granularity rather than character, because a character diff of two
 * lines of prose produces a speckle of single letters that is harder to read
 * than the two lines were.
 *
 * @param {string} before the old line
 * @param {string} after the new line
 * @returns {object[]} the runs, in order
 */
export function inlineDiff(before, after) {
  requireText(before, 'before');
  requireText(after, 'after');

  return diffSequences(
    split(before, Granularity.WORD),
    split(after, Granularity.WORD),
  ).edits;
}

/**
 * Renders an inline diff with markers around what changed.
 *
 * Two strings come back, one per side, each with only its own changes
 * marked: the old line marks what was removed and the new line marks what
 * was added. Showing both sets on both lines is a common mistake and makes
 * each line unreadable as a line.
 *
 * @param {string} before the old line
 * @param {string} after the new line
 * @param {object} [options] the markers to use
 * @param {string} [options.open] what opens a changed run
 * @param {string} [options.close] what closes it
 * @returns {{before: string, after: string}} the two marked lines
 */
export function markInline(before, after, options = {}) {
  const open = options.open ?? '[';
  const close = options.close ?? ']';
  const edits = inlineDiff(before, after);

  const left = [];
  const right = [];

  for (const edit of edits) {
    const text = edit.tokens.join('');
    if (edit.operation === Operation.EQUAL) {
      left.push(text);
      right.push(text);
    } else if (edit.operation === Operation.DELETE) {
      left.push(`${open}${text}${close}`);
    } else {
      right.push(`${open}${text}${close}`);
    }
  }

  return { before: left.join(''), after: right.join('') };
}
