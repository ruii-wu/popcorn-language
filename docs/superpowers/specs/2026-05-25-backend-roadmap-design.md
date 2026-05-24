# Popcorn Language · Backend Roadmap 设计文档 (v2)

> **状态**：已通过 brainstorming 评审（2026-05-25），待转 implementation plan。
> **目的**：在 bckend v1（已 revert）的基础上，结合当前 web 原型与 `docs/context.md`，给出让前端真正"工作起来"的完整后端：架构、功能列表、API schema、数据库 schema、记忆策略接口、关键工作流、逐周路线图。
> **基线来源**：bckend v1（commit `564965a`，已 revert）的 `docs/backend.md` —— 本文以其为起点打磨。
> **本轮 4 个关键决策**（brainstorming 确认）：
> 1. 以 v1 为基线打磨，不重造轮子
> 2. 全范围、P0 详细 + P1 架构占位
> 3. **多用户**，但 auth 极简：**明文密码、登录即一次 DB 查询、无加密、无 Auth.js**（仅本机 demo，auth 非项目重点）
> 4. **记忆模块做成可插拔策略接口** + 离线消融评估（论文核心）
>
> **技术栈基线**（来自 context.md）：Next.js 14 (App Router) + TypeScript + Prisma + SQLite + Ollama 本地 HTTP API（流式 SSE）+ Qwen 2.5 7B-Instruct；embedding 用 `nomic-embed-text`（本地）。

---

## 一、架构总览

```
Next.js 14 App Router (TS) ── 单进程, local-first
│
├─ Route handlers  /api/*           REST + SSE
├─ 极简 session auth                 明文密码查库 + httpOnly cookie(pop_uid=userId)
├─ Service layer   src/server/services/
│    Module 0  Auth & Session
│    Module 1  LLM Client (Ollama: stream · chatJson+retry · embed · health)
│    Module 2  Persona & Prompt Builder
│    Module 3  Memory Engine  ── MemoryStrategy 接口 + eval harness
│    Module 4  Scenario Orchestrator  (B3 trigger → JSON 状态机)
│    Module 5  Relationship & Progression
│    Module 6  Grammar Correction
│    Module 7  Achievement Engine (static P0)
├─ Async dispatcher                  进程内 fire-and-forget(纠错/摘要/memory/成就)
└─ Prisma + SQLite                   所有数据按 authenticated userId 隔离
```

**相对 v1 的两处结构性改动**：

1. **多用户隔离**：每张业务表与每条查询都按 authenticated `userId` 收敛（v1 假定单一隐式 "You"）。auth 本身极简（见 §四），但数据隔离是真实的。
2. **Memory 升级为策略可插拔子系统** + 离线评估 harness（论文消融实验的工程落点）。

---

## 二、UI → Backend 映射总览

（继承 v1，新增 auth 行）

| UI 位置 | 用户动作 | 后端必须发生的事 |
|---|---|---|
| Onboarding · Welcome / Sign in | 注册 / 登录 | `register` / `login`：建/查 user，set cookie |
| Onboarding · Profile | 提交 role/goal/interests | 落库 UserProfile；注入 NPC system prompt |
| Onboarding · Meet Lily | "Start chatting" | 初始化 user↔Lily Relationship + 插入 Lily 首条 intro 消息 |
| Main App · Conversations rail | 加载 | 拉取该 user 全部 NPC + 各 thread 最近一条 + 关系等级 + sparkle 标记 |
| Main App · streak strip | 加载 | 计算 7-day streak / 本周对话数 |
| Main App · 切换 NPC | 点击 | 拉该 thread 消息历史（分页） |
| Main App · 发送消息 | Send | ①落库 user msg ②触发 LLM 流式 ③异步纠错 ④检查 scenario 触发阈值 |
| Main App · 输入建议 chips | 进入聊天 | 上下文生成 3–4 个 chips（轻量 LLM 或规则） |
| Main App · "Lily noticed something" | 自动 | grammar/style 检测（异步 LLM call） |
| Main App · 右侧 "What X knows about you" | 加载 | **Memory.recall** 召回该 NPC 关于 user 的 facts |
| Main App · 右侧 "Memories from this chat" | 加载 | 拉本 thread 关联的 AI memory |
| Scenario · B · NPC 邀请卡 | 自动触发 | triggerJudge（轮数+关系阈值+话题匹配）→ 生成 invitation + scenario draft |
| Scenario · B · 接受/拒绝 | 点击 | 接受→建 session、切 mode；拒绝→记 decline、回 casual |
| Scenario · C · HUD | 实时 | 每轮 LLM 返回结构化 JSON 状态 → 更新 session |
| Scenario · C · 3 选项卡 | 自动生成 | 每轮 NPC 输出后生成 3 个 stylized 选项 |
| Scenario · C · 用户选择 | 点击 | 落库 choice；推进 turn；NPC 下一轮（流式） |
| Scenario · D · Summary 卡 | 结束自动 | 生成 summary（Language/Pragmatics/Relationship + 字母成绩） |
| Scenario · D · 关系跃迁 / 新 Memory | 自动 | 调整 relationship_value；LLM 提炼 memory card |
| Journey · KPI / Relationships / Scenarios / Memories | 加载 | 聚合查询（全部 `where userId`） |
| Settings | 加载/编辑 | 偏好、模型选择、**memoryStrategy**、纠错开关、清除数据 |

