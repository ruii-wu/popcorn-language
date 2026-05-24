# W1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project skeleton, database, minimal session-auth primitives, the Ollama client, and the PromptBuilder — the foundation every later phase builds on.

**Architecture:** Next.js 14 (App Router, TS) single process. Pure-logic modules live in `src/server/*` and are unit-tested with no Ollama and no DB (Ollama is dependency-injected via a `fetchImpl`; data shapes are plain objects). Prisma + SQLite hold all state. This phase ships no chat UI yet — its acceptance gate is `GET /api/system/health` returning JSON and all unit tests green.

**Tech Stack:** Next.js 14, TypeScript, Prisma 5, SQLite, Zod, Vitest, tsx.

**Spec:** `docs/superpowers/specs/2026-05-25-backend-roadmap-design.md` — this phase implements §四 (auth primitives), §七 Module 1 + Module 2, §八 (full schema), and `/api/system/health` from §五.9.

**Decision (confirmed):** Build fresh via TDD. Do **not** copy from reverted commit `564965a`.

---

## Prerequisites

- **Node.js 20+** in PATH (`node -v`). The reverted attempt stalled here — verify first.
- **Ollama** is **optional for this phase**: all tests mock it. To exercise `/api/system/health` against a live model: `ollama pull qwen2.5:7b-instruct` and `ollama pull nomic-embed-text`.
- Work happens at repo root `D:\MCOMP\Capstone\popcorn_language`.

---

## File structure produced by W1

```
package.json · tsconfig.json · next.config.js · vitest.config.ts · .env.example
prisma/
  schema.prisma          # full v2 schema (§八)
  seed-data.ts           # typed NPC / scenario / achievement seed data
  seed.ts                # writes seed-data into SQLite
src/
  server/
    db/client.ts         # Prisma singleton
    llm/ollama.ts        # Module 1: OllamaClient (health/chat/chatJson/embed)
    prompt/types.ts      # PromptContext types
    prompt/builder.ts    # Module 2: buildSystemPrompt
    auth/session.ts      # cookie serialize/parse
    auth/requireUser.ts  # requireUser / getUserId
  app/api/system/health/route.ts
tests/
  unit/{sanity,seed-data,ollama-health,ollama-chat,ollama-chatjson,ollama-embed,prompt-builder,auth}.test.ts
  integration/schema.test.ts
```

---

## Task 0: Project bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `vitest.config.ts`, `.env.example`, `src/server/db/client.ts`, `tests/unit/sanity.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "popcorn-language",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:generate": "prisma generate",
    "typecheck": "tsc --noEmit"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "@prisma/client": "5.18.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/node": "20.14.15",
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0",
    "prisma": "5.18.0",
    "vitest": "2.0.5",
    "tsx": "4.17.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "skipLibCheck": true,
    "paths": { "@/*": ["./src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next.config.js`**

```js
/** @type {import('next').NextConfig} */
module.exports = { reactStrictMode: true };
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
```

- [ ] **Step 5: Create `.env.example` and copy to `.env`**

```
DATABASE_URL="file:./dev.db"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_CHAT_MODEL="qwen2.5:7b-instruct"
OLLAMA_EMBED_MODEL="nomic-embed-text"
```

Then: `Copy-Item .env.example .env`

- [ ] **Step 6: Create `src/server/db/client.ts`**

```ts
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;
```

- [ ] **Step 7: Create `tests/unit/sanity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 8: Install and verify**

Run: `npm install`
Then: `npm run test`
Expected: 1 passing test (`sanity`). (Prisma client import in `db/client.ts` is not exercised yet.)

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json next.config.js vitest.config.ts .env.example src/server/db/client.ts tests/unit/sanity.test.ts
git commit -m "chore: bootstrap Next.js 14 + TS + Vitest + Prisma toolchain"
```

---

## Task 1: Prisma schema + migration

**Files:**
- Create: `prisma/schema.prisma`, `tests/integration/schema.test.ts`

- [ ] **Step 1: Create `prisma/schema.prisma`** — full v2 schema (verbatim from spec §八)

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "sqlite"; url = env("DATABASE_URL") }

model User {
  id          String   @id @default(cuid())
  username    String   @unique
  password    String
  createdAt   DateTime @default(now())
  displayName String   @default("You")
  language    String   @default("zh-CN")
  targetLang  String   @default("en-US")
  cefrLevel   String?

  profile          UserProfile?
  settings         UserSettings?
  relationships    Relationship[]
  threads          Thread[]
  messages         Message[]
  scenarioSessions ScenarioSession[]
  memories         Memory[]
  facts            MemoryFact[]
  achievements     UserAchievement[]
  events           ActivityEvent[]
  retrievalLogs    MemoryRetrievalLog[]
}

model UserProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role      String?
  goal      String?
  interests String   @default("[]")
  updatedAt DateTime @updatedAt
}

