# Design

Five stages, each understandable without the others:

```
text  ->  tokens  ->  edit script  ->  hunks  ->  patch text
     tokenize      myers          diff        unified

patch text  ->  hunks  ->  patched text
           parse        apply

base + two versions  ->  regions  ->  merged text
                    merge
```

## The algorithm

The problem: given two sequences, find the shortest sequence of insertions
and deletions that turns one into the other.

Phrased as a graph it is a shortest path. Put the first sequence along the
top and the second down the side; moving right deletes a token, moving down
inserts one, and moving diagonally is free when the two tokens match. The
shortest path from one corner to the other is the shortest edit script, and
the diagonal moves are the longest common subsequence.

Filling that grid with dynamic programming is O(NM) in time and space. For
two ten-thousand-line files that is a hundred million cells, which is not a
diff tool, it is a memory problem.

**Myers' insight** is to search by edit distance rather than by position. At
distance D, only 2D+1 diagonals are reachable, and on each one only the
*furthest* point matters — a path that has got further on the same diagonal
for the same cost dominates every path behind it. So the state is one number
per reachable diagonal, the search proceeds D = 0, 1, 2, …, and the first D
that reaches the far corner is the answer.

That makes the cost O((N+M)D): proportional to how *different* the sequences
are rather than to how long they are. Two nearly identical files are nearly
free, which is the case that actually happens — every file in version control
is nearly identical to its previous version.

```
one line changed in 10,000      1.093 ms
1 in 100 lines changed          6.409 ms
1 in 10 lines changed         197.297 ms
```

Three implementation details are worth stating.

**The common prefix and suffix come off first.** This is not an
optimisation so much as the reason the bound is usable: an edit in the middle
of a large file leaves a tiny problem behind, and D is measured on what is
left. Without it, D for a one-line change in a ten-thousand-line file is
still 2, but every round of the search scans a width proportional to the
file.

**The state is a flat typed array with an offset**, not a map keyed by
diagonal. Diagonals run from -D to +D, so index `offset + k`. The arithmetic
is noise next to what a Map costs per lookup in the inner loop.

**The path is recovered by backtracking a recorded trace.** Each round of the
search snapshots its state, and the path is reconstructed from the end by
asking, at each distance, which diagonal the current point must have come
from. The alternative — the linear-space divide-and-conquer refinement from
the same paper — halves the memory and roughly doubles the constant factor,
and the memory was never the problem here.

## The ceiling

Myers is O((N+M)D) and D can be as large as N+M, so the worst case is
quadratic. Two files with nothing in common hit it exactly, and that case is
not hypothetical: it is what happens when someone diffs the wrong pair of
files.

A diff tool that hangs is worse than one that says "these are different". So
the search gives up past `MAX_EDIT_DISTANCE` and returns the honest fallback —
the whole middle was replaced — with `minimal: false` on the result so the
caller knows the answer is correct but not shortest.

```
2,000 lines, nothing in common              491.312 ms
the same, capped at distance 50               1.398 ms
```

## Runs, not individual edits

The algorithm naturally produces one edit per token. Everything downstream —
hunk grouping, patch output, apply — works in *runs* of the same operation,
so the runs are built here and nobody downstream has to coalesce. An `Edit`
carries its operation, its tokens, and where it starts in both sequences.

An `EQUAL` run takes its text from the **first** sequence. That is invisible
until whitespace or case folding is in play, at which point two tokens can
compare equal without being equal, and the question of which one to show
becomes real. The first sequence's version is what `diff` shows.

## Hunk grouping

A patch wants something coarser than one run per change: changes near each
other belong in the same hunk, with a few unchanged lines either side so the
hunk can be located again later.

The rule for "near each other" is the one every diff tool uses and none
explains: two changes share a hunk when the gap between them is at most
**twice** the context size. Twice, because at exactly that gap the trailing
context of the first change and the leading context of the second meet, and
splitting there would print the same lines in both hunks.

## Errors: thrown or returned

The decision that shapes every signature.

A patch that **will not parse** is a problem with the input, and the only
useful response is to say which line and why. That throws `ParseError`.

A patch that parses but **will not apply** is not broken at all — it simply
does not match the file in front of it, which is ordinary and expected. That
returns an `ApplyResult` carrying which hunks applied, at what offset, with
how much fuzz, and for the ones that failed, what was expected and what was
there instead.

A caller passing a number where text belongs throws `UsageError`, because
there is nothing to report a result about.

## Applying a patch

The stated line number is a hint. Two mechanisms, both standard, and the
second is the one people get wrong.

**Offset search** looks outwards from the stated position — 41, 39, 42, 38 —
for a place where all of the hunk's old lines match. Outwards rather than
forwards because a patch is as likely to have moved up as down, and the
nearest match is the one most likely to be right.

**Fuzz** drops a line of context from each end and searches again. Context
exists to locate the hunk, not to be applied, so a context line that no
longer matches is often harmless. Fuzz never drops a line the hunk
*changes*, and refuses a hunk that is all context — dropping those would
change the result rather than where it lands.

Each applied hunk shifts the lines after it, so the next hunk's stated
position is corrected by the drift accumulated so far.