---

## 三、功能列表

### P0 — MVP，详细实现

1. **Auth & 账号** — register / login / logout / me；session cookie；按 user 数据隔离。
2. **Onboarding** — profile(role/goal/interests 3–5) 注入 prompt；Meet Lily → relationship init + intro 消息。
3. **持久 NPC 聊天** — 3 NPC（Lily / Mr. Chen / Emma），SSE 流式，双语（中→英为主）输入，suggest chips。
4. **内嵌语法纠错** — `{fixed, noteZh, tag}`，异步，可开关。
5. **Memory Engine** — 可插拔策略；fact 抽取；recall 拼 prompt；AI memory 卡；"What X knows about you"。
6. **Scenario 系统** — *Mock Interview* 做精（B3 NPC 主动触发 → 接受/拒绝 → 内嵌 active → JSON HUD 状态 → 选项卡 → summary+grade → memory + 关系跃迁）。Authored JSON 模板，LLM 在边界内驱动对话。
7. **关系与进度** — 三档（acquaintance/friend/close），隐藏分，升档事件。
8. **静态成就** — 5–6 个规则触发。
9. **Journey 仪表盘** — KPI 聚合、关系卡、scenario 历史、memories、7-day streak。
10. **Settings + 系统** — 纠错开关、模型选择、memoryStrategy 选择、reset、Ollama health。
11. **Memory 策略 eval harness** — 离线对比（recall@k / 延迟 / token），产出 Final Report 图表。

### P1 — 架构占位（接口/字段预留，P0 不实现）

- **Cross-NPC Memory Network** — `MemoryFact.knownToNpcs` 传播规则。
- **AI-Generated Dynamic Achievements** — `AchievementDef.isDynamic`，周期性 LLM 生成。
- **AI Reflective Companion** — 周期性 meta-summary。
- **Code-Switching as Gameplay** — 不同 NPC 对中英混用差异化反应。

---

## 四、Auth（极简）

> **设计取舍**：明文密码、无 bcrypt、无 Auth.js。登录 = `prisma.user.findFirst({ where: { username, password } })`。Session = httpOnly cookie `pop_uid=<userId>`。
> **安全声明**：明文密码不安全，**此设计仅限本机 localhost demo，绝不可对外部署**。auth 不是本项目的技术贡献点，故刻意简化以省工程预算。

```
POST /api/auth/register  { username, password }      → create user → set cookie pop_uid
POST /api/auth/login     { username, password }      → findFirst 比对 → set cookie
POST /api/auth/logout                                 → clear cookie
GET  /api/auth/me                                      → { user, streak, totals }
```

`requireUser(req)`：读 `pop_uid` cookie → 取 user；缺失/无效 → 401。所有业务端点首行调用它，并以返回的 `userId` 收敛全部查询。

---

## 五、核心 API 接口列表

> 全部 REST + 必要 SSE。路径前缀 `/api`。除 `auth/register`、`auth/login` 外，所有端点经 `requireUser()`，按 `userId` 隔离。

### 1. Auth（见 §四）

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| POST | `/api/auth/register` | 注册 | `{ username, password }` | `{ userId }` + Set-Cookie |
| POST | `/api/auth/login` | 登录（查库比对） | `{ username, password }` | `{ userId }` + Set-Cookie |
| POST | `/api/auth/logout` | 登出 | — | `{ ok }` |
| GET | `/api/auth/me` | 当前 user 概况 | — | `{ user, streak:{days,weekCount}, totals }` |