model UserSettings {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  grammarCorrection Boolean  @default(true)
  modelName         String   @default("qwen2.5:7b-instruct")
  uiLanguage        String   @default("zh-CN")
  voiceTTSEnabled   Boolean  @default(false)
  showAIRationale   Boolean  @default(true)
  memoryStrategy    String   @default("hybrid")
  updatedAt         DateTime @updatedAt
}

model Npc {
  id              String  @id
  name            String
  avatarGlyph     String
  avatarBg        String
  avatarInk       String
  shortBio        String
  personaPrompt   String
  languageProfile String  @default("{}")
  topicInterests  String  @default("[]")
  scenarioRoles   String  @default("[]")
  introMessage    String

  relationships     Relationship[]
  threads           Thread[]
  scenarioSessions  ScenarioSession[]
  scenarioTemplates ScenarioTemplate[]
}

model Relationship {
  id                 String    @id @default(cuid())
  userId             String
  npcId              String
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  npc                Npc       @relation(fields: [npcId], references: [id])
  stage              String    @default("acquaintance")
  stageValue         Int       @default(1)
  relationshipPoints Int       @default(0)
  conversationCount  Int       @default(0)
  scenarioCount      Int       @default(0)
  declineCount       Int       @default(0)
  lastInteractionAt  DateTime?
  createdAt          DateTime  @default(now())

  events RelationshipEvent[]

  @@unique([userId, npcId])
}

model RelationshipEvent {
  id             String       @id @default(cuid())
  relationshipId String
  relationship   Relationship @relation(fields: [relationshipId], references: [id], onDelete: Cascade)
  fromStage      String
  toStage        String
  reason         String
  createdAt      DateTime     @default(now())
}

model Thread {
  id        String    @id @default(cuid())
  userId    String
  npcId     String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  npc       Npc       @relation(fields: [npcId], references: [id])
  createdAt DateTime  @default(now())
  lastMsgAt DateTime?

  messages         Message[]
  summaries        ConversationSummary[]
  scenarioSessions ScenarioSession[]

  @@unique([userId, npcId])
}

model Message {
  id          String   @id @default(cuid())
  threadId    String
  userId      String?
  thread      Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  role        String
  text        String
  langDetect  String?
  correction  String?
  meta        String?
  tokensUsed  Int?
  modelName   String?
  createdAt   DateTime @default(now())

  scenarioSessionId String?
  scenarioSession   ScenarioSession? @relation(fields: [scenarioSessionId], references: [id], onDelete: SetNull)
  scenarioTurn      ScenarioTurn?

  @@index([threadId, createdAt])
}

model ConversationSummary {
  id        String   @id @default(cuid())
  threadId  String
  thread    Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  fromMsgId String
  toMsgId   String
  summary   String
  embedding String?
  createdAt DateTime @default(now())

  @@index([threadId, createdAt])
}

model ScenarioTemplate {
  id               String  @id
  title            String
  titleZh          String?
  npcId            String
  npc              Npc     @relation(fields: [npcId], references: [id])
  rolePlayedBy     String
  minStage         String  @default("friend")
  estimatedMinutes Int     @default(8)
  estimatedTurns   Int     @default(6)
  registerTags     String  @default("[]")
  systemPrompt     String
  topicKeywords    String  @default("[]")
  enabled          Boolean @default(true)

  sessions ScenarioSession[]
}

model ScenarioSession {
  id               String   @id @default(cuid())
  userId           String
  npcId            String
  threadId         String
  templateId       String
  user             User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  npc              Npc              @relation(fields: [npcId], references: [id])
  thread           Thread           @relation(fields: [threadId], references: [id], onDelete: Cascade)
  template         ScenarioTemplate @relation(fields: [templateId], references: [id])

  status           String
  state            String   @default("{}")
  invitedAt        DateTime @default(now())
  startedAt        DateTime?
  endedAt          DateTime?
  declineReason    String?
  triggerRationale String?

  turns    ScenarioTurn[]
  messages Message[]
  summary  ScenarioSummary?
}

model ScenarioTurn {
  id             String   @id @default(cuid())
  sessionId      String
  session        ScenarioSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  turnIndex      Int
  userChoiceId   String?
  userChoiceTone String?
  userFreeText   String?
  userMessageId  String?  @unique
  userMessage    Message? @relation(fields: [userMessageId], references: [id])
  npcMessageId   String?
  stateBefore    String   @default("{}")
  stateAfter     String   @default("{}")
  nextChoices    String?
  createdAt      DateTime @default(now())

  @@unique([sessionId, turnIndex])
}

