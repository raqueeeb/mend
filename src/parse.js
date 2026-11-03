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

/**
 * Strips a timestamp or a git prefix from a file label.
 *
 * `diff -u` writes a tab and a timestamp after the path; git writes `a/` and
 * `b/` prefixes. Neither is part of the name.
 *
 * @param {string} label the text after `--- ` or `+++ `
 * @returns {string} the path
 */
function stripLabel(label) {
  const path = label.split('\t')[0].trim();
  if (path === '/dev/null') return path;
  return path.replace(/^[ab]\//, '');
}

/**
 * Reads one hunk, starting at its header.
 *
 * @param {string[]} lines every line of the patch
 * @param {number} start the index of the header
 * @param {object} pending the file being built
 * @returns {number} the index of the first line after the hunk
 * @throws {ParseError} when the hunk is malformed
 */
function readHunk(lines, start, pending) {
  const header = lines[start];
  const match = header.match(HUNK);

  const oldStart = Number(match[1]);
  const oldLines = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newLines = match[4] === undefined ? 1 : Number(match[4]);

  const changes = [];
  let oldAt = oldStart;
  let newAt = newStart;
  let oldSeen = 0;
  let newSeen = 0;
  let at = start + 1;

  while (at < lines.length) {
    const line = lines[at];

    // Anything that starts the next file or hunk ends this one.
    if (HUNK.test(line) || line.startsWith('--- ') || line.startsWith('diff --git ')) break;
    if (line === '' && at === lines.length - 1) break;

    // The no-newline marker is read before the counts are checked, because
    // it arrives *after* the last line of the hunk: a hunk whose counts are
    // already met may still have this one line left to tell us about.
    if (line.startsWith(NO_NEWLINE.slice(0, 1))) {
      // `\ No newline at end of file` refers to whichever side the previous
      // line belonged to.
      const previous = changes[changes.length - 1];
      if (previous) {
        if (previous.operation !== Operation.INSERT) pending.oldEndsWithNewline = false;
        if (previous.operation !== Operation.DELETE) pending.newEndsWithNewline = false;
      }
      at++;
      continue;
    }

    // Now the counts may end it. Checked here rather than at the top so a
    // following context line that happens to start with a space is not
    // swallowed into this hunk.
    if (oldSeen >= oldLines && newSeen >= newLines) break;

    const sign = line[0];
    const text = line.slice(1);

    if (sign === ' ' || line === '') {
      // A completely empty line in a patch is a context line whose trailing
      // space an editor has eaten. Tolerated, because it is extremely
      // common and unambiguous.
      changes.push({
        operation: Operation.EQUAL, text: line === '' ? '' : text, oldLine: oldAt, newLine: newAt,
      });
      oldAt++;
      newAt++;
      oldSeen++;
      newSeen++;
    } else if (sign === '-') {
      changes.push({
        operation: Operation.DELETE, text, oldLine: oldAt, newLine: null,
      });
      oldAt++;
      oldSeen++;
    } else if (sign === '+') {
      changes.push({
        operation: Operation.INSERT, text, oldLine: null, newLine: newAt,
      });
      newAt++;
      newSeen++;
    } else {
      throw new ParseError(
        `a hunk line must begin with a space, '+', '-' or '\\', got '${sign}'`,
        { line: at + 1, text: line },
      );
    }

    at++;
  }

  if (oldSeen !== oldLines || newSeen !== newLines) {
    throw new ParseError(
      `hunk header says ${oldLines} old and ${newLines} new lines `
      + `but the hunk has ${oldSeen} and ${newSeen}`,
      { line: start + 1, text: header },
    );
  }

  pending.hunks.push(new Hunk({
    oldStart, oldLines, newStart, newLines, changes,
  }));

  return at;
}

/**
 * Reverses a diff, so applying it undoes what it describes.
 *
 * Every insertion becomes a deletion and the two sides swap everywhere: the
 * paths, the line numbers, the counts and the newline facts. Missing any one
 * of those produces a patch that applies and then fails to round-trip,
 * which is the sort of bug that is found much later.
 *
 * @param {Diff} diff the diff to reverse
 * @returns {Diff} the reversed diff
 */
export function reverse(diff) {
  const flip = {
    [Operation.EQUAL]: Operation.EQUAL,
    [Operation.INSERT]: Operation.DELETE,
    [Operation.DELETE]: Operation.INSERT,
  };

  return new Diff({
    oldTotal: diff.newTotal,
    newTotal: diff.oldTotal,
    hunks: diff.hunks.map((hunk) => new Hunk({
      oldStart: hunk.newStart,
      oldLines: hunk.newLines,
      newStart: hunk.oldStart,
      newLines: hunk.oldLines,
      changes: hunk.changes.map((change) => ({
        operation: flip[change.operation],
        text: change.text,
        oldLine: change.newLine,
        newLine: change.oldLine,
      })),
    })),
    oldPath: diff.newPath,
    newPath: diff.oldPath,
    oldEndsWithNewline: diff.newEndsWithNewline,
    newEndsWithNewline: diff.oldEndsWithNewline,
    crlf: diff.crlf,
    minimal: diff.minimal,
    distance: diff.distance,
  });
}
