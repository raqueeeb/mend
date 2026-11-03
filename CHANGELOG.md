# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
uses [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-11-03

The first release. A diff and patch engine with no dependencies.

### Added

- **Myers' diff algorithm**, O((N+M)D), so the cost tracks how different two
  texts are rather than how long they are: one changed line in ten thousand
  takes about a millisecond. The common prefix and suffix are stripped first,
  the state is a flat typed array indexed by diagonal, and the path is
  recovered by backtracking a recorded trace.
- **A ceiling on the search.** The worst case is quadratic, so past
  `MAX_EDIT_DISTANCE` the search returns a correct but non-minimal script and
  says `minimal: false` rather than hanging on two unrelated files.
- **Line, word and character granularity.** Word splitting keeps the
  whitespace between words as its own token, so the text rebuilds exactly and
  a change of spacing reads as one.
- **Whitespace and case folding**, applied to a comparison key rather than to
  the lines, so the output still shows the original text.
- **Hunk grouping** with configurable context, splitting where the gap
  between changes exceeds twice the context.
- **Unified, git-style, context and stat output**, including the parts of the
  format that are easy to get wrong: a count of one omitted from a hunk
  header, a lone space for an empty context line, and one
  `\ No newline at end of file` marker per side that needs one.
- **A unified diff parser** that skips the prose before the first `---`, so
  an emailed patch parses; strips `a/` prefixes and timestamps from paths;
  tolerates an empty context line whose trailing space an editor ate; and
  refuses a hunk whose line counts disagree with its contents, because that
  patch has been truncated and applying it would corrupt the file silently.
- **Reversing a patch**, swapping the paths, operations, line numbers, counts
  and newline facts together.
- **Applying a patch** with offset search and fuzz, where a failure is a
  returned result carrying which hunk, where it looked and what was there
  instead — a patch that does not match is an ordinary outcome, not an
  exception. Fuzz never drops a line the hunk changes.
- **Three-way merge**, comparing whole changed regions so a five-line rewrite
  is one conflict rather than five, with `diff3`-style output and a
  conflict-marker check for use before a commit.
- **Similarity and inline diffs**: a ratio for rename detection, word-level
  marking of two lines with each side showing only its own changes, and
  positional pairing of removed and added lines.
- **A command line** with `diff`, `apply`, `show`, `merge` and `stat`, whose
  exit codes follow `diff`: 0 for no differences, 1 for differences, 2 for
  trouble.
- **197 tests**, including a check that the edit distance is genuinely
  minimal against a brute-force LCS over two thousand random pairs, and a
  round-trip property over three thousand more.
- A benchmark, a dependency-free linter, and three documents: the design, the
  format as actually practised, and the API.

### Notes

- Whether a file ends with a newline is treated as part of its content, so
  `"a"` and `"a\n"` differ — as `diff` reports them.
- No `index` line is written in git-style output: it carries blob hashes this
  library does not compute, and a wrong hash is worse than an absent one.
- File modes, renames and binary diffs are not handled; those header lines
  are skipped rather than acted on.
