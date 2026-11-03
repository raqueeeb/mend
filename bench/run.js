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
