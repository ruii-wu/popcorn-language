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
}
