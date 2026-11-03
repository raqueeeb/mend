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
