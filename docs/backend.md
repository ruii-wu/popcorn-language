# Popcorn Language · Backend 设计文档

> ⚠️ **Historical v1 design (superseded).** This is the original prototype-derived design doc.
> Several endpoints sketched here (`/api/session/init`, `/suggestions`, `/typing`) were never
> built, and the auth model evolved. The **source of truth** for what shipped is the v2 spec
> [`docs/superpowers/specs/2026-05-25-backend-roadmap-design.md`](superpowers/specs/2026-05-25-backend-roadmap-design.md)
> and the API surface table in the [README](../README.md). Kept for provenance.

> 基于当前 web 原型（`prototypes/web/src/*.jsx`）和项目背景（`docs/context.md`），列出让前端 UI 真正"工作起来"所需的完整后端：核心 API 接口、后端功能模块、数据库 schema。
>
> **范围**：覆盖 MVP P0 全部 UI（Onboarding 3 步 → Main Chat → Embedded Scenario A/B/C/D → Journey Dashboard）。P1 拓展（Cross-NPC Memory Network、AI-Generated Achievements 等）单独标注。
>
> **技术栈基线**（来自 context.md）：Next.js 14 (App Router) + TypeScript + Prisma + SQLite + Ollama 本地 HTTP API（流式 SSE）+ Qwen 2.5 7B-Instruct。

---

## 一、UI → Backend 映射总览

下面这张表把每个 UI 交互逐一映射到需要后端做的事，作为后续 API/Schema 设计的依据。

| UI 位置 | 用户动作 | 后端必须发生的事 |
|---|---|---|
| Onboarding · Welcome | 进入页 | （可选）创建匿名 user / device session |
| Onboarding · Profile | 提交 role/goal/interests | 落库 user profile；注入 NPC system prompt |
| Onboarding · Meet Lily | "Start chatting" | 初始化 user ↔ Lily relationship；插入 Lily 首条 preview 消息到 thread |
| Main App · 左侧 Conversations rail | 加载 | 拉取 user 所有 NPC、各 thread 的最近一条消息、关系等级、未读/sparkle 标记 |
| Main App · 左侧 streak strip | 加载 | 计算"7-day streak / 本周对话数" |
| Main App · 切换 NPC | 点击 NPC | 拉取该 thread 的消息历史（分页） |
| Main App · 聊天 header | 加载 | 当前 NPC 状态（status / 在线 / 关系等级） |
| Main App · 发送消息 | Send | 1) 落库 user msg；2) 触发 LLM 流式生成；3) 异步语法纠错；4) 检查是否到 scenario 触发阈值 |
| Main App · 输入建议 chips | 进入聊天 | 基于上下文生成 3-4 个 suggest chips（轻量 LLM 调用 or 规则） |
| Main App · "Lily noticed something" 纠错卡 | 自动出现 | grammar/style 检测（独立 LLM call 或合并到主响应） |
| Main App · 右侧 "What Lily knows about you" | 加载 | 召回该 NPC 关于 user 的事实记忆 |
| Main App · 右侧 "Memories from this chat" | 加载 | 拉取本 thread 关联的 AI memory |
| Scenario · State B · NPC 主动邀请卡 | 自动触发 | 判定逻辑（轮数 + 关系阈值 + 话题匹配）→ 生成 invitation 消息和 scenario draft |
| Scenario · State B · "Yeah let's do it" / "Maybe later" | 点击 | 接受 → 创建 scenario_session、切换 mode；拒绝 → 记录 decline、回归 casual |
| Scenario · State C · HUD（Impression / Stress / 对话进度） | 实时 | 每轮 LLM 返回结构化 JSON 状态 → 更新 session；预计轮数仅用于内部节奏控制 |
| Scenario · State C · 3 选项卡 | 自动生成 | 每轮结构化 NPC 输出同时生成 3 个与当前问题直接相关且不重复的选项（tone + 副标） |
| Scenario · State C · 用户选择 A/B/C | 点击 | 落库 user choice；推进 turn；NPC 下一轮响应（流式） |
| Scenario · State C · Pause | 点击 | 暂停 session（状态保留） |
| Scenario · State D · Summary 卡 | scenario 结束自动 | 生成 summary（Language/Pragmatics/Relationship 三栏 + 字母成绩） |
| Scenario · State D · 关系跃迁 | 自动 | 根据 scenario 成绩调整 relationship_value |
| Scenario · State D · 新 Memory 卡 | 自动 | LLM 提炼 memory entry，落库并关联 |
| Journey · 顶部 KPI | 加载 | 聚合查询（days / conversations / scenarios / memories） |
| Journey · Relationships 卡 | 加载 | 三个 NPC 的 relationship + 计数 + 最近 note |
| Journey · Scenarios 历史 | 加载 | 所有 scenario_session（含 declined / in-progress） |
| Journey · Memories grid | 加载 | 所有 AI memory entries（按 noticed_at 倒序） |
| Settings（rail 入口已存在，页面未画） | 加载/编辑 | 用户偏好、模型选择、纠错开关、清除数据 |

