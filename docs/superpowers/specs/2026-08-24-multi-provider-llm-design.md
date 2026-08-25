# Ollama and API LLM Provider Switching - Technical Design

**Date:** 2026-08-24
**Status:** Proposed
**Scope:** Backend provider abstraction, Settings integration, embedding compatibility, and rollout

## 1. Background

Popcorn currently talks directly to Ollama through
`apps/api/src/server/llm/ollama.ts`. The client already exposes a small and useful
capability surface:

- `chat()` for streamed casual-chat responses;
- `chatJson()` for schema-validated generation used by Scenario, Memory,
  Correction, and dynamic Achievements;
- `embed()` for semantic and hybrid Memory retrieval;
- `health()` and `listModels()` for the Settings and system-status experience.

Most business modules accept only a `Pick<OllamaClient, ...>`, so they are not
deeply coupled to Ollama's HTTP protocol. The coupling that remains is mainly:

1. the concrete `OllamaClient` type and `ollama` dependency names throughout the
   service layer;
2. Ollama's newline-delimited streaming response and `format: "json"` request;
3. direct `new OllamaClient()` calls in health, model-list, and memory-evaluation
   routes;
4. Ollama-specific configuration names and model discovery;
5. stored embeddings that do not identify the provider/model vector space that
   created them.

The goal is to support both local Ollama and one server-configured
OpenAI-compatible API without changing Chat, Scenario, Memory, or Learner Model
business behavior.

## 2. Goals

- Let an authenticated user select `ollama` or `openai_compatible` as the chat
  provider in Settings without restarting the API process.
- Preserve Ollama as the default and keep existing installations working without
  new required configuration.
- Keep API credentials and provider endpoints server-side.
- Give all business modules one provider-neutral interface for streaming chat,
  structured JSON, and embeddings.
- Allow the chat provider and embedding provider to be configured independently.
- Prevent embeddings produced by different models from being compared silently.
- Preserve cancellation, Zod validation, retry behavior, and useful error messages.
- Make provider behavior contract-testable without calling a real paid API.

## 3. Non-goals

- User-supplied API keys or arbitrary base URLs.
- Automatic provider failover after a response has started streaming.
- Load balancing across several cloud providers.
- Resuming a partially streamed response on another model.
- Provider-specific prompt tuning or model-quality routing in the first version.
- Replacing the existing Memory retrieval strategies.

## 4. Key Decisions

### 4.1 Chat selection is per user

Add `llmProvider` to `UserSettings` and continue using the existing `modelName`
field for the selected provider's chat model. Existing rows default to `ollama`.

The provider base URL, API key, and allowed model names are deployment
configuration. A browser can select only a provider/model that the server exposes;
it cannot submit credentials or an endpoint.

### 4.2 Embedding selection is service-level

The embedding model defines a vector space shared by stored Memory facts and
conversation summaries. Switching it is a data-index migration, not an ordinary
UI preference. It is therefore selected by environment configuration rather than
`UserSettings`.

This still permits all useful deployments:

| Chat provider | Embedding provider | Intended use |
|---|---|---|
| Ollama | Ollama | Fully local development and private demo |
| API | Ollama | Higher-quality generation while retaining local embeddings |
| API | API | Deployment that does not require Ollama |

### 4.3 No transparent mid-stream fallback

A streamed request may fall back only before the first token is emitted. Phase 1
does not enable automatic fallback at all. Once output begins, an error terminates
the stream and the existing retry interaction remains available to the user. This
avoids duplicate or contradictory NPC messages.

### 4.4 Conflict resolution remains provider-independent

Memory conflict extraction may use `chatJson()`, but normalization and conflict
resolution remain deterministic application code. Embedding similarity is not used
as proof of contradiction, so changing the LLM provider cannot change committed
facts merely because the embedding space changed.

## 5. Target Architecture

```text
Chat / Scenario / Memory / Correction / Achievements
                         |
                         v
                    LlmClient facade
                    /             \
                   /               \
          ChatProvider          EmbeddingProvider
          /          \            /          \
      Ollama       API adapter  Ollama       API adapter
```

`LlmClient` is a small facade composed from independently selected chat and
embedding adapters. Business code continues to receive one dependency, minimizing
the refactor while allowing mixed deployments.

### 5.1 Provider-neutral types

Create `apps/api/src/server/llm/types.ts`:

```ts
import type { ZodType } from 'zod';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface JsonChatOptions extends ChatOptions {
  maxRetries?: number;
}

export interface ModelProfile {
  provider: 'ollama' | 'openai_compatible';
  model: string;
}

export interface LlmClient {
  readonly chatProfile: ModelProfile;
  readonly embeddingProfile: ModelProfile;
  chat(messages: ChatMessage[], options?: ChatOptions): AsyncGenerator<string>;
  chatJson<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
    options?: JsonChatOptions,
  ): Promise<T>;
  embed(text: string, options?: { signal?: AbortSignal }): Promise<number[]>;
}
```

