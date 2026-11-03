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

test('a patch applies after the file has been shifted up', () => {
  // Ten lines removed from above the hunk. The hunk's own lines are all
  // still there, ten lines earlier, so the search finds them going backwards.
  const pad = Array.from({ length: 10 }, (_, index) => `pad ${index}`);
  const before = L(...pad, 'a', 'b', 'c', 'd', 'e');
  const diff = patchFor(before, L(...pad, 'a', 'b', 'C', 'd', 'e'));

  const result = applyPatch(L('a', 'b', 'c', 'd', 'e'), diff);

  assert.ok(result.ok, result.describe());
  assert.equal(result.text, L('a', 'b', 'C', 'd', 'e'));
  assert.equal(result.hunks[0].offset, -10);
  assert.match(result.hunks[0].describe(), /offset -10 lines/);
});

test('an offset of one line is described in the singular', () => {
  const before = L('one', 'two', 'three');
  const diff = patchFor(before, L('one', 'TWO', 'three'));
  const result = applyPatch(L('new', 'one', 'two', 'three'), diff);

  assert.match(result.hunks[0].describe(), /offset 1 line\)/);
});

test('fuzz lets a changed context line through', () => {
  // Context is there to locate the hunk, not to be applied, so a context
  // line that no longer matches is often harmless.
  const before = L('one', 'two', 'three', 'four', 'five');
  const diff = patchFor(before, L('one', 'two', 'THREE', 'four', 'five'));

  const drifted = L('ONE', 'two', 'three', 'four', 'five');
  const result = applyPatch(drifted, diff, { fuzz: 2 });

  assert.ok(result.ok);
  assert.equal(result.text, L('ONE', 'two', 'THREE', 'four', 'five'));
  assert.ok(result.hunks[0].fuzz > 0);
  assert.match(result.hunks[0].describe(), /fuzz \d/);
});

test('fuzz never eats the lines the hunk changes', () => {
  // Dropping those would change the result rather than where it lands, so a
  // hunk with no context to spare simply fails.
  const before = L('one');
  const diff = patchFor(before, L('ONE'), { context: 0 });

  const result = applyPatch(L('something else'), diff, { fuzz: 5 });
  assert.ok(!result.ok);
});

test('fuzz is off far enough by default to be safe', () => {
  assert.equal(DEFAULT_FUZZ, 2);
});