---

## 二、核心 API 接口列表

> 全部 REST 风格 + 必要的 SSE（流式响应）。路径前缀 `/api`，认证使用单用户本地 session（MVP 假定单设备单用户，无需复杂 auth）。

### 1. Session / Profile

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `POST` | `/api/session/init` | 首次启动创建匿名 user + device session | `{}` | `{ userId, sessionToken }` |
| `GET`  | `/api/me` | 当前 user 概况（用于 NavRail 头像、streak） | — | `{ user, streak: {days, weekCount}, totals }` |
| `GET`  | `/api/profile` | 拉取已保存的 onboarding 偏好 | — | `{ role, goal, interests[], language }` |
| `PUT`  | `/api/profile` | Onboarding step 2 提交 / Settings 修改 | `{ role, goal, interests[], language? }` | `{ ok, profile }` |
| `POST` | `/api/onboarding/complete` | Onboarding step 3 完成（初始化 Lily 关系 + 首条消息） | `{}` | `{ npc: 'lily', firstMessageId }` |

### 2. NPCs

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/npcs` | 全部 NPC（含 user-specific relationship state，用于左侧 rail） | — | `[{ id, name, avatar, status, relationship, stageValue, lastMessage, lastTime, hasSomething }, ...]` |
| `GET` | `/api/npcs/:id` | 单个 NPC 详情（右侧 persona panel） | — | `{ id, name, persona, languageProfile, relationship, knownFacts[], chatStats }` |

> NPC 本体（persona、system prompt 模板、language profile）是配置文件 / seed data，不暴露写接口。

### 3. Chat Threads & Messages

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET`  | `/api/threads/:npcId/messages` | 拉取消息历史（分页） | `?before=msgId&limit=50` | `{ messages[], hasMore }` |
| `POST` | `/api/threads/:npcId/messages` | 发送 user 消息（**SSE 响应**） | `{ text, lang? }` | SSE stream（见下文 §三 流式协议） |
| `POST` | `/api/threads/:npcId/messages/:msgId/correction` | 手动请求纠错（如果未自动生成） | — | `{ correction }` |
| `GET`  | `/api/threads/:npcId/suggestions` | 输入建议 chips（4 个） | — | `{ chips: string[] }` |
| `POST` | `/api/threads/:npcId/typing` | 上报 user 正在输入（用于 npc "saw you typing" 反应，**可选**） | — | `{ ok }` |
| `DELETE` | `/api/threads/:npcId` | 清空该 NPC 对话历史（Settings 用） | — | `{ ok }` |

### 4. Scenarios

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET`  | `/api/scenarios/catalog` | 全部可用 scenario 模板列表（debug / 未来 UI） | — | `[{ id, title, npcId, registerTags[], minStage }, ...]` |
| `GET`  | `/api/scenarios/sessions/:sessionId` | 单个 scenario session 详情 | — | `{ session, transcript[], state }` |
| `POST` | `/api/scenarios/sessions/:sessionId/accept` | 用户接受邀请（State B → C 过渡） | `{}` | `{ session, openingMessage }` |
| `POST` | `/api/scenarios/sessions/:sessionId/decline` | 用户拒绝邀请 | `{ reason? }` | `{ ok }` |
| `POST` | `/api/scenarios/sessions/:sessionId/choose` | 用户选择一个 choice（**SSE 响应**） | `{ choiceId }` | SSE stream（NPC 下一轮 + 更新后的 state） |
| `POST` | `/api/scenarios/sessions/:sessionId/freetype` | 用户切换"let me type freely"自由输入（**SSE 响应**） | `{ text }` | SSE stream |
| `POST` | `/api/scenarios/sessions/:sessionId/pause` | 暂停 | — | `{ ok }` |
| `POST` | `/api/scenarios/sessions/:sessionId/resume` | 恢复 | — | `{ session }` |
| `POST` | `/api/scenarios/sessions/:sessionId/abort` | 主动退出 scenario（不算失败） | — | `{ ok }` |
| `GET`  | `/api/scenarios/sessions` | 全部 scenario sessions（Journey "Scenarios" 区） | `?npcId=&status=` | `[{ id, scenarioTitle, npcId, status, grade, startedAt, ... }]` |

### 5. Memories（AI 生成的"用户人格观察"）

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET`  | `/api/memories` | 全部 memory（Journey 用） | `?npcId=&limit=` | `[{ id, title, body, noticedAt, sourceType, sourceRef, npcId? }, ...]` |
| `GET`  | `/api/memories/recent?npcId=:id` | 单个 NPC 的"What I know about you" / "Memories from this chat" | — | `[{ id, title, body }, ...]` |
| `DELETE` | `/api/memories/:id` | 用户删除某条 memory（隐私/纠错） | — | `{ ok }` |

