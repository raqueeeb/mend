/**
 * Three-way merge.
 *
 * Two people changed the same file. A two-way diff cannot tell which version
 * is the change and which is the original, so it has to treat every
 * difference as a conflict. With the common ancestor in hand the question
 * becomes answerable: a region that only one side touched takes that side's
 * version, and only a region both sides changed *differently* is a conflict.
 *
 * The implementation diffs each side against the base, then walks all three
 * in step. The subtlety is that a conflict is not decided line by line --
 * two sides inserting the same line in the same place agree, and two sides
 * rewriting the same five lines conflict as one region of five lines rather
 * than as five separate conflicts. So changed regions are collected first
 * and compared as regions.
 */

import { Operation, diffSequences } from './myers.js';
import { endsWithNewline, join, lines as splitLines, usesCrlf } from './tokenize.js';
import { requireText } from './errors.js';

/** The default conflict markers, as git writes them. */
export const MARKERS = {
  ours: '<<<<<<<',
  base: '|||||||',
  theirs: '>>>>>>>',
  divider: '=======',
};