Ollama's `think`, `keep_alive`, and nested `options` are adapter configuration,
not business-layer options. Existing Scenario calls such as
`{ options: { temperature: 0.7 } }` become `{ temperature: 0.7 }`.

### 5.2 Provider adapters

Keep the current `OllamaClient` HTTP implementation, but make it implement the new
interfaces. Add `openaiCompatible.ts` with:

- Bearer-token authentication;
- `/v1/chat/completions` SSE parsing;
- `[DONE]`, split-frame, empty-delta, error-frame, and abort handling;
- `/v1/embeddings` parsing when API embeddings are configured;
- JSON mode when supported, followed by JSON parse and Zod validation;
- the same bounded `chatJson()` retry semantics as Ollama;
- normalized errors that do not contain the API key or full response body.

The adapter receives explicit capability configuration because OpenAI-compatible
services do not all implement model listing, JSON Schema, or embeddings:

```ts
interface ProviderCapabilities {
  modelList: boolean;
  jsonMode: 'json_schema' | 'json_object' | 'prompt_only';
  embeddings: boolean;
}
```

For `prompt_only`, the existing system prompt still requests JSON, and Zod remains
the final authority. An invalid response is retried up to `maxRetries`.

### 5.3 Registry and factory

Replace `ollamaForUser()` in `server/llm/userClient.ts` with:

```ts
export async function llmForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<LlmClient>;
```

The factory:

1. reads `UserSettings.llmProvider` and `modelName`;
2. validates the selection against the server's provider registry;
3. creates the selected chat adapter;
4. attaches the service-level embedding adapter;
5. returns a provider-neutral facade.

Provider construction belongs in a registry so routes cannot instantiate Ollama
directly. The dev memory evaluator requests the configured embedding adapter from
the same registry.

## 6. Configuration

Existing Ollama variables remain supported:

```env
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_CHAT_MODEL="qwen3.5:9b"
OLLAMA_EMBED_MODEL="nomic-embed-text"
OLLAMA_KEEP_ALIVE="-1"
```

Add:

```env
DEFAULT_LLM_PROVIDER="ollama"

LLM_API_BASE_URL="https://provider.example.com/v1"
LLM_API_KEY=""
LLM_API_CHAT_MODELS="model-a,model-b"
LLM_API_DEFAULT_CHAT_MODEL="model-a"
LLM_API_JSON_MODE="json_object"
LLM_API_SUPPORTS_MODEL_LIST="false"

EMBEDDING_PROVIDER="ollama"
LLM_API_EMBED_MODEL="embedding-model"
```

Rules:

- The API provider is `configured: false` when URL, key, default model, or allowed
  models are missing.
- An unconfigured provider is visible but disabled in Settings.
- `LLM_API_CHAT_MODELS` is a server-side allowlist and is used when the provider
  has no reliable model-list endpoint.
- API keys are never returned by an endpoint, written to logs, or persisted in
  SQLite.
- Production startup validates the selected embedding provider eagerly. Chat
  providers are health-checked on demand so local development can still boot when
  Ollama is temporarily stopped.

## 7. Database Changes

### 7.1 User settings

```prisma
model UserSettings {
  // existing fields
  llmProvider String @default("ollama")
  modelName   String @default("qwen3.5:9b")
}
```

No data rewrite is required for existing users beyond the default migration.

### 7.2 Message provenance

Add a nullable provider field while retaining the existing `modelName` and
`tokensUsed` fields:

```prisma
model Message {
  // existing fields
  modelProvider String?
}
```

Each generated NPC message records the effective provider and model. API usage is
recorded in `tokensUsed` when supplied by the provider; unavailable Ollama usage may
remain null until Ollama metrics are added.

### 7.3 Embedding-space identity

Add the same nullable field to both embedded record types:

```prisma
model MemoryFact {
  // existing fields
  embeddingSpace String?
}

model ConversationSummary {
  // existing fields
  embeddingSpace String?
}
```

The canonical format is:

```text
<provider>:<model>:<dimensions>
```

For example:

```text
ollama:nomic-embed-text:768
```

The dimension is taken from the returned vector, not hard-coded.

On write, `factExtract.ts` and `summarize.ts` store both the vector and its
`embeddingSpace`. On recall, semantic and hybrid strategies compare only records
whose `embeddingSpace` matches the active embedding profile and returned query
dimension. A mismatch is excluded, never assigned a misleading similarity score.