> Memory 不开放 `POST`：全部由后台 worker 自动生成（聊天后台 / scenario 结束触发）。

### 6. Journey / 聚合统计

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET` | `/api/journey/summary` | 顶部 KPI（current streak / practice turns / scenarios / memories） | — | `{ days, practiceTurns, scenarios, memories }` |
| `GET` | `/api/journey/relationships` | 三个 NPC 的关系卡数据 | — | `[{ npcId, name, stage, stageValue, sub, note, last }, ...]` |
| `GET` | `/api/journey/streak` | streak strip 数据 | — | `{ days, weekCount, perDay[7] }` |

### 7. Achievements（P0 静态成就）

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET`  | `/api/achievements` | 全部成就（含已解锁/未解锁） | — | `[{ id, title, description, unlocked, unlockedAt? }, ...]` |
| （内部 worker） | — | 在 message 落库 / scenario 结束后跑规则引擎，写 user_achievement | — | — |

### 8. Settings / 系统

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| `GET`  | `/api/settings` | 当前设置 | — | `{ grammarCorrection, model, language, ... }` |
| `PUT`  | `/api/settings` | 更新 | `{ ... }` | `{ ok }` |
| `GET`  | `/api/system/health` | Ollama 是否可达、模型加载状态 | — | `{ ollama: 'up', model: 'qwen2.5:7b', latencyMs }` |
| `GET`  | `/api/system/models` | 可用本地模型 | — | `[{ name, sizeGB, loaded }]` |
| `POST` | `/api/system/reset` | 清空所有数据（debug / 用户主动重置） | `{ confirm: true }` | `{ ok }` |

---

## 三、流式响应协议（SSE）

`POST /api/threads/:npcId/messages` 与 `POST /api/scenarios/.../choose` 都使用 SSE，事件序列示例：

```
event: user_message_saved
data: { "messageId": "msg_123", "createdAt": "..." }

event: typing_start
data: { "npcId": "lily" }

event: token
data: { "delta": "morning" }

event: token
data: { "delta": "! " }

...

event: message_complete
data: { "messageId": "msg_124", "fullText": "...", "tokensUsed": 184 }

event: correction
data: { "targetMessageId": "msg_123", "correction": { "fixed": "...", "noteZh": "...", "tag": "..." } }

event: state_update     # scenario 模式才有
data: { "impression": 7, "stress": "Medium", "turnsLeft": 4 }

event: scenario_offer   # 普通聊天进入 scenario 邀请时
data: { "sessionId": "sess_42", "draft": { "title": "...", "detail": "...", "estMinutes": 8, "rationale": "..." } }

event: scenario_end     # State D 触发
data: { "summary": {...}, "memoryId": "mem_77", "relationshipChange": { "from": "friend", "to": "close" } }

event: done
data: {}
```

事件类型清单：
- `user_message_saved` — user msg 写入 DB
- `typing_start` / `typing_end` — 控制 typing dots
- `token` — LLM 流式 token
- `message_complete` — 完整 NPC 消息落库
- `correction` — 异步纠错结果（可在 message_complete 之后到达）
- `suggestions_update` — 输入框 chips 刷新
- `scenario_offer` — NPC 主动邀请（普通模式独有）
- `state_update` — scenario HUD 状态（scenario 模式独有）
- `choices` — 下一轮的 3 选项（scenario 模式独有）
- `scenario_end` — scenario 结束 + summary（scenario 模式独有）
- `error` — 任何错误（含 LLM JSON parse 失败等）
- `done` — 流结束

---

## 四、后端功能模块清单

按职责切成 7 个模块，对应 `src/server/services/`（建议布局）。

