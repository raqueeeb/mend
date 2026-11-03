/**
 * The public API.
 *
 * A diff and patch engine: compare two texts, write the difference as a
 * unified patch, read one back, apply it to a file that has since moved on,
 * and merge two sets of changes with their common ancestor.
 */

export { Edit, MAX_EDIT_DISTANCE, Operation, commonLength, diffSequences } from './myers.js';
export {
  Granularity, characters, endsWithNewline, join, lines, split, usesCrlf, words,
} from './tokenize.js';
export {
  DEFAULT_CONTEXT, Diff, Hunk, diffCharacters, diffText, diffWords,
} from './diff.js';
export {
  NO_NEWLINE, SIGN, formatContext, formatGitStyle, formatStat, formatUnified,
} from './unified.js';
export { parseOne, parsePatch, reverse } from './parse.js';
export {
  ApplyResult, DEFAULT_FUZZ, DEFAULT_SEARCH, HunkResult, applyPatch, canApply,
} from './apply.js';
export {
  MARKERS, MergeResult, Region, hasConflictMarkers, merge, mergeLines,
} from './merge.js';
export {
  inlineDiff, isRename, markInline, pairChanges, similarity,
} from './similarity.js';
export { MendError, ParseError, UsageError } from './errors.js';

import { applyPatch } from './apply.js';
import { diffText } from './diff.js';
import { formatUnified } from './unified.js';
import { parseOne } from './parse.js';

/** The library version. */
export const VERSION = '0.1.0';

/**
 * Diffs two texts and returns a unified patch.
 *
 * The one-call form, for when the intermediate diff object is not wanted.
 *
 * @param {string} before the old text
 * @param {string} after the new text
 * @param {object} [options] as for `diffText`
 * @returns {string} the patch, or `''` when the texts are the same
 */
export function createPatch(before, after, options = {}) {
  return formatUnified(diffText(before, after, options), options);
}

/**
 * Applies a patch given as text.
 *
 * @param {string} text the text to patch
 * @param {string} patchText the patch text
 * @param {object} [options] as for `applyPatch`
 * @returns {string|null} the patched text, or null when it did not apply
 */
export function patch(text, patchText, options = {}) {
  const result = applyPatch(text, parseOne(patchText), options);
  return result.ok ? result.text : null;
}

/**
 * Whether two texts are the same, ignoring what the options say to ignore.
 *
 * @param {string} before the first text
 * @param {string} after the second text
 * @param {object} [options] as for `diffText`
 * @returns {boolean} true when there is no difference
 */
export function same(before, after, options = {}) {
  return diffText(before, after, options).isEmpty;
}
