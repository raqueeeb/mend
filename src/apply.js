/**
 * Applying a patch to text.
 *
 * A patch says "at line 40, these lines are there; replace them with these".
 * The file in front of it is rarely the file the patch was made against, so
 * line 40 is a hint rather than an address. Two mechanisms make a patch
 * apply anyway, and both are standard:
 *
 * **Offset search.** If the hunk's lines are not at line 40, look outwards
 * from there -- 41, 39, 42, 38 -- for a position where they all match. A
 * patch against a file that has had ten lines added at the top applies with
 * an offset of ten, which is what `patch` reports as "Hunk #1 succeeded at
 * 50 (offset 10 lines)".
 *
 * **Fuzz.** If nothing matches exactly, drop a line of context from each end
 * of the hunk and search again. Context is there to locate the hunk, not to
 * be changed, so a context line that no longer matches is often harmless.
 * Fuzz never drops a line the hunk *changes*, because that would change the
 * result rather than where it lands.
 *
 * A failure is a returned result, not an exception. A patch that does not
 * apply is an ordinary outcome and the caller needs the details: which hunk,
 * where it was looked for, and what was there instead.
 */

import { Operation } from './myers.js';
import { UsageError, requireText } from './errors.js';
import { endsWithNewline, join, lines as splitLines, usesCrlf } from './tokenize.js';

/** How many lines of context may be dropped before giving up. */
export const DEFAULT_FUZZ = 2;

/** How far either side of the stated line to look. */
export const DEFAULT_SEARCH = 200;

/** What happened to one hunk. */
export class HunkResult {
  /**
   * @param {object} fields the outcome
   */
  constructor(fields) {
    this.index = fields.index;
    this.applied = fields.applied;
    this.line = fields.line ?? null;
    this.offset = fields.offset ?? 0;
    this.fuzz = fields.fuzz ?? 0;
    this.reason = fields.reason ?? null;
    Object.freeze(this);
  }

  /** A line describing the outcome, in the style `patch` uses. */
  describe() {
    if (!this.applied) return `Hunk #${this.index + 1} failed: ${this.reason}`;

    const notes = [];
    if (this.offset !== 0) notes.push(`offset ${this.offset} line${abs(this.offset)}`);
    if (this.fuzz !== 0) notes.push(`fuzz ${this.fuzz}`);
    const suffix = notes.length > 0 ? ` (${notes.join(', ')})` : '';

    return `Hunk #${this.index + 1} applied at ${this.line}${suffix}`;
  }
}

function abs(count) {
  return Math.abs(count) === 1 ? '' : 's';
}

/** What happened to the whole patch. */
export class ApplyResult {
  /**
   * @param {object} fields the outcome
   */
  constructor(fields) {
    this.ok = fields.ok;
    this.text = fields.text;
    this.hunks = fields.hunks;
    Object.freeze(this);
  }

  /** How many hunks applied. */
  get appliedCount() {
    return this.hunks.filter((hunk) => hunk.applied).length;
  }

  /** How many hunks failed. */
  get failedCount() {
    return this.hunks.length - this.appliedCount;
  }

  /** A report, one line per hunk. */
  describe() {
    return this.hunks.map((hunk) => hunk.describe()).join('\n');
  }
}