### Module 1 · LLM Client（Ollama 适配层）
- 封装 Ollama HTTP API（`/api/generate`、`/api/chat`，**流式**）
- 统一 `chat(prompt, opts)` → AsyncIterable<token>
- `chatJson(prompt, schema, opts)` → 强制 `format: "json"` + Zod 校验 + 失败重试（max 3）
- 模型温度 / top_p 预设（casual / scenario / json 三档）
- 超时与降级（Ollama 不可达时返回 stub 响应 + 报错给前端）
- **风险点**：context.md 已识别的"7B JSON 输出稳定性"——必须有 schema 校验 + 重试 + fallback 模板

### Module 2 · Persona & Prompt Builder
- 从 `npc_persona` 表 + `user_profile` 表 + `relationship` 表 + 召回的 `memory_facts` → 组装 system prompt
- 模板结构：`{base_persona}` + `{language_profile}` + `{user_facts_block}` + `{recent_summary}` + `{relationship_tone_hint}` + `{mode_specific_instructions}`
- 双语 prompt：根据 user.language（中→英 主 / 英→中 实验）切换
- Scenario 模式有独立 prompt 模板（含角色扮演说明 + JSON 输出契约）
- **输出**：纯 prompt 字符串，方便单测和缓存

### Module 3 · Memory Engine（context.md 标识"项目最关键工程模块"）

三层结构：
1. **Recent buffer**：最近 N=10 轮对话原文，每次请求拼入 prompt
2. **Summary**：超过 buffer 的对话由 LLM 周期性 summarize（每 20 轮触发一次），存入 `conversation_summary`
3. **Long-term facts**：从对话中提取的"用户事实"（住址、宠物、偏好），结构化存 `memory_fact`

子功能：
- `recall(npcId, userId, k)`：向量检索 + 时间衰减，给 prompt 拼接最相关 facts
- `summarize(threadId)`：异步 worker（每 N 轮触发）
- `extractFacts(messages)`：LLM 调用，结构化 JSON 输出（{subject, predicate, value, confidence}）
- `generateMemoryCard(threadId | sessionId)`：scenario 结束 / 周期触发，生成人格化 "Cat Person Diplomat" 类 memory
- **可对比策略**（论文章节素材）：summary-only / fact-only / hybrid 三种 recall 模式开关

### Module 4 · Scenario Orchestrator
- **Trigger judge**（决策 3 · B3 核心）：每条 user msg 后检查
  - 关系阈值（acquaintance/friend/close 与 scenario.minStage 匹配）
  - 对话轮数累计（自上次 scenario 起 ≥ N）
  - Topic match（LLM 轻量分类 or 关键词 + NPC 兴趣交集）
  - Cooldown（同一 NPC 短时间内不重复邀请）
  - → 满足则调用 `generateInvitation()`（LLM）→ 创建 `scenario_session (status: invited)` + 发送 `scenario_offer` event
- **State machine**（per scenario_session）：
  ```
  invited → accepted → active → (paused ⇄ active) → completed
        └→ declined
        └→ aborted
  ```
- **Per-turn loop**（active 状态）：
  1. 接收 user choice / freetype
  2. 调用 LLM（roleplay system prompt + 当前 state JSON + 历史）
  3. **强制 JSON 输出**：`{ npcReply, stateDelta: {impression, stress}, isFinalTurn, suggestedChoicesNext: [...] }`
  4. 更新 `scenario_session.state`、写 `scenario_turn`
  5. 推送 SSE `token` → `state_update` → `choices`
  6. `isFinalTurn=true` 且 NPC 已给出无新问题的自然收尾 → 触发 end flow；预计轮数是软目标，安全上限为预计轮数 + 3
- **End flow**：
  1. 调用 LLM 生成 summary（Language / Pragmatics / Relationship 三栏 + 字母成绩）
  2. 写入 `scenario_summary`
  3. 触发 Memory Engine 生成 memory card
  4. 调用 Relationship Engine 调整 stageValue
  5. 触发 Achievement Engine
  6. 推送 SSE `scenario_end`

### Module 5 · Relationship & Progression
- 关系档位：`acquaintance(1) → friend(2) → close(3)`
- 数值字段 `relationship_points`（隐藏，0-100），跨阈值时升档
- 规则：
  - 每条 user msg +1 point（cap per day）
  - scenario completed: +grade-based bonus（A+: +15, B: +8, C: +3, decline: 0, abort: 0）
  - 跨越阈值时写 `relationship_event(from, to, reason)`，供 UI "Friend → Close friend" 提示
- 反向：长期不互动衰减（P1，可不做）

