# The unified diff format

There is no specification. There is `diff -u`, `git diff`, and thirty years
of consensus. This is what that consensus actually requires, written down
because every part of it has caught somebody out.

## The shape

```
--- old/path	optional timestamp
+++ new/path	optional timestamp
@@ -1,4 +1,4 @@
 context line
-removed line
+added line
 context line
```

Anything before the first `---` is prose and is skipped. Mail clients,
review tools and commit messages all put text there, and a parser that
refuses an emailed patch is a parser nobody can use.

## The hunk header

```
@@ -oldStart,oldCount +newStart,newCount @@
```

The numbers are **one-based line numbers and line counts**, not change
counts. `oldCount` includes context lines.

**A count of exactly one is omitted.** `@@ -1 +1 @@` and `@@ -1,1 +1,1 @@`
mean the same thing, but only the first is what tools emit, and a tool that
always writes the long form produces patches that look wrong next to
everything else.

**A count of zero means the side is empty**, and the start names the line the
change *follows*. Inserting at the very beginning of a file is therefore
`-0,0`:

```
@@ -0,0 +1 @@
+the only line
```

The counts are **load-bearing**. If they disagree with the lines that follow,
the patch has been edited or truncated, and applying it anyway corrupts the
file silently. So they are checked, and a mismatch is a parse error.

## The line prefixes

| prefix | meaning |
| --- | --- |
| `` (space) | unchanged, present on both sides |
| `-` | removed from the old side |
| `+` | added on the new side |
| `\` | a note about the line above, not content |

Every line of content is shifted one column right, which has a consequence
nobody likes: **an empty context line is a line containing a single space.**
Editors strip trailing whitespace, mail clients reflow, and the patch is
broken by the time it arrives. So this parser accepts a bare empty line
inside a hunk as a context line too — unambiguous, because nothing else in a
hunk is empty.

## No newline at the end

A text file may or may not end with a newline, and the difference is a byte.
The format says so with:

```
\ No newline at end of file
```

placed **immediately after the line it refers to**.

Three things follow, and together they are the most commonly broken part of
the format.

**Both sides can need one.** A hunk that changes the final line of two files
that both lack a final newline carries *two* markers:

```
@@ -1,2 +1,2 @@
 a
-b
\ No newline at end of file
+B
\ No newline at end of file
```

A tool that emits only the last marker has lost the old side's fact, and the
patch then reverses into one that adds a byte nobody asked for.

**A side whose last line is not in any hunk needs no marker.** The patch does
not touch the end of that file and is in no position to claim anything about
it.

**Adding a final newline is itself a change.** The lines are identical, so a
tool that compares only line content reports no difference — and `diff`
reports one:

```
$ printf 'a' > x; printf 'a\n' > y; diff -u x y
--- x
+++ y
@@ -1 +1 @@
-a
\ No newline at end of file
+a
```

## The git header

```
diff --git a/path b/path
index 8baef1b..ce01362 100644
--- a/path
+++ b/path
```

The `a/` and `b/` prefixes are not part of the path and come off when
parsing. So does a tab and a timestamp after the path, which is what
`diff -u` writes.

`/dev/null` on one side means the file was created or deleted, and survives
parsing as itself because it means something.

The `index` line carries blob hashes, which this library does not compute. It
is read and ignored, and never written: a wrong hash is worse than an absent
one.
