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

test('diff can write a git-style header', () => {
  const result = run(['diff', 'old.txt', 'new.txt', '--git'], FILES);
  assert.match(result.out, /^diff --git a\/old\.txt b\/new\.txt$/m);
});

test('diff can write an old-style context diff', () => {
  const result = run(['diff', 'old.txt', 'new.txt', '--context-format'], FILES);
  assert.match(result.out, /^\*{15}$/m);
  assert.match(result.out, /^- two$/m);
});

test('diff can send its output to a file', () => {
  const result = run(['diff', 'old.txt', 'new.txt', '-o', 'out.patch'], FILES);
  assert.equal(result.out, '');
  assert.match(result.written['out.patch'], /^@@ -1,3 \+1,3 @@$/m);
  assert.ok(result.written['out.patch'].endsWith('\n'), 'a patch file ends with a newline');
});

test('diff --inline adds a word-level view after the patch', () => {
  // After, not woven in: a patch with extra lines in it is no longer a patch
  // that applies.
  const files = {
    'a.txt': L('the quick brown fox'),
    'b.txt': L('the slow brown fox'),
  };
  const result = run(['diff', 'a.txt', 'b.txt', '--inline'], files);

  assert.match(result.out, /# word-level view/);
  assert.match(result.out, /-the \[quick\] brown fox/);
  assert.match(result.out, /\+the \[slow\] brown fox/);
});

test('diff needs exactly two files', () => {
  assert.match(run(['diff', 'old.txt'], FILES).err, /two files/);
  assert.equal(run(['diff', 'old.txt'], FILES).code, Exit.TROUBLE);
  assert.equal(run(['diff', 'a', 'b', 'c'], FILES).code, Exit.TROUBLE);
});

test('a file that is not there is reported, not thrown', () => {
  const result = run(['diff', 'missing.txt', 'new.txt'], FILES);
  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.err, /cannot read missing\.txt/);
});

// ---- apply --------------------------------------------------------------

test('apply patches the file in place', () => {
  const patch = run(['diff', 'old.txt', 'new.txt'], FILES).out;
  const result = run(['apply', 'old.txt', 'p.patch'], { ...FILES, 'p.patch': `${patch}\n` });

  assert.equal(result.code, Exit.SAME);
  assert.equal(result.written['old.txt'], L('one', 'TWO', 'three'));
  assert.match(result.out, /Hunk #1 applied at 1/);
});

test('apply can write somewhere else', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['apply', 'old.txt', 'p.patch', '-o', 'patched.txt'], {
    ...FILES, 'p.patch': patch,
  });

  assert.equal(result.written['patched.txt'], L('one', 'TWO', 'three'));
  assert.equal(result.written['old.txt'], undefined, 'the original is untouched');
});

test('apply --dry-run reports without writing', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['apply', 'old.txt', 'p.patch', '--dry-run'], {
    ...FILES, 'p.patch': patch,
  });

  assert.equal(result.code, Exit.SAME);
  assert.match(result.out, /would write old\.txt/);
  assert.deepEqual(result.written, {});
});

test('apply -R undoes a patch', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['apply', 'new.txt', 'p.patch', '-R'], { ...FILES, 'p.patch': patch });

  assert.equal(result.code, Exit.SAME);
  assert.equal(result.written['new.txt'], L('one', 'two', 'three'));
});

test('a hunk that does not apply goes to standard error and exits one', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['apply', 'unrelated.txt', 'p.patch'], {
    ...FILES,
    'p.patch': patch,
    'unrelated.txt': L('nothing', 'like', 'it'),
  });

  assert.equal(result.code, Exit.DIFFERENT);
  assert.match(result.err, /Hunk #1 failed/);
  assert.deepEqual(result.written, {}, 'and nothing is written');
});

test('apply reports a patch it cannot read', () => {
  const result = run(['apply', 'old.txt', 'p.patch'], {
    ...FILES,
    'p.patch': '--- a\n+++ b\n@@ -1,9 +1,9 @@\n one\n',
  });

  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.err, /hunk header says 9 old/);
});