### 2. Profile / Onboarding

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| GET | `/api/profile` | 拉 onboarding 偏好 | — | `{ role, goal, interests[], language }` |
| PUT | `/api/profile` | onboarding step2 / settings 改 | `{ role, goal, interests[], language? }` | `{ ok, profile }` |
| POST | `/api/onboarding/complete` | step3 完成（init Lily 关系 + 首条消息） | `{}` | `{ npc:'lily', firstMessageId }` |

### 3. NPCs

| Method | Path | 用途 | Response |
|---|---|---|---|
| GET | `/api/npcs` | 全部 NPC + user-specific 关系（左侧 rail） | `[{ id,name,avatar,status,relationship,stageValue,lastMessage,lastTime,hasSomething }]` |
| GET | `/api/npcs/:id` | 单 NPC 详情（右侧 persona panel） | `{ id,name,persona,languageProfile,relationship,knownFacts[],chatStats }` |

> NPC 本体（persona / prompt 模板 / language profile）是 seed data，不暴露写接口。

### 4. Chat Threads & Messages

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| GET | `/api/threads/:npcId/messages` | 消息历史（分页） | `?before=msgId&limit=50` | `{ messages[], hasMore }` |
| POST | `/api/threads/:npcId/messages` | 发送 user 消息（**SSE**） | `{ text, lang? }` | SSE stream（§六） |
| POST | `/api/threads/:npcId/messages/:msgId/correction` | 手动请求纠错 | — | `{ correction }` |
| GET | `/api/threads/:npcId/suggestions` | 输入建议 chips | — | `{ chips: string[] }` |
| DELETE | `/api/threads/:npcId` | 清空该对话（settings） | — | `{ ok }` |

### 5. Scenarios

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| GET | `/api/scenarios/catalog` | 可用模板列表 | — | `[{ id,title,npcId,registerTags[],minStage }]` |
| GET | `/api/scenarios/sessions/:id` | 单 session 详情 | — | `{ session, transcript[], state }` |
| POST | `/api/scenarios/sessions/:id/accept` | 接受（B→C） | `{}` | `{ session, openingMessage }` |
| POST | `/api/scenarios/sessions/:id/decline` | 拒绝 | `{ reason? }` | `{ ok }` |
| POST | `/api/scenarios/sessions/:id/choose` | 选 choice（**SSE**） | `{ choiceId }` | SSE stream |
| POST | `/api/scenarios/sessions/:id/freetype` | 自由输入（**SSE**） | `{ text }` | SSE stream |
| POST | `/api/scenarios/sessions/:id/pause` | 暂停 | — | `{ ok }` |
| POST | `/api/scenarios/sessions/:id/resume` | 恢复 | — | `{ session }` |
| POST | `/api/scenarios/sessions/:id/abort` | 退出（不算失败） | — | `{ ok }` |
| GET | `/api/scenarios/sessions` | 全部 session（Journey） | `?npcId=&status=` | `[{ id,scenarioTitle,npcId,status,grade,startedAt }]` |

### 6. Memories

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| GET | `/api/memories` | 全部 memory（Journey） | `?npcId=&limit=` | `[{ id,title,body,noticedAt,sourceType,sourceRef,npcId? }]` |
| GET | `/api/memories/recent` | 单 NPC "What I know" / "from this chat" | `?npcId=` | `[{ id,title,body }]` |
| DELETE | `/api/memories/:id` | 删除某条（隐私/纠错） | — | `{ ok }` |

> Memory 无 `POST`：全部由 async dispatcher 自动生成。

### 7. Journey / 聚合

| Method | Path | Response |
|---|---|---|
| GET | `/api/journey/summary` | `{ days, conversations, scenarios, memories }` |
| GET | `/api/journey/relationships` | `[{ npcId,name,stage,stageValue,sub,note,last }]` |
| GET | `/api/journey/streak` | `{ days, weekCount, perDay[7] }` |

### 8. Achievements（P0 静态）

| Method | Path | Response |
|---|---|---|
| GET | `/api/achievements` | `[{ id,title,description,unlocked,unlockedAt? }]` |

> 内部 worker：在 message 落库 / scenario 结束后跑规则引擎，写 `UserAchievement`。

### 9. Settings / System

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| GET | `/api/settings` | 当前设置 | — | `{ grammarCorrection, modelName, uiLanguage, memoryStrategy, ... }` |
| PUT | `/api/settings` | 更新（含 memoryStrategy） | `{ ... }` | `{ ok }` |
| GET | `/api/system/health` | Ollama 可达 + 模型加载 | — | `{ server, ollama:{ reachable,model,modelLoaded }, latencyMs }` |
| GET | `/api/system/models` | 本地可用模型 | — | `[{ name, sizeGB, loaded }]` |
| POST | `/api/system/reset` | 清空当前 user 数据 | `{ confirm:true }` | `{ ok }` |

