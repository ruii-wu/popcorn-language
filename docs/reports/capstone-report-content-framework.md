# Popcorn Language Capstone Report Framework

## 1. Project Positioning

### Working title

> **Popcorn Language: A Relationship-First, Local-LLM-Powered Platform for Persistent and Adaptive Language Practice**

### One-line positioning

Popcorn Language is a relationship-first, local-first bilingual language-practice system. Persistent AI NPCs remember the learner and sustain relationships, while bounded scenarios and a learner model turn everyday conversation into practice that can be evaluated, accumulated, and adapted over time.

### Central narrative

The report follows one progression:

```text
AI-supported conversation
-> persistent persona and personal memory
-> stateful and structured scenario practice
-> corrections and learning evidence
-> learner model
-> adaptive scenario recommendation
```

Personal Memory and the Learner Model are deliberately separated:

| Personal Memory | Learner Model |
|---|---|
| Represents who the user is | Represents how the learner is performing |
| Facts, interests, plans, and shared experiences | Grammar, vocabulary, pragmatics, interaction, and trends |
| Supports relationship and conversational continuity | Supports feedback and adaptive practice |

### Scope of claims

The report presents an engineering capstone with evaluated technical contributions. It may claim that:

- the complete persistent-conversation-to-adaptive-practice loop was implemented;
- different Memory strategies were compared on a fixed retrieval task;
- local Ollama performance was measured for representative application workloads;
- the Learner Model and recommendation loop behave according to their stated design.

It must not claim that Popcorn has already improved language proficiency, engagement, or retention. Those outcomes require a controlled or longitudinal user study.

## 2. Front Matter

### Title page and declaration

Replace the template placeholders with the final project title, student, supervisor, examiner, degree year, and declaration date. Remove the dedication or publication appendix if they are not required.

### Acknowledgments

Keep this brief and personal. It should not describe the technical contribution.

### Abstract

Target approximately 250--350 words:

1. Context: LLMs enable open-ended language practice.
2. Problem: one-off chat lacks continuity, while local models introduce latency and reliability constraints.
3. Approach: relationship-based NPCs, Personal Memory, bounded scenarios, and a Learner Model inside an external Agent Harness.
4. Implementation: React/Hono/SQLite/Ollama system, described only at a high level.
5. Evaluation: Memory strategy comparison and local Ollama performance experiment.
6. Results: include only final measured values.
7. Conclusion: state engineering feasibility, not educational effectiveness.

The abstract should contain no citations, future-work list, or low-level implementation detail.

## 3. Chapter 1: Introduction

### 1.1 Motivation

Introduce conversational language practice, the value of low-pressure interaction, and the opportunity to make practice persistent rather than a sequence of isolated chatbot sessions. Explain why local inference is both a project constraint and an engineering opportunity.

### 1.2 Problem Statement

Frame four connected problems:

- generic chatbots do not sustain a relationship or stable persona over time;
- the model context window is not a reliable long-term user memory;
- open-ended generation is insufficient for stateful, goal-directed roleplay;
- one-off feedback does not automatically become a model of the learner or inform later practice.

### 1.3 Project Aim and Objectives

**Aim:** engineer a local-first bilingual language-practice application in which persistent AI companions support both social conversation and adaptive scenario practice.

**Objectives:**

1. build persistent, relationship-based NPC interaction using persona and Personal Memory;
2. create an Agent Harness for stateful and structured scenario interaction;
3. convert corrections and scenario outcomes into a Learner Model and explainable recommendations;
4. evaluate Memory retrieval strategies and the performance of the local Ollama runtime.

### 1.4 Scope and Non-Goals

State the course-project boundary: a single-developer, local demo for primarily Chinese-to-English practice, CEFR A2--B2, three NPCs, and a small scenario catalog. Exclude production authentication, high concurrency, mobile clients, speech assessment, and proof of long-term learning gains.

### 1.5 Summary of Contributions

Summarize the delivered contributions:

