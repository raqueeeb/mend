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
