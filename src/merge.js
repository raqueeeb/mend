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

/** One region of a merge: agreed text, or a conflict. */
export class Region {
  /**
   * @param {object} fields the region
   */
  constructor(fields) {
    this.conflict = fields.conflict;
    this.lines = fields.lines ?? [];
    this.ours = fields.ours ?? [];
    this.base = fields.base ?? [];
    this.theirs = fields.theirs ?? [];
    Object.freeze(this);
  }
}

/** The outcome of a merge. */
export class MergeResult {
  /**
   * @param {object} fields the outcome
   */
  constructor(fields) {
    this.regions = fields.regions;
    this.text = fields.text;
    Object.freeze(this);
  }

  /** Whether anything conflicted. */
  get clean() {
    return this.regions.every((region) => !region.conflict);
  }

  /** How many regions conflicted. */
  get conflictCount() {
    return this.regions.filter((region) => region.conflict).length;
  }
}

/**
 * Merges two changed versions of a file using their common ancestor.
 *
 * @param {string} base the common ancestor
 * @param {string} ours one side's version
 * @param {string} theirs the other side's version
 * @param {object} [options] how to present conflicts
 * @param {string} [options.ourLabel] what to call our side
 * @param {string} [options.theirLabel] what to call their side
 * @param {boolean} [options.diff3] include the base inside a conflict
 * @returns {MergeResult} the merged text, with markers where it conflicted
 */
export function merge(base, ours, theirs, options = {}) {
  requireText(base, 'base');
  requireText(ours, 'ours');
  requireText(theirs, 'theirs');

  const baseLines = splitLines(base);
  const regions = mergeLines(baseLines, splitLines(ours), splitLines(theirs));

  const out = [];
  for (const region of regions) {
    if (!region.conflict) {
      out.push(...region.lines);
      continue;
    }

    out.push(`${MARKERS.ours} ${options.ourLabel ?? 'ours'}`);
    out.push(...region.ours);
    if (options.diff3) {
      out.push(`${MARKERS.base} base`);
      out.push(...region.base);
    }
    out.push(MARKERS.divider);
    out.push(...region.theirs);
    out.push(`${MARKERS.theirs} ${options.theirLabel ?? 'theirs'}`);
  }

  const trailing = endsWithNewline(ours) || endsWithNewline(theirs) || endsWithNewline(base);
  const crlf = usesCrlf(base) || usesCrlf(ours) || usesCrlf(theirs);

  return new MergeResult({ regions, text: join(out, trailing, crlf) });
}