### 10.（研究）Memory Eval — dev only

| Method | Path | 用途 | Request | Response |
|---|---|---|---|---|
| POST | `/api/dev/memory-eval` | 在固定 transcript 集跑全策略消融 | `{ datasetId?, k? }` | `{ perStrategy:[{ name, recallAtK, latencyMs, tokenCost }] }` |

---

## 六、流式响应协议（SSE）

`POST /api/threads/:npcId/messages` 与 `POST /api/scenarios/.../choose|freetype` 用 SSE：

```
event: user_message_saved
data: { "messageId":"msg_123", "createdAt":"..." }

event: typing_start
data: { "npcId":"lily" }

event: token
data: { "delta":"morning" }

event: message_complete
data: { "messageId":"msg_124", "fullText":"...", "tokensUsed":184 }

event: correction
data: { "targetMessageId":"msg_123", "correction":{ "fixed":"...", "noteZh":"...", "tag":"..." } }

event: suggestions_update
data: { "chips":["Tell me more","Why?","什么意思?"] }

event: scenario_offer          # 普通聊天触发邀请
data: { "sessionId":"sess_42", "draft":{ "title":"...","detail":"...","estMinutes":8,"rationale":"..." } }

event: state_update            # scenario 模式
data: { "impression":7, "stress":"Medium", "turnsLeft":4 }

event: choices                 # scenario 模式：下一轮 3 选项
data: { "choices":[{ "id":"c1","text":"...","tone":"Diplomatic","desc":"..." }] }

event: scenario_end            # State D
data: { "summary":{...}, "memoryId":"mem_77", "relationshipChange":{ "from":"friend","to":"close" } }

event: error
data: { "code":"LLM_JSON_PARSE", "message":"..." }

event: done
data: {}
```

事件清单：`user_message_saved · typing_start/end · token · message_complete · correction · suggestions_update · scenario_offer · state_update · choices · scenario_end · error · done`。

---

## 七、后端功能模块清单

按职责切成 8 个模块，对应 `src/server/services/`。

### Module 0 · Auth & Session
- register / login（明文查库）/ logout / me。
- `requireUser(req)` 中间件：cookie → user；缺失 401。
- 所有业务查询以 `userId` 收敛。

### Module 1 · LLM Client（Ollama 适配层）
- 封装 Ollama HTTP API（`/api/chat`、`/api/generate`，**流式**）。
- `chat(messages, opts) → AsyncIterable<token>`。
- `chatJson(messages, zodSchema, opts)` → 强制 `format:"json"` + Zod 校验 + 失败重试（max 3）+ 兜底模板。
- **`embed(text) → number[]`**（`nomic-embed-text`）—— 供 Memory semantic 策略。
- 温度/top_p 预设：casual / scenario / json 三档。
- 超时与降级（Ollama 不可达→ stub + 报错给前端）。
- **风险点**：7B JSON 输出稳定性 —— schema 校验 + 重试 + fallback 必备。

### Module 2 · Persona & Prompt Builder
- 输入：`Npc.personaPrompt` + `UserProfile` + `Relationship` + `Memory.recall()` 结果 + `ConversationSummary` + recent buffer。
- 模板结构：`{base_persona}` + `{language_profile}` + `{user_facts_block}` + `{recent_summary}` + `{relationship_tone_hint}` + `{mode_specific_instructions}`。
- 双语：按 `user.language` 切换中→英(主) / 英→中(实验)。
- Scenario 模式独立模板（角色扮演说明 + JSON 输出契约）。
- 输出纯字符串，便于单测与缓存。

### Module 3 · Memory Engine（论文核心）
三层数据 + 策略可插拔召回：
1. **Recent buffer**：最近 N=10 轮原文，每次请求拼 prompt。
2. **Summary**：超出 buffer 的对话由 LLM 周期 summarize（每 ~20 轮），存 `ConversationSummary`（带 embedding）。
3. **Long-term facts**：从对话抽取的结构化事实，存 `MemoryFact`（带 embedding）。

**MemoryStrategy 接口**（见 §九）；子功能：
- `recall(query)`：按当前策略召回 top-k，拼 prompt。
- `summarize(threadId)`：async worker。
- `extractFacts(messages)`：LLM JSON 输出 `{subject,predicate,value,confidence}`。
- `generateMemoryCard(threadId|sessionId)`：scenario 结束/周期触发，生成 "Polite Disagree-er" 类人格化卡。
- **eval harness**：固定数据集上跑全策略，记 `MemoryRetrievalLog`，产出 recall@k / 延迟 / token 对比。