- an end-to-end relationship-first language-practice experience;
- a pluggable persistent Memory system;
- a bounded, persisted scenario orchestrator;
- an evidence-based Learner Model and adaptive recommendation loop;
- reliability mechanisms around a local LLM runtime.

### 1.6 Report Organization

Give one sentence for each remaining chapter.

## 4. Chapter 2: Background and Related Work

This chapter reviews concepts and prior work. It should not describe Popcorn's code, database, API, retries, or framework choices.

### 2.1 AI in Language Learning

#### 2.1.1 Conversational Practice and Feedback

Review the progression from computer-assisted language learning and intelligent tutoring systems to conversational LLM practice. Cover open-ended dialogue, grammar correction, explanatory feedback, and situated practice. Identify the limitation of isolated conversations and one-off feedback.

#### 2.1.2 Learner Modeling and Adaptive Learning

Introduce learner models as representations of skill state derived from performance evidence. Cover mastery, weaknesses, trends, and adaptive content selection. Establish the conceptual loop:

```text
Interaction -> Learning Evidence -> Learner Model -> Adaptive Practice
```

Conversation Review belongs here as a potential evidence source, not as a separate large system.

### 2.2 Personalized Conversational Agents

#### 2.2.1 Persona and Social Presence

Review persona consistency, social presence, relationship cues, and the distinction between a persistent companion and a one-off tutor. Explain why a persona prompt alone cannot guarantee long-term continuity.

#### 2.2.2 Long-Term Memory and Personalization

Review short-term context, summaries, structured facts, retrieval-backed memory, and semantic retrieval. Explain how Memory supports cross-session continuity, then distinguish Personal Memory from pedagogical learner state.

### 2.3 Agent Architectures for Stateful and Structured Interaction

#### 2.3.1 Stateful LLM Interaction

Review why multi-turn, goal-directed interaction requires external task state rather than relying solely on the model context. Discuss stateful agent architectures and bounded roleplay at a conceptual level.

#### 2.3.2 Structured and Constrained Generation

Review structured outputs, schema-guided generation, constrained workflows, and the collaboration between probabilistic generation and deterministic program control. Include local or smaller-model reliability as a motivating constraint.

### 2.4 Chapter Summary and Research Gap

Synthesize the three bodies of work:

1. AI language learning supports conversation, feedback, and adaptation.
2. Persona and Memory support persistent relationships and personalization.
3. Agent architectures support controlled, stateful LLM interaction.

Proposed gap statement:

> Existing studies have explored conversational language learning, persistent agent personalization, and stateful LLM orchestration as related but often separate directions. Less attention has been given to integrating them into a relationship-oriented, local-first experience in which Personal Memory sustains conversational continuity while accumulated learning evidence informs adaptive scenario practice.

## 5. Chapter 3: Requirements and Proposed Solution

This chapter defines what the system must achieve and why the proposed concept addresses those requirements. It does not yet explain the source code or infrastructure.

### 3.1 Design Goals and Requirements

#### 3.1.1 User and Learning Requirements

Group the functional requirements into four areas:

1. **Relationship-based conversational practice:** distinctive NPCs, bilingual conversation, and interaction continuity.
2. **Persistent personalization:** user facts, interests, goals, relationships, and user control over stored data.
3. **Structured scenario practice:** contextual invitation, multi-turn roleplay, persistent progress, completion, and feedback.
4. **Adaptive learning support:** Learning Evidence, Learner Model, skill focus, and explainable recommendation.

#### 3.1.2 System Quality Requirements

Define the required qualities:

- local-first operation;
- continuity across refresh and return;
- controllability of model-driven workflows;
- recoverability after interruption or failure;
- responsive feedback during generation;
- explainability of feedback and recommendations;
- user control of messages, memories, and profile;
- reproducible setup and evaluation.

#### 3.1.3 Scope and Non-Goals

Restate the implementation boundary only as needed for requirements interpretation.

### 3.2 Proposed Solution Overview

#### 3.2.1 Relationship-First Interaction

Users practice through ongoing NPC relationships rather than beginning from a course or topic catalog.

