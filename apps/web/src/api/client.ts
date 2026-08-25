// web/src/api/client.ts — thin same-origin client for the Popcorn backend.
// Ported from public/app/src/api.js (plain global script) to ESM TypeScript.
import type {
  ProfileBody,
  SettingsPatch,
  MeResponse,
  AuthResponse,
  NpcListItem,
  ThreadResponse,
  ProfileResponse,
  JourneySummaryResponse,
  RelationshipCard,
  StreakResponse,
  Achievement,
  MemoryItem,
  NpcDetail,
  SettingsResponse,
  ScenarioCatalogItem,
  SessionListItem,
  SessionDetailResponse,
  AcceptSessionResponse,
  OkResponse,
  ChatStreamEvent,
  ScenarioStreamEvent,
  LearnerModelResponse,
  RecommendationResponse,
  StartScenarioResponse,
} from '@popcorn/shared';

interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

async function req<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method: method, headers: {} };
  if (body !== undefined) {
    (opts.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts); // same-origin → pop_uid cookie sent automatically
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || res.statusText;
    const err = new Error(msg) as ApiError;
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data as T;
}
const apiGet = <T = unknown>(u: string) => req<T>('GET', u);
const apiPost = <T = unknown>(u: string, b?: unknown) => req<T>('POST', u, b === undefined ? {} : b);
const apiPut = <T = unknown>(u: string, b?: unknown) => req<T>('PUT', u, b);

// SSE over POST: EventSource cannot POST, so read the stream manually.
// Calls onEvent({ type, data }) per `event:`/`data:` frame.
async function streamPost<E extends { type: string; data: unknown } = { type: string; data: unknown }>(
  url: string,
  body: unknown,
  onEvent: (e: E) => void,
  signal?: AbortSignal,
) {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) return;
    onEvent({ type: 'error', data: { code: 'NETWORK', message: String(e) } } as E);
    onEvent({ type: 'done', data: {} } as E);
    return;
  }
  if (!res.ok || !res.body) {
    let data: { error?: unknown } | null = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    onEvent({ type: 'error', data: (data && data.error) || { code: 'HTTP_' + res.status, message: res.statusText } } as E);
    onEvent({ type: 'done', data: {} } as E);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (frame.trim()) {
        const event = parseFrame(frame) as E;
        onEvent(event);
        if (event.type === 'error') {
          await reader.cancel();
          return;
        }
      }
    }
  }
  if (buf.trim()) onEvent(parseFrame(buf) as E);
}

export function parseFrame(frame: string): { type: string; data: unknown } {
  let type = 'message';
  const dataLines: string[] = [];
  const lines = frame.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf('event:') === 0) type = line.slice(6).trim();
    else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  let data: unknown = null;
  const raw = dataLines.join('\n');
  if (raw) { try { data = JSON.parse(raw); } catch (e) { data = raw; } }
  return { type: type, data: data };
}

