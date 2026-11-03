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

test('adding a final newline is itself a difference', () => {
  // The lines are identical, so the difference lives only in whether the
  // file ended with a newline -- which is part of its content. `diff`
  // reports it, and a tool that says "no changes" here would quietly lose a
  // byte on the next round trip.
  const added = patchOf(N('a'), L('a'));

  assert.equal(added, `--- f.txt\n+++ f.txt\n@@ -1 +1 @@\n-a\n${NO_NEWLINE}\n+a\n`);
  assert.ok(added.includes(`-a\n${NO_NEWLINE}`), 'the old side is marked');
  assert.ok(!added.includes(`+a\n${NO_NEWLINE}`), 'the new side is not');
});

test('a git-style header names both paths', () => {
  const patch = formatGitStyle(diffText(L('a'), L('b'), { oldPath: 'x.js', newPath: 'x.js' }));
  assert.ok(patch.startsWith('diff --git a/x.js b/x.js\n'));
  assert.match(patch, /^--- a\/x\.js$/m);
  assert.match(patch, /^\+\+\+ b\/x\.js$/m);
});

test('a git-style header carries no index line', () => {
  // It holds blob hashes this library does not compute, and a wrong hash is
  // worse than an absent one.
  const patch = formatGitStyle(diffText(L('a'), L('b')));
  assert.ok(!patch.includes('index '));
});

test('a context diff writes each side in full', () => {
  const patch = formatContext(diffText(L('a', 'b', 'c'), L('a', 'B', 'c'), {
    oldPath: 'f', newPath: 'f',
  }));

  assert.match(patch, /^\*\*\* f$/m);
  assert.match(patch, /^\*{15}$/m);
  assert.match(patch, /^- b$/m);
  assert.match(patch, /^\+ B$/m);
});

test('a stat line scales its bar only when it has to', () => {
  const small = formatStat(diffText(L('a', 'b'), L('A', 'b'), { newPath: 'f' }));
  assert.equal(small, 'f | 2 +-');

  const large = diffText(
    L(...Array.from({ length: 200 }, (_, index) => `${index}`)),
    L(...Array.from({ length: 200 }, (_, index) => `x${index}`)),
    { newPath: 'f' },
  );
  const bar = formatStat(large, { width: 10 }).split(' ').pop();
  assert.ok(bar.length <= 11, `the bar is bounded, got ${bar.length}`);
});

test('a stat line for no change says zero', () => {
  assert.equal(formatStat(diffText(L('a'), L('a'), { newPath: 'f' })), 'f | 0');
});

// ---- reading a patch back ----------------------------------------------

test('a patch round-trips through the parser', () => {
  const diff = diffText(L('one', 'two', 'three'), L('one', 'TWO', 'three'), {
    oldPath: 'f.txt', newPath: 'f.txt',
  });
  const reparsed = parseOne(formatUnified(diff));

  assert.equal(reparsed.oldPath, 'f.txt');
  assert.equal(reparsed.hunks.length, 1);
  assert.equal(reparsed.hunks[0].header, diff.hunks[0].header);
  assert.equal(formatUnified(reparsed), formatUnified(diff));
});

test('a hunk header with no counts means one line', () => {
  const diff = parseOne('--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n');
  assert.equal(diff.hunks[0].oldLines, 1);
  assert.equal(diff.hunks[0].newLines, 1);
});

test('prose before the patch is skipped', () => {
  // Mail clients, review tools and commit messages all put text there, and
  // refusing to parse an emailed patch would make the parser useless.
  const diff = parseOne([
    'From: someone',
    'Subject: [PATCH] fix the thing',
    '',
    'Here is why.',
    '',
    '--- a/f.txt',
    '+++ b/f.txt',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    '',
  ].join('\n'));

  assert.equal(diff.oldPath, 'f.txt');
  assert.equal(diff.hunks.length, 1);
});

test('a git prefix and a timestamp come off the paths', () => {
  const diff = parseOne([
    '--- a/f.txt\t2026-11-03 10:00:00',
    '+++ b/f.txt\t2026-11-03 10:01:00',
    '@@ -1 +1 @@',
    '-a',
    '+b',
    '',
  ].join('\n'));
  assert.equal(diff.oldPath, 'f.txt');
  assert.equal(diff.newPath, 'f.txt');
});

test('dev null survives as itself, because it means something', () => {
  const diff = parseOne('--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1 @@\n+a\n');
  assert.equal(diff.oldPath, '/dev/null');
  assert.equal(diff.newPath, 'new.txt');
});

test('a multi-file patch parses into one diff per file', () => {
  const patch = formatGitStyle(diffText(L('a'), L('b'), { oldPath: 'x', newPath: 'x' }))
    + formatGitStyle(diffText(L('p'), L('q'), { oldPath: 'y', newPath: 'y' }));

  const diffs = parsePatch(patch);
  assert.equal(diffs.length, 2);
  assert.deepEqual(diffs.map((diff) => diff.newPath), ['x', 'y']);
});

test('several hunks in one file all parse', () => {
  const before = L(...Array.from({ length: 40 }, (_, index) => `line ${index}`));
  const lines = before.split('\n');
  lines[2] = 'changed';
  lines[30] = 'also';

  const diff = parseOne(patchOf(before, lines.join('\n')));
  assert.equal(diff.hunks.length, 2);
});

test('a no-newline marker is read even when the counts are already met', () => {
  // It arrives *after* the hunk's last line, so a reader that stops as soon
  // as the counts are satisfied never sees it.
  const diff = parseOne(`--- a\n+++ b\n@@ -1 +1 @@\n-a\n+b\n${NO_NEWLINE}\n`);
  assert.equal(diff.newEndsWithNewline, false);
  assert.equal(diff.oldEndsWithNewline, true);
});

test('a line count that disagrees with the hunk is refused', () => {
  // The counts are load-bearing: a patch that has been truncated would
  // otherwise corrupt the file silently.
  const error = throwsWith(() => parseOne('--- a\n+++ b\n@@ -1,5 +1,5 @@\n one\n'), ParseError);
  assert.match(error.message, /says 5 old and 5 new lines but the hunk has 1 and 1/);
  assert.equal(error.line, 3);
});

test('a line with an illegal prefix is refused, with its position', () => {
  const error = throwsWith(
    () => parseOne('--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n?b\n'),
    ParseError,
  );
  assert.match(error.message, /must begin with a space/);
  assert.match(error.format(), /\| \?b/);
});

test('a patch with no hunks at all is refused by parseOne', () => {
  throwsWith(() => parseOne('just some prose\n'), ParseError);
});

test('parseOne refuses a patch that describes two files', () => {
  const patch = formatGitStyle(diffText(L('a'), L('b'), { oldPath: 'x', newPath: 'x' }))
    + formatGitStyle(diffText(L('p'), L('q'), { oldPath: 'y', newPath: 'y' }));

  const error = throwsWith(() => parseOne(patch), ParseError);
  assert.match(error.message, /describes 2 files/);
});

test('an empty context line written with no trailing space is tolerated', () => {
  // Extremely common, because editors and mail clients strip it, and
  // unambiguous, because nothing else is a bare empty line inside a hunk.
  const diff = parseOne('--- a\n+++ b\n@@ -1,3 +1,3 @@\n a\n\n-b\n+B\n');
  assert.equal(diff.hunks[0].changes[1].text, '');
  assert.equal(diff.hunks[0].changes.length, 4);
});

test('a parse error with no line still formats', () => {
  const error = new ParseError('something general');
  assert.equal(error.format(), 'something general');
  assert.equal(error.line, null);
});
