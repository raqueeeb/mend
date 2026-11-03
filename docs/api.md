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