### Module 6 · Grammar Correction
- 独立 LLM 调用（与主响应并行 or 串行后置）
- 输入：user msg + 前一句 NPC msg（上下文）
- 输出 JSON：`{ hasIssue: bool, fixed: string, noteZh: string, tag: 'Grammar·Tense' | 'Style·Word order' | ... }`
- 阈值：`hasIssue=false` 时不显示纠错卡（避免噪音）
- 落库 `message.correction` 字段（nullable JSON）
- 用户开关（settings.grammarCorrection）

### Module 7 · Achievement Engine（P0 静态）
- 5-6 个固定成就（context.md MVP P0）：
  - "First Chat" — 与任一 NPC 完成第一次对话
  - "Three Friends" — 解锁所有 3 个 NPC 的 friend+ 关系
  - "Scenario Survivor" — 完成第一个 scenario
  - "Polite Mode" — 在 scenario 中拿到 B 以上
  - "Bilingual" — 单次对话中包含中 + 英
  - "Streak Week" — 连续 7 天有对话
- 规则化触发，不依赖 LLM
- worker 在 `message_saved` / `scenario_end` 事件后跑规则

### （P1）Module 8 · Cross-NPC Memory Network
- `shared_fact` 表 + propagation rule（决策：某些"用户事实"在 NPC 间扩散）
- 例：用户告诉 Lily "我有只猫" → Emma 一周后会问"听 Lily 说你有只猫？"
- 论文素材角度

### （P1）Module 9 · AI-Generated Dynamic Achievements
- 周期性（每 N 次 scenario）跑 LLM，根据用户行为模式生成个性化成就标题
- 输出严格 JSON，落 `dynamic_achievement` 表

---

## 五、数据库 Schema（Prisma）

> 单用户本地 SQLite，所有外键都用 cuid()。下面是 Prisma schema 形式；如需 SQL DDL 可由 `prisma migrate` 自动生成。

