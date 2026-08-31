# LongMemEval-S Turn Retrieval

> External benchmark run over 60 stratified, non-abstention questions from [LongMemEval-S](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json). Official answer-session IDs and has_answer turn labels are used for Recall@5.

| Strategy | Recall@5 | Mean latency (ms) | Mean retrieved tokens |
|---|---:|---:|---:|
| recency | 0.008 | 27.8 | 934.3 |
| summary | 0.008 | 28.1 | 94.6 |
| semantic | 0.624 | 69.4 | 866.3 |
| hybrid | 0.346 | 69.2 | 928.0 |

| Question type | n | Recency | Summary | Semantic | Hybrid |
|---|---:|---:|---:|---:|---:|
| knowledge-update | 10 | 0.000 | 0.000 | 0.500 | 0.200 |
| multi-session | 10 | 0.000 | 0.000 | 0.592 | 0.292 |
| single-session-assistant | 10 | 0.000 | 0.000 | 0.850 | 0.650 |
| single-session-preference | 10 | 0.000 | 0.000 | 0.417 | 0.150 |
| single-session-user | 10 | 0.000 | 0.000 | 0.900 | 0.200 |
| temporal-reasoning | 10 | 0.050 | 0.050 | 0.483 | 0.583 |

- Dataset: LongMemEval-S cleaned (500 total questions before filtering)
- Dataset SHA-256: d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442
- Adapter: one source conversation turn = one Popcorn ConversationSummary candidate; turns over 2,000 characters are chunked
- Embedding model: nomic-embed-text (0a109f422b47e3a30ba2b10eca18548e944e8a23073ee3f3e947efcf3c45e59f)
- Git commit: 2c7ce7b919caedc13c2558835c5e725e76b577f0
- Run time: 2026-08-31T11:01:10.099Z
- Host: HTGHR2Y6HY / darwin 25.6.0 / Node v24.19.0

This is a retrieval-only external validity check. It does not evaluate answer generation, memory extraction, or educational effectiveness.
