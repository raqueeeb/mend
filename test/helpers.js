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
