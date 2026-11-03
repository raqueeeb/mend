import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Exit, main, parseArguments } from '../src/cli.js';
import { UsageError } from '../src/index.js';
import { L, throwsWith } from './helpers.js';

/**
 * Runs the CLI against an in-memory filesystem.
 *
 * The real entry point, with the streams and the file access injected, so a
 * test drives the actual code rather than a reimplementation of it.
 */
function run(argv, files = {}) {
  const out = [];
  const err = [];
  const written = {};

  const code = main(argv, {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    read: (path) => {
      if (!(path in files)) {
        const error = new Error(`no such file: ${path}`);
        error.code = 'ENOENT';
        error.path = path;
        throw error;
      }
      return files[path];
    },
    write: (path, text) => { written[path] = text; },
  });

  return {
    code, out: out.join('\n'), err: err.join('\n'), written,
  };
}

const FILES = {
  'old.txt': L('one', 'two', 'three'),
  'new.txt': L('one', 'TWO', 'three'),
  'base.txt': L('one', 'two', 'three'),
  'ours.txt': L('one', 'OURS', 'three'),
  'theirs.txt': L('one', 'THEIRS', 'three'),
};

test('no arguments prints the usage and is trouble', () => {
  // Trouble rather than success: the invocation was wrong.
  const result = run([]);
  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.out, /usage:/);
});

test('--help prints the usage and succeeds', () => {
  const result = run(['--help']);
  assert.equal(result.code, Exit.SAME);
  assert.match(result.out, /mend diff/);
  assert.match(result.out, /exit codes:/);
});

test('--version prints the version alone', () => {
  const result = run(['--version']);
  assert.equal(result.code, Exit.SAME);
  assert.match(result.out, /^\d+\.\d+\.\d+$/);
});
