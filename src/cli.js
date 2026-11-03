/**
 * The command line.
 *
 * Four verbs, because they are the four things anybody does with a patch:
 * make one, read one, apply one, and merge. Everything is written through
 * injected streams rather than straight to stdout, so the tests drive the
 * real entry point instead of a reimplementation of it.
 *
 * Exit codes follow `diff`, which is older than the convention it breaks: 0
 * means no differences, 1 means there were differences, and 2 means the tool
 * could not do its job. A script that treats 1 as failure is wrong about
 * `diff` too.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { VERSION } from './index.js';
import { applyPatch } from './apply.js';
import { diffText } from './diff.js';
import { hasConflictMarkers, merge } from './merge.js';
import { ParseError, UsageError } from './errors.js';
import { markInline, pairChanges, similarity } from './similarity.js';
import { parsePatch, reverse } from './parse.js';
import {
  formatContext, formatGitStyle, formatStat, formatUnified,
} from './unified.js';

/** What the exit codes mean. */
export const Exit = {
  SAME: 0,
  DIFFERENT: 1,
  TROUBLE: 2,
};