#### 3.2.2 Persistent Personalization

The solution maintains Personal Memory for continuity and a separate Learner Model for pedagogical adaptation.

#### 3.2.3 Bounded Scenario Practice

Embedded scenarios convert relevant conversation into goal-directed, multi-turn roleplay with explicit progress and feedback.

#### 3.2.4 Learner Model and Adaptive Recommendation

Corrections and scenario reviews produce Learning Signals. Aggregated skill state drives an explainable recommendation containing the scenario, reason, target skills, difficulty, duration, and accept/dismiss actions.

### 3.3 End-to-End User Journey

Describe the complete experience:

```text
Onboarding
-> casual NPC conversation
-> Personal Memory and relationship continuity
-> correction or scenario review
-> Learning Signals
-> Learner Model update
-> recommended scenario
-> new performance evidence
```

Use a conceptual user-journey figure rather than a technical architecture diagram.

### 3.4 Key Design Decisions

Briefly justify:

- relationship-first rather than course-first interaction;
- embedded rather than isolated scenario practice;
- Personal Memory separated from the Learner Model;
- bounded roleplay rather than unrestricted roleplay;
- explainable rather than opaque recommendation;
- local-first rather than cloud-dependent inference.

### 3.5 Requirement-to-Solution Mapping

Use one traceability table mapping each requirement group to the proposed solution capability and its later evaluation or verification evidence.

### 3.6 Chapter Summary

Summarize the proposed relationship-first learning loop and lead into its technical realization.

## 6. Chapter 4: System Architecture and Implementation

This chapter answers how the proposed solution is realized. It may include technology choices, data flows, algorithms, selected schemas, equations, and short code or JSON examples.

### 4.1 High-Level System Architecture

#### 4.1.1 Architecture Style

Describe the local-first modular monolith: an npm-workspaces monorepo with a React/Vite client, Hono API, TypeScript domain services, Prisma/SQLite state, and Ollama model service. Justify why this is more appropriate than microservices for the project scope.

#### 4.1.2 Architectural Layers

Present the Presentation, Contract, API, Domain Service, and Data/AI layers and their ownership boundaries.

#### 4.1.3 Technology Selection

Use a trade-off table for React/Vite, Hono, TypeScript/Zod, SSE-over-POST, Prisma/SQLite, Ollama, the chat model, the embedding model, Vitest, and Playwright.

### 4.2 Application and Communication Layer

#### 4.2.1 Web Application

Explain the high-level UI state and navigation for Chat, Scenario, Journey, and Settings without documenting every component.

#### 4.2.2 API and Shared Contracts

Explain route adaptation, user context, request validation, shared TypeScript/Zod contracts, and the separation between protocol handlers and domain services.

#### 4.2.3 Streaming Interaction

Explain the REST/SSE interaction lifecycle, token display, typed events, cancellation, terminal errors, and state synchronization.

### 4.3 Persistent Conversational Agent

#### 4.3.1 Persona and Prompt Construction

Show how NPC persona, user profile, relationship, recent context, relevant Memory, settings, and scenario context are composed into a prompt.

#### 4.3.2 Personal Memory Representation

Describe Conversation Summary, Memory Fact, and Scenario Memory, including shared versus NPC-specific visibility.

#### 4.3.3 Memory Retrieval Strategies

Describe Recency, Summary, Semantic, and Hybrid retrieval and the interface that makes them interchangeable. Reserve comparative results for Chapter 5.

#### 4.3.4 Ordinary Chat Pipeline

Use a sequence diagram covering message persistence, scenario-trigger priority, Memory retrieval, prompt construction, streaming generation, correction, Memory extraction, and progression.

### 4.4 Stateful Scenario Orchestration

#### 4.4.1 Trigger and Invitation

Explain relationship/topic eligibility, recommendation-based entry, invitation, acceptance, and decline continuation.

#### 4.4.2 Scenario Lifecycle

Present the invited, accepted, active, paused, completed, declined, and aborted state transitions, together with persisted turn state.