model ScenarioSummary {
  id               String   @id @default(cuid())
  sessionId        String   @unique
  session          ScenarioSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  grade            String
  languageNote     String
  pragmaticsNote   String
  relationshipNote String
  transcriptUrl    String?
  createdAt        DateTime @default(now())
}

model Memory {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  body        String
  npcId       String?
  sourceType  String
  sourceRef   String?
  noticedAt   DateTime  @default(now())
  dismissedAt DateTime?
  meta        String?

  @@index([userId, noticedAt])
}

model MemoryFact {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject     String   @default("user")
  predicate   String
  value       String
  confidence  Float    @default(0.7)
  embedding   String?
  sourceMsgId String?
  knownToNpcs String   @default("[]")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, predicate])
}

model AchievementDef {
  id          String  @id
  title       String
  description String
  icon        String?
  rule        String
  ruleConfig  String?
  isDynamic   Boolean @default(false)
  enabled     Boolean @default(true)

  unlocks UserAchievement[]
}

model UserAchievement {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  achievementId String
  achievement   AchievementDef @relation(fields: [achievementId], references: [id])
  unlockedAt    DateTime @default(now())
  context       String?

  @@unique([userId, achievementId])
}

model ActivityEvent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String
  payload   String   @default("{}")
  createdAt DateTime @default(now())

  @@index([userId, type, createdAt])
}

model MemoryRetrievalLog {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  strategy     String
  queryText    String
  retrievedIds String   @default("[]")
  k            Int
  latencyMs    Int
  tokenCost    Int?
  createdAt    DateTime @default(now())

  @@index([userId, strategy, createdAt])
}
```

- [ ] **Step 2: Run the migration**

Run: `npx prisma migrate dev --name init`
Expected: creates `prisma/migrations/<ts>_init/`, generates the Prisma client, no errors.

- [ ] **Step 3: Write the failing integration test**

`tests/integration/schema.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const USERNAME = '__w1_schema_test_user__';

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.$disconnect();
});

