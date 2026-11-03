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