export const api = {
  // auth/session
  me: (): Promise<MeResponse> => apiGet<MeResponse>('/api/auth/me'),
  login: (username: string, password: string): Promise<AuthResponse> =>
    apiPost<AuthResponse>('/api/auth/login', { username: username, password: password }),
  register: (username: string, password: string): Promise<AuthResponse> =>
    apiPost<AuthResponse>('/api/auth/register', { username: username, password: password }),
  logout: () => apiPost('/api/auth/logout', {}),
  // chat
  npcs: (): Promise<NpcListItem[]> => apiGet<NpcListItem[]>('/api/npcs'),
  thread: (npcId: string, limit?: number): Promise<ThreadResponse> =>
    apiGet<ThreadResponse>('/api/threads/' + npcId + '/messages?limit=' + (limit || 50)),
  recallMessage: (npcId: string, messageId: string): Promise<OkResponse> =>
    req<OkResponse>('DELETE', '/api/threads/' + npcId + '/messages/' + messageId),
  restoreRecalledMessage: (npcId: string, messageId: string): Promise<OkResponse> =>
    apiPost<OkResponse>('/api/threads/' + npcId + '/messages/' + messageId + '/restore', {}),
  streamMessage: (npcId: string, text: string, onEvent: (e: ChatStreamEvent) => void, signal?: AbortSignal) =>
    streamPost<ChatStreamEvent>('/api/threads/' + npcId + '/messages', { text: text }, onEvent, signal),
  // onboarding / journey / profile
  profile: (): Promise<ProfileResponse> => apiGet<ProfileResponse>('/api/profile'),
  saveProfile: (p: ProfileBody) => apiPut('/api/profile', p),
  learnerModel: (): Promise<LearnerModelResponse> => apiGet<LearnerModelResponse>('/api/learner-model'),
  recommendation: (): Promise<RecommendationResponse> => apiGet<RecommendationResponse>('/api/scenarios/recommendation'),
  dismissRecommendation: (templateId: string) =>
    apiPost('/api/scenarios/recommendation/dismiss', { templateId }),
  startScenarioTemplate: (templateId: string): Promise<StartScenarioResponse> =>
    apiPost<StartScenarioResponse>('/api/scenarios/templates/' + templateId + '/start', {}),
  onboardingComplete: () => apiPost('/api/onboarding/complete', {}),
  journey: (): Promise<JourneySummaryResponse> => apiGet<JourneySummaryResponse>('/api/journey/summary'),
  relationships: (): Promise<RelationshipCard[]> => apiGet<RelationshipCard[]>('/api/journey/relationships'),
  streak: (): Promise<StreakResponse> => apiGet<StreakResponse>('/api/journey/streak'),
  achievements: (): Promise<Achievement[]> => apiGet<Achievement[]>('/api/achievements'),
  npcDetail: (id: string): Promise<NpcDetail> => apiGet<NpcDetail>('/api/npcs/' + id),
  memories: (npcId?: string): Promise<MemoryItem[]> =>
    apiGet<MemoryItem[]>('/api/memories' + (npcId ? '?npcId=' + npcId : '')),
  settings: (): Promise<SettingsResponse> => apiGet<SettingsResponse>('/api/settings'),
  saveSettings: (s: SettingsPatch) => apiPut('/api/settings', s),
  resetUserData: (): Promise<OkResponse> => apiPost<OkResponse>('/api/system/reset', { confirm: true }),
  // scenario
  scenarioCatalog: (): Promise<ScenarioCatalogItem[]> => apiGet<ScenarioCatalogItem[]>('/api/scenarios/catalog'),
  sessions: (query?: string): Promise<SessionListItem[]> =>
    apiGet<SessionListItem[]>('/api/scenarios/sessions' + (query || '')),
  session: (id: string): Promise<SessionDetailResponse> =>
    apiGet<SessionDetailResponse>('/api/scenarios/sessions/' + id),
  acceptSession: (id: string): Promise<AcceptSessionResponse> =>
    apiPost<AcceptSessionResponse>('/api/scenarios/sessions/' + id + '/accept', {}),
  streamDeclineSession: (id: string, reason: string | undefined, onEvent: (e: ChatStreamEvent) => void) =>
    streamPost<ChatStreamEvent>('/api/scenarios/sessions/' + id + '/decline', reason ? { reason: reason } : {}, onEvent),
  streamChoose: (id: string, choiceId: string, onEvent: (e: ScenarioStreamEvent) => void, extra?: Record<string, unknown>) =>
    streamPost<ScenarioStreamEvent>('/api/scenarios/sessions/' + id + '/choose',
      Object.assign({ choiceId: choiceId }, extra || {}), onEvent),
  streamFreetype: (id: string, text: string, onEvent: (e: ScenarioStreamEvent) => void) =>
    streamPost<ScenarioStreamEvent>('/api/scenarios/sessions/' + id + '/freetype', { text: text }, onEvent),
  streamCompleteSession: (id: string, onEvent: (e: ScenarioStreamEvent) => void) =>
    streamPost<ScenarioStreamEvent>('/api/scenarios/sessions/' + id + '/complete', {}, onEvent),
  pauseSession: (id: string): Promise<OkResponse> =>
    apiPost<OkResponse>('/api/scenarios/sessions/' + id + '/pause', {}),
  resumeSession: (id: string): Promise<unknown> =>
    apiPost('/api/scenarios/sessions/' + id + '/resume', {}),
  abortSession: (id: string): Promise<OkResponse> =>
    apiPost<OkResponse>('/api/scenarios/sessions/' + id + '/abort', {}),
};
