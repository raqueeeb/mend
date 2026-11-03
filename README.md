# mend

A diff and patch engine, in JavaScript, with no dependencies.

Compare two texts, write the difference as a unified patch, read one back,
apply it to a file that has since moved on, and merge two sets of changes
using their common ancestor.

```js
import { createPatch, patch, merge } from 'mend-diff';

const before = 'one\ntwo\nthree\n';
const after = 'one\nTWO\nthree\n';

createPatch(before, after, { oldPath: 'f.txt', newPath: 'f.txt' });
// --- f.txt
// +++ f.txt
// @@ -1,3 +1,3 @@
//  one
// -two
// +TWO
//  three

patch(before, createPatch(before, after));   // 'one\nTWO\nthree\n'
```

## Why it exists

Four things in a diff tool are more interesting than they look.

**The algorithm.** Finding the shortest edit script between two sequences is
a shortest-path problem through an edit grid. Filling the grid is O(NM) —
a hundred million cells for two ten-thousand-line files. Myers' 1986 insight
is to search by *edit distance* instead: for each distance D, record only the
furthest point reachable on each diagonal, and stop at the first D that
reaches the corner. The cost becomes O((N+M)D), so it tracks how **different**
the files are rather than how long they are. The measured difference on a
ten-thousand-line file:

```
1 in 100 lines changed                        6.409 ms/op
1 in 10 lines changed                       197.297 ms/op
```

That is also the trade: the worst case is quadratic, so there is a ceiling
past which the search stops insisting on a minimal answer and says so.

**A patch is a hint, not an address.** A patch says "at line 40, replace
these lines" — and the file in front of it is rarely the file the patch was
made against. Two standard mechanisms make it apply anyway. *Offset search*
looks outwards from line 40 for a position where the hunk's lines match, so a
patch against a file that gained ten lines at the top applies with an offset
of ten. *Fuzz* drops a line of context from each end and tries again, because
context exists to locate the hunk, not to be applied. Fuzz never drops a line
the hunk **changes** — that would change the result rather than where it
lands.

**A failed apply is not an error.** A patch that does not match the file is
an ordinary outcome, and the caller needs the details: which hunk, where it
looked, and what was there instead. So applying returns a result, and only a
patch that cannot be *parsed* throws.

**Three-way merge needs the ancestor.** Two people changed a file. A two-way
diff cannot tell which version is the change, so it has to call every
difference a conflict. With the common ancestor in hand, a region only one
side touched takes that side's version, and only a region both sides changed
*differently* conflicts — compared as a region, so a five-line rewrite is one
conflict rather than five.

## Install

No dependencies, and nothing to build.

```sh
git clone https://github.com/Mohammed-Abdul-Raqueeb/mend.git
cd mend
npm test
```

Node 20 or newer.

## The command line

```sh
$ mend diff old.txt new.txt
--- old.txt
+++ new.txt
@@ -1,3 +1,3 @@
 one
-two
+TWO
 three

$ mend diff old.txt new.txt -o change.patch
$ mend apply old.txt change.patch
Hunk #1 applied at 1

$ mend show change.patch
old.txt -> new.txt
  +1 -1 in 1 hunk
  @@ -1,3 +1,3 @@  2 changed
1 file

$ mend merge base.txt ours.txt theirs.txt
one
<<<<<<< ours.txt
OURS
=======
THEIRS
>>>>>>> theirs.txt
three

$ mend stat old.txt new.txt
new.txt | 2 +-
similarity 66.7%
```

Exit codes follow `diff`, which is older than the convention it breaks: **0**
means no differences, **1** means there were differences, and **2** means the
tool could not do its job. A script that treats 1 as failure is wrong about
`diff` too.

`mend --help` lists every flag.

## What it handles

**The awkward parts of the format**, which are most of the format:

- A hunk header counts lines, not changes, and omits a count of one, so
  `@@ -1 +1 @@` rather than `@@ -1,1 +1,1 @@`.
- A context line is a space followed by the text, which means an empty
  context line is a lone trailing space. Real, and the reason so many patches
  are broken by editors that strip it — so the parser tolerates a bare empty
  line too.
- A file with no final newline is marked with `\ No newline at end of file`.
  Both sides can need one. A hunk changing the last line of two such files
  carries **two** markers, and a patch that emits only the last of them
  reverses into one that adds a byte nobody asked for.
- Whether a file ends with a newline is part of its content: `"a"` and
  `"a\n"` differ, and `mend diff` says so, as `diff` does.
- Prose before the first `---` is skipped, so an emailed patch parses.
- A `diff --git` header is written and read; no `index` line is written,
  because it carries blob hashes this library does not compute and a wrong
  hash is worse than none.

**Line, word and character granularity.** Lines for code, words for prose,
characters for a short string. Word splitting keeps the whitespace between
words as its own token, so the text rebuilds exactly and a change of spacing
reads as a change of spacing rather than as every word being rewritten.

**Whitespace and case folding**, done by comparing a *key* rather than by
editing the lines, so the output still shows the original text.

## Documentation

- [docs/design.md](docs/design.md) — the algorithm, and the decisions
  around it
- [docs/format.md](docs/format.md) — the unified diff format, as actually
  practised
- [docs/api.md](docs/api.md) — the public API

## Layout

```
src/
  myers.js       the algorithm: shortest edit script between two sequences
  tokenize.js    splitting text into lines, words or characters
  diff.js        diffing text, and grouping changes into hunks
  unified.js     writing a unified, git-style or context diff
  parse.js       reading a unified diff, and reversing one
  apply.js       applying a patch, with offset search and fuzz
  merge.js       three-way merge with conflict markers
  similarity.js  how alike two texts are, and word-level highlighting
  errors.js      the two exception types, and where the line is drawn
  cli.js         the five subcommands
test/            197 tests, including a check that the edit distance is
                 minimal against a brute-force LCS
bench/           the benchmark above
tools/lint.js    the linter, which is also dependency-free
```

## Licence

MIT.
