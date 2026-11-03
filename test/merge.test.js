import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MARKERS, UsageError, hasConflictMarkers, inlineDiff, isRename, markInline, merge, mergeLines,
  pairChanges, similarity,
} from '../src/index.js';
import { diffText } from '../src/diff.js';
import { L, render, throwsWith } from './helpers.js';

const BASE = L('one', 'two', 'three', 'four', 'five');

test('a change on one side only is taken', () => {
  // The whole point of having the ancestor: this is not a conflict, and a
  // two-way diff could not tell.
  const ours = L('one', 'TWO', 'three', 'four', 'five');

  const result = merge(BASE, ours, BASE);
  assert.ok(result.clean);
  assert.equal(result.text, ours);
});

test('a change on the other side only is taken', () => {
  const theirs = L('one', 'two', 'three', 'FOUR', 'five');

  const result = merge(BASE, BASE, theirs);
  assert.ok(result.clean);
  assert.equal(result.text, theirs);
});

test('changes to different regions both survive', () => {
  const result = merge(
    BASE,
    L('one', 'TWO', 'three', 'four', 'five'),
    L('one', 'two', 'three', 'FOUR', 'five'),
  );

  assert.ok(result.clean);
  assert.equal(result.text, L('one', 'TWO', 'three', 'FOUR', 'five'));
});
