# Hybrid Parameter Sensitivity

Exploratory parameter sensitivity; same 60 stratified questions as earlier evaluation, not held out.

All configurations share candidate chunks, embeddings, query timestamps, k=5 and stable tie-breaking. Raw cosine is not rescaled. Each of six question types has 10 questions.

| Configuration | Recall@5 | Clamp future ages: Recall@5 | MRR@5 | Better than default (questions) | Worse than default |
|---|---:|---:|---:|---:|---:|
| recency | 0.0083 | 0.0083 | 0.0167 | 0 | 28 |
| a0.5-h24 | 0.1333 | 0.1500 | 0.1519 | 0 | 16 |
| a0.5-h72 | 0.2167 | 0.2250 | 0.2275 | 0 | 10 |
| a0.5-h168 | 0.2611 | 0.2611 | 0.3067 | 1 | 8 |
| a0.5-h720 | 0.5014 | 0.5014 | 0.4703 | 14 | 4 |
| a0.7-h24 | 0.3167 | 0.3250 | 0.2942 | 1 | 5 |
| a0.7-h72 | 0.3458 | 0.3458 | 0.3783 | 0 | 0 |
| a0.7-h168 | 0.4319 | 0.4319 | 0.4150 | 8 | 2 |
| a0.7-h720 | 0.5889 | 0.5889 | 0.5789 | 21 | 5 |
| a0.9-h24 | 0.6153 | 0.6153 | 0.5664 | 21 | 2 |
| a0.9-h72 | 0.6486 | 0.6403 | 0.5689 | 22 | 0 |
| a0.9-h168 | 0.6264 | 0.6264 | 0.5831 | 22 | 3 |
| a0.9-h720 | 0.6264 | 0.6264 | 0.5864 | 22 | 3 |
| semantic | 0.6236 | 0.6236 | 0.5808 | 23 | 4 |

The default is a0.7-h72. Endpoints are pure recency and semantic ranking; half-life is irrelevant to them. Intermediate rows scan semantic weight and half-life (hours).

| Question type (10 each) | Default | a0.9-h72 | Semantic |
|---|---:|---:|---:|
| knowledge-update | 0.2000 | 0.5500 | 0.5000 |
| multi-session | 0.2917 | 0.5417 | 0.5917 |
| single-session-assistant | 0.6500 | 0.8500 | 0.8500 |
| single-session-preference | 0.1500 | 0.4667 | 0.4167 |
| single-session-user | 0.2000 | 0.9000 | 0.9000 |
| temporal-reasoning | 0.5833 | 0.5833 | 0.4833 |

7/60 questions contain sessions dated after the question; 2 also have labelled evidence in those sessions. Main results preserve these inputs and production negative-age behavior. The clamp control bounds the decay term at 1; it does not remove future information. Pure recency keeps timestamp ordering in both controls. A separate no-future-question subset (53 questions) is reported in JSON. Neither control repairs the dataset or establishes temporal causality.

This scan cannot establish optimal weights or a held-out improvement. Recall measures retrieval of labelled chunks, not language-learning outcomes. No latency claim is made.

Legacy cache records model name only. Six sampled vectors were re-embedded for compatibility; full historical provenance is unavailable.

Run: `npm run eval:hybrid:sensitivity`. Requires the existing LongMemEval-S dataset/candidate cache and Ollama nomic-embed-text. Query embeddings are cached by model digest. No database is accessed. Per-question rankings and provenance are in the companion JSON.
