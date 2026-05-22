import { z, ZodSchema } from 'zod';

// ----------------------------------------------------------------------------
// Ollama HTTP client.
//
// Ollama exposes a streaming /api/chat endpoint that returns NDJSON. Each
// chunk has the shape:
//   { "model": "...", "created_at": "...", "message": { "role": "assistant",
//     "content": "<partial token>" }, "done": false }
// The final chunk has `done: true` plus optional eval stats.
// ----------------------------------------------------------------------------

const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:7b-instruct';
const LIGHT_MODEL = process.env.OLLAMA_MODEL_LIGHT ?? DEFAULT_MODEL;
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 60_000);

export type ChatRole = 'system' | 'user' | 'assistant';
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

// Temperature / sampling presets keyed by use-case. Picked conservatively;
// scenarios need more variety than corrections.
export const PRESETS = {
  casual:    { temperature: 0.8,  top_p: 0.9, repeat_penalty: 1.1 },
  scenario:  { temperature: 0.85, top_p: 0.9, repeat_penalty: 1.1 },
  json:      { temperature: 0.4,  top_p: 0.9, repeat_penalty: 1.05 },
  correction:{ temperature: 0.2,  top_p: 0.9, repeat_penalty: 1.05 },
  summary:   { temperature: 0.3,  top_p: 0.9, repeat_penalty: 1.05 },
} as const;

export type Preset = keyof typeof PRESETS;

export interface ChatOpts {
  model?: string;
  preset?: Preset;
  numCtx?: number;
  signal?: AbortSignal;
}

// ----------------------------------------------------------------------------
// Health
// ----------------------------------------------------------------------------

export interface OllamaHealth {
  reachable: boolean;
  baseUrl: string;
  model: string;
  modelLoaded: boolean;
  latencyMs: number;
  error?: string;
  availableModels?: string[];
}

export async function ollamaHealth(): Promise<OllamaHealth> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return {
        reachable: false, baseUrl: BASE_URL, model: DEFAULT_MODEL,
        modelLoaded: false, latencyMs: Date.now() - t0,
        error: `HTTP ${res.status}`,
      };
    }
    const data = (await res.json()) as { models?: { name: string }[] };
    const names = (data.models ?? []).map((m) => m.name);
    return {
      reachable: true, baseUrl: BASE_URL, model: DEFAULT_MODEL,
      modelLoaded: names.some((n) => n.startsWith(DEFAULT_MODEL.split(':')[0]!)),
      latencyMs: Date.now() - t0,
      availableModels: names,
    };
  } catch (err) {
    return {
      reachable: false, baseUrl: BASE_URL, model: DEFAULT_MODEL,
      modelLoaded: false, latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ----------------------------------------------------------------------------
// Streaming chat — yields raw token deltas.
// ----------------------------------------------------------------------------

export async function* chatStream(
  messages: ChatMessage[],
  opts: ChatOpts = {},
): AsyncGenerator<string, ChatResult, void> {
  const preset = PRESETS[opts.preset ?? 'casual'];
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    stream: true,
    options: { ...preset, ...(opts.numCtx ? { num_ctx: opts.numCtx } : {}) },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort());

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new OllamaError('NETWORK', `Ollama unreachable at ${BASE_URL}: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(timeout);
    throw new OllamaError('HTTP', `Ollama returned ${res.status} ${res.statusText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let modelOut = body.model;
  let totalDurationNs: number | undefined;
  let evalCount: number | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // NDJSON: split on \n; last fragment may be incomplete.
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;

        let chunk: OllamaChatChunk;
        try {
          chunk = JSON.parse(line);
        } catch {
          continue;
        }
        if (chunk.message?.content) {
          fullText += chunk.message.content;
          yield chunk.message.content;
        }
        if (chunk.done) {
          modelOut = chunk.model ?? modelOut;
          totalDurationNs = chunk.total_duration;
          evalCount = chunk.eval_count;
        }
      }
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }

  return {
    text: fullText,
    model: modelOut,
    tokensUsed: evalCount,
    totalDurationMs: totalDurationNs ? Math.round(totalDurationNs / 1_000_000) : undefined,
  };
}

interface OllamaChatChunk {
  model?: string;
  message?: { role: string; content: string };
  done?: boolean;
  total_duration?: number;
  eval_count?: number;
}

export interface ChatResult {
  text: string;
  model: string;
  tokensUsed?: number;
  totalDurationMs?: number;
}

// ----------------------------------------------------------------------------
// Non-streaming convenience — collect the stream into a single string.
// ----------------------------------------------------------------------------

export async function chat(
  messages: ChatMessage[],
  opts: ChatOpts = {},
): Promise<ChatResult> {
  const it = chatStream(messages, opts);
  let result: ChatResult = { text: '', model: opts.model ?? DEFAULT_MODEL };
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = await it.next();
    if (next.done) {
      result = next.value;
      break;
    }
  }
  return result;
}