### Module 4 · Scenario Orchestrator
- **triggerJudge**（B3 核心，每条 user msg 后）：关系阈值匹配 `template.minStage` + 自上次 scenario 起累计轮数 ≥ N + topic match（NPC 兴趣∩关键词 / 轻量 LLM）+ cooldown → 命中则 `generateInvitation()` → 建 `ScenarioSession(status:invited, triggerRationale)` → SSE `scenario_offer`。
- **状态机**：`invited → accepted → active → (paused ⇄ active) → completed`；旁支 `declined` / `aborted`。
- **per-turn loop（active）**：收 choice/freetype → LLM（roleplay prompt + state JSON + 历史）→ **强制 JSON** `{ npcReply, stateDelta:{impression,stress}, isFinalTurn, suggestedChoicesNext[] }` → 更新 `state` + 写 `ScenarioTurn` → SSE `token`→`state_update`→`choices`；`isFinalTurn || turnsLeft<=0` → end flow。
- **end flow**：LLM 生成 summary（三栏+字母成绩）→ 写 `ScenarioSummary` → `generateMemoryCard` → `Relationship.applyScenarioOutcome(grade)` → `AchievementEngine.tick()` → `status:completed` → SSE `scenario_end`。

### Module 5 · Relationship & Progression
- 档位 `acquaintance(1) → friend(2) → close(3)`；隐藏 `relationshipPoints`(0–100) 跨阈值升档。
- 规则：每条 user msg +1（每日 cap）；scenario completed 按成绩加成（A+:+15 / B:+8 / C:+3 / decline·abort:0）；跨阈值写 `RelationshipEvent(from,to,reason)`，供 UI "Friend → Close friend" 提示。
- 反向衰减：P1，可不做。

### Module 6 · Grammar Correction
- 独立 LLM 调用（与主响应并行，异步后置）。
- 输入：user msg + 前一句 NPC msg（上下文）。
- 输出 JSON：`{ hasIssue, fixed, noteZh, tag }`，`hasIssue=false` 不显示。
- 落 `Message.correction`；受 `UserSettings.grammarCorrection` 开关。

### Module 7 · Achievement Engine（P0 静态）
- 5–6 固定成就：First Chat / Three Friends / Scenario Survivor / Polite Mode(scenario B+) / Bilingual(单对话含中+英) / Streak Week(连续 7 天)。
- 规则化触发，不依赖 LLM；worker 在 `message_saved` / `scenario_end` 后跑。

### Async Dispatcher（横切）
- 进程内 fire-and-forget：响应流结束后启动 { 纠错、summarize、factExtract、memory card、achievement tick }，结果落库；不阻塞主流。
- 单进程本地足够，无外部队列。

### （P1）Module 8 · Cross-NPC Memory Network
- `MemoryFact.knownToNpcs` 传播规则（用户告诉 Lily "我有猫" → Emma 一周后提及）。

### （P1）Module 9 · AI-Generated Dynamic Achievements
- 周期性 LLM 按行为生成个性化成就标题，严格 JSON，落 `AchievementDef(isDynamic=true)` + `UserAchievement`。

---

## 八、数据库 Schema（Prisma · SQLite）

> SQLite 限制：所有 JSON 字段以 `String` 存 JSON 文本（沿用 v1 实践）；embedding 存 `String`（JSON `number[]`，nomic-embed-text 768 维，约数 KB/行，JS 端解析做 cosine）。外键用 cuid()。

