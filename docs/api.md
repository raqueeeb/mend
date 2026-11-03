# API

Everything below comes from `src/index.js`.

```js
import { createPatch, diffText, applyPatch, merge } from 'mend-diff';
```

## Quick ways in

| function | what it does |
| --- | --- |
| `createPatch(before, after, options?)` | a unified patch, or `''` for no change |
| `patch(text, patchText, options?)` | the patched text, or `null` if it did not apply |
| `same(before, after, options?)` | whether there is any difference |

```js
createPatch('a\nb\n', 'a\nB\n', { oldPath: 'f', newPath: 'f' });
patch('a\nb\n', thatPatch);     // 'a\nB\n'
same('a\n', 'a\n');             // true
```

## Diffing

### `diffText(before, after, options?)`

Returns a `Diff`.

| option | default | meaning |
| --- | --- | --- |
| `context` | `3` | unchanged lines around each change |
| `oldPath`, `newPath` | `'a'`, `'b'` | the names to record |
| `ignoreWhitespace` | `false` | collapse runs and trim before comparing |
| `ignoreCase` | `false` | compare case-insensitively |
| `maxDistance` | `4000` | where the search stops insisting on minimal |

A `Diff` carries:

| field | meaning |
| --- | --- |
| `hunks` | the groups of changes |
| `isEmpty` | whether the texts were the same |
| `added`, `removed` | line counts |
| `summary` | e.g. `'+2 -1 in 1 hunk'` |
| `oldEndsWithNewline`, `newEndsWithNewline` | each side's final newline |
| `crlf` | whether either side used CRLF |
| `minimal`, `distance` | whether the script is shortest, and its length |

A `Hunk` carries `oldStart`, `oldLines`, `newStart`, `newLines`, its
`changes`, a `header` (`'@@ -1,3 +1,3 @@'`) and `changedLines`. Each change is
`{ operation, text, oldLine, newLine }`, where a line number is `null` on the
side the line does not exist on.

Both are frozen.

### `diffWords(before, after)` and `diffCharacters(before, after)`

Runs rather than hunks — there is nothing to locate in a file, so context and
grouping have nothing to do.

```js
diffWords('the quick fox', 'the slow fox');
// equal 'the ', delete 'quick', insert 'slow', equal ' fox'
```

### `diffSequences(before, after, options?)`

The algorithm itself, over arrays of anything comparable by `===`.

```js
const { edits, distance, minimal } = diffSequences(['a', 'b'], ['a', 'c']);
```

`options.beforeKeys` and `options.afterKeys` supply comparison keys, so two
tokens can compare equal while staying different in the output. That is how
whitespace and case folding work.

## Writing a patch

| function | what it writes |
| --- | --- |
| `formatUnified(diff, options?)` | a unified diff |
| `formatGitStyle(diff, options?)` | with a `diff --git` header |
| `formatContext(diff)` | the older context format |
| `formatStat(diff, options?)` | one line, as `diff --stat` prints |

`formatUnified` takes `headers` (default `true`), `oldLabel` and `newLabel`.
It returns `''` when there are no hunks — not an empty-looking patch with
headers — so the result can be tested for truth.

## Reading a patch

| function | what it does |
| --- | --- |
| `parsePatch(text)` | one `Diff` per file, in order |
| `parseOne(text)` | the single `Diff`, or throws |
| `reverse(diff)` | the diff that undoes it |

`reverse` swaps every side: the paths, the operations, the line numbers, the
counts and the newline facts. Missing any one of those produces a patch that
applies and then fails to round-trip.

```js
import { applyPatch, parseOne, reverse } from 'mend-diff';

const diff = parseOne(patchText);
applyPatch(after, reverse(diff));   // back to before
```

## Applying a patch

### `applyPatch(text, diff, options?)`

| option | default | meaning |
| --- | --- | --- |
| `fuzz` | `2` | context lines that may be dropped |
| `search` | `200` | how far either side of the stated line to look |
| `partial` | `false` | keep the hunks that did apply |

Returns an `ApplyResult`:

| field | meaning |
| --- | --- |
| `ok` | whether every hunk applied |
| `text` | the patched text, or the original when it failed |
| `hunks` | one `HunkResult` each |
| `appliedCount`, `failedCount` | counts |
| `describe()` | a report, one line per hunk |

A `HunkResult` carries `applied`, `line`, `offset`, `fuzz` and, when it
failed, `reason`. Its `describe()` reads as `patch` does:

```
Hunk #1 applied at 11 (offset 10 lines)
Hunk #2 applied at 40 (fuzz 1)
Hunk #3 failed: expected "one" at or near line 60, found "something else"
```

`canApply(text, diff, options?)` answers without producing the result.

## Merging

### `merge(base, ours, theirs, options?)`

| option | default | meaning |
| --- | --- | --- |
| `ourLabel`, `theirLabel` | `'ours'`, `'theirs'` | names in the markers |
| `diff3` | `false` | include the base inside a conflict |

Returns a `MergeResult` with `text`, `regions`, `clean` and
`conflictCount`. `mergeLines(base, ours, theirs)` returns the regions alone,
for a caller that wants to present conflicts its own way: each is either
`{ conflict: false, lines }` or `{ conflict: true, ours, base, theirs }`.

`hasConflictMarkers(text)` is a commit-time check — a file with markers in it
is a file nobody finished merging.

## Similarity and inline diffs

| function | what it does |
| --- | --- |
| `similarity(before, after, options?)` | a ratio from 0 to 1 |
| `isRename(before, after, threshold?)` | whether it is the same file, edited |
| `inlineDiff(before, after)` | word runs for two single lines |
| `markInline(before, after, options?)` | the two lines with changes marked |
| `pairChanges(hunk)` | removed lines paired with the added ones |

```js
markInline('the quick brown fox', 'the slow brown fox');
// { before: 'the [quick] brown fox', after: 'the [slow] brown fox' }
```

Each side is marked with **only its own** changes. Showing both sets on both
lines is a common mistake and makes each line unreadable as a line.

`pairChanges` pairs positionally and only where the counts match: guessing
which of five removed lines became which of two added ones produces worse
output than not guessing.

## Tokenizing

| function | what it does |
| --- | --- |
| `lines(text)` | lines, without endings; a trailing newline adds no empty line |
| `words(text)` | words *and* the whitespace between them, as separate tokens |
| `characters(text)` | by code point, so an emoji is one token |
| `split(text, granularity)` | dispatches on `Granularity` |
| `join(lines, trailing?, crlf?)` | the inverse of `lines` |
| `endsWithNewline(text)`, `usesCrlf(text)` | the two facts worth keeping |

```js
join(lines(text), endsWithNewline(text)) === text   // for any text
```

## Errors

`ParseError` is thrown for a patch that cannot be read; it carries `line`,
`text` and a `format()` that shows the offending line. `UsageError` is thrown
for a caller mistake — the wrong type, an impossible option. Both extend
`MendError`, so one `catch` covers the library.

A patch that does not *apply* throws nothing: see `ApplyResult`.
