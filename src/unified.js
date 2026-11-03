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