// ----------------------------------------------------------------------------
// JSON chat — forces `format: "json"`, validates against a Zod schema, retries
// on parse / validation failure. Critical for scenario state machine stability
// (context.md identifies 7B JSON output as the #1 risk).
// ----------------------------------------------------------------------------

export interface JsonChatOpts<T> extends ChatOpts {
  schema: ZodSchema<T>;
  maxRetries?: number;
  // Fallback returned if every retry fails. If absent, throws.
  fallback?: T;
}

export async function chatJson<T>(
  messages: ChatMessage[],
  opts: JsonChatOpts<T>,
): Promise<{ data: T; raw: string; attempts: number; usedFallback: boolean; result: ChatResult }> {
  const max = opts.maxRetries ?? 3;
  const preset = opts.preset ?? 'json';
  let lastError: unknown;
  let attempt = 0;

  while (attempt < max) {
    attempt++;
    // Re-issue with a slightly stronger nudge after the first failure.
    const augmented: ChatMessage[] = attempt === 1
      ? messages
      : [
          ...messages,
          {
            role: 'user',
            content: `The previous response was not valid JSON matching the required schema. Return ONLY a single JSON object. No prose, no markdown fences. (Attempt ${attempt}/${max}.)`,
          },
        ];

    let res: ChatResult;
    try {
      res = await postJsonChat(augmented, { ...opts, preset });
    } catch (err) {
      lastError = err;
      continue;
    }

    const raw = stripJsonFences(res.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      lastError = new OllamaError('JSON_PARSE', `Attempt ${attempt}: ${err instanceof Error ? err.message : err}`);
      continue;
    }

    const validated = opts.schema.safeParse(parsed);
    if (validated.success) {
      return { data: validated.data, raw, attempts: attempt, usedFallback: false, result: res };
    }
    lastError = new OllamaError('SCHEMA', `Attempt ${attempt}: ${validated.error.message}`);
  }

  if (opts.fallback !== undefined) {
    return {
      data: opts.fallback,
      raw: '',
      attempts: attempt,
      usedFallback: true,
      result: { text: '', model: opts.model ?? DEFAULT_MODEL },
    };
  }
  throw lastError instanceof Error
    ? lastError
    : new OllamaError('UNKNOWN', String(lastError));
}

// Internal: single non-streaming call with format: "json".
async function postJsonChat(messages: ChatMessage[], opts: ChatOpts): Promise<ChatResult> {
  const preset = PRESETS[opts.preset ?? 'json'];
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    messages,
    stream: false,
    format: 'json',
    options: { ...preset, ...(opts.numCtx ? { num_ctx: opts.numCtx } : {}) },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new OllamaError('HTTP', `Ollama returned ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      model?: string;
      message?: { content?: string };
      total_duration?: number;
      eval_count?: number;
    };
    return {
      text: data.message?.content ?? '',
      model: data.model ?? body.model,
      tokensUsed: data.eval_count,
      totalDurationMs: data.total_duration
        ? Math.round(data.total_duration / 1_000_000)
        : undefined,
    };
  } catch (err) {
    if (err instanceof OllamaError) throw err;
    throw new OllamaError('NETWORK', err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timeout);
  }
}

// Some local models still wrap JSON in ```json fences despite format:"json".
function stripJsonFences(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }
  return trimmed;
}

// ----------------------------------------------------------------------------
// Error type
// ----------------------------------------------------------------------------

export type OllamaErrorKind = 'NETWORK' | 'HTTP' | 'JSON_PARSE' | 'SCHEMA' | 'UNKNOWN';

export class OllamaError extends Error {
  constructor(public readonly kind: OllamaErrorKind, message: string) {
    super(`[OllamaError:${kind}] ${message}`);
    this.name = 'OllamaError';
  }
}

// ----------------------------------------------------------------------------
// Convenience: small re-export so callers don't import zod just for schemas.
// ----------------------------------------------------------------------------

export { z };
export const constants = { DEFAULT_MODEL, LIGHT_MODEL, BASE_URL, TIMEOUT_MS };
