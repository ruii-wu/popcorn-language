# Architecture & Data-Flow Diagrams

> For the Final Report. Mermaid renders natively on GitHub. Source of truth for module
> responsibilities is the v2 spec (`docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`).

## Module architecture

```mermaid
flowchart TB
  subgraph Client["Vite React SPA (apps/web) — proxies /api to :3100"]
    UI["Main chat · Scenario · Onboarding/Journey"]
  end
  subgraph Next["Hono API server (apps/api/src/http/app.ts)"]
    Routes["REST + SSE route handlers from src/app/api/*"]
    Gate["withUser → requireUser (pop_uid cookie)"]
  end
  subgraph Server["Service layer (src/server)"]
    M1["M1 LLM Client (Ollama: chat/chatJson/embed/health)"]
    M2["M2 Prompt Builder"]
    M3["M3 Memory Engine (recency/summary/semantic/hybrid + eval)"]
    M4["M4 Scenario Orchestrator"]
    M5["M5 Relationship & Progression"]
    M6["M6 Grammar Correction"]
    M7["M7 Achievement Engine"]
    M8["M8 Cross-NPC Memory (P1 placeholder)"]
    M9["M9 Dynamic Achievements (P1, shipped W8)"]
  end
  DB[("Prisma + SQLite — every query scoped by userId")]
  Ollama[["Ollama HTTP API<br/>qwen3.5:9b + nomic-embed-text"]]

  UI --> Routes --> Gate
  Gate --> M2 & M3 & M4 & M5 & M6 & M7 & M9
  M2 --> M1
  M3 --> M1
  M4 --> M1
  M6 --> M1
  M1 --> Ollama
  M2 -.reads.-> M3
  M3 & M4 & M5 & M6 & M7 & M9 --> DB
```

## Workflow A — ordinary chat message

```mermaid
sequenceDiagram
  participant U as User
  participant R as POST /threads/:npcId/messages (SSE)
  participant Mem as Memory Engine
  participant LLM as Ollama
  participant DB as SQLite

  U->>R: { text }
  R->>DB: persist user Message
  R-->>U: event: user_message_saved
  par async correction
    R->>LLM: correctGrammar(text)
    LLM-->>R: { hasIssue, fixed, noteZh, tag }
    R-->>U: event: correction
  and main reply
    R->>Mem: recall(userId, npcId) [strategy from settings]
    Mem-->>R: recalled facts/summary
    R->>LLM: chat(prompt)
    LLM-->>R: token stream
    R-->>U: event: token … message_complete
    R->>DB: persist NPC Message, bump relationship, ActivityEvent
    R->>R: achievement tick · maybe summarize · extract facts · trigger judge
    opt scenario triggered
      R-->>U: event: scenario_offer
    end
  end
  R-->>U: event: done
```

## Workflow B — scenario trigger → completion

```mermaid
sequenceDiagram
  participant U as User
  participant S as Scenario routes
  participant LLM as Ollama
  participant DB as SQLite

  Note over S: trigger judge HIT (stage ≥ minStage, ≥3 user turns, topic match)
  S->>DB: ScenarioSession(status=invited, triggerRationale)
  S-->>U: event: scenario_offer
  U->>S: POST accept
  S->>LLM: opening roleplay turn (forced JSON)
  S->>DB: session=active, ScenarioTurn(0)
  S-->>U: state_update + choices
  loop each turn
    U->>S: POST choose { choiceId } (SSE)
    S->>LLM: { npcReply, stateDelta, isFinalTurn, nextChoices }
    S->>DB: NPC Message + ScenarioTurn
    S-->>U: token → state_update → choices
  end
  Note over S: isFinalTurn or turnsLeft≤0
  S->>LLM: summary (grade + 3 notes)
  S->>DB: ScenarioSummary · Memory card · applyScenarioOutcome (maybe stage-up) · achievement tick
  S-->>U: event: scenario_end
```