#### 4.4.3 Structured Turn Generation

Show a concise structured-output contract containing NPC reply, state changes, choices, and final-turn status. Explain schema validation, retry, and fallback.

#### 4.4.4 Completion and Review

Explain durable final turns, grading, feedback, Learning Signals, summary, relationship update, Journey update, and return to ordinary chat.

### 4.5 Learner Model and Adaptive Recommendation

#### 4.5.1 Skill Taxonomy

Describe the fixed Grammar, Vocabulary, Pragmatics, and Interaction categories and their CEFR hints. Put the complete taxonomy in an appendix.

#### 4.5.2 Learning Signals

Describe signal sources, polarity, score, confidence, weight, evidence, and provenance. Explain why immutable evidence is preferable to directly overwriting a learner-profile blob.

#### 4.5.3 Mastery Aggregation

Present the aggregation equation, evidence thresholds, status buckets, trend calculation, and learning-focus selection.

#### 4.5.4 Scenario Recommendation

Explain eligibility filtering, weakness/evidence/CEFR/profile scoring, repetition control, deterministic ranking, and displayed recommendation rationale.

### 4.6 Progression and User-Facing Learning State

Briefly describe relationship progression, Journey aggregation, achievements, user settings, profile/CEFR editing, and user controls. These are supporting capabilities rather than separate technical contributions.

### 4.7 Persistence, Consistency, and Recovery

#### 4.7.1 Core Data Model

Show a reduced entity diagram centered on User, Thread/Message, Memory, ScenarioSession/Turn/Summary, and LearningSignal.

#### 4.7.2 Transactional Consistency and Idempotency

Explain atomic scenario completion, retry-safe summary/signals, idempotent Memory generation, and post-completion compensation.

#### 4.7.3 Reversible Message History

Explain soft recall, branch hiding/restoration, scenario visibility, and automatic invalidation of hidden Learning Evidence.

#### 4.7.4 Failure Handling

Summarize structured-output failure, stream cancellation, interrupted completion, page refresh, health checks, and bounded retries.

### 4.8 Chapter Summary

Summarize the three implementation pillars: persistent conversation, stateful scenarios, and adaptive learning inside a local Agent Harness.

## 7. Chapter 5: Evaluation

The evaluation contains two main experiments. Automated tests and UAT are implementation verification and may be summarized in Chapter 4 or an appendix rather than presented as a third experiment.

### 5.1 Evaluation Scope and Setup

Define two evaluation questions:

- **EQ1:** How effectively do the four Memory strategies retrieve relevant long-term user information?
- **EQ2:** What runtime performance and structured-output reliability do the local Ollama models provide for representative Popcorn workloads?

Record hardware, operating system, Ollama/model versions and quantization, Node version, corpus version, code commit, model parameters, and cold/warm definitions.

### 5.2 Memory Strategy Evaluation

#### 5.2.1 Compared Strategies

Compare Recency, Summary, Semantic, and Hybrid retrieval.

#### 5.2.2 Evaluation Corpus

Use a fixed, manually labelled corpus covering location, job, interests, plans, and shared experiences. Include recent facts, distant facts, paraphrased queries, and irrelevant distractors. Freeze generated summaries so the comparison isolates retrieval strategy.

#### 5.2.3 Metrics

Use Recall@3 as the primary measure, MRR as a ranking measure, and optionally Precision@3. Also record retrieval latency and injected context size.

#### 5.2.4 Results

Present separate quality and efficiency tables. The current deterministic `0.125 / 0.375 / 1.000 / 1.000` result is preliminary; the final report should prefer an expanded fixed corpus evaluated with the real embedding model.

#### 5.2.5 Analysis

Interpret long-range recall, information loss in summaries, semantic false positives, and the quality/latency/context trade-off of Hybrid retrieval.

### 5.3 Local Ollama Performance Evaluation

#### 5.3.1 Workloads

Use three representative workloads:

- streaming free-text chat;
- structured scenario-turn generation;
- Memory embedding generation.