test('apply refuses a patch with no hunks', () => {
  const result = run(['apply', 'old.txt', 'p.patch'], { ...FILES, 'p.patch': 'just prose\n' });
  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.err, /no hunks/);
});

test('apply refuses a multi-file patch', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt', '--git'], FILES).out}\n`;
  const result = run(['apply', 'old.txt', 'p.patch'], {
    ...FILES, 'p.patch': patch + patch.replace(/old\.txt/g, 'z.txt'),
  });

  assert.equal(result.code, Exit.TROUBLE);
  assert.match(result.err, /describes 2 files/);
});

// ---- show ---------------------------------------------------------------

test('show summarises a patch', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['show', 'p.patch'], { 'p.patch': patch });

  assert.equal(result.code, Exit.DIFFERENT);
  assert.match(result.out, /old\.txt -> new\.txt/);
  assert.match(result.out, /\+1 -1 in 1 hunk/);
  assert.match(result.out, /@@ -1,3 \+1,3 @@  2 changed/);
  assert.match(result.out, /1 file$/);
});

test('show counts the files in a multi-file patch', () => {
  const one = `${run(['diff', 'old.txt', 'new.txt', '--git'], FILES).out}\n`;
  const result = run(['show', 'p.patch'], { 'p.patch': one + one.replace(/old\.txt/g, 'z.txt') });

  assert.match(result.out, /2 files$/);
});

test('show -R summarises the patch the other way round', () => {
  const patch = `${run(['diff', 'old.txt', 'new.txt'], FILES).out}\n`;
  const result = run(['show', 'p.patch', '-R'], { 'p.patch': patch });

  assert.match(result.out, /new\.txt -> old\.txt/);
});

// ---- merge --------------------------------------------------------------

test('merge takes the one-sided change', () => {
  const result = run(['merge', 'base.txt', 'ours.txt', 'base.txt'], FILES);
  assert.equal(result.code, Exit.SAME);
  assert.equal(result.out, L('one', 'OURS', 'three').replace(/\n$/, ''));
});

test('merge marks a conflict and exits one', () => {
  const result = run(['merge', 'base.txt', 'ours.txt', 'theirs.txt'], FILES);

  assert.equal(result.code, Exit.DIFFERENT);
  assert.match(result.out, /^<<<<<<< ours\.txt$/m);
  assert.match(result.out, /^>>>>>>> theirs\.txt$/m);
  assert.match(result.err, /1 conflict$/);
});

test('merge --diff3 shows the base inside the conflict', () => {
  const result = run(['merge', 'base.txt', 'ours.txt', 'theirs.txt', '--diff3'], FILES);
  assert.match(result.out, /^\|\|\|\|\|\|\| base$/m);
});

test('merge can write to a file', () => {
  const result = run(['merge', 'base.txt', 'ours.txt', 'base.txt', '-o', 'merged.txt'], FILES);
  assert.equal(result.written['merged.txt'], L('one', 'OURS', 'three'));
});

test('merge needs three files', () => {
  assert.match(run(['merge', 'base.txt', 'ours.txt'], FILES).err, /three files/);
});

// ---- stat ---------------------------------------------------------------

test('stat prints the counts and the similarity', () => {
  const result = run(['stat', 'old.txt', 'new.txt'], FILES);

  assert.equal(result.code, Exit.DIFFERENT);
  assert.match(result.out, /new\.txt \| 2 \+-/);
  assert.match(result.out, /similarity 66\.7%/);
});

test('stat on identical files exits zero', () => {
  const result = run(['stat', 'old.txt', 'base.txt'], FILES);
  assert.equal(result.code, Exit.SAME);
  assert.match(result.out, /similarity 100\.0%/);
});

test('stat warns when the new file still holds conflict markers', () => {
  const conflicted = run(['merge', 'base.txt', 'ours.txt', 'theirs.txt'], FILES).out;
  const result = run(['stat', 'base.txt', 'c.txt'], {
    ...FILES, 'c.txt': `${conflicted}\n`,
  });

  assert.match(result.out, /warning: the new file holds conflict markers/);
});
