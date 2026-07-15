import type { MemoryStrategy } from './requests';

// Response types — one per typed client method, mirroring today's handler output.
// Derived by reading each handler / its src/server mapper; no behavior change.
//
// Datetime convention: fields the server emits as `Date` are typed `string | Date`.
// The handler produces a `Date` (assignable to the union, so annotations type-check);
// over the wire JSON serializes it to an ISO string, which the web also accepts.

// GET /api/auth/me
export interface MeResponse {
  user: { id: string; username: string; displayName: string; language: string; targetLang: string };
  streak: { days: number; weekCount: number };
  totals: { conversations: number; scenarios: number; memories: number };
}

// POST /api/auth/login + POST /api/auth/register
export interface AuthResponse {
  userId: string;
}

// GET /api/npcs
export interface NpcListItem {
  id: string;
  name: string;
  avatar: { glyph: string; bg: string; ink: string };
  status: string;
  relationship: string;
  stageValue: number;
  lastMessage: string | null;
  lastTime: string | Date | null;
  hasSomething: boolean;
}

// GET /api/threads/:npcId/messages — element of `messages` (see mapMessageToApi)
export interface ThreadMessage {
  id: string;
  role: string;
  text: string;
  from: string; // 'user' | 'npc', widened by the mapper
  correction: unknown; // parsed JSON, or null
  lang: string | null;
  retracted: boolean;
  retractedText: string | null;
  createdAt: string | Date;
}
export interface ThreadResponse {
  messages: ThreadMessage[];
  hasMore: boolean;
}

// GET /api/profile
export interface ProfileResponse {
  role: string | null;
  goal: string | null;
  interests: string[];
  language: string;
}

// GET /api/journey/summary
export interface JourneySummaryResponse {
  days: number;
  conversations: number;
  scenarios: number;
  memories: number;
}

// GET /api/journey/relationships — element (see buildRelationshipCards)
export interface RelationshipCard {
  npcId: string;
  name: string;
  stage: string;
  stageValue: number;
  sub: string;
  note: string | null;
  last: string | null; // already an ISO string (lastInteractionAt.toISOString())
}

// GET /api/journey/streak
export interface StreakResponse {
  days: number;
  weekCount: number;
  perDay: number[];
}

// GET /api/achievements — element
export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  unlocked: boolean;
  unlockedAt: string | Date | null;
}

// GET /api/memories — element
export interface MemoryItem {
  id: string;
  title: string;
  body: string;
  noticedAt: string | Date;
  sourceType: string;
  sourceRef: string | null;
  npcId: string | null;
}

// GET /api/settings (mirrors SettingsView). MemoryStrategy is the single source
// in ./requests (shared with the SettingsPatch request enum).
export interface SettingsResponse {
  grammarCorrection: boolean;
  modelName: string;
  uiLanguage: string;
  voiceTTSEnabled: boolean;
  showAIRationale: boolean;
  memoryStrategy: MemoryStrategy;
}

// GET /api/scenarios/catalog — element
export interface ScenarioCatalogItem {
  id: string;
  title: string;
  titleZh: string | null;
  npcId: string;
  minStage: string;
  estimatedMinutes: number;
  registerTags: string[];
  eligible: boolean;
}

// GET /api/scenarios/sessions — element (see mapSessionListItem)
export interface SessionListItem {
  id: string;
  scenarioTitle: string;
  npcId: string;
  status: string;
  grade: string | null;
  startedAt: string | Date | null;
}

// Shared session header — used by the session detail and the accept result.
export interface ScenarioSessionView {
  id: string;
  npcId: string;
  scenarioTitle: string;
  titleZh: string | null;
  status: string;
  grade: string | null;
  invitedAt: string | Date;
  startedAt: string | Date | null;
  endedAt: string | Date | null;
  rationale: unknown;
}

export interface ScenarioTranscriptItem {
  id: string;
  role: string;
  from: 'user' | 'npc';
  text: string;
  meta: unknown;
  createdAt: string | Date;
}

// GET /api/scenarios/sessions/:id (see mapSessionDetail)
export interface SessionDetailResponse {
  session: ScenarioSessionView;
  transcript: ScenarioTranscriptItem[];
  state: unknown;
}

// POST /api/scenarios/sessions/:id/accept (see acceptScenario → AcceptResult)
export interface AcceptSessionResponse {
  session: ScenarioSessionView;
  openingMessage: { id: string; text: string };
  choices: unknown[];
  state: unknown;
}

// POST /api/scenarios/sessions/:id/decline
export interface OkResponse {
  ok: boolean;
}

// GET /api/npcs/:id (the NPC persona panel)
export interface NpcDetail {
  id: string;
  name: string;
  persona: string; // shortBio
  avatar: { glyph: string; bg: string; ink: string };
  languageProfile: { primary: string; occasional: string[]; register: string };
  topicInterests: string[];
  relationship: string; // stage
  relationshipSince: string | Date | null;
  knownFacts: string[]; // per-NPC, factToText-formatted
  chatStats: { messages: number; conversationCount: number };
}
