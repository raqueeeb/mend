/**
 * Shared test helpers.
 *
 * Nearly every test here is about multi-line text, and writing that inline
 * with `\n` between every line makes the expectation harder to read than the
 * code it checks. `L` builds it from arguments instead.
 */

import assert from 'node:assert/strict';

import { Operation } from '../src/myers.js';

/**
 * Builds text from lines, with a trailing newline.
 *
 * @param {...string} input the lines
 * @returns {string} the text
 */
export function L(...input) {
  return input.length === 0 ? '' : `${input.join('\n')}\n`;
}

/**
 * Builds text from lines, with no trailing newline.
 *
 * @param {...string} input the lines
 * @returns {string} the text
 */
export function N(...input) {
  return input.join('\n');
}

/**
 * Asserts that `fn` throws an instance of `type`, and returns the error.
 *
 * @param {Function} fn the body to run
 * @param {Function} type the constructor expected
 * @returns {Error} the thrown error, for further assertions
 */
export function throwsWith(fn, type) {
  let thrown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown !== undefined, `expected ${type.name} but nothing was thrown`);
  assert.ok(
    thrown instanceof type,
    `expected ${type.name} but got ${thrown.constructor.name}: ${thrown.message}`,
  );
  return thrown;
}

/**
 * Renders an edit script compactly, for an assertion that reads at a glance.
 *
 * `' ab|-c|+d'` is three runs: two tokens kept, one removed, one added.
 *
 * @param {object[]} edits the runs
 * @returns {string} the rendering
 */
export function render(edits) {
  const sign = { [Operation.EQUAL]: ' ', [Operation.INSERT]: '+', [Operation.DELETE]: '-' };
  return edits.map((edit) => `${sign[edit.operation]}${edit.tokens.join('')}`).join('|');
}

/**
 * Applies an edit script forwards, which must rebuild the second sequence.
 *
 * @param {object[]} edits the runs
 * @returns {string[]} the tokens of the second sequence
 */
export function forwards(edits) {
  return edits
    .filter((edit) => edit.operation !== Operation.DELETE)
    .flatMap((edit) => edit.tokens);
}

/**
 * Applies an edit script backwards, which must rebuild the first sequence.
 *
 * @param {object[]} edits the runs
 * @returns {string[]} the tokens of the first sequence
 */
export function backwards(edits) {
  return edits
    .filter((edit) => edit.operation !== Operation.INSERT)
    .flatMap((edit) => edit.tokens);
}

/**
 * A small deterministic random generator.
 *
 * Deterministic because a property test that fails once in fifty runs and
 * cannot be reproduced is worse than no test at all.
 *
 * @param {number} [seed] the starting state
 * @returns {() => number} a function returning numbers in [0, 1)
 */
export function random(seed = 1) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * The longest common subsequence length, by dynamic programming.
 *
 * The slow, obviously-correct version, used to check that the fast one finds
 * a genuinely minimal edit script rather than merely a valid one.
 *
 * @param {string[]} before the first sequence
 * @param {string[]} after the second
 * @returns {number} the length
 */
export function bruteForceCommon(before, after) {
  const table = Array.from(
    { length: before.length + 1 },
    () => new Array(after.length + 1).fill(0),
  );

  for (let i = 1; i <= before.length; i++) {
    for (let j = 1; j <= after.length; j++) {
      table[i][j] = before[i - 1] === after[j - 1]
        ? table[i - 1][j - 1] + 1
        : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }

  return table[before.length][after.length];
}
