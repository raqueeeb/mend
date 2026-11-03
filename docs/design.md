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