```prisma
generator client { provider = "prisma-client-js" }
datasource db    { provider = "sqlite"; url = env("DATABASE_URL") }

// ============================================================
// User & Profile & Settings
// ============================================================
model User {
  id          String   @id @default(cuid())
  username    String   @unique
  password    String                          // 明文 — 仅本机 demo（见 §四 安全声明）
  createdAt   DateTime @default(now())
  displayName String   @default("You")
  language    String   @default("zh-CN")       // 母语
  targetLang  String   @default("en-US")       // 目标语
  cefrLevel   String?                          // "A2" | "B1" | "B2"

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
  role      String?                            // Student / Software engineer / ...
  goal      String?                            // work | travel | study | daily
  interests String   @default("[]")            // JSON: string[]
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
  showAIRationale   Boolean  @default(true)     // 右侧 "Why Lily is suggesting"
  memoryStrategy    String   @default("hybrid") // recency | summary | semantic | hybrid
  updatedAt         DateTime @updatedAt
}

// ============================================================
// NPCs (seed data, not user-editable)
// ============================================================
model Npc {
  id              String  @id                  // 'lily' | 'chen' | 'emma'
  name            String
  avatarGlyph     String
  avatarBg        String
  avatarInk       String
  shortBio        String
  personaPrompt   String                       // base persona block
  languageProfile String  @default("{}")        // JSON: { primary, occasional[], register }
  topicInterests  String  @default("[]")        // JSON: string[] — scenario topic match
  scenarioRoles   String  @default("[]")        // JSON: [{ id, name, voice, defaultStress }]
  introMessage    String                       // onboarding 后首条 preview

  relationships     Relationship[]
  threads           Thread[]
  scenarioSessions  ScenarioSession[]
  scenarioTemplates ScenarioTemplate[]
}

// ============================================================
// Relationships
// ============================================================
model Relationship {
  id                 String    @id @default(cuid())
  userId             String
  npcId              String
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  npc                Npc       @relation(fields: [npcId], references: [id])
  stage              String    @default("acquaintance") // acquaintance | friend | close
  stageValue         Int       @default(1)               // 1 | 2 | 3
  relationshipPoints Int       @default(0)                // 隐藏 0-100
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
  reason         String                          // "scenario_completed:Mock Interview" | "msg_count_threshold"
  createdAt      DateTime     @default(now())
}

// ============================================================
// Threads & Messages
// ============================================================
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
  userId      String?                            // null = NPC 发的
  thread      Thread   @relation(fields: [threadId], references: [id], onDelete: Cascade)
  user        User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  role        String                             // user | npc | npc-roleplay | system | invitation | summary
  text        String
  langDetect  String?                            // en | zh | mixed
  correction  String?                            // JSON: { fixed, noteZh, tag }
  meta        String?                            // JSON: { roleplayCharacter?, invitationSessionId?, summarySessionId?, choiceId?, tone? }
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
  embedding String?                              // JSON: number[] — semantic 策略用
  createdAt DateTime @default(now())

  @@index([threadId, createdAt])
}

// ============================================================
// Scenarios
// ============================================================
model ScenarioTemplate {
  id               String  @id                  // 'mock_interview' | 'coffee_order_busy' | ...
  title            String
  titleZh          String?
  npcId            String
  npc              Npc     @relation(fields: [npcId], references: [id])
  rolePlayedBy     String                        // NPC 扮演的角色 id（'hr_manager'）
  minStage         String  @default("friend")    // 关系阈值
  estimatedMinutes Int     @default(8)
  estimatedTurns   Int     @default(6)
  registerTags     String  @default("[]")        // JSON: string[]
  systemPrompt     String                        // 扮演 prompt（含 JSON output schema）
  topicKeywords    String  @default("[]")        // JSON: string[] — triggerJudge 用
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

  status           String                        // invited | accepted | active | paused | completed | declined | aborted
  state            String   @default("{}")        // JSON: { impression, stress, turnsLeft, customFlags }
  invitedAt        DateTime @default(now())
  startedAt        DateTime?
  endedAt          DateTime?
  declineReason    String?
  triggerRationale String?                        // JSON: { topicMatch, turnCount, stage, snippetMsgIds[] }

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
  userChoiceTone String?                          // Diplomatic | Confident | Reflective
  userFreeText   String?
  userMessageId  String?  @unique
  userMessage    Message? @relation(fields: [userMessageId], references: [id])
  npcMessageId   String?
  stateBefore    String   @default("{}")          // JSON
  stateAfter     String   @default("{}")          // JSON
  nextChoices    String?                          // JSON: [{ id, text, tone, desc, predictedImpact }]
  createdAt      DateTime @default(now())

  @@unique([sessionId, turnIndex])
}

model ScenarioSummary {
  id               String   @id @default(cuid())
  sessionId        String   @unique
  session          ScenarioSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  grade            String                         // "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C" | "—"
  languageNote     String
  pragmaticsNote   String
  relationshipNote String
  transcriptUrl    String?
  createdAt        DateTime @default(now())
}

// ============================================================
// Memory (AI-generated)
// ============================================================
model Memory {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String                             // "Polite Disagree-er"
  body        String
  npcId       String?                            // null = cross-NPC observation
  sourceType  String                             // scenario | chat_pattern | manual
  sourceRef   String?                            // scenarioSessionId | threadId
  noticedAt   DateTime  @default(now())
  dismissedAt DateTime?
  meta        String?                            // JSON: { confidence, supportingMsgIds[] }

  @@index([userId, noticedAt])
}

model MemoryFact {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  subject     String   @default("user")
  predicate   String                             // lives_near | orders | studies_for | has_pet | works_as | ...
  value       String
  confidence  Float    @default(0.7)
  embedding   String?                            // JSON: number[] — semantic 策略用
  sourceMsgId String?
  knownToNpcs String   @default("[]")             // JSON: string[] — P0 全部；P1 propagation
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId, predicate])
}

// ============================================================
// Achievements
// ============================================================
model AchievementDef {
  id          String  @id                        // first_chat | three_friends | ...
  title       String
  description String
  icon        String?
  rule        String                             // 规则引擎 dispatch key
  ruleConfig  String?                            // JSON
  isDynamic   Boolean @default(false)            // P1
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
  context       String?                          // JSON: { triggerEventId }

  @@unique([userId, achievementId])
}

// ============================================================
// Activity / Streak / Research
// ============================================================
model ActivityEvent {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String                               // message_sent | scenario_accepted | scenario_completed | relationship_up | ...
  payload   String   @default("{}")              // JSON
  createdAt DateTime @default(now())

  @@index([userId, type, createdAt])
}

// 研究用：记录每次 recall，喂消融实验（dev only）
model MemoryRetrievalLog {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  strategy     String                            // recency | summary | semantic | hybrid
  queryText    String
  retrievedIds String   @default("[]")            // JSON: string[]
  k            Int
  latencyMs    Int
  tokenCost    Int?
  createdAt    DateTime @default(now())

  @@index([userId, strategy, createdAt])
}
```