describe('schema', () => {
  it('creates a user with a profile and reads it back', async () => {
    await prisma.user.deleteMany({ where: { username: USERNAME } });
    const user = await prisma.user.create({
      data: {
        username: USERNAME,
        password: 'plain',
        profile: { create: { role: 'Student', goal: 'work', interests: JSON.stringify(['Coffee']) } },
      },
      include: { profile: true },
    });
    expect(user.username).toBe(USERNAME);
    expect(user.language).toBe('zh-CN');
    expect(user.profile?.role).toBe('Student');
    expect(JSON.parse(user.profile!.interests)).toEqual(['Coffee']);
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm run test -- tests/integration/schema.test.ts`
Expected: PASS (migration already created the tables).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/integration/schema.test.ts
git commit -m "feat: add full v2 Prisma schema and init migration"
```

---

## Task 2: Seed data (3 NPC, 1 scenario, 6 achievements)

**Files:**
- Create: `prisma/seed-data.ts`, `prisma/seed.ts`, `tests/unit/seed-data.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/seed-data.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { NPCS, SCENARIO_TEMPLATES, ACHIEVEMENTS } from '../../prisma/seed-data';

describe('seed-data', () => {
  it('has exactly 3 NPCs with unique ids and required fields', () => {
    expect(NPCS).toHaveLength(3);
    const ids = NPCS.map(n => n.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids).toEqual(expect.arrayContaining(['lily', 'chen', 'emma']));
    for (const n of NPCS) {
      expect(n.personaPrompt.length).toBeGreaterThan(10);
      expect(n.introMessage.length).toBeGreaterThan(0);
      expect(n.languageProfile.primary).toBeTruthy();
    }
  });

  it('has the mock_interview template referencing a real NPC', () => {
    const t = SCENARIO_TEMPLATES.find(s => s.id === 'mock_interview');
    expect(t).toBeDefined();
    expect(NPCS.map(n => n.id)).toContain(t!.npcId);
    expect(t!.systemPrompt.length).toBeGreaterThan(10);
  });

  it('has 6 achievements with unique ids', () => {
    expect(ACHIEVEMENTS).toHaveLength(6);
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/seed-data.test.ts`
Expected: FAIL — cannot find module `../../prisma/seed-data`.

- [ ] **Step 3: Create `prisma/seed-data.ts`**

```ts
export interface NpcSeed {
  id: string; name: string; avatarGlyph: string; avatarBg: string; avatarInk: string;
  shortBio: string; personaPrompt: string;
  languageProfile: { primary: string; occasional: string[]; register: string };
  topicInterests: string[];
  scenarioRoles: { id: string; name: string; voice: string; defaultStress: string }[];
  introMessage: string;
}

export const NPCS: NpcSeed[] = [
  {
    id: 'lily', name: 'Lily', avatarGlyph: '☕', avatarBg: '#D5F2DC', avatarInk: '#15784A',
    shortBio: 'Brooklyn barista, 24',
    personaPrompt:
      'You are Lily, a friendly 24-year-old coffee-shop barista in Brooklyn. You are warm, casual, and use light NYC slang. You know a handful of Chinese words but answer in English. You previously worked in HR.',
    languageProfile: { primary: 'en', occasional: ['zh'], register: 'casual' },
    topicInterests: ['coffee', 'food', 'neighborhoods', 'daily life', 'interview'],
    scenarioRoles: [{ id: 'hr_manager', name: 'Linda', voice: 'professional, probing', defaultStress: 'Medium' }],
    introMessage: "hey! welcome in. you look new — what can i get started for you today? we've got a really good oat milk latte if you want a rec ☕",
  },
  {
    id: 'chen', name: 'Mr. Chen', avatarGlyph: '陈', avatarBg: 'oklch(0.93 0.02 250)', avatarInk: 'oklch(0.40 0.06 250)',
    shortBio: 'Bilingual senior coworker',
    personaPrompt:
      'You are Mr. Chen, a bilingual senior coworker and mentor figure. You are professional, measured, and supportive. You comfortably switch between English and Chinese.',
    languageProfile: { primary: 'en', occasional: ['zh'], register: 'professional' },
    topicInterests: ['work', 'career', 'projects', 'planning'],
    scenarioRoles: [{ id: 'manager', name: 'Mr. Chen', voice: 'measured, senior', defaultStress: 'Low' }],
    introMessage: 'Glad to have you on the team. Let me know when you have a moment to sync.',
  },
  {
    id: 'emma', name: 'Emma', avatarGlyph: 'E', avatarBg: 'oklch(0.93 0.04 340)', avatarInk: 'oklch(0.48 0.10 340)',
    shortBio: 'UK university student',
    personaPrompt:
      'You are Emma, an energetic UK university student. You are chatty, playful, and use British expressions. You speak English only.',
    languageProfile: { primary: 'en', occasional: [], register: 'casual' },
    topicInterests: ['cats', 'music', 'movies', 'student life'],
    scenarioRoles: [],
    introMessage: 'oi hello!! you new here? tell me everything — and do you have a cat',
  },
];

export interface ScenarioTemplateSeed {
  id: string; title: string; titleZh?: string; npcId: string; rolePlayedBy: string;
  minStage: string; estimatedMinutes: number; estimatedTurns: number;
  registerTags: string[]; systemPrompt: string; topicKeywords: string[]; enabled: boolean;
}

export const SCENARIO_TEMPLATES: ScenarioTemplateSeed[] = [
  {
    id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试',
    npcId: 'lily', rolePlayedBy: 'hr_manager', minStage: 'friend',
    estimatedMinutes: 8, estimatedTurns: 6,
    registerTags: ['Formal register', 'Polite hedging'],
    systemPrompt:
      'Roleplay: you are Linda, a tough but fair HR manager interviewing the user for a junior marketing role. Ask probing questions, test composure under pressure, and stay in character. Keep each reply to 1-3 sentences.',
    topicKeywords: ['interview', 'job', 'hr', 'hiring', 'role', 'application'],
    enabled: true,
  },
];

export interface AchievementSeed {
  id: string; title: string; description: string; icon?: string; rule: string; ruleConfig?: Record<string, unknown>;
}

export const ACHIEVEMENTS: AchievementSeed[] = [
  { id: 'first_chat', title: 'First Chat', description: 'Finish your first conversation with any NPC.', rule: 'first_chat' },
  { id: 'three_friends', title: 'Three Friends', description: 'Reach Friend stage with all 3 NPCs.', rule: 'all_npcs_friend' },
  { id: 'scenario_survivor', title: 'Scenario Survivor', description: 'Complete your first scenario.', rule: 'first_scenario_completed' },
  { id: 'polite_mode', title: 'Polite Mode', description: 'Score B or above in a scenario.', rule: 'scenario_grade_min', ruleConfig: { minGrade: 'B' } },
  { id: 'bilingual', title: 'Bilingual', description: 'Use both Chinese and English in one conversation.', rule: 'bilingual_message' },
  { id: 'streak_week', title: 'Streak Week', description: 'Chat on 7 consecutive days.', rule: 'streak_days', ruleConfig: { days: 7 } },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/seed-data.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `prisma/seed.ts`**

```ts
import { PrismaClient } from '@prisma/client';
import { NPCS, SCENARIO_TEMPLATES, ACHIEVEMENTS } from './seed-data';

const prisma = new PrismaClient();

async function main() {
  for (const n of NPCS) {
    await prisma.npc.upsert({
      where: { id: n.id },
      update: {},
      create: {
        id: n.id, name: n.name, avatarGlyph: n.avatarGlyph, avatarBg: n.avatarBg, avatarInk: n.avatarInk,
        shortBio: n.shortBio, personaPrompt: n.personaPrompt, introMessage: n.introMessage,
        languageProfile: JSON.stringify(n.languageProfile),
        topicInterests: JSON.stringify(n.topicInterests),
        scenarioRoles: JSON.stringify(n.scenarioRoles),
      },
    });
  }
  for (const s of SCENARIO_TEMPLATES) {
    await prisma.scenarioTemplate.upsert({
      where: { id: s.id },
      update: {},
      create: {
        id: s.id, title: s.title, titleZh: s.titleZh, npcId: s.npcId, rolePlayedBy: s.rolePlayedBy,
        minStage: s.minStage, estimatedMinutes: s.estimatedMinutes, estimatedTurns: s.estimatedTurns,
        systemPrompt: s.systemPrompt, enabled: s.enabled,
        registerTags: JSON.stringify(s.registerTags),
        topicKeywords: JSON.stringify(s.topicKeywords),
      },
    });
  }
  for (const a of ACHIEVEMENTS) {
    await prisma.achievementDef.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id, title: a.title, description: a.description, icon: a.icon, rule: a.rule,
        ruleConfig: a.ruleConfig ? JSON.stringify(a.ruleConfig) : null,
      },
    });
  }
  console.log(`Seeded ${NPCS.length} NPCs, ${SCENARIO_TEMPLATES.length} scenario(s), ${ACHIEVEMENTS.length} achievements.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Run the seed and verify**

Run: `npm run db:seed`
Expected: prints `Seeded 3 NPCs, 1 scenario(s), 6 achievements.`

- [ ] **Step 7: Commit**

```bash
git add prisma/seed-data.ts prisma/seed.ts tests/unit/seed-data.test.ts
git commit -m "feat: add seed data (3 NPCs, mock_interview, 6 achievements)"
```

---

## Task 3: Minimal session auth primitives

**Files:**
- Create: `src/server/auth/session.ts`, `src/server/auth/requireUser.ts`, `tests/unit/auth.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/auth.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { SESSION_COOKIE, serializeSessionCookie, clearSessionCookie, parseUserIdFromCookieHeader } from '@/server/auth/session';
import { requireUser, getUserId, UnauthorizedError } from '@/server/auth/requireUser';

function reqWithCookie(cookie: string | null): Request {
  return new Request('http://localhost/api/x', { headers: cookie ? { cookie } : {} });
}

describe('session cookie', () => {
  it('round-trips a userId', () => {
    const setCookie = serializeSessionCookie('user_123');
    expect(setCookie).toContain(`${SESSION_COOKIE}=user_123`);
    expect(setCookie).toContain('HttpOnly');
    const header = `other=1; ${SESSION_COOKIE}=user_123; foo=bar`;
    expect(parseUserIdFromCookieHeader(header)).toBe('user_123');
  });

  it('returns null when cookie missing', () => {
    expect(parseUserIdFromCookieHeader(null)).toBeNull();
    expect(parseUserIdFromCookieHeader('other=1')).toBeNull();
  });

  it('clear cookie has Max-Age=0', () => {
    expect(clearSessionCookie()).toContain('Max-Age=0');
  });
});

describe('requireUser', () => {
  it('returns userId when cookie present', () => {
    expect(getUserId(reqWithCookie(`${SESSION_COOKIE}=user_9`))).toBe('user_9');
    expect(requireUser(reqWithCookie(`${SESSION_COOKIE}=user_9`))).toEqual({ userId: 'user_9' });
  });

  it('throws UnauthorizedError when missing', () => {
    expect(() => requireUser(reqWithCookie(null))).toThrow(UnauthorizedError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/auth.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/server/auth/session.ts`**

```ts
export const SESSION_COOKIE = 'pop_uid';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function serializeSessionCookie(userId: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(userId)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export function parseUserIdFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === SESSION_COOKIE) {
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      return val || null;
    }
  }
  return null;
}
```

- [ ] **Step 4: Create `src/server/auth/requireUser.ts`**

```ts
import { parseUserIdFromCookieHeader } from './session';

export class UnauthorizedError extends Error {
  constructor() { super('Unauthorized'); this.name = 'UnauthorizedError'; }
}

export function getUserId(req: Request): string | null {
  return parseUserIdFromCookieHeader(req.headers.get('cookie'));
}

export function requireUser(req: Request): { userId: string } {
  const userId = getUserId(req);
  if (!userId) throw new UnauthorizedError();
  return { userId };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- tests/unit/auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/auth/session.ts src/server/auth/requireUser.ts tests/unit/auth.test.ts
git commit -m "feat: add minimal session cookie + requireUser primitives"
```

---

## Task 4: Ollama client — `health()`

**Files:**
- Create: `src/server/llm/ollama.ts`, `tests/unit/ollama-health.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/ollama-health.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe('OllamaClient.health', () => {
  it('reports reachable + modelInstalled when tags include the chat model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ models: [{ name: 'qwen2.5:7b-instruct' }, { name: 'nomic-embed-text' }] }),
    );
    const client = new OllamaClient({ chatModel: 'qwen2.5:7b-instruct', fetchImpl });
    const h = await client.health();
    expect(h.reachable).toBe(true);
    expect(h.modelInstalled).toBe(true);
    expect(h.model).toBe('qwen2.5:7b-instruct');
    expect(typeof h.latencyMs).toBe('number');
  });

  it('reports unreachable when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new OllamaClient({ fetchImpl });
    const h = await client.health();
    expect(h.reachable).toBe(false);
    expect(h.modelInstalled).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/ollama-health.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/server/llm/ollama.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/ollama-health.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/ollama.ts tests/unit/ollama-health.test.ts
git commit -m "feat: add OllamaClient.health()"
```

---

## Task 5: Ollama client — `chat()` streaming

**Files:**
- Modify: `src/server/llm/ollama.ts`
- Create: `tests/unit/ollama-chat.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/ollama-chat.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { OllamaClient } from '@/server/llm/ollama';

function ndjsonResponse(lines: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(enc.encode(l + '\n'));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

describe('OllamaClient.chat', () => {
  it('yields content tokens until done', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      ndjsonResponse([
        JSON.stringify({ message: { content: 'hel' }, done: false }),
        JSON.stringify({ message: { content: 'lo' }, done: false }),
        JSON.stringify({ message: { content: '!' }, done: true }),
      ]),
    );
    const client = new OllamaClient({ fetchImpl });
    const out: string[] = [];
    for await (const tok of client.chat([{ role: 'user', content: 'hi' }])) out.push(tok);
    expect(out.join('')).toBe('hello!');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/ollama-chat.test.ts`
Expected: FAIL — `client.chat is not a function`.

- [ ] **Step 3: Add `chat()` to `OllamaClient`** (insert as a method inside the class in `src/server/llm/ollama.ts`)

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/ollama-chat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/ollama.ts tests/unit/ollama-chat.test.ts
git commit -m "feat: add OllamaClient.chat() NDJSON streaming"
```

---

## Task 6: Ollama client — `chatJson()` with Zod + retry

**Files:**
- Modify: `src/server/llm/ollama.ts`
- Create: `tests/unit/ollama-chatjson.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/ollama-chatjson.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { OllamaClient, OllamaError } from '@/server/llm/ollama';

function chatJsonResponse(content: string): Response {
  return { ok: true, status: 200, json: async () => ({ message: { content } }) } as unknown as Response;
}

const schema = z.object({ fixed: z.string(), tag: z.string() });

describe('OllamaClient.chatJson', () => {
  it('retries past invalid JSON then returns a validated object', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(chatJsonResponse('not json'))
      .mockResolvedValueOnce(chatJsonResponse(JSON.stringify({ fixed: 'I am going', tag: 'Grammar' })));
    const client = new OllamaClient({ fetchImpl });
    const out = await client.chatJson([{ role: 'user', content: 'x' }], schema, { maxRetries: 3 });
    expect(out).toEqual({ fixed: 'I am going', tag: 'Grammar' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('throws OllamaError after exhausting retries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(chatJsonResponse('still not json'));
    const client = new OllamaClient({ fetchImpl });
    await expect(client.chatJson([{ role: 'user', content: 'x' }], schema, { maxRetries: 3 }))
      .rejects.toBeInstanceOf(OllamaError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/ollama-chatjson.test.ts`
Expected: FAIL — `client.chatJson is not a function`.

- [ ] **Step 3: Add `chatJson()` to `OllamaClient`** (also add the `import type { ZodType } from 'zod'` at the top of the file)

At top of `src/server/llm/ollama.ts`:
```ts
import type { ZodType } from 'zod';
```

Method inside the class:
```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/ollama-chatjson.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/ollama.ts tests/unit/ollama-chatjson.test.ts
git commit -m "feat: add OllamaClient.chatJson() with Zod validation + retry"
```

---

## Task 7: Ollama client — `embed()`

**Files:**
- Modify: `src/server/llm/ollama.ts`
- Create: `tests/unit/ollama-embed.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/ollama-embed.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { OllamaClient, OllamaError } from '@/server/llm/ollama';

describe('OllamaClient.embed', () => {
  it('returns the embedding vector', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      { ok: true, status: 200, json: async () => ({ embedding: [0.1, 0.2, 0.3] }) } as unknown as Response,
    );
    const client = new OllamaClient({ fetchImpl });
    const v = await client.embed('hello');
    expect(v).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws when the response lacks an embedding', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      { ok: true, status: 200, json: async () => ({}) } as unknown as Response,
    );
    const client = new OllamaClient({ fetchImpl });
    await expect(client.embed('hello')).rejects.toBeInstanceOf(OllamaError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/ollama-embed.test.ts`
Expected: FAIL — `client.embed is not a function`.

- [ ] **Step 3: Add `embed()` to `OllamaClient`**

```ts
  async embed(text: string, opts: { model?: string } = {}): Promise<number[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: opts.model ?? this.embedModel, prompt: text }),
    });
    if (!res.ok) throw new OllamaError(`embed HTTP ${res.status}`);
    const data = (await res.json()) as { embedding?: number[] };
    if (!Array.isArray(data.embedding)) throw new OllamaError('embed: no embedding in response');
    return data.embedding;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/unit/ollama-embed.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/llm/ollama.ts tests/unit/ollama-embed.test.ts
git commit -m "feat: add OllamaClient.embed()"
```

---

## Task 8: PromptBuilder (Module 2)

**Files:**
- Create: `src/server/prompt/types.ts`, `src/server/prompt/builder.ts`, `tests/unit/prompt-builder.test.ts`

- [ ] **Step 1: Write the failing test** `tests/unit/prompt-builder.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '@/server/prompt/builder';
import type { PromptContext } from '@/server/prompt/types';

const base: PromptContext = {
  npc: { name: 'Lily', personaPrompt: 'You are Lily, a Brooklyn barista.', languageProfile: { primary: 'en', occasional: ['zh'], register: 'casual' } },
  userLanguage: 'zh-CN',
  mode: 'casual',
};

describe('buildSystemPrompt', () => {
  it('includes persona, language profile and the bilingual learner note', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('You are Lily, a Brooklyn barista.');
    expect(p).toContain('primarily in en');
    expect(p).toContain('native Chinese speaker');
  });

  it('includes recalled facts, profile and relationship tone when provided', () => {
    const p = buildSystemPrompt({
      ...base,
      userProfile: { role: 'Student', goal: 'work', interests: ['Coffee', 'Cats'] },
      facts: ['orders oat milk latte', 'has a cat'],
      relationshipStage: 'close',
      recentSummary: 'Talked about the GRE.',
    });
    expect(p).toContain('role: Student');
    expect(p).toContain('orders oat milk latte');
    expect(p).toContain('Talked about the GRE.');
    expect(p).toContain('close friends');
  });

  it('adds the roleplay JSON contract in scenario mode', () => {
    const p = buildSystemPrompt({ ...base, mode: 'scenario', scenario: { roleName: 'Linda', instructions: 'Act as a tough HR manager.' } });
    expect(p).toContain('Linda');
    expect(p).toContain('"npcReply"');
    expect(p).toContain('"isFinalTurn"');
  });

  it('omits the bilingual note for an English-native user', () => {
    const p = buildSystemPrompt({ ...base, userLanguage: 'en-US' });
    expect(p).not.toContain('native Chinese speaker');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- tests/unit/prompt-builder.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/server/prompt/types.ts`**

```ts
export interface NpcPromptInfo {
  name: string;
  personaPrompt: string;
  languageProfile: { primary: string; occasional: string[]; register: string };
}

export interface PromptContext {
  npc: NpcPromptInfo;
  userProfile?: { role?: string | null; goal?: string | null; interests?: string[] };
  relationshipStage?: 'acquaintance' | 'friend' | 'close';
  facts?: string[];
  recentSummary?: string;
  userLanguage: string; // 'zh-CN' | 'en-US'
  mode: 'casual' | 'scenario';
  scenario?: { roleName: string; instructions: string };
}
```

- [ ] **Step 4: Create `src/server/prompt/builder.ts`**

```ts
import type { PromptContext } from './types';

const RELATIONSHIP_TONE: Record<string, string> = {
  acquaintance: 'You are still getting to know this person. Be friendly but a little reserved.',
  friend: 'You and this person are friends. Be warm, casual and familiar.',
  close: 'You are close friends. Be playful and affectionate, and tease lightly.',
};

const JSON_CONTRACT =
  'Respond ONLY with a JSON object matching: ' +
  '{"npcReply": string, "stateDelta": {"impression": number, "stress": "Low"|"Medium"|"High"}, ' +
  '"isFinalTurn": boolean, "suggestedChoicesNext": [{"id": string, "text": string, "tone": string, "desc": string}]}. ' +
  'No prose outside the JSON.';

export function buildSystemPrompt(ctx: PromptContext): string {
  const blocks: string[] = [];

  blocks.push(ctx.npc.personaPrompt.trim());

  const lp = ctx.npc.languageProfile;
  blocks.push(
    `Language: speak primarily in ${lp.primary}` +
      (lp.occasional.length ? `, occasionally using ${lp.occasional.join('/')}` : '') +
      `. Register: ${lp.register}.`,
  );

  if (ctx.userProfile) {
    const p = ctx.userProfile;
    const parts = [
      p.role && `role: ${p.role}`,
      p.goal && `learning goal: ${p.goal}`,
      p.interests?.length && `interests: ${p.interests.join(', ')}`,
    ].filter(Boolean);
    if (parts.length) blocks.push(`About the person you're talking to — ${parts.join('; ')}.`);
  }

  if (ctx.facts?.length) blocks.push(`What you remember about them:\n- ${ctx.facts.join('\n- ')}`);

  if (ctx.recentSummary) blocks.push(`Recent conversation summary: ${ctx.recentSummary}`);

  if (ctx.relationshipStage) blocks.push(RELATIONSHIP_TONE[ctx.relationshipStage]);

  if (ctx.userLanguage === 'zh-CN') {
    blocks.push(
      'The learner is a native Chinese speaker practising English. Stay in character even when they make mistakes; corrections are handled separately.',
    );
  }

  if (ctx.mode === 'scenario' && ctx.scenario) {
    blocks.push(`ROLEPLAY: you are now playing "${ctx.scenario.roleName}". ${ctx.scenario.instructions}`);
    blocks.push(JSON_CONTRACT);
  }

  return blocks.join('\n\n');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- tests/unit/prompt-builder.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/prompt/types.ts src/server/prompt/builder.ts tests/unit/prompt-builder.test.ts
git commit -m "feat: add PromptBuilder (Module 2) with bilingual + scenario modes"
```

---

## Task 9: Health route + full-suite gate

**Files:**
- Create: `src/app/api/system/health/route.ts`

- [ ] **Step 1: Create `src/app/api/system/health/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { OllamaClient } from '@/server/llm/ollama';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  const ollama = await new OllamaClient().health();
  return NextResponse.json({ server: 'up', uptimeMs: Date.now() - started, ollama });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Run the full unit + integration suite**

Run: `npm run test`
Expected: ALL green — `sanity`, `seed-data`, `auth`, `ollama-health`, `ollama-chat`, `ollama-chatjson`, `ollama-embed`, `prompt-builder`, plus integration `schema`.

- [ ] **Step 4: Manual smoke (optional, needs `npm run dev`)**

Run: `npm run dev`, then in another shell: `curl http://localhost:3000/api/system/health`
Expected JSON shape:
```json
{ "server": "up", "uptimeMs": 1, "ollama": { "reachable": false, "model": "qwen2.5:7b-instruct", "modelInstalled": false, "latencyMs": 3 } }
```
(`reachable: false` is fine if Ollama isn't running — not a W1 blocker.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/system/health/route.ts
git commit -m "feat: add GET /api/system/health"
```

---

## W1 Acceptance

- [ ] `npm run test` — all unit + integration tests green.
- [ ] `npm run typecheck` — clean.
- [ ] `npm run db:seed` — seeds 3 NPCs / 1 scenario / 6 achievements.
- [ ] `GET /api/system/health` returns the JSON shape above.

When all four are checked, W1 is done — proceed to the W2 plan (`…-w2-chat-sse.md`).

---

## Self-review notes (filled by plan author)

- **Spec coverage:** §四 auth primitives → Task 3; §七 M1 → Tasks 4–7; §七 M2 → Task 8; §八 schema → Task 1; seed (§八 models) → Task 2; `/api/system/health` (§五.9) → Task 9. (register/login *routes* are intentionally W2, per master plan.)
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `OllamaClient` methods (`health`/`chat`/`chatJson`/`embed`), `ChatMessage`, `HealthInfo`, `OllamaError`, `PromptContext`, `SESSION_COOKIE`, `requireUser` names are identical across tasks and tests.
