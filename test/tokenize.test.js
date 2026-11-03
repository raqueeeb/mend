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