```prisma
// ============================================================
// User & Profile
// ============================================================

model User {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now())
  displayName String   @default("You")
  language    String   @default("zh-CN")   // user 母语
  targetLang  String   @default("en-US")   // 目标语言
  cefrLevel   String?  // "A2" | "B1" | "B2"

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
}

model UserProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  role      String?  // Student / Software engineer / ...
  goal      String?  // work / travel / study / daily
  interests Json     // string[]
  updatedAt DateTime @updatedAt
}

model UserSettings {
  id                  String   @id @default(cuid())
  userId              String   @unique
  user                User     @relation(fields: [userId], references: [id])
  grammarCorrection   Boolean  @default(true)
  modelName           String   @default("qwen2.5:7b-instruct")
  uiLanguage          String   @default("zh-CN")
  voiceTTSEnabled     Boolean  @default(false)
  showAIRationale     Boolean  @default(true)  // 右侧 panel "Why Lily is suggesting"
  updatedAt           DateTime @updatedAt
}

// ============================================================
// NPCs (seed data, not user-editable)
// ============================================================

model Npc {
  id              String   @id            // 'lily' | 'chen' | 'emma'
  name            String
  avatarGlyph     String
  avatarBg        String
  avatarInk       String
  shortBio        String
  personaPrompt   String   // 系统级 persona prompt（base block）
  languageProfile Json     // { primary: 'en', occasional: ['zh'], register: 'casual' }
  topicInterests  Json     // ['coffee', 'cats', 'tech'] — 用于 scenario topic match
  scenarioRoles   Json     // [{id: 'hr_manager', name: 'Linda', ...}] — NPC 可扮演哪些 scenario 角色
  introMessage    String   // onboarding 后 Lily 发出的首条 preview

  relationships    Relationship[]
  threads          Thread[]
  scenarioOffers   ScenarioSession[]
}

// ============================================================
// Relationships
// ============================================================

model Relationship {
  id                 String   @id @default(cuid())
  userId             String
  npcId              String
  user               User     @relation(fields: [userId], references: [id])
  npc                Npc      @relation(fields: [npcId], references: [id])
  stage              String   @default("acquaintance")  // acquaintance | friend | close
  stageValue         Int      @default(1)               // 1 | 2 | 3
  relationshipPoints Int      @default(0)               // 隐藏分数 0-100
  conversationCount  Int      @default(0)
  scenarioCount      Int      @default(0)
  declineCount       Int      @default(0)
  lastInteractionAt  DateTime?
  createdAt          DateTime @default(now())

  events  RelationshipEvent[]

  @@unique([userId, npcId])
}

model RelationshipEvent {
  id             String   @id @default(cuid())
  relationshipId String
  relationship   Relationship @relation(fields: [relationshipId], references: [id])
  fromStage      String
  toStage        String
  reason         String   // "scenario_completed:Mock Interview" | "msg_count_threshold"
  createdAt      DateTime @default(now())
}

// ============================================================
// Threads & Messages
// ============================================================

model Thread {
  id        String   @id @default(cuid())
  userId    String
  npcId     String
  user      User     @relation(fields: [userId], references: [id])
  npc       Npc      @relation(fields: [npcId], references: [id])
  createdAt DateTime @default(now())
  lastMsgAt DateTime?

  messages         Message[]
  summaries        ConversationSummary[]
  scenarioSessions ScenarioSession[]

  @@unique([userId, npcId])
}

model Message {
  id          String   @id @default(cuid())
  threadId    String
  userId      String?  // null 表示 NPC 发的
  thread      Thread   @relation(fields: [threadId], references: [id])
  user        User?    @relation(fields: [userId], references: [id])
  role        String   // 'user' | 'npc' | 'npc-roleplay' | 'system' | 'invitation' | 'summary'
  text        String
  langDetect  String?  // 'en' | 'zh' | 'mixed'
  correction  Json?    // { fixed, noteZh, tag } — nullable
  meta        Json?    // { roleplayCharacter?: 'Linda', invitationSessionId?, summarySessionId? }
  tokensUsed  Int?
  modelName   String?
  createdAt   DateTime @default(now())

  // 关联到某个 scenario session（roleplay 消息）
  scenarioSessionId String?
  scenarioSession   ScenarioSession? @relation(fields: [scenarioSessionId], references: [id])
  scenarioTurn      ScenarioTurn?

  @@index([threadId, createdAt])
}

model ConversationSummary {
  id          String   @id @default(cuid())
  threadId    String
  thread      Thread   @relation(fields: [threadId], references: [id])
  fromMsgId   String   // 摘要的起始消息
  toMsgId     String
  summary     String   // LLM 输出的自然语言摘要
  createdAt   DateTime @default(now())

  @@index([threadId, createdAt])
}

// ============================================================
// Scenarios
// ============================================================

model ScenarioTemplate {
  id            String   @id            // 'mock_interview' | 'coffee_order_busy' | ...
  title         String
  titleZh       String?
  npcId         String   // 哪个 NPC 可以发起
  rolePlayedBy  String   // NPC 扮演的角色 id（如 'hr_manager'）
  minStage      String   @default("friend")  // 关系阈值
  estimatedMinutes Int   @default(8)
  estimatedTurns   Int   @default(6)
  registerTags  Json     // ['Formal register', 'Polite hedging']
  systemPrompt  String   // 该 scenario 的扮演 prompt（含 JSON output schema）
  topicKeywords Json     // ['interview','job','HR'] — 用于 trigger judge
  enabled       Boolean  @default(true)

  sessions ScenarioSession[]
}

model ScenarioSession {
  id           String   @id @default(cuid())
  userId       String
  npcId        String
  threadId     String   // 总归属于某条 chat thread
  templateId   String
  user         User     @relation(fields: [userId], references: [id])
  npc          Npc      @relation(fields: [npcId], references: [id])
  thread       Thread   @relation(fields: [threadId], references: [id])
  template     ScenarioTemplate @relation(fields: [templateId], references: [id])

  status       String   // invited | accepted | active | paused | completed | declined | aborted
  state        Json     // { impression, stress, turnsLeft: softPacingValue, turnIndex, completionPending? }
  invitedAt    DateTime @default(now())
  startedAt    DateTime?
  endedAt      DateTime?
  declineReason String?

  // 触发原因（B3 路径可解释性）
  triggerRationale Json?  // { topicMatch, turnCount, stage, snippetMsgIds: [...] }

  turns    ScenarioTurn[]
  messages Message[]
  summary  ScenarioSummary?
}

model ScenarioTurn {
  id                String   @id @default(cuid())
  sessionId         String
  session           ScenarioSession @relation(fields: [sessionId], references: [id])
  turnIndex         Int
  // user 这一轮做了什么
  userChoiceId      String?  // 如果选了卡片
  userChoiceTone    String?  // 'Diplomatic' | 'Confident' | 'Reflective'
  userFreeText      String?  // 如果"let me type freely"
  userMessageId     String?  @unique
  userMessage       Message? @relation(fields: [userMessageId], references: [id])
  // NPC 这一轮的回应
  npcMessageId      String?
  // 状态变化
  stateBefore       Json
  stateAfter        Json
  // 下一轮预生成的 3 个 choices
  nextChoices       Json?    // [{ id, text, tone, desc, predictedImpact }]
  createdAt         DateTime @default(now())

  @@unique([sessionId, turnIndex])
}

model ScenarioSummary {
  id             String   @id @default(cuid())
  sessionId      String   @unique
  session        ScenarioSession @relation(fields: [sessionId], references: [id])
  grade          String   // "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "—"
  languageNote   String   // "You used polite hedging well. Watch the slight overuse of 'I think'."
  pragmaticsNote String
  relationshipNote String
  transcriptUrl  String?
  createdAt      DateTime @default(now())
}

// ============================================================
// Memory (AI-generated)
// ============================================================

model Memory {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  title       String   // "Polite Disagree-er"
  body        String   // LLM 提炼的描述
  npcId       String?  // null = cross-NPC observation
  sourceType  String   // 'scenario' | 'chat_pattern' | 'manual'
  sourceRef   String?  // scenario_session_id 或 thread_id
  noticedAt   DateTime @default(now())
  dismissedAt DateTime?  // user 可隐藏
  meta        Json?    // { confidence, supportingMsgIds: [...] }

  @@index([userId, noticedAt])
}

model MemoryFact {
  // 结构化用户事实：{ subject: user, predicate: 'has_pet', value: 'cat' }
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  subject    String   @default("user")
  predicate  String   // 'lives_near' | 'orders' | 'studies_for' | 'has_pet' | 'works_as' | ...
  value      String
  confidence Float    @default(0.7)
  sourceMsgId String?
  knownToNpcs Json    @default("[]") // string[] — 哪些 NPC "知道" 这条（P0 全部知道；P1 propagation）
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([userId, predicate])
}

// ============================================================
// Achievements
// ============================================================

model AchievementDef {
  id          String   @id        // 'first_chat' | 'three_friends' | ...
  title       String
  description String
  icon        String?
  rule        String   // 'first_chat' | 'scenario_grade_b_plus' | ... — 规则引擎 dispatch key
  ruleConfig  Json?    // 规则参数
  isDynamic   Boolean  @default(false)
  enabled     Boolean  @default(true)
}

model UserAchievement {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  achievementId String
  unlockedAt    DateTime @default(now())
  context       Json?    // { triggerEventId, ... }

  @@unique([userId, achievementId])
}

// ============================================================
// Activity / Streak / Events
// ============================================================

model ActivityEvent {
  // 通用事件流，用于 streak 计算 / achievement 触发 / 调试
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String   // 'message_sent' | 'scenario_accepted' | 'scenario_completed' | 'relationship_up' | ...
  payload   Json
  createdAt DateTime @default(now())

  @@index([userId, type, createdAt])
}
```