---

## 九、Memory-Strategy 接口（研究核心）

```ts
// src/server/services/memory/types.ts
export interface RecallQuery  { userId: string; npcId?: string; queryText: string; k: number }
export interface RecalledItem { id: string; kind: 'fact' | 'summary'; text: string; score: number }

export interface MemoryStrategy {
  readonly name: 'recency' | 'summary' | 'semantic' | 'hybrid';
  recall(q: RecallQuery): Promise<RecalledItem[]>;
}
```

| 策略 | 机制 | 论文中的角色 |
|---|---|---|
| `recency` | 按 `createdAt` 取最近 N 条 fact/summary | baseline（无理解） |
| `summary` | 最新 `ConversationSummary` + 全量 facts，不排序 | 压缩型 baseline |
| `semantic` | `embed(queryText)` → 对 fact/summary embedding 算 cosine → top-k | 语义召回 |
| `hybrid` | semantic 分 + 时间衰减加权融合 | 提出方法 |

- 运行时由 `UserSettings.memoryStrategy` 选择，PromptBuilder 调用 `strategy.recall()` 拼 prompt。
- **eval harness**（`/api/dev/memory-eval`）：固定 transcript + 标注"应召回事实"集合，对每个策略算 **recall@k / 延迟 / token 成本**，写 `MemoryRetrievalLog`，导出对比表 → Final Report 消融章节。
- 这是把 context.md "多种记忆策略对比作为论文章节" 落到工程的地方，也是本项目最高研究价值、最低 demo 价值的部分（路线图 W7，deadline 压缩时优先保护）。

---

## 十、关键工作流

### 工作流 A：普通聊天消息

```
[POST /threads/:npcId/messages]  (SSE)
  ↓ requireUser → userId
1. 落库 user Message (role='user', langDetect)
2. SSE: user_message_saved
3. 并行：
   ├─ Grammar Correction (async → SSE: correction)
   └─ 主回复：
        a. Memory.recall({userId,npcId,queryText,k})  ← 当前 strategy
        b. PromptBuilder.build(npc, profile, relationship, facts, summary, recentBuffer)
        c. LLMClient.chat(stream) → token events
        d. 流结束 → 落库 NPC Message
        e. Relationship.lastInteractionAt / conversationCount++
        f. ActivityEvent('message_sent') → AchievementEngine.tick()
        g. async: 到 N 轮→summarize；新 fact→extractFacts→MemoryFact(+embedding)
        h. Scenario.triggerJudge(threadId) → 命中则 SSE: scenario_offer
4. SSE: done
```

### 工作流 B：Scenario 触发到结束