Correction or scenario summary may be included as supplementary structured tasks.

#### 5.3.2 Metrics

For chat: cold latency, time to first token, total time, output tokens, and tokens per second. For structured output: total time, first-pass schema-valid rate, retry rate, fallback rate, and final failure rate. For embeddings: single-text, corpus, and query latency.

#### 5.3.3 Procedure

Use fixed prompts and parameters, one declared cold run, and at least ten warm runs per task. Report median, P90, and range. Do not mix cold and warm measurements.

#### 5.3.4 Results

Use one latency/throughput table and one structured-output reliability table, accompanied by simple charts.

#### 5.3.5 Analysis

Discuss model-load cost, prompt evaluation, generation speed, streaming responsiveness, retry cost, embedding suitability for background work, and whether the measured hardware is sufficient for the course demo.

### 5.4 Threats to Validity

State that the Memory corpus is limited and manually labelled, only one main chat and embedding model are evaluated, results are hardware-specific, prompt outputs vary, and retrieval/runtime measurements do not establish learning effectiveness.

### 5.5 Evaluation Summary

Answer EQ1 and EQ2 directly using final measured values.

## 8. Chapter 6: Discussion

This chapter interprets the evaluation and project as a whole. It should not add new experiments or repeat implementation details.

### 6.1 Interpretation of Evaluation Findings

#### 6.1.1 Memory Strategy Findings

Interpret the strengths and limitations of Recency, Summary, Semantic, and Hybrid retrieval. Distinguish relevance from broader Memory correctness, including freshness, contradiction, and visibility.

#### 6.1.2 Local Ollama Performance Findings

Interpret cold/warm behavior, streaming responsiveness, structured-output cost, retry impact, embedding latency, and the privacy/control versus hardware/latency trade-off.

### 6.2 Implications for Persistent Language-Learning Agents

#### 6.2.1 Memory as Part of the Interaction Model

Discuss Memory as both prompt context and a visible basis for relationship continuity.

#### 6.2.2 Agent Harness as a Reliability Boundary

Discuss the broader design lesson that probabilistic generation is most useful inside deterministic state, validation, persistence, and recovery boundaries.

#### 6.2.3 From Personal Memory to Adaptive Learning

Explain how Personal Memory sustains the relationship while the Learner Model supports future learning decisions. State that the project demonstrates the implemented loop, not educational effectiveness.

### 6.3 Design Trade-Offs

Discuss:

- naturalness versus control;
- personalization versus privacy;
- retrieval quality versus latency and context size;
- local independence versus runtime performance;
- explainability versus recommendation sophistication;
- simple local deployment versus production scalability.

### 6.4 Limitations and Scope of Claims

Cover the small Memory corpus, one hardware/model configuration, limited scenario catalog, unvalidated LLM learning judgments, absence of teacher-labelled ground truth, absence of longitudinal user evaluation, local authentication, and SQLite deployment boundary.

### 6.5 Broader Applicability

Briefly explain how separating Personal Memory from task/learner state and wrapping local generation in a stateful harness may transfer to tutoring, coaching, interview practice, journaling, or simulation systems. Do not generalize the experiment results themselves.

### 6.6 Chapter Summary

Summarize what the evaluation means for persistent, local-first language-learning agents.

## 9. Chapter 7: Conclusion and Future Work

### 7.1 Conclusion

Write four concise paragraphs:

1. restate the problem and local-model constraints;
2. summarize the relationship-first solution and learning loop;
3. report the final Memory and Ollama evaluation findings;
4. state the engineering contribution and its claim boundary.

Conclude that Popcorn demonstrates engineering feasibility, not proven improvement in learning, engagement, or retention.

### 7.2 Future Work

#### 7.2.1 Reliable and Explainable Memory

Add temporal consistency, contradiction detection, expiry, confidence decay, provenance, user correction, and clearer retrieval rationale.

#### 7.2.2 Learner Model Validation and Adaptation

Add Conversation Review signals, teacher-labelled calibration, evidence decay, spaced practice, expanded taxonomy, and stronger recommendation evaluation.