---

## 六、关键工作流图（按 UI 状态）

### 工作流 A：用户发送一条普通聊天消息

```
[POST /threads/:npcId/messages]
  ↓
1. Persist user Message (role='user', langDetect)
  ↓
2. SSE: user_message_saved
  ↓
3. 并行启动：
   ├─ Grammar Correction LLM call  (async, settle later → SSE: correction)
   └─ Main Reply Flow:
        a. Memory.recall(npcId, userId)
        b. PromptBuilder.build(npc, user, facts, summary, recentBuffer)
        c. LLMClient.chatStream(prompt) → token events
        d. On stream end → persist NPC Message
        e. Update Relationship.lastInteractionAt, conversationCount(+1)
        f. ActivityEvent('message_sent') → AchievementEngine.tick()
        g. Memory worker：若到 N 轮 → 触发 summarize；若新 fact → 写 MemoryFact
        h. Scenario.triggerJudge(threadId)
            if match → 生成 invitation → SSE: scenario_offer
  ↓
4. SSE: done
```

### 工作流 B：Scenario 触发到结束

```
trigger judge HIT
  ↓
1. Create ScenarioSession (status='invited', triggerRationale)
  ↓
2. LLM generate invitation text → persist Message (role='invitation')
  ↓
3. SSE: scenario_offer

[user clicks "Yeah let's do it"]
  ↓
[POST /scenarios/sessions/:id/accept]
  ↓
4. Update session.status='accepted' → 'active'
5. Prepare scenario system prompt (template + state init)
6. First NPC roleplay message via LLM (JSON-formatted with state) 
   → persist Message (role='npc-roleplay', scenarioSessionId)
   → persist ScenarioTurn (turnIndex=0)
7. Read next-turn choices embedded in the same structured LLM output; filter current and cross-turn duplicates
8. SSE: state_update + choices

[loop: user picks choice]
[POST /scenarios/sessions/:id/choose { choiceId }]
  ↓
9. Persist user "choice" as Message (role='user', meta.choiceId/tone)
10. LLM JSON chat: { npcReply, stateDelta, isFinalTurn, nextChoices }
11. Persist NPC Message + ScenarioTurn(stateBefore/stateAfter/nextChoices)
12. SSE: token → message_complete → state_update → choices

[when isFinalTurn=true after a natural closing, or at the estimated-turns + 3 safety limit]
  ↓
13. LLM generate summary JSON (grade + 3 notes)
14. Persist ScenarioSummary + Message (role='summary')
15. Memory.generateMemoryCard(sessionId)
16. Relationship.applyScenarioOutcome(grade) → maybe stage up → RelationshipEvent
17. AchievementEngine.tick()
18. session.status='completed', endedAt=now
19. SSE: scenario_end
```