Legacy rows can be backfilled to the project's known Ollama default during
migration. If a deployment previously used another model, it runs the re-embedding
command instead of relying on that backfill.

## 8. Re-embedding Strategy

Add a server-side command:

```bash
npm run memory:reembed --workspace apps/api
```

The command:

1. selects facts and summaries whose `embeddingSpace` does not match the configured
   embedding profile;
2. processes them in small batches;
3. writes the new vector and space together in a transaction;
4. is idempotent and resumable;
5. reports processed, failed, and remaining counts without printing user content.

During re-indexing:

- `recency` and `summary` continue to work normally;
- `semantic` searches only the already migrated subset and falls back to recency
  when that subset is empty;
- `hybrid` combines compatible semantic candidates with recency candidates.

Changing the chat provider alone never requires re-embedding.

## 9. API Contracts

### 9.1 Settings

Extend the shared settings request and response:

```ts
type LlmProvider = 'ollama' | 'openai_compatible';

interface SettingsResponse {
  // existing fields
  llmProvider: LlmProvider;
  modelName: string;
}
```

`PUT /api/settings` validates that:

- the provider exists and is configured;
- the model is allowed for that provider;
- provider and model are changed atomically.

An invalid combination returns `400 INVALID_MODEL_SELECTION`; an unavailable but
valid provider is still saveable only if it is configured.

### 9.2 Provider discovery

Replace the Ollama-only semantics of `/api/system/models` with a new endpoint:

```text
GET /api/system/providers
```

Example response:

```json
{
  "providers": [
    {
      "id": "ollama",
      "label": "Ollama (Local)",
      "configured": true,
      "reachable": true,
      "latencyMs": 12,
      "models": ["qwen3.5:9b"]
    },
    {
      "id": "openai_compatible",
      "label": "API Service",
      "configured": false,
      "reachable": false,
      "latencyMs": null,
      "models": []
    }
  ],
  "embedding": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "reachable": true
  }
}
```

`/api/system/models` remains temporarily as an Ollama-compatible deprecated route
for one release, then can be removed after the Web client migrates.

`/api/system/health` reports API reachability and embedding readiness separately;
one unavailable optional chat provider does not make the entire application
unhealthy.

## 10. Settings UX

Rename the existing "local AI" section to "AI model" and add:

- a two-option segmented control: `Ollama` / `API Service`;
- a model select populated from `/api/system/providers`;
- a compact status indicator for `Ready`, `Unavailable`, or `Not configured`;
- existing Memory strategy controls below the model selection.

Selecting an unavailable provider does not silently switch back. The control stays
disabled and explains the server-side configuration state through its status label.
The API key and base URL are never rendered.

Saving changes affects the next request. It does not cancel or migrate an already
running chat or Scenario stream.

## 11. Error Handling and Retry Policy

Normalize provider failures into application errors:

| Error | Meaning | Client behavior |
|---|---|---|
| `PROVIDER_NOT_CONFIGURED` | Required server configuration is absent | Disable provider in Settings |
| `PROVIDER_UNAVAILABLE` | Network, timeout, or upstream 5xx | End stream and show retry |
| `MODEL_NOT_AVAILABLE` | Model is invalid or unavailable | Return to Settings selection |
| `RATE_LIMITED` | Upstream 429 | Show retryable message; respect `Retry-After` |
| `INVALID_STRUCTURED_OUTPUT` | JSON failed all schema retries | Preserve existing feature fallback |
| `EMBEDDING_UNAVAILABLE` | Embedding call failed | Store text without embedding and continue |

Policy:

- Streamed chat is never retried after the first emitted token.
- `chatJson()` retries invalid output and transient pre-response failures only.
- Embedding failure remains non-fatal, matching the current Memory behavior.
- `AbortSignal` must propagate from the browser through the route and provider
  adapter.
- Logs include provider, model, operation, latency, status, and request ID, but not
  API keys or full user prompts.

## 12. Implementation Plan

### Phase 1 - Abstraction with Ollama only

- Add provider-neutral types and the facade.
- Make `OllamaClient` implement the interfaces.
- Rename `ollamaForUser()` to `llmForUser()`.
- Replace concrete `OllamaClient` types in business modules.
- Keep runtime behavior and configuration unchanged.

This phase should be independently mergeable and carry no user-visible behavior
change.

### Phase 2 - OpenAI-compatible adapter

- Add chat streaming, structured output, embedding, health, and model discovery.
- Add provider registry and environment validation.
- Add normalized provider errors and contract tests.

### Phase 3 - Settings and system API

- Add the Prisma migration and shared request/response types.
- Add `/api/system/providers` and update health behavior.
- Add the provider and model controls to Settings.
- Persist provider/model provenance on new NPC messages.

