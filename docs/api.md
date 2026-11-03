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
