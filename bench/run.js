/**
 * A benchmark, mostly to show what Myers' complexity bound actually buys.
 *
 * The headline is the pair of "one line changed" and "half the lines
 * changed" cases on files of the same size. The algorithm is O((N+M)D), so
 * the first is nearly free and the second is not: the cost tracks how
 * different the files are rather than how big they are. That is the whole
 * reason to use this algorithm instead of the O(NM) table.
 */

import {
  applyPatch, createPatch, diffText, formatUnified, merge, parseOne, similarity,
} from '../src/index.js';

const WIDTH = 42;

/**
 * Times a function, reporting operations per second.
 *
 * @param {string} name what is being measured
 * @param {() => void} body the thing to run
 * @param {number} [iterations] how many times
 */
function bench(name, body, iterations = 1000) {
  // A warm-up, so the first measurement is not paying for the just-in-time
  // compiler's first look at the code.
  for (let at = 0; at < Math.min(iterations, 50); at++) body();

  const started = process.hrtime.bigint();
  for (let at = 0; at < iterations; at++) body();
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6;

  const each = elapsed / iterations;
  const perSecond = Math.round(1000 / each);
  console.log(
    `${name.padEnd(WIDTH)}${format(each)} ms/op   ${perSecond.toLocaleString('en-US')}/s`,
  );
}

function format(milliseconds) {
  return milliseconds.toFixed(milliseconds < 0.01 ? 5 : 3).padStart(9);
}

function section(title) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

/** A file of n numbered lines. */
function file(count, prefix = 'line') {
  return `${Array.from({ length: count }, (_, index) => `${prefix} ${index}`).join('\n')}\n`;
}

/** The same file with every nth line changed. */
function touch(text, every) {
  return text
    .split('\n')
    .map((line, index) => (index % every === 0 ? `changed ${index}` : line))
    .join('\n');
}

section('one line changed, by file size');
for (const size of [100, 1000, 10000, 50000]) {
  const before = file(size);
  const after = before.replace(`line ${Math.floor(size / 2)}`, 'changed');
  const iterations = size > 10000 ? 50 : 500;
  bench(`${size.toLocaleString('en-US')} lines`, () => diffText(before, after), iterations);
}

section('10,000 lines, by how much changed');
{
  const before = file(10000);
  for (const [label, every] of [['1 in 100', 100], ['1 in 10', 10], ['1 in 2', 2]]) {
    const after = touch(before, every);
    // The cost tracks the edit distance, not the file: this is the trade.
    bench(label, () => diffText(before, after), every === 2 ? 5 : 50);
  }
}

section('the pieces, on a 2,000-line file with 20 changes');
{
  const before = file(2000);
  const after = touch(before, 100);
  const diff = diffText(before, after, { oldPath: 'f', newPath: 'f' });
  const patch = formatUnified(diff);
  const parsed = parseOne(patch);

  bench('diff', () => diffText(before, after), 200);
  bench('format', () => formatUnified(diff), 2000);
  bench('parse', () => parseOne(patch), 2000);
  bench('apply', () => applyPatch(before, parsed), 500);
  bench('diff + format + parse + apply', () => {
    applyPatch(before, parseOne(createPatch(before, after, { oldPath: 'f', newPath: 'f' })));
  }, 200);
  bench('similarity', () => similarity(before, after), 200);

  console.log(`\n  ${diff.summary}, patch is ${patch.length.toLocaleString('en-US')} bytes`);
}

section('applying a patch that has to be searched for');
{
  const before = file(5000);
  const after = before.replace('line 2500', 'changed');
  const diff = parseOne(createPatch(before, after, { oldPath: 'f', newPath: 'f' }));

  const shifted = file(100, 'pad') + before;

  bench('exactly where the patch says', () => applyPatch(before, diff), 2000);
  bench('100 lines out', () => applyPatch(shifted, diff), 2000);
}

section('three-way merge of a 2,000-line file');
{
  const base = file(2000);
  const ours = base.replace('line 100', 'ours');
  const theirs = base.replace('line 1900', 'theirs');
  const conflicting = base.replace('line 100', 'theirs too');

  bench('clean merge', () => merge(base, ours, theirs), 200);
  bench('conflicting merge', () => merge(base, ours, conflicting), 200);
}

section('the worst case, which is what the ceiling is for');
{
  // Two files with nothing in common. Myers is quadratic here, and a diff
  // tool that hangs on this is worse than one that says they are unrelated.
  const before = file(2000, 'alpha');
  const after = file(2000, 'omega');

  bench('2,000 lines, nothing in common', () => diffText(before, after), 3);
  bench('same, with the search capped at 50', () => (
    diffText(before, after, { maxDistance: 50 })
  ), 50);
}

console.log();
