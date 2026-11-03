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
