# Scoring Evaluation Change Log

## Changes

- Extracted default Hybrid and recommendation scoring helpers used by production
  code and evaluation. The numeric defaults, eligibility rules, four-decimal
  recommendation rounding and tie-breaking are unchanged.
- Added a 14-configuration LongMemEval sensitivity scan with per-question rankings,
  raw and clamped age controls, and a no-future-question subset.
- Added 60 synthetic recommendation cases, seven weight configurations, 78 unique
  nonbaseline weight perturbations and nine eligibility/evidence boundary checks.
- Added an isolated SQLite runner, three regression tests, a dedicated evaluation
  TypeScript config, npm commands, result files and methodology notes.

## Verification

- Node 24.19.0.
- All 13 migrations and base seed replayed successfully on temporary SQLite.
- API: 370 tests passed across 103 files, including the three formula regressions.
- API and Web typechecks passed; both evaluation scripts also typechecked.
- Hybrid: 60 questions x 14 configurations, with shared cached candidates and
  model-generated query embeddings; 60 queries also reranked under the age clamp.
- Recommendation: all 60 default rankings and scores matched production, and all
  nine boundary checks passed. Execution details are in the saved run log.

No production parameter tuning, schema change, dependency installation, demo reset,
report rewrite or remote push was performed. Existing untracked video recordings
were left untouched. Ollama was started temporarily for embedding verification and
stopped after the scan finished.
