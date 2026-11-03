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

const USAGE = `mend ${VERSION} -- a diff and patch engine

usage:
  mend diff <old> <new> [options]     write a unified patch
  mend apply <file> <patch>           apply a patch to a file
  mend show <patch>                   summarise a patch
  mend merge <base> <ours> <theirs>   three-way merge
  mend stat <old> <new>               one line of counts

options:
  -c, --context <n>    unchanged lines around each change (default 3)
  -w, --ignore-space   ignore whitespace differences
  -i, --ignore-case    ignore case differences
      --words          diff by word, for prose
      --git            write a 'diff --git' header
      --context-format write an old-style context diff
  -R, --reverse        reverse the patch before using it
      --fuzz <n>       context lines apply may drop (default 2)
      --inline         mark changed words within changed lines
  -o, --output <file>  write there instead of to standard output
      --dry-run        with apply, report without writing
      --diff3          with merge, show the base inside a conflict

exit codes:
  0  no differences, or the operation succeeded
  1  there were differences, or a hunk did not apply
  2  the arguments or the patch were unusable
`;
