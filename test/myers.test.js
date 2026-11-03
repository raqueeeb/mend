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

test('an edit run is frozen, so a consumer cannot corrupt the script', () => {
  const { edits } = diff('a', 'b');
  assert.throws(() => { edits[0].operation = 'nonsense'; }, TypeError);
});

test('a run describes itself for a failure message', () => {
  const { edits } = diff('ab', 'b');
  assert.equal(String(edits[0]), '-1@0,0');
});

test('the script rebuilds both sequences', () => {
  // The defining property: deletions removed gives the second sequence,
  // insertions removed gives the first.
  const { edits } = diff('kitten', 'sitting');
  assert.equal(forwards(edits).join(''), 'sitting');
  assert.equal(backwards(edits).join(''), 'kitten');
});

test('the script rebuilds both sequences for three thousand random pairs', () => {
  const next = random(20261103);
  const alphabet = 'abcd';

  for (let trial = 0; trial < 3000; trial++) {
    const before = Array.from(
      { length: Math.floor(next() * 12) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    ).join('');
    const after = Array.from(
      { length: Math.floor(next() * 12) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    ).join('');

    const { edits } = diff(before, after);
    assert.equal(forwards(edits).join(''), after, `forwards for ${before} -> ${after}`);
    assert.equal(backwards(edits).join(''), before, `backwards for ${before} -> ${after}`);
  }
});

test('the edit distance is minimal, checked against brute force', () => {
  // Myers is only worth having if it finds the *shortest* script, and the
  // only honest check is the slow algorithm that cannot be wrong.
  const next = random(7);
  const alphabet = 'abc';

  for (let trial = 0; trial < 2000; trial++) {
    const before = Array.from(
      { length: Math.floor(next() * 10) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    );
    const after = Array.from(
      { length: Math.floor(next() * 10) },
      () => alphabet[Math.floor(next() * alphabet.length)],
    );

    const common = bruteForceCommon(before, after);
    const expected = before.length + after.length - 2 * common;
    const { distance, minimal } = diffSequences(before, after);

    assert.ok(minimal);
    assert.equal(distance, expected, `${before.join('')} -> ${after.join('')}`);
  }
});

test('the common prefix and suffix are not searched', () => {
  // The reason a large file with one change is cheap: the distance is
  // measured on what is left after trimming, not on the file.
  const before = Array.from({ length: 20000 }, (_, index) => `line ${index}`);
  const after = [...before];
  after[10000] = 'changed';

  const { distance, minimal } = diffSequences(before, after);
  assert.equal(distance, 2);
  assert.ok(minimal);
});

test('a sequence with nothing in common is capped rather than hung', () => {
  // The worst case for Myers is quadratic, and a diff tool that hangs on two
  // unrelated files is worse than one that says they are unrelated.
  const before = Array.from({ length: 3000 }, (_, index) => `a${index}`);
  const after = Array.from({ length: 3000 }, (_, index) => `b${index}`);

  const { edits, minimal } = diffSequences(before, after, { maxDistance: 100 });

  assert.equal(minimal, false, 'the result says it is not minimal');
  assert.deepEqual(forwards(edits), after, 'and it is still a correct script');
  assert.deepEqual(backwards(edits), before);
});

test('the cap is high enough not to affect an ordinary diff', () => {
  assert.ok(MAX_EDIT_DISTANCE >= 1000);
});

test('comparison keys let two tokens compare equal while staying different', () => {
  // How whitespace and case folding work: the comparison uses the keys and
  // the output keeps the original text.
  const before = ['Hello', 'world'];
  const after = ['HELLO', 'world'];

  const { edits } = diffSequences(before, after, {
    beforeKeys: before.map((token) => token.toUpperCase()),
    afterKeys: after.map((token) => token.toUpperCase()),
  });

  assert.equal(edits.length, 1);
  assert.ok(edits[0].isEqual);
  // The tokens kept are the first sequence's, which is what a diff shows.
  assert.deepEqual(edits[0].tokens, ['Hello', 'world']);
});

test('the common length is zero when nothing matches', () => {
  assert.equal(commonLength([...'abc'], [...'xyz']), 0);
  assert.equal(commonLength([], []), 0);
});

test('something that is not an array is reported, not diffed', () => {
  throwsWith(() => diffSequences('abc', ['a']), UsageError);
  throwsWith(() => diffSequences(['a'], null), UsageError);
});
