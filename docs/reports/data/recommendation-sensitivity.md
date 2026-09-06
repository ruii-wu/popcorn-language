# Recommendation Scoring Sensitivity

Synthetic scoring sensitivity, not recommendation relevance or learning efficacy.

10 archetypes x 3 CEFR levels x 2 profile directions; both catalogue scenarios eligible. Fixed clock, old completed sessions with linked transcript, summary and signals.

Ranking fixtures use synthetic scenario_summary evidence; correction invalidation is a separate boundary probe. No LLM or human annotator.

| Configuration | Top-1 differs from default | Tied scores |
|---|---:|---:|
| default | 0/60 | 0/60 |
| equal | 8/60 | 0/60 |
| weakness-only | 19/60 | 12/60 |
| without-weakness | 8/60 | 0/60 |
| without-evidence | 0/60 | 0/60 |
| without-cefr | 7/60 | 0/60 |
| without-profile | 19/60 | 0/60 |

Each component weight is multiplied by 0.8, 1.0 or 1.2, then renormalized. After deduplicating equivalent weights and excluding the baseline: 78 configurations. 12/60 cases flip at least once; 90/4680 case-configuration comparisons flip. These correlated cases are not independent learner observations.

All 60 default rankings and rounded scores match the production recommender. 9 separate eligibility/invalidation probes passed.

E is capped evidence count, not independent confidence; W ignores skills below three observations. Rank changes show component influence, not which recommendation is pedagogically better. The two-scenario catalogue cannot support a broad quality claim or optimal-weight claim.

Run: `npm run eval:recommendation:sensitivity`; optional `-- --test` also runs API tests on temporary SQLite. The wrapper deploys migrations, seeds base data and deletes its temporary database. No Ollama is required. Per-case inputs, components, scores and perturbation outcomes are in the companion JSON.
