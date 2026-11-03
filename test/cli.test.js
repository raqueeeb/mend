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

test('an unknown command is reported', () => {
  const result = run(['frobnicate', 'a', 'b'], FILES);
  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.err, /unknown command 'frobnicate'/);
});

// ---- diff ---------------------------------------------------------------

test('diff writes a unified patch and exits one', () => {
  // One means "there were differences", as diff has always meant. A script
  // that treats it as failure is wrong about diff too.
  const result = run(['diff', 'old.txt', 'new.txt'], FILES);

  assert.equal(result.code, Exit.DIFFERENT);
  assert.match(result.out, /^--- old\.txt$/m);
  assert.match(result.out, /^\+\+\+ new\.txt$/m);
  assert.match(result.out, /^-two$/m);
  assert.match(result.out, /^\+TWO$/m);
});

test('diff on identical files writes nothing and exits zero', () => {
  const result = run(['diff', 'old.txt', 'base.txt'], FILES);
  assert.equal(result.code, Exit.SAME);
  assert.equal(result.out, '');
});

test('diff honours the context size', () => {
  const files = {
    'a.txt': L('1', '2', '3', '4', '5', '6', '7'),
    'b.txt': L('1', '2', '3', 'X', '5', '6', '7'),
  };

  const tight = run(['diff', 'a.txt', 'b.txt', '-c', '0'], files);
  assert.match(tight.out, /@@ -4 \+4 @@/);

  const loose = run(['diff', 'a.txt', 'b.txt', '--context', '1'], files);
  assert.match(loose.out, /@@ -3,3 \+3,3 @@/);
});

test('diff can ignore whitespace and case', () => {
  const files = { 'a.txt': L('Hello  world'), 'b.txt': L('hello world') };

  assert.equal(run(['diff', 'a.txt', 'b.txt'], files).code, Exit.DIFFERENT);
  assert.equal(run(['diff', 'a.txt', 'b.txt', '-w', '-i'], files).code, Exit.SAME);
});
