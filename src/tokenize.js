/**
 * Splitting text into the units a diff compares.
 *
 * The choice of unit is the single biggest influence on whether a diff reads
 * well. Lines are right for source code, words for prose, and characters for
 * a short string where a word diff would show the whole thing changed. All
 * three go through the same algorithm, so this module only has to produce
 * arrays of comparable pieces.
 *
 * Line splitting has one trap worth stating. A text file may or may not end
 * with a newline, and the difference matters: a patch has to say which, or
 * applying it adds or removes a byte nobody asked about. So the split keeps
 * that fact rather than discarding it.
 */

import { UsageError, requireText } from './errors.js';

/** How text is broken up before comparison. */
export const Granularity = {
  LINE: 'line',
  WORD: 'word',
  CHARACTER: 'character',
};

/**
 * Splits text into lines, without their line endings.
 *
 * A trailing newline does not produce a final empty line -- `"a\n"` is one
 * line, not two -- because every tool that treats it as two ends up with an
 * off-by-one in its line numbers. Whether the text ended with a newline is
 * reported separately by {@link endsWithNewline}.
 *
 * @param {string} text the text
 * @returns {string[]} the lines
 */
export function lines(text) {
  requireText(text, 'text');
  if (text === '') return [];

  const split = text.split('\n');
  if (split[split.length - 1] === '') split.pop();

  // A CRLF file is compared by its content, not by its line endings, so the
  // carriage return comes off here and is restored when text is rebuilt.
  return split.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/**
 * Whether text ends with a newline.
 *
 * Empty text does not, which keeps `join(lines(''), false) === ''`.
 *
 * @param {string} text the text
 * @returns {boolean} true when the last character is a newline
 */
export function endsWithNewline(text) {
  requireText(text, 'text');
  return text.length > 0 && text.endsWith('\n');
}

/**
 * Whether text uses CRLF line endings.
 *
 * Decided by the first line ending found, because a file with mixed endings
 * has a bigger problem than this function can solve.
 *
 * @param {string} text the text
 * @returns {boolean} true when the first newline is preceded by a return
 */
export function usesCrlf(text) {
  requireText(text, 'text');
  const at = text.indexOf('\n');
  return at > 0 && text[at - 1] === '\r';
}

/**
 * Rebuilds text from lines.
 *
 * The inverse of {@link lines}, given the same two facts about the original.
 *
 * @param {string[]} input the lines, without endings
 * @param {boolean} [trailing] whether to end with a newline
 * @param {boolean} [crlf] whether to use CRLF endings
 * @returns {string} the text
 */
export function join(input, trailing = true, crlf = false) {
  if (!Array.isArray(input)) throw new UsageError('lines must be an array');
  if (input.length === 0) return '';

  const ending = crlf ? '\r\n' : '\n';
  return input.join(ending) + (trailing ? ending : '');
}

/**
 * Splits text into words and the whitespace between them.
 *
 * The whitespace is kept as its own token rather than being attached to a
 * word or dropped. Keeping it means the text can be rebuilt exactly; marking
 * it separately means a change of spacing shows as a change of spacing
 * rather than as every surrounding word having been rewritten.
 *
 * @param {string} text the text
 * @returns {string[]} the tokens, which concatenate back to the input
 */
export function words(text) {
  requireText(text, 'text');
  const matches = text.match(/\s+|[^\s]+/g);
  return matches === null ? [] : matches;
}

/**
 * Splits text into characters.
 *
 * By code point, not by UTF-16 unit, so an emoji is one token and a diff
 * cannot cut it in half and produce two broken halves of a character.
 *
 * @param {string} text the text
 * @returns {string[]} the characters
 */
export function characters(text) {
  requireText(text, 'text');
  return [...text];
}

/**
 * Splits text at the given granularity.
 *
 * @param {string} text the text
 * @param {string} granularity one of {@link Granularity}
 * @returns {string[]} the tokens
 * @throws {UsageError} when the granularity is not one of the three
 */
export function split(text, granularity = Granularity.LINE) {
  switch (granularity) {
    case Granularity.LINE: return lines(text);
    case Granularity.WORD: return words(text);
    case Granularity.CHARACTER: return characters(text);
    default:
      throw new UsageError(
        `granularity must be line, word or character, got ${JSON.stringify(granularity)}`,
      );
  }
}

/**
 * Normalises a line for comparison.
 *
 * Returns the key two lines should be compared by, which is the line itself
 * unless whitespace is being ignored. Comparing by a key rather than editing
 * the lines means the output still shows the original text.
 *
 * @param {string} line the line
 * @param {object} [options] what to ignore
 * @param {boolean} [options.ignoreWhitespace] collapse runs and trim
 * @param {boolean} [options.ignoreCase] compare case-insensitively
 * @returns {string} the comparison key
 */
export function key(line, options = {}) {
  let out = line;
  if (options.ignoreWhitespace) out = out.replace(/\s+/g, ' ').trim();
  if (options.ignoreCase) out = out.toUpperCase();
  return out;
}

/**
 * Builds the comparison keys for a whole array of tokens.
 *
 * @param {string[]} tokens the tokens
 * @param {object} [options] what to ignore, as for {@link key}
 * @returns {string[]} the keys, one per token
 */
export function keys(tokens, options = {}) {
  if (!options.ignoreWhitespace && !options.ignoreCase) return tokens;
  return tokens.map((token) => key(token, options));
}
