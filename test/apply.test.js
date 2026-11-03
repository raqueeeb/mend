import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_FUZZ, UsageError, applyPatch, canApply, createPatch, diffText, formatUnified, parseOne,
  patch as patchText, reverse,
} from '../src/index.js';
import { L, N, random, throwsWith } from './helpers.js';

/** The parsed patch that turns `before` into `after`. */
const patchFor = (before, after, options = {}) => parseOne(
  formatUnified(diffText(before, after, { oldPath: 'f', newPath: 'f', ...options })),
);

test('a patch applies to the file it was made from', () => {
  const before = L('one', 'two', 'three');
  const after = L('one', 'TWO', 'three');

  const result = applyPatch(before, patchFor(before, after));
  assert.ok(result.ok);
  assert.equal(result.text, after);
});

test('applying reports where each hunk landed', () => {
  const before = L('one', 'two', 'three');
  const result = applyPatch(before, patchFor(before, L('one', 'TWO', 'three')));

  assert.equal(result.hunks.length, 1);
  assert.equal(result.hunks[0].line, 1);
  assert.equal(result.hunks[0].offset, 0);
  assert.equal(result.hunks[0].describe(), 'Hunk #1 applied at 1');
});

test('a patch applies after the file has been shifted down', () => {
  // The common case: someone added lines above the hunk. The stated position
  // is a hint, so the search looks outwards from it.
  const before = L('one', 'two', 'three');
  const diff = patchFor(before, L('one', 'TWO', 'three'));

  const shifted = L('new', 'new', 'new', 'one', 'two', 'three');
  const result = applyPatch(shifted, diff);

  assert.ok(result.ok);
  assert.equal(result.text, L('new', 'new', 'new', 'one', 'TWO', 'three'));
  assert.equal(result.hunks[0].offset, 3);
  assert.match(result.hunks[0].describe(), /offset 3 lines/);
});
