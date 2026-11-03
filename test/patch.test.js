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