### 工作流 C：Journey Dashboard 加载

```
[GET /journey/summary]      → 聚合 Message/ScenarioSession/Memory 三表的 count
[GET /journey/relationships]→ Relationship + 最近 ActivityEvent 拼 note
[GET /scenarios/sessions]   → ScenarioSession.findMany (含 status='in-progress' / 'declined')
[GET /memories]             → Memory.findMany order by noticedAt desc
[GET /journey/streak]       → ActivityEvent (type='message_sent') group by date last 7d
```

---

## 七、与 UI 对照的"还未画但需要的"页面/状态

UI 已经覆盖了 P0 的主路径，但以下后端字段在 UI 上**还没有承载**——若不补 UI，可先后端落库等后续：

1. **Settings 页**（Conversations rail 有入口按钮但未实现）
   - grammarCorrection toggle
   - model 选择下拉
   - 清除数据 / reset
   - System health 状态
2. **Achievements grid**（Journey 上没有，但 P0 列入 MVP）
   - 5-6 个静态成就的解锁状态展示
3. **Scenario transcript 详情页**（Summary 卡上有 "View transcript →" 按钮，但未实现）
   - 完整 roleplay 对话回放
4. **Memory 详情页**（Memory 卡可点击）
   - 显示 supportingMsgIds 跳转
5. **Onboarding step 0 / step 2 的"实际写入"**
   - Welcome → init session
   - Profile submit → /api/profile PUT
   - Meet Lily "Start chatting" → /api/onboarding/complete

---

## 八、风险与取舍提示（与 context.md 第六节呼应）

| 风险 | 后端层面对策 |
|---|---|
| 7B JSON 输出失败 | Module 1 强制 schema 校验 + 3 次重试 + 兜底模板（scenario state 用上一轮 +0 delta） |
| LLM 延迟过长 | 必须流式 SSE；correction 改异步、不阻塞主流；suggestions 用缓存 + 规则兜底 |
| 记忆召回质量 | Module 3 必须支持 3 种 recall 策略切换，作为论文消融实验素材 |
| Scenario 触发误判 | triggerJudge 输出 rationale，UI 右侧 "Why Lily is suggesting this" 直接读这个字段；用户拒绝时记录 declineReason 用于离线 tuning |
| 数据库迁移 | 单机 SQLite + Prisma migrate；保留 `/api/system/reset` 以便 demo 前重置 |

---

## 九、实施顺序建议（按 UI demo 价值密度）

1. **W1**：Schema + Prisma migrate + seed 3 NPC + Module 1 (Ollama client) + Module 2 (PromptBuilder)
2. **W2**：Threads/Messages CRUD + SSE 流式聊天（让 Main App 真正能聊起来）
3. **W3**：Memory Engine v1（recent buffer + fact extract） + 右侧 panel 接入
4. **W4**：Scenario Template 1 个（Mock Interview）全流程跑通（B3 trigger + active loop + summary + memory + relationship up）
5. **W5**：Grammar Correction + Achievements + Journey 聚合接口
6. **W6**：Onboarding 数据回流 + Settings + System health
7. **W7+**：第 2 个 scenario template；P1 之一（Cross-NPC Memory 或 Dynamic Achievements）

---

> 文档版本：v1 · 2026-05-22 · 基于 commit `daa6967` 的原型梳理。
> 后续若新增 UI 屏幕或修改交互，请同步本文件的 §一 / §二 / §五。
