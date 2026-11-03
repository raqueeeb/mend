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
