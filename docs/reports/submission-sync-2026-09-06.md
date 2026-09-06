# Submission Repository Sync

## Scope

Publish the existing scoring evaluation helpers, scripts, results, and supporting
documentation, preserving production weights. Synchronize the public
`ruii-wu/popcorn-language` and private `ruii-wu/popcorn_language` main branches
through normal fast-forward pushes. Preserve other branches and repository
visibility settings.

The private main branch already contained the Scenario/stream recovery fixes
that were one commit ahead of the public main branch. The new submission keeps
those fixes and their regression tests. Existing recommendation evaluation tools
remain supplementary; no recommendation ablation was added to the report and no
new scoring experiment was run for this synchronization.

## Checks Before Publication

- Node 24.19.0, `npm run verify`: passed.
- All 13 migrations, base seed, and demo seed: passed on temporary SQLite.
- API typecheck and 370 tests across 103 files: passed.
- Web typecheck and 40 tests across seven files: passed.
- Production web build: passed.
- `npm run typecheck:scoring-eval`: passed.
- `git diff --check`: passed.
- Reviewed the explicit publication list and scanned added evaluation text/data
  for common credential/private-key patterns; none were found. This is a scoped
  check, not a comprehensive security audit.
- No environment files, local databases, embedding caches, node_modules,
  generated web bundles, or unrelated video recordings are included.

Report front-matter changes are maintained in the separate LaTeX report directory:
the author-approved date, typed signature, and acknowledgments are not copied
into the application repository by this operation.

No production data reset, dependency upgrade, parameter tuning, forced push,
history rewrite, or deletion of existing branches is part of this sync.
