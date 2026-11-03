import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CONTEXT, Operation, UsageError, diffCharacters, diffText, diffWords, same,
} from '../src/index.js';
import { L, N, render, throwsWith } from './helpers.js';

/** The operations of a hunk, as a compact string: ` `, `-` and `+`. */
const shape = (hunk) => hunk.changes
  .map((change) => ({ equal: ' ', insert: '+', delete: '-' }[change.operation]))
  .join('');

test('two identical texts produce no hunks', () => {
  const diff = diffText(L('a', 'b'), L('a', 'b'));
  assert.ok(diff.isEmpty);
  assert.equal(diff.hunks.length, 0);
  assert.equal(diff.summary, 'no changes');
});

test('a one-line change is one hunk with context either side', () => {
  const diff = diffText(L('a', 'b', 'c'), L('a', 'B', 'c'));

  assert.equal(diff.hunks.length, 1);
  assert.equal(shape(diff.hunks[0]), ' -+ ');
  assert.equal(diff.added, 1);
  assert.equal(diff.removed, 1);
});

test('the hunk header counts lines and omits a count of one', () => {
  // `@@ -1 +1 @@` and `@@ -1,1 +1,1 @@` mean the same thing, but only the
  // first is what tools emit.
  assert.equal(diffText(L('a'), L('b')).hunks[0].header, '@@ -1 +1 @@');
  assert.equal(diffText(L('a', 'b'), L('a', 'B')).hunks[0].header, '@@ -1,2 +1,2 @@');
});

test('context is clamped by the start and end of the file', () => {
  const diff = diffText(L('a', 'b', 'c'), L('A', 'b', 'c'));
  assert.equal(diff.hunks[0].oldStart, 1);
  assert.equal(shape(diff.hunks[0]), '-+  ');
});