```
triggerJudge HIT
1. ScenarioSession(status='invited', triggerRationale)
2. LLM generateInvitation → Message(role='invitation')
3. SSE: scenario_offer

[accept] → POST …/accept
4. status: accepted → active；scenario system prompt + state init
5. 首条 roleplay 消息（JSON+state）→ Message(role='npc-roleplay') + ScenarioTurn(0)
6. SSE: state_update + choices

[loop] POST …/choose { choiceId }   (SSE)
7. 落库 user choice Message(meta.choiceId/tone)
8. LLM chatJson: { npcReply, stateDelta, isFinalTurn, nextChoices }   (schema 校验+重试)
9. 落库 NPC Message + ScenarioTurn(stateBefore/After/nextChoices)
10. SSE: token → message_complete → state_update → choices

[isFinalTurn || turnsLeft<=0]
11. LLM summary JSON (grade + 3 notes) → ScenarioSummary + Message(role='summary')
12. Memory.generateMemoryCard(sessionId)
13. Relationship.applyScenarioOutcome(grade) → 可能升档 → RelationshipEvent
14. AchievementEngine.tick()
15. status='completed', endedAt=now
16. SSE: scenario_end
```

### 工作流 C：Journey Dashboard 加载

```
GET /journey/summary       → count(Message / ScenarioSession / Memory)  where userId
GET /journey/relationships → Relationship + 最近 ActivityEvent 拼 note
GET /scenarios/sessions    → ScenarioSession.findMany（含 in-progress / declined）
GET /memories              → Memory.findMany order by noticedAt desc
GET /journey/streak        → ActivityEvent(type='message_sent') group by date last 7d
```

---

## 十一、风险与对策（呼应 context.md 第六节）

| 风险 | 后端对策 |
|---|---|
| 7B JSON 输出失败 | Module 1 强制 schema 校验 + 3 次重试 + 兜底模板（scenario state 用上一轮 +0 delta） |
| LLM 延迟过长 | 必须流式 SSE；纠错/摘要/memory 全异步不阻塞；suggestions 缓存 + 规则兜底 |
| 记忆召回质量 | Module 3 支持 4 种策略切换 + eval harness 量化对比（消融实验） |
| Scenario 触发误判 | triggerJudge 输出 rationale，右侧 "Why Lily is suggesting" 直接读；decline 记 reason 供离线 tuning |
| 多用户数据串户 | 每端点 `requireUser` + 查询全部 `where userId`；集成测试覆盖隔离 |
| 明文密码 | 仅 localhost demo，绝不对外部署；README/Settings 明确声明 |
| 数据迁移 | SQLite + prisma migrate；`/api/system/reset` 便于 demo 前重置 |

---

## 十二、实施路线图（约 8–9 周，Phase-1 文献调研之后）

| Phase | Focus | "Done" |
|---|---|---|
| **W1** | Schema + prisma migrate + 极简 auth foundation + seed(3 NPC,1 scenario,6 成就) + Module 1(stream/json/embed/health) + Module 2(PromptBuilder) | `/api/system/health` green；JS 层测试通过 |
| **W2** | login/register + onboarding 回写 + Threads/Messages + **SSE 流式聊天** | Main App 真能和 Lily 聊 |
| **W3** | **Memory Engine** — MemoryStrategy 接口 + recency/summary/semantic；factExtract；recall 拼 prompt；右侧 panel 接入 | NPC 跨轮"记得"事实 |
| **W4** | **Scenario Orchestrator** — Mock Interview 全程（trigger→active JSON loop→HUD→choices→summary→payoff） | A→B→C→D 跑通 |
| **W5** | Grammar correction + Relationship/progression + Achievement engine | 纠错/升档/解锁触发 |
| **W6** | Journey 聚合 + Settings + system health + onboarding finalize | Journey 全活 |
| **W7** | **Memory 策略 eval harness** + 消融跑批 | 报告对比表/图 |
| **W8** | 第 2 个 scenario 模板 + 一个 P1 angle（Cross-NPC memory 或 dynamic achievements） | stretch demo 内容 |
| **W9** | buffer：加固、demo 准备、报告配图 | — |

> auth 前置在 W1–W2，因为每条查询都按 userId 收敛，后期补会牵动全局。
> W7 eval harness 研究价值最高、demo 价值最低 —— deadline 压缩时优先保护它，而非 W8 的第 2 个 scenario。

---

> 文档版本：v2 · 2026-05-25 · 基于 bckend v1（commit `564965a`）打磨，经 superpowers brainstorming 评审。
> 后续若新增 UI 屏幕或改交互，请同步 §二 / §五 / §八。
