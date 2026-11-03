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

test('changes further apart than twice the context split into two hunks', () => {
  // Twice, because at exactly that gap the trailing context of the first and
  // the leading context of the second meet, and splitting would print the
  // same lines in both.
  const before = L(...Array.from({ length: 40 }, (_, index) => `line ${index}`));
  const after = before.split('\n');
  after[2] = 'changed';
  after[30] = 'also changed';

  const diff = diffText(before, after.join('\n'));
  assert.equal(diff.hunks.length, 2);
  assert.equal(diff.added, 2);
  assert.equal(diff.removed, 2);
});

test('changes closer than twice the context share one hunk', () => {
  const before = L(...Array.from({ length: 20 }, (_, index) => `line ${index}`));
  const after = before.split('\n');
  after[5] = 'changed';
  after[9] = 'also changed';

  const diff = diffText(before, after.join('\n'));
  assert.equal(diff.hunks.length, 1, 'a gap of three with context three is one hunk');
});

test('the context size is configurable, down to none at all', () => {
  const before = L('a', 'b', 'c', 'd', 'e');
  const after = L('a', 'b', 'C', 'd', 'e');

  assert.equal(shape(diffText(before, after, { context: 0 }).hunks[0]), '-+');
  assert.equal(shape(diffText(before, after, { context: 1 }).hunks[0]), ' -+ ');
  assert.equal(diffText(before, after, { context: 1 }).hunks[0].header, '@@ -2,3 +2,3 @@');
});

test('the default context is three', () => {
  assert.equal(DEFAULT_CONTEXT, 3);
  const before = L(...Array.from({ length: 20 }, (_, index) => `${index}`));
  const after = before.replace('\n10\n', '\nten\n');
  const hunk = diffText(before, after).hunks[0];
  assert.equal(hunk.oldLines, 7, 'three above, three below, one changed');
});

test('a negative or fractional context is a caller mistake', () => {
  throwsWith(() => diffText('a', 'b', { context: -1 }), UsageError);
  throwsWith(() => diffText('a', 'b', { context: 1.5 }), UsageError);
});

test('an insertion at the start of a file is reported at line zero', () => {
  // The convention for a zero-length side is to name the line it follows,
  // which at the very start of a file is line zero.
  const diff = diffText('', L('a'));
  assert.equal(diff.hunks[0].oldStart, 0);
  assert.equal(diff.hunks[0].oldLines, 0);
  assert.equal(diff.hunks[0].header, '@@ -0,0 +1 @@');
});

test('deleting a whole file leaves nothing on the new side', () => {
  const diff = diffText(L('a', 'b'), '');
  assert.equal(diff.hunks[0].newLines, 0);
  assert.equal(diff.hunks[0].header, '@@ -1,2 +0,0 @@');
});

test('a pure insertion has no deletions and vice versa', () => {
  assert.equal(diffText(L('a'), L('a', 'b')).removed, 0);
  assert.equal(diffText(L('a', 'b'), L('a')).added, 0);
});

test('how each side ended is recorded', () => {
  // Both facts, separately: a patch has to say which side lacked a newline
  // and they are not interchangeable.
  const diff = diffText(N('a', 'b'), L('a', 'B'));
  assert.equal(diff.oldEndsWithNewline, false);
  assert.equal(diff.newEndsWithNewline, true);
});

test('CRLF input is noted so the output can restore it', () => {
  assert.equal(diffText('a\r\nb\r\n', 'a\r\nB\r\n').crlf, true);
  assert.equal(diffText(L('a'), L('b')).crlf, false);
});

test('the paths default to a and b', () => {
  const diff = diffText(L('a'), L('b'));
  assert.equal(diff.oldPath, 'a');
  assert.equal(diff.newPath, 'b');
});

test('the summary reads as a review comment would', () => {
  const diff = diffText(L('a', 'b', 'c'), L('a', 'B', 'c', 'd'));
  assert.equal(diff.summary, '+2 -1 in 1 hunk');
});

test('whitespace can be ignored, and the output keeps the original text', () => {
  const before = L('a  b', 'c');
  const after = L('a b', 'c');

  assert.ok(diffText(before, after, { ignoreWhitespace: true }).isEmpty);
  assert.ok(!diffText(before, after).isEmpty);
});
