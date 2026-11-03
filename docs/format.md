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