#### 7.2.3 Scenario Quality and Coverage

Expand CEFR levels and contexts, introduce teacher-designed rubrics, dynamic difficulty, richer free input, and systematic scenario-quality checks.

#### 7.2.4 Local Model Performance

Compare models and quantizations, compress prompts, warm/cache models, move extraction to smaller models, and parallelize optional post-processing.

#### 7.2.5 User and Learning Evaluation

Conduct task-based usability, Memory trust, recommendation usefulness, longitudinal engagement, and controlled pre/post learning studies when approved.

#### 7.2.6 Production Readiness

Only if the project moves beyond the course scope: secure authentication, PostgreSQL, queues, observability, backups, rate limiting, and production model serving.

### 7.3 Final Remarks

End with the distinction that Personal Memory helps the companion remember the learner, while the Learner Model enables the system to act on what it has learned about the learner.

## 10. Core Figures and Tables

### Figures

1. End-to-end conceptual learning loop.
2. Deployment and high-level system architecture.
3. Module architecture.
4. Ordinary chat sequence.
5. Personal Memory storage and retrieval pipeline.
6. Scenario state machine.
7. Learner Model and recommendation pipeline.
8. Reduced data model.
9. Memory retrieval-quality chart.
10. Ollama latency and structured-output charts.

### Tables

1. Project scope and non-goals.
2. Functional and quality requirements.
3. Related-work synthesis and research gap.
4. Technology choices and trade-offs.
5. Memory strategy comparison.
6. Learning Signal sources and fields.
7. Recommendation eligibility and scoring factors.
8. Memory experiment quality and efficiency results.
9. Ollama performance and reliability results.
10. Design trade-offs and limitations.

## 11. Mapping to the LaTeX Template

| File | Use |
|---|---|
| `main.tex` | Replace metadata and include the expanded chapter list |
| `chapters/abstract.tex` | Abstract |
| `chapters/ch-intro.tex` | Chapter 1: Introduction |
| `chapters/ch-review.tex` | Chapter 2: Background and Related Work |
| `chapters/ch-solution.tex` | Chapter 3: Requirements and Proposed Solution |
| `chapters/ch-architecture.tex` | New Chapter 4: System Architecture and Implementation |
| `chapters/ch-evaluation.tex` | New Chapter 5: Evaluation |
| `chapters/ch-discussion.tex` | New Chapter 6: Discussion |
| `chapters/ch-concl.tex` | Chapter 7: Conclusion and Future Work |
| `references.bib` | Reviewed academic literature and primary technical sources |
| `pic/` | Architecture diagrams, result charts, and selected screenshots |
| `exp/` | Evaluation corpus, raw measurements, and plotting data |

Suggested appendices:

- complete learning-skill taxonomy;
- selected prompts and structured-output contracts;
- API/SSE reference and verification matrix;
- Memory corpus, relevance labels, and raw retrieval results;
- raw Ollama timing records and calculation method;
- UAT checklist and local demo runbook.

## 12. Suggested Length Allocation

| Chapter | Share of body |
|---|---:|
| Introduction | 10% |
| Background and Related Work | 18% |
| Requirements and Proposed Solution | 13% |
| Architecture and Implementation | 30% |
| Evaluation | 15% |
| Discussion | 9% |
| Conclusion and Future Work | 5% |

Architecture and Implementation is the largest chapter. Evaluation remains focused on the two experiments rather than becoming a list of every test or feature.

## 13. Evidence Still Required Before Final Drafting

1. Final report metadata and required page/word limit.
2. Frozen submission commit and final verification counts.
3. Expanded, labelled Memory evaluation corpus.
4. Final Memory quality, latency, and context-size measurements.
5. Exact hardware, model, quantization, and Ollama versions.
6. Repeated cold/warm Ollama timing records.
7. Structured-output first-pass, retry, fallback, and failure counts.
8. Final reviewed bibliography for AI language learning, persona/social presence, agent Memory, learner modeling, stateful agents, and structured generation.
