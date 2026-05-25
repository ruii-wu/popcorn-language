import type { ZodType } from 'zod';

export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface HealthInfo { reachable: boolean; model: string; modelInstalled: boolean; latencyMs: number }

export interface OllamaOptions {
  baseUrl?: string;
  chatModel?: string;
  embedModel?: string;
  fetchImpl?: typeof fetch;
}

export class OllamaError extends Error {
  constructor(message: string) { super(message); this.name = 'OllamaError'; }
}

export class OllamaClient {
  private baseUrl: string;
  private chatModel: string;
  private embedModel: string;
  private fetchImpl: typeof fetch;

  constructor(opts: OllamaOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
    this.chatModel = opts.chatModel ?? process.env.OLLAMA_CHAT_MODEL ?? 'qwen2.5:7b-instruct';
    this.embedModel = opts.embedModel ?? process.env.OLLAMA_EMBED_MODEL ?? 'nomic-embed-text';
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  async health(): Promise<HealthInfo> {
    const started = Date.now();
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/api/tags`, { method: 'GET' });
      const latencyMs = Date.now() - started;
      if (!res.ok) return { reachable: false, model: this.chatModel, modelInstalled: false, latencyMs };
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = Array.isArray(data.models) ? data.models.map((m) => m.name) : [];
      const modelInstalled = names.some((n) => n === this.chatModel || n.startsWith(this.chatModel));
      return { reachable: true, model: this.chatModel, modelInstalled, latencyMs };
    } catch {
      return { reachable: false, model: this.chatModel, modelInstalled: false, latencyMs: Date.now() - started };
    }
  }

  async *chat(
    messages: ChatMessage[],
    opts: { model?: string; options?: Record<string, unknown> } = {},
  ): AsyncGenerator<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model ?? this.chatModel, messages, stream: true, options: opts.options }),
    });
    if (!res.ok || !res.body) throw new OllamaError(`chat failed: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line) as { message?: { content?: string }; done?: boolean };
        if (obj.message?.content) yield obj.message.content;
        if (obj.done) return;
      }
    }
  }

  async chatJson<T>(
    messages: ChatMessage[],
    schema: ZodType<T>,
    opts: { model?: string; maxRetries?: number; options?: Record<string, unknown> } = {},
  ): Promise<T> {
    const maxRetries = opts.maxRetries ?? 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: opts.model ?? this.chatModel, messages, stream: false, format: 'json', options: opts.options,
          }),
        });
        if (!res.ok) { lastErr = new OllamaError(`chatJson HTTP ${res.status}`); continue; }
        const data = (await res.json()) as { message?: { content?: string } };
        const parsed = JSON.parse(data.message?.content ?? '');
        return schema.parse(parsed);
      } catch (e) {
        lastErr = e;
      }
    }
    throw new OllamaError(`chatJson failed after ${maxRetries} attempts: ${String(lastErr)}`);
  }
}
