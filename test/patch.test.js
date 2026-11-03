import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NO_NEWLINE, ParseError, createPatch, diffText, formatContext, formatGitStyle, formatStat,
  formatUnified, parseOne, parsePatch, reverse,
} from '../src/index.js';
import { L, N, throwsWith } from './helpers.js';

const patchOf = (before, after, options = {}) => formatUnified(
  diffText(before, after, { oldPath: 'f.txt', newPath: 'f.txt', ...options }),
);

test('a patch has the headers, the hunk header and the lines', () => {
  const patch = patchOf(L('one', 'two', 'three'), L('one', 'TWO', 'three'));

  assert.equal(patch, [
    '--- f.txt',
    '+++ f.txt',
    '@@ -1,3 +1,3 @@',
    ' one',
    '-two',
    '+TWO',
    ' three',
    '',
  ].join('\n'));
});

test('no differences produce no patch at all', () => {
  // Not an empty-looking patch with headers: nothing, so a caller can test
  // the string for truth.
  assert.equal(patchOf(L('a'), L('a')), '');
});

test('the headers can be left out', () => {
  const patch = formatUnified(diffText(L('a'), L('b')), { headers: false });
  assert.ok(patch.startsWith('@@'));
});

test('the labels can be overridden without changing the diff', () => {
  const patch = formatUnified(diffText(L('a'), L('b')), {
    oldLabel: 'before.txt',
    newLabel: 'after.txt',
  });
  assert.match(patch, /^--- before\.txt\n\+\+\+ after\.txt\n/);
});

test('a context line is a space followed by the text', () => {
  // Which means a trailing space on an empty context line. Real, and the
  // reason so many patches are broken by editors that strip it.
  const patch = patchOf(L('a', '', 'b'), L('a', '', 'B'));
  assert.ok(patch.split('\n').includes(' '), 'the empty context line is a lone space');
});

test('a file with no final newline is marked', () => {
  const patch = patchOf(N('a', 'b'), N('a', 'B'));
  assert.ok(patch.includes(NO_NEWLINE));
});

test('each side gets its own marker, after its own last line', () => {
  // A hunk changing the final line of two files that both lack a newline
  // carries two markers. Emitting only the last loses the old side's fact,
  // and the patch then reverses into one that adds a byte nobody asked for.
  const patch = patchOf(N('a', 'b'), N('a', 'B'));

  assert.equal(patch, [
    '--- f.txt',
    '+++ f.txt',
    '@@ -1,2 +1,2 @@',
    ' a',
    '-b',
    NO_NEWLINE,
    '+B',
    NO_NEWLINE,
    '',
  ].join('\n'));
});

test('a file that lacks a newline but is changed in the middle gets no marker', () => {
  // Both files end without one, so neither side's ending changed, and the
  // only hunk is nowhere near the end. A marker there would be a claim the
  // patch is in no position to make.
  const before = N(...Array.from({ length: 20 }, (_, index) => `${index}`));
  const after = before.replace('\n2\n', '\ntwo\n');
  const patch = patchOf(before, after);

  assert.ok(!patch.includes(NO_NEWLINE));
  assert.equal(patch.match(/^@@/gm).length, 1);
});
