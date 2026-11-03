import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  Granularity, UsageError, characters, endsWithNewline, join, lines, split, usesCrlf, words,
} from '../src/index.js';
import { key, keys } from '../src/tokenize.js';
import { throwsWith } from './helpers.js';

test('a trailing newline does not make a final empty line', () => {
  // Every tool that treats it as two lines ends up with an off-by-one in its
  // line numbers, so the fact is recorded separately instead.
  assert.deepEqual(lines('a\n'), ['a']);
  assert.deepEqual(lines('a\nb\n'), ['a', 'b']);
  assert.deepEqual(lines('a\nb'), ['a', 'b']);
});

test('empty text has no lines', () => {
  assert.deepEqual(lines(''), []);
});

test('a line that is empty is still a line', () => {
  assert.deepEqual(lines('a\n\nb\n'), ['a', '', 'b']);
  assert.deepEqual(lines('\n'), ['']);
});

test('carriage returns come off, because content is what is compared', () => {
  assert.deepEqual(lines('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(lines('a\r\nb'), ['a', 'b']);
});

test('whether the text ended with a newline is kept', () => {
  assert.equal(endsWithNewline('a\n'), true);
  assert.equal(endsWithNewline('a'), false);
  // Empty text does not, which keeps the round trip exact.
  assert.equal(endsWithNewline(''), false);
});

test('CRLF is detected from the first line ending', () => {
  // A file with mixed endings has a bigger problem than this can fix.
  assert.equal(usesCrlf('a\r\nb\n'), true);
  assert.equal(usesCrlf('a\nb\r\n'), false);
  assert.equal(usesCrlf('a'), false);
  assert.equal(usesCrlf(''), false);
});

test('joining is the inverse of splitting', () => {
  for (const text of ['', 'a\n', 'a', 'a\nb\n', 'a\nb', '\n', 'a\n\nb']) {
    assert.equal(
      join(lines(text), endsWithNewline(text)),
      text,
      `${JSON.stringify(text)} round-trips`,
    );
  }
});

test('joining restores CRLF when asked', () => {
  assert.equal(join(['a', 'b'], true, true), 'a\r\nb\r\n');
  assert.equal(join(['a', 'b'], false, true), 'a\r\nb');
});

test('joining nothing gives nothing, whatever the flags say', () => {
  assert.equal(join([], true), '');
  assert.equal(join([], false), '');
});

test('words keep the whitespace between them as its own token', () => {
  // So the text can be rebuilt exactly, and a change of spacing shows as a
  // change of spacing rather than as every word being rewritten.
  assert.deepEqual(words('a b'), ['a', ' ', 'b']);
  assert.deepEqual(words('  a  '), ['  ', 'a', '  ']);
  assert.deepEqual(words(''), []);
});

test('word tokens concatenate back to the original', () => {
  for (const text of ['hello world', '  leading', 'trailing  ', 'a\tb\nc', '']) {
    assert.equal(words(text).join(''), text);
  }
});

test('characters are split by code point, not by UTF-16 unit', () => {
  // Splitting an emoji in half produces two broken halves of a character.
  assert.deepEqual(characters('ab'), ['a', 'b']);
  assert.equal(characters('\u{1f600}').length, 1);
  assert.equal(characters('a\u{1f600}b').length, 3);
});

test('split dispatches on the granularity', () => {
  assert.deepEqual(split('a b\n', Granularity.LINE), ['a b']);
  assert.deepEqual(split('a b', Granularity.WORD), ['a', ' ', 'b']);
  assert.deepEqual(split('ab', Granularity.CHARACTER), ['a', 'b']);
  assert.deepEqual(split('a\n'), ['a'], 'lines by default');
});

test('an unknown granularity is reported with what is allowed', () => {
  const error = throwsWith(() => split('a', 'paragraph'), UsageError);
  assert.match(error.message, /line, word or character/);
});

test('something that is not text is reported with what it was', () => {
  const error = throwsWith(() => lines(null), UsageError);
  assert.match(error.message, /must be a string, got null/);
  throwsWith(() => words(42), UsageError);
  throwsWith(() => join('not an array'), UsageError);
});

test('a comparison key folds what it is told to fold', () => {
  assert.equal(key('  a   b  ', { ignoreWhitespace: true }), 'a b');
  assert.equal(key('aB', { ignoreCase: true }), 'AB');
  assert.equal(key('  aB ', { ignoreWhitespace: true, ignoreCase: true }), 'AB');
  assert.equal(key('  a  '), '  a  ', 'and nothing by default');
});

test('keys returns the tokens themselves when there is nothing to fold', () => {
  // Identity rather than a copy, because the common case is no folding and
  // mapping a large file for nothing is waste.
  const tokens = ['a', 'b'];
  assert.equal(keys(tokens), tokens);
  assert.notEqual(keys(tokens, { ignoreCase: true }), tokens);
  assert.deepEqual(keys(['aB'], { ignoreCase: true }), ['AB']);
});
