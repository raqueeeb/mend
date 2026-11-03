/**
 * Reading a unified diff.
 *
 * Parsing a patch is mostly a matter of being strict about the parts that
 * carry meaning and forgiving about the parts that do not. The line counts
 * in a hunk header are load-bearing: if they disagree with the lines that
 * follow, the patch has been edited or truncated, and applying it would
 * corrupt the file silently. So the counts are checked.
 *
 * Everything before the first `---` is prose. Mail clients, review tools and
 * commit messages all put text there, and refusing to parse a patch because
 * it arrived in an email would make the parser useless.
 */

import { Operation } from './myers.js';
import { ParseError, requireText } from './errors.js';
import { Diff, Hunk } from './diff.js';
import { NO_NEWLINE } from './unified.js';

/** Matches a hunk header, with optional counts. */
const HUNK = /^@@+ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parses a unified diff into one {@link Diff} per file.
 *
 * @param {string} patch the patch text
 * @returns {Diff[]} one diff per file, in the order they appear
 * @throws {ParseError} when the patch is malformed
 */
export function parsePatch(patch) {
  requireText(patch, 'patch');

  const lines = patch.split('\n');
  const diffs = [];
  let at = 0;

  let pending = null;

  while (at < lines.length) {
    const line = lines[at];

    // A `diff --git` line starts a new file, and carries the paths in case
    // the `---` and `+++` lines are missing, which they are for a patch that
    // only changes a file's mode.
    const git = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (git) {
      if (pending) diffs.push(finish(pending));
      pending = blank(git[1], git[2]);
      at++;
      continue;
    }

    if (line.startsWith('--- ') && lines[at + 1]?.startsWith('+++ ')) {
      const oldPath = stripLabel(line.slice(4));
      const newPath = stripLabel(lines[at + 1].slice(4));

      if (pending && pending.hunks.length > 0) {
        diffs.push(finish(pending));
        pending = null;
      }
      pending = pending ?? blank(oldPath, newPath);
      pending.oldPath = oldPath;
      pending.newPath = newPath;
      at += 2;
      continue;
    }

    if (HUNK.test(line)) {
      if (!pending) pending = blank('a', 'b');
      const consumed = readHunk(lines, at, pending);
      at = consumed;
      continue;
    }

    at++;
  }

  if (pending) diffs.push(finish(pending));

  return diffs;
}

/**
 * Parses a patch that is known to describe exactly one file.
 *
 * @param {string} patch the patch text
 * @returns {Diff} the diff
 * @throws {ParseError} when the patch holds no diff, or more than one
 */
export function parseOne(patch) {
  const diffs = parsePatch(patch);
  if (diffs.length === 0) throw new ParseError('the patch contains no hunks');
  if (diffs.length > 1) {
    throw new ParseError(`the patch describes ${diffs.length} files, expected one`);
  }
  return diffs[0];
}

function blank(oldPath, newPath) {
  return {
    oldPath,
    newPath,
    hunks: [],
    oldEndsWithNewline: true,
    newEndsWithNewline: true,
  };
}

function finish(pending) {
  const last = pending.hunks[pending.hunks.length - 1];

  return new Diff({
    // A patch says nothing about how long the files are, only where its
    // hunks sit. Taking the end of the last hunk as the end of the file is
    // right for the only thing the totals are used for: deciding that the
    // no-newline markers this patch already carries belong where they are.
    oldTotal: last ? last.oldStart + last.oldLines - 1 : 0,
    newTotal: last ? last.newStart + last.newLines - 1 : 0,
    hunks: pending.hunks,
    oldPath: pending.oldPath,
    newPath: pending.newPath,
    oldEndsWithNewline: pending.oldEndsWithNewline,
    newEndsWithNewline: pending.newEndsWithNewline,
    crlf: false,
    minimal: true,
    distance: pending.hunks.reduce((total, hunk) => total + hunk.changedLines, 0),
  });
}
