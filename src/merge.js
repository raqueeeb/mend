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

/**
 * Merges three arrays of lines into regions.
 *
 * @param {string[]} base the ancestor's lines
 * @param {string[]} ours one side's lines
 * @param {string[]} theirs the other side's lines
 * @returns {Region[]} the regions, in order
 */
export function mergeLines(base, ours, theirs) {
  const ourChanges = changeMap(base, ours);
  const theirChanges = changeMap(base, theirs);

  const regions = [];
  let at = 0;
  let pendingAgreed = [];

  const flush = () => {
    if (pendingAgreed.length > 0) {
      regions.push(new Region({ conflict: false, lines: pendingAgreed }));
      pendingAgreed = [];
    }
  };

  while (at <= base.length) {
    const ourEdit = ourChanges.get(at);
    const theirEdit = theirChanges.get(at);

    if (!ourEdit && !theirEdit) {
      if (at < base.length) pendingAgreed.push(base[at]);
      at++;
      continue;
    }

    // One or both sides changed the region starting here. Take the widest
    // span either side touches, so a conflict covers the whole overlap
    // rather than being split at an arbitrary line.
    const span = Math.max(ourEdit?.length ?? 0, theirEdit?.length ?? 0);
    const baseSlice = base.slice(at, at + span);

    const ourText = sideText(ourChanges, at, span, base);
    const theirText = sideText(theirChanges, at, span, base);

    const oursChanged = !same(ourText, baseSlice);
    const theirsChanged = !same(theirText, baseSlice);

    if (oursChanged && theirsChanged && !same(ourText, theirText)) {
      flush();
      regions.push(new Region({
        conflict: true, ours: ourText, base: baseSlice, theirs: theirText,
      }));
    } else if (oursChanged) {
      pendingAgreed.push(...ourText);
    } else if (theirsChanged) {
      pendingAgreed.push(...theirText);
    } else {
      // Both sides made the same change, which is agreement, not a conflict.
      pendingAgreed.push(...ourText);
    }

    if (span === 0) {
      // A pure insertion consumes no base line, so the cursor must not move
      // -- moving it would skip the base line the insertion sits in front
      // of. The entries are cleared instead, and the next pass reads that
      // base line normally rather than looping here for ever.
      ourChanges.delete(at);
      theirChanges.delete(at);
      continue;
    }

    at += span;
  }

  flush();
  return regions;
}

/**
 * Where one side changed the base, keyed by the base line it starts at.
 *
 * A deletion or a replacement is recorded with the number of base lines it
 * covers; a pure insertion covers none, which is why `length` can be zero
 * and why the merge has to handle a zero-length span without looping.
 *
 * @param {string[]} base the ancestor's lines
 * @param {string[]} side one side's lines
 * @returns {Map<number, object>} the changes
 */
function changeMap(base, side) {
  const { edits } = diffSequences(base, side);
  const changes = new Map();

  let baseAt = 0;
  let pending = null;

  for (const edit of edits) {
    if (edit.operation === Operation.EQUAL) {
      if (pending) {
        changes.set(pending.at, pending);
        pending = null;
      }
      baseAt += edit.length;
      continue;
    }

    pending = pending ?? { at: baseAt, length: 0, lines: [] };

    if (edit.operation === Operation.DELETE) {
      pending.length += edit.length;
      baseAt += edit.length;
    } else {
      pending.lines.push(...edit.tokens);
    }
  }

  if (pending) changes.set(pending.at, pending);

  return changes;
}
