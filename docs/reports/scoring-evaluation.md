# Scoring Evaluation

## Scope

This evaluation examines the fixed weights in the recommendation score and Hybrid
memory retrieval. It does not change either production default. The two experiments
answer different questions: LongMemEval provides labels for retrieval, whereas the
recommendation fixtures exercise ranking behavior without independent relevance
judgments. Their results should not be presented as equivalent quality measures.

## Hybrid Retrieval

The evaluated family is
`S = alpha * cosine(query, candidate) + (1 - alpha) * 2^(-ageHours / halfLifeHours)`.
The grid uses alpha = 0.5, 0.7, 0.9 and half-lives of 24, 72, 168 and 720 hours,
plus pure recency and pure semantic endpoints: 14 distinct ranking configurations.
All configurations use the same 60 stratified LongMemEval-S questions, 2,000-character
chunks, nomic-embed-text vectors, question timestamps and k=5. Recall is averaged
over questions and measures recovery of labelled chunks, not answer correctness.

| Configuration | Recall@5 |
|---|---:|
| Pure recency | 0.0083 |
| Default: alpha 0.7, 72 hours | 0.3458 |
| Alpha 0.7, 168 hours | 0.4319 |
| Alpha 0.7, 720 hours | 0.5889 |
| Alpha 0.9, 72 hours | 0.6486 |
| Pure semantic | 0.6236 |

Increasing semantic weight or extending the half-life reduces the default's loss
of older relevant evidence on this sample. For question `118b2229`, about daily
commute duration, the labelled chunk has cosine 0.6744 but is 191.3 hours old.
Its default composite is 0.5197. An irrelevant chunk only 4.1 hours old, with a much
lower cosine of 0.4311, scores 0.5902. The labelled chunk is first under semantic
ranking but absent from the default top five.

The highest observed grid result is not an independently validated optimum.
Alpha 0.9 / 72 hours improves recall over pure semantic on four questions, worsens
one and ties 55. It improves over the default on 22 and ties 38. The small advantage
over semantic therefore comes from very few questions. At question-type level it
retains the default temporal recall of 0.5833 versus semantic's 0.4833, while
multi-session recall is lower than semantic (0.5417 versus 0.5917).

### Timestamp and Cache Checks

Seven questions contain candidate sessions dated after the question; two include
labelled evidence in those future sessions. The production formula allows negative
ages, making recency exceed 1. A control that clamps negative ages to zero leaves
default recall unchanged and reduces alpha 0.9 / 72 hours from 0.6486 to 0.6403.
Clamping does not remove future information. Excluding all seven affected questions
leaves 53 cases: default 0.3538, alpha 0.9 / 72 hours 0.6682, semantic 0.6494.
The broad ranking is unchanged, but temporal conclusions need this qualification.

The candidate cache contains 34,321 unique vectors used by these cases. Its legacy
metadata records only the model name. Six deterministic sample texts were embedded
again with the installed model and matched cached vector directions to numerical
precision; this is a compatibility check, not complete provenance verification.
New query embeddings are cached by model digest. Dataset/cache hashes, model details,
per-question rankings and the raw/clamped controls are preserved in the JSON output.

The next validation should freeze a candidate parameter set and test questions not
used by this scan, checking timestamp consistency before selection. The current
experiment does not justify changing production defaults automatically or claiming
that Hybrid is universally better than semantic retrieval.

## Scenario Recommendation

The default is `R = 0.55W + 0.20E + 0.15C + 0.10P`:

- W is average weakness across targeted skills with at least three valid observations.
- E averages the observation count, capped at five per skill, across all target skills.
  It is not an independent confidence estimate. Confidence already affects the
  mastery update that supplies W.
- C measures the distance between scenario difficulty and self-reported CEFR.
- P measures keyword overlap with the learner's goal and interests.

Sixty synthetic learner fixtures cover ten evidence patterns, three CEFR levels
and two profile directions. Patterns include cold start, two versus three
observations, competing weaknesses, improving scores and low-score successes.
Scenario signals have linked completed sessions, transcript messages and summaries;
these are fixture ratings, not observed learner data or LLM-generated ratings.
Both current catalogue scenarios survive eligibility checks in all 60 scoring cases.
Separate boundary probes test cases with fewer candidates so their behavior is not
credited to the ranking weights.

| Ablation | Cases whose first recommendation changes |
|---|---:|
| Equal weights | 8/60 |
| Weakness only | 19/60 |
| Remove W and renormalize | 8/60 |
| Remove E and renormalize | 0/60 |
| Remove C and renormalize | 7/60 |
| Remove P and renormalize | 19/60 |

Profile fit has a larger observed effect on the first recommendation than weakness
in this fixture set, despite its smaller nominal weight. This is partly a property
of the scenarios and inputs: the two profile directions deliberately align with
different scenarios, while cold/sparse cases set W to zero. Equal scalar evidence
on the two tested skills also does not imply equal components, because the templates
have different numbers of target skills and those skills have different CEFR priors.
The result is not evidence that P should be removed or that W is unimportant.
Likewise, removing E changes no first choices here, which does not establish that E
is redundant across a larger catalogue or a different learner distribution.

Each weight was also multiplied by 0.8, 1.0 or 1.2 and renormalized. Deduplicating
uniformly scaled equivalents and excluding the baseline leaves 78 perturbations.
Twelve of 60 fixtures change their first recommendation under at least one
perturbation; 90 of 4,680 comparisons change (1.92%). These are correlated synthetic
comparisons, not 4,680 independent learners. The flipping fixtures have baseline
score margins between 0.0179 and 0.0532. Weakness-only scoring creates 12 ties, which
the production template-ID tiebreak resolves without a pedagogical preference.

All 60 baseline scores/rankings match the production recommender. Nine additional
checks pass: relationship eligibility, dismiss cooldown, open sessions, completion
cooldown, hidden completion, CEFR exclusion, retracted corrections, cascade-hidden
corrections and hidden scenario evidence. Correct filtering and stable rankings do
not show that the recommendations help learners.

To evaluate relevance, the next dataset needs independently judged learner/scenario
pairs and more than two eligible scenarios. Judgments should cover skill match,
appropriate difficulty and usefulness; they must not be generated from this same
weighted formula. Weights can then be selected on development cases and evaluated
on separate learner histories. A learner study would still be needed for learning
outcomes.

## Reproduction and Files

Run under the repository's pinned Node version:

```bash
npm run typecheck:scoring-eval
npm run eval:hybrid:sensitivity
npm run eval:recommendation:sensitivity -- --test
```

The Hybrid command needs existing files in `.cache/eval/` from the earlier
LongMemEval benchmark and a running Ollama with nomic-embed-text. It does not access
SQLite or run the chat model. The recommendation command overrides DATABASE_URL
with a new temporary SQLite database, applies all migrations, seeds it, runs optional
API tests and deletes that database. It does not access the application database.

- [Hybrid results](data/hybrid-sensitivity.md) and [per-query JSON](data/hybrid-sensitivity.json).
- [Recommendation results](data/recommendation-sensitivity.md) and [per-case JSON](data/recommendation-sensitivity.json).
- [Migration, seed, test and recommendation execution log](data/recommendation-sensitivity-run.log).

These are supplementary exploratory evaluations. The existing benchmark artifacts,
report text, production weights and user data are unchanged.
