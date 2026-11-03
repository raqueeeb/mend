/**
 * Writing a unified diff.
 *
 * The format is older than most of the tools that read it and has no
 * specification, only `diff -u` and thirty years of consensus. The parts
 * that matter and are easy to get wrong:
 *
 * - A hunk header counts lines, not changes, and omits the count when it is
 *   exactly one. `@@ -1 +1 @@` and `@@ -1,1 +1,1 @@` mean the same thing but
 *   only the first is what tools emit.
 * - A line's first character is its operation, so every line of content is
 *   shifted one column right. A context line is a space followed by the
 *   text, which means a trailing space on an empty context line -- real, and
 *   the reason so many patches are broken by editors that strip it.
 * - A file with no final newline is marked by a `\ No newline at end of
 *   file` line after the content it refers to. Both sides can need one, and
 *   they are not interchangeable.
 */

import { Operation } from './myers.js';
import { UsageError } from './errors.js';

/** The marker a patch uses to say a file did not end with a newline. */
export const NO_NEWLINE = '\\ No newline at end of file';

/** The sign that introduces each kind of line. */
export const SIGN = {
  [Operation.EQUAL]: ' ',
  [Operation.INSERT]: '+',
  [Operation.DELETE]: '-',
};

/**
 * Formats a diff as a unified patch.
 *
 * @param {object} diff the diff, from `diffText`
 * @param {object} [options] how to format
 * @param {boolean} [options.headers] include the `---` and `+++` lines
 * @param {string} [options.oldLabel] what to call the old file
 * @param {string} [options.newLabel] what to call the new file
 * @returns {string} the patch, ending with a newline, or `''` for no changes
 */
export function formatUnified(diff, options = {}) {
  if (!diff || !Array.isArray(diff.hunks)) {
    throw new UsageError('formatUnified needs a diff with hunks');
  }
  if (diff.hunks.length === 0) return '';

  const out = [];
  const withHeaders = options.headers ?? true;

  if (withHeaders) {
    out.push(`--- ${options.oldLabel ?? diff.oldPath}`);
    out.push(`+++ ${options.newLabel ?? diff.newPath}`);
  }

  const last = diff.hunks[diff.hunks.length - 1];
  const marks = markerPositions(diff, last);

  diff.hunks.forEach((hunk, index) => {
    out.push(hunk.header);

    hunk.changes.forEach((change, position) => {
      out.push(`${SIGN[change.operation]}${change.text}`);

      // Each side gets its own marker, after its own last line. A line that
      // is on both sides gets one marker, because it is one line.
      if (index === diff.hunks.length - 1 && marks.has(position)) out.push(NO_NEWLINE);
    });
  });

  return `${out.join('\n')}\n`;
}

/**
 * Which lines of the final hunk a no-newline marker follows.
 *
 * A marker belongs after the last line of a file that does not end with a
 * newline -- which means a hunk changing the final line of two such files
 * carries *two* markers, one for the removed line and one for the added one.
 * Emitting only the last of them loses the old side's fact, and a patch that
 * has lost it reverses into one that adds or removes a byte nobody asked
 * about.
 *
 * A side whose final line is not in this hunk needs no marker: the patch
 * does not touch it.
 *
 * @param {object} diff the diff
 * @param {object} hunk the final hunk
 * @returns {Set<number>} positions within the hunk that a marker follows
 */
function markerPositions(diff, hunk) {
  const marks = new Set();
  if (!hunk) return marks;

  const reaches = (start, count, total) => (
    total === undefined || start + count - 1 >= total
  );

  const lastOnSide = (exclude) => {
    for (let at = hunk.changes.length - 1; at >= 0; at--) {
      if (hunk.changes[at].operation !== exclude) return at;
    }
    return -1;
  };

  if (!diff.oldEndsWithNewline && reaches(hunk.oldStart, hunk.oldLines, diff.oldTotal)) {
    const at = lastOnSide(Operation.INSERT);
    if (at !== -1) marks.add(at);
  }
  if (!diff.newEndsWithNewline && reaches(hunk.newStart, hunk.newLines, diff.newTotal)) {
    const at = lastOnSide(Operation.DELETE);
    if (at !== -1) marks.add(at);
  }

  return marks;
}
