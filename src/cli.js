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

/**
 * Runs the command line.
 *
 * @param {string[]} argv the arguments, without the node and script paths
 * @param {object} [io] where to write and how to reach the filesystem
 * @returns {number} the exit code
 */
export function main(argv, io = {}) {
  const out = io.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = io.err ?? ((text) => process.stderr.write(`${text}\n`));
  const read = io.read ?? ((path) => readFileSync(path, 'utf8'));
  const write = io.write ?? ((path, text) => writeFileSync(path, text));

  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    out(USAGE);
    return argv.length === 0 ? Exit.TROUBLE : Exit.SAME;
  }

  if (argv.includes('--version')) {
    out(VERSION);
    return Exit.SAME;
  }

  let options;
  try {
    options = parseArguments(argv);
  } catch (error) {
    err(error.message);
    return Exit.TROUBLE;
  }

  const context = { out, err, read, write, options };

  try {
    switch (options.command) {
      case 'diff': return runDiff(context);
      case 'apply': return runApply(context);
      case 'show': return runShow(context);
      case 'merge': return runMerge(context);
      case 'stat': return runStat(context);
      default:
        err(`unknown command '${options.command}' -- try --help`);
        return Exit.TROUBLE;
    }
  } catch (error) {
    if (error instanceof ParseError) {
      err(error.format());
      return Exit.TROUBLE;
    }
    if (error instanceof UsageError) {
      err(error.message);
      return Exit.TROUBLE;
    }
    if (error && error.code === 'ENOENT') {
      err(`cannot read ${error.path}`);
      return Exit.TROUBLE;
    }
    throw error;
  }
}

/**
 * Reads the arguments into an options object.
 *
 * @param {string[]} argv the arguments
 * @returns {object} the parsed options
 * @throws {UsageError} when a flag is unknown or missing its value
 */
export function parseArguments(argv) {
  const options = {
    command: argv[0],
    files: [],
    context: 3,
    fuzz: 2,
    ignoreWhitespace: false,
    ignoreCase: false,
    words: false,
    git: false,
    contextFormat: false,
    reverse: false,
    inline: false,
    output: null,
    dryRun: false,
    diff3: false,
  };

  const value = (flag, at) => {
    const next = argv[at + 1];
    if (next === undefined) throw new UsageError(`${flag} needs a value`);
    return next;
  };

  for (let at = 1; at < argv.length; at++) {
    const argument = argv[at];

    switch (argument) {
      case '-c': case '--context': {
        const given = Number(value(argument, at));
        if (!Number.isInteger(given) || given < 0) {
          throw new UsageError(
            `--context needs a non-negative whole number, got '${argv[at + 1]}'`,
          );
        }
        options.context = given;
        at++;
        break;
      }
      case '--fuzz': {
        const given = Number(value(argument, at));
        if (!Number.isInteger(given) || given < 0) {
          throw new UsageError(`--fuzz needs a non-negative whole number, got '${argv[at + 1]}'`);
        }
        options.fuzz = given;
        at++;
        break;
      }
      case '-o': case '--output':
        options.output = value(argument, at);
        at++;
        break;
      case '-w': case '--ignore-space': options.ignoreWhitespace = true; break;
      case '-i': case '--ignore-case': options.ignoreCase = true; break;
      case '--words': options.words = true; break;
      case '--git': options.git = true; break;
      case '--context-format': options.contextFormat = true; break;
      case '-R': case '--reverse': options.reverse = true; break;
      case '--inline': options.inline = true; break;
      case '--dry-run': options.dryRun = true; break;
      case '--diff3': options.diff3 = true; break;
      default:
        if (argument.startsWith('-') && argument !== '-') {
          throw new UsageError(`unknown option '${argument}' -- try --help`);
        }
        options.files.push(argument);
    }
  }

  return options;
}

function expect(options, count, shape) {
  if (options.files.length !== count) {
    throw new UsageError(`${options.command} takes ${shape}`);
  }
}

function runDiff({ out, read, write, options }) {
  expect(options, 2, 'two files: an old one and a new one');
  const [oldPath, newPath] = options.files;

  const diff = diffText(read(oldPath), read(newPath), {
    context: options.context,
    oldPath,
    newPath,
    ignoreWhitespace: options.ignoreWhitespace,
    ignoreCase: options.ignoreCase,
  });

  if (diff.isEmpty) return Exit.SAME;

  let text;
  if (options.contextFormat) text = formatContext(diff);
  else if (options.git) text = formatGitStyle(diff);
  else text = formatUnified(diff);

  if (options.inline) text = annotate(diff, text);

  if (options.output) write(options.output, text);
  else out(text.replace(/\n$/, ''));

  return Exit.DIFFERENT;
}

/**
 * Appends a word-level view of each changed pair in the diff.
 *
 * Appended rather than woven into the patch, because a patch with extra
 * lines in it is no longer a patch that applies.
 *
 * @param {object} diff the diff
 * @param {string} text the formatted patch
 * @returns {string} the patch with the inline view after it
 */
function annotate(diff, text) {
  const notes = [];

  for (const hunk of diff.hunks) {
    for (const pair of pairChanges(hunk)) {
      const marked = markInline(pair.before, pair.after);
      notes.push(`-${marked.before}`);
      notes.push(`+${marked.after}`);
    }
  }

  if (notes.length === 0) return text;
  return `${text}\n# word-level view\n${notes.join('\n')}\n`;
}

function runApply({ out, err, read, write, options }) {
  expect(options, 2, 'two files: the file to patch and the patch');
  const [target, patchPath] = options.files;

  const text = read(target);
  const diffs = parsePatch(read(patchPath));

  if (diffs.length === 0) {
    err('the patch contains no hunks');
    return Exit.TROUBLE;
  }
  if (diffs.length > 1) {
    err(`the patch describes ${diffs.length} files; apply takes a single-file patch`);
    return Exit.TROUBLE;
  }

  const diff = options.reverse ? reverse(diffs[0]) : diffs[0];
  const result = applyPatch(text, diff, { fuzz: options.fuzz });

  for (const hunk of result.hunks) {
    const line = hunk.describe();
    if (hunk.applied) out(line);
    else err(line);
  }

  if (!result.ok) return Exit.DIFFERENT;

  if (options.dryRun) {
    out(`would write ${target}`);
    return Exit.SAME;
  }

  write(options.output ?? target, result.text);
  return Exit.SAME;
}
