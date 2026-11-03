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

test('changes to the same region conflict', () => {
  const result = merge(
    BASE,
    L('one', 'OURS', 'three', 'four', 'five'),
    L('one', 'THEIRS', 'three', 'four', 'five'),
  );

  assert.ok(!result.clean);
  assert.equal(result.conflictCount, 1);
  assert.equal(result.text, L(
    'one',
    `${MARKERS.ours} ours`,
    'OURS',
    MARKERS.divider,
    'THEIRS',
    `${MARKERS.theirs} theirs`,
    'three',
    'four',
    'five',
  ));
});

test('the identical change on both sides is agreement, not a conflict', () => {
  // Two people fixing the same typo the same way have not disagreed.
  const same = L('one', 'FIXED', 'three', 'four', 'five');

  const result = merge(BASE, same, same);
  assert.ok(result.clean);
  assert.equal(result.text, same);
});

test('a multi-line disagreement is one conflict, not one per line', () => {
  // Five separate conflict blocks over a five-line rewrite would be unusable.
  const result = merge(
    L('a', 'b', 'c', 'd', 'e'),
    L('a', '1', '2', '3', 'e'),
    L('a', 'x', 'y', 'z', 'e'),
  );

  assert.equal(result.conflictCount, 1);
  assert.equal(result.regions.length, 3, 'agreed, conflict, agreed');
});

test('an insertion on one side keeps the line it was inserted before', () => {
  // A pure insertion consumes no base line, so the cursor must not advance
  // past one -- doing so silently drops the following line.
  const ours = L('one', 'two', 'new', 'three', 'four', 'five');

  const result = merge(BASE, ours, BASE);
  assert.ok(result.clean);
  assert.equal(result.text, ours);
});

test('different insertions at the same point conflict without losing the file', () => {
  const result = merge(
    BASE,
    L('A', 'one', 'two', 'three', 'four', 'five'),
    L('B', 'one', 'two', 'three', 'four', 'five'),
  );

  assert.ok(!result.clean);
  assert.ok(result.text.includes('\none\n'), 'the base line after the conflict survives');
  assert.ok(result.text.includes('A'));
  assert.ok(result.text.includes('B'));
});

test('the same insertion on both sides appears once', () => {
  const both = L('new', 'one', 'two', 'three', 'four', 'five');
  const result = merge(BASE, both, both);

  assert.ok(result.clean);
  assert.equal(result.text, both);
});

test('a deletion on one side is taken', () => {
  const ours = L('one', 'three', 'four', 'five');
  const result = merge(BASE, ours, BASE);

  assert.ok(result.clean);
  assert.equal(result.text, ours);
});

test('the same deletion on both sides is agreement', () => {
  const both = L('one', 'three', 'four', 'five');
  assert.ok(merge(BASE, both, both).clean);
  assert.equal(merge(BASE, both, both).text, both);
});

test('a deletion against an edit of the same line conflicts', () => {
  const result = merge(
    BASE,
    L('one', 'three', 'four', 'five'),
    L('one', 'EDITED', 'three', 'four', 'five'),
  );

  assert.ok(!result.clean);
});

test('the labels are whatever the caller calls the two sides', () => {
  const result = merge(
    BASE,
    L('one', 'OURS', 'three', 'four', 'five'),
    L('one', 'THEIRS', 'three', 'four', 'five'),
    { ourLabel: 'HEAD', theirLabel: 'feature/x' },
  );

  assert.ok(result.text.includes(`${MARKERS.ours} HEAD`));
  assert.ok(result.text.includes(`${MARKERS.theirs} feature/x`));
});

test('diff3 style shows what the line used to be', () => {
  // Which is usually what tells a reader which side to keep.
  const result = merge(
    BASE,
    L('one', 'OURS', 'three', 'four', 'five'),
    L('one', 'THEIRS', 'three', 'four', 'five'),
    { diff3: true },
  );

  assert.ok(result.text.includes(`${MARKERS.base} base`));
  assert.ok(result.text.includes('\ntwo\n'), 'the base text is inside the conflict');
});

test('merging empty files gives an empty file', () => {
  assert.equal(merge('', '', '').text, '');
  assert.ok(merge('', '', '').clean);
});

test('a file created identically on both sides is clean', () => {
  assert.equal(merge('', L('a'), L('a')).text, L('a'));
});

test('a file created differently on both sides conflicts', () => {
  const result = merge('', L('a'), L('b'));
  assert.ok(!result.clean);
});

test('merge regions can be inspected without the markers', () => {
  const regions = mergeLines(
    ['one', 'two', 'three'],
    ['one', 'OURS', 'three'],
    ['one', 'THEIRS', 'three'],
  );

  assert.equal(regions.length, 3);
  assert.deepEqual(regions[0].lines, ['one']);
  assert.ok(regions[1].conflict);
  assert.deepEqual(regions[1].ours, ['OURS']);
  assert.deepEqual(regions[1].base, ['two']);
  assert.deepEqual(regions[1].theirs, ['THEIRS']);
  assert.deepEqual(regions[2].lines, ['three']);
});

test('a region is frozen', () => {
  const [region] = mergeLines(['a'], ['a'], ['a']);
  assert.throws(() => { region.conflict = true; }, TypeError);
});

test('conflict markers are detected in a merged file', () => {
  // Useful as a commit-time check: a file with markers in it is a file
  // nobody finished merging.
  const conflicted = merge(
    BASE,
    L('one', 'OURS', 'three', 'four', 'five'),
    L('one', 'THEIRS', 'three', 'four', 'five'),
  );

  assert.ok(hasConflictMarkers(conflicted.text));
  assert.ok(!hasConflictMarkers(BASE));
  assert.ok(!hasConflictMarkers(''));
});

test('something that is not text is a caller mistake', () => {
  throwsWith(() => merge(null, 'a', 'b'), UsageError);
  throwsWith(() => merge('a', 42, 'b'), UsageError);
  throwsWith(() => hasConflictMarkers(null), UsageError);
});

// ---- similarity and inline diffs ---------------------------------------

test('identical texts are perfectly similar', () => {
  assert.equal(similarity(BASE, BASE), 1);
  assert.equal(similarity('', ''), 1, 'including two empty ones');
});

test('texts with nothing in common are not similar at all', () => {
  assert.equal(similarity(L('a', 'b'), L('x', 'y')), 0);
});