### Phase 4 - Embedding compatibility

- Add `embeddingSpace` fields.
- Tag new fact and summary embeddings.
- Filter semantic retrieval by embedding space.
- Add the idempotent re-embedding command and fallback behavior.

### Phase 5 - Documentation and demo hardening

- Update `.env.example`, README, architecture docs, and demo check.
- Verify Ollama-only, mixed, and API-only modes.
- Record the change in the review/fix log before commit.

## 13. Test Strategy

### Unit tests

- Ollama NDJSON parsing with chunk boundaries and abort.
- API SSE parsing with split `data:` frames, `[DONE]`, empty deltas, malformed data,
  HTTP failures, and abort.
- Structured JSON validation and bounded retries for both adapters.
- Provider registry configuration and secret redaction.
- Provider/model selection validation.
- Embedding-space equality and mismatch exclusion.

### Integration tests

- Casual chat streams through either mock adapter.
- Scenario accept, turn, completion, and Summary generation remain provider-neutral.
- Correction, fact extraction, Memory card generation, and dynamic Achievement use
  `chatJson()` through the facade.
- Semantic recall never compares vectors from different spaces.
- API embedding failure stores text without an embedding.
- Existing users migrate to `llmProvider = ollama` without behavior changes.
- Provider/model provenance is written to NPC messages.

### Web tests

- Configured providers and models render correctly.
- Unconfigured and unreachable providers have distinct states.
- Saving a provider/model pair updates Settings and affects the next request.
- API failures do not silently reset the selected provider.

### Manual demo matrix

| Mode | Expected result |
|---|---|
| Ollama/Ollama | Existing local demo works unchanged |
| API/Ollama | Chat and structured generation use API; Memory retrieval uses local vectors |
| API/API | Application works with Ollama stopped |
| API unavailable | Clear retryable error; no duplicate NPC message |
| Embedding model changed | Old vectors excluded; recall falls back until re-indexed |

## 14. Files Expected to Change

### New

- `apps/api/src/server/llm/types.ts`
- `apps/api/src/server/llm/openaiCompatible.ts`
- `apps/api/src/server/llm/providerRegistry.ts`
- `apps/api/src/server/llm/client.ts`
- `apps/api/src/app/api/system/providers/route.ts`
- `apps/api/src/server/memory/reembed.ts`
- Prisma migration and provider contract tests

### Modified

- `apps/api/src/server/llm/ollama.ts`
- `apps/api/src/server/llm/userClient.ts`
- Chat, Scenario, Memory, Correction, and Achievement dependency types
- system health/models routes
- Prisma schema, settings service, shared request/response types
- Memory extraction, summarization, candidate loading, and semantic/hybrid strategies
- Web API client and Settings route
- `apps/api/.env.example`, README, demo check, and review log

## 15. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| OpenAI-compatible APIs differ subtly | Explicit capability flags and adapter contract tests |
| API model emits invalid JSON | Prompt requirement, JSON mode where available, Zod validation, bounded retry |
| Provider switch breaks old vectors | Persist and filter by `embeddingSpace`; re-index explicitly |
| Partial stream is duplicated by retry | Never retry or fall back after first token |
| API key leaks to Web or logs | Environment-only secrets, redacted normalized errors, response contract tests |
| Unavailable optional provider marks app down | Health reports provider components independently |
| Mechanical refactor introduces regressions | Merge Ollama-only abstraction first and run the complete suite before adding API behavior |

## 16. Acceptance Criteria

- With only the existing Ollama variables, all current behavior and tests remain
  unchanged.
- With API configuration present, Settings can switch providers and the next Chat,
  Scenario, Correction, and Memory extraction request uses the selected provider.
- API-only mode works while Ollama is stopped when API embeddings are configured.
- No endpoint or log exposes the API key.
- Provider and model are recorded for newly generated NPC messages.
- Semantic retrieval never compares incompatible embedding spaces.
- Provider cancellation prevents an aborted or recalled turn from persisting a late
  NPC response.
- Full API/Web tests, typecheck, production Web build, and fresh-database migration
  checks pass in both the default and API-adapter test configurations.

## 17. Estimated Effort

| Work item | Estimate |
|---|---|
| Provider-neutral abstraction and Ollama migration | 0.5-1 day |
| API adapter and contract tests | 1-1.5 days |
| Settings, discovery API, and provenance | 1 day |
| Embedding-space migration and re-index command | 1-1.5 days |
| End-to-end verification and documentation | 0.5-1 day |

Total expected implementation time is approximately **4-6 engineering days**. A
smaller environment-only switch that excludes Settings and embedding migration can
be completed faster, but it would not satisfy API-only deployment or safe semantic
Memory retrieval.
