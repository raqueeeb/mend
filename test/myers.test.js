import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_EDIT_DISTANCE, Operation, UsageError, commonLength, diffSequences,
} from '../src/index.js';
import {
  backwards, bruteForceCommon, forwards, random, render, throwsWith,
} from './helpers.js';

/** Diffs two strings character by character, which is enough for the algorithm. */
const diff = (before, after, options) => diffSequences([...before], [...after], options);

test('two identical sequences need no edits', () => {
  const { edits, distance } = diff('abc', 'abc');
  assert.equal(render(edits), ' abc');
  assert.equal(distance, 0);
});

test('two empty sequences produce nothing at all', () => {
  const { edits, distance } = diff('', '');
  assert.deepEqual(edits, []);
  assert.equal(distance, 0);
});

test('an empty first sequence is all insertion', () => {
  const { edits, distance } = diff('', 'abc');
  assert.equal(render(edits), '+abc');
  assert.equal(distance, 3);
});

test('an empty second sequence is all deletion', () => {
  const { edits, distance } = diff('abc', '');
  assert.equal(render(edits), '-abc');
  assert.equal(distance, 3);
});

test('an append is one insertion at the end', () => {
  assert.equal(render(diff('ab', 'abc').edits), ' ab|+c');
});

test('a prepend is one insertion at the start', () => {
  assert.equal(render(diff('bc', 'abc').edits), '+a| bc');
});

test('a replacement is a deletion and an insertion', () => {
  assert.equal(render(diff('axc', 'abc').edits), ' a|-x|+b| c');
});

test('the paper example takes five edits', () => {
  // ABCABBA -> CBABAC, the example Myers works through in the 1986 paper.
  // Five edits and a common subsequence of four is the published answer.
  const { distance } = diff('ABCABBA', 'CBABAC');
  assert.equal(distance, 5);
  assert.equal(commonLength([...'ABCABBA'], [...'CBABAC']), 4);
});

test('runs are coalesced rather than reported one token at a time', () => {
  // Three consecutive insertions are one run, because every consumer works
  // in runs and coalescing here means nobody downstream has to.
  const { edits } = diff('ad', 'abcd');
  assert.equal(edits.length, 3);
  assert.equal(render(edits), ' a|+bc| d');
});

test('each run carries where it starts in both sequences', () => {
  const { edits } = diff('abc', 'axc');
  const deletion = edits.find((edit) => edit.operation === Operation.DELETE);
  const insertion = edits.find((edit) => edit.operation === Operation.INSERT);

  assert.equal(deletion.oldStart, 1);
  assert.equal(insertion.newStart, 1);
  assert.equal(deletion.length, 1);
});
