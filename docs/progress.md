# Popcorn Language · 项目进度档案

> 用于新 session 快速同步。读这一份 + `docs/context.md` + `docs/backend.md` 即可无缝接续。
> **最后更新**：2026-05-22

---

## 一、本次 session 在做什么（一句话）

把 UI 原型对应的后端**写成具体方案**（`docs/backend.md`）→ 启动 **W1 工程实现**（Next.js 骨架 + Prisma schema + 3 NPC seed + Ollama client + PromptBuilder）→ 写 **~75 个 vitest 测试** → **卡在 Node.js 未安装**，等用户手动装 Node 后继续跑 install / migrate / test。

---

## 二、按时间线发生了什么

1. **生成 `docs/backend.md`** — 基于 `prototypes/web/src/*.jsx` 和 `docs/context.md`，整理出：
   - UI → backend 映射表
   - 8 组 REST API + SSE 流式协议
   - 7 个后端功能模块（+ 2 个 P1）
   - 14 个 Prisma model 的完整 schema
   - 3 条关键工作流（普通聊天 / Scenario 全流程 / Journey 加载）
   - 7 周实施顺序建议
2. **执行 W1 第 1-5 步**（5 个 Task 全部 completed）：
   - Bootstrap Next.js 14 + TypeScript 工程骨架
   - 写 Prisma schema（SQLite，Json 字段全部改 String + 注释）
   - 写 seed（3 NPC + 1 scenario template + 6 achievements）
   - Module 1：Ollama client（流式 + chatJson schema retry + health）
   - Module 2：PromptBuilder（6 块结构 + 5 mode + 双语适配）
3. **写测试套件**（vitest）— 5 个测试文件 ~75 个 case，覆盖 W1 所有模块。所有测试**不需要 Ollama 与 SQLite**，纯 JS 层即可跑通。
4. **试图 npm install** — 在 bash 和 PowerShell 都失败。`node` / `npm` 不在 PATH，`C:\Program Files\nodejs` / `%USERPROFILE%` / 全盘搜索都没找到 `node.exe`。
5. **用户决定手动装 Node 后再继续**。

---

## 三、当前状态总览

| 模块 | 代码 | 安装 | 迁移/Seed | 测试 |
|---|---|---|---|---|
| Next.js 骨架 | ✅ | ❌ | — | — |
| Prisma schema | ✅ | ❌ | ❌ | ✅ 代码就绪 |
| Seed 数据 | ✅ | ❌ | ❌ | ✅ 代码就绪 |
| Ollama client | ✅ | ❌ | — | ✅ 代码就绪 |
| PromptBuilder | ✅ | ❌ | — | ✅ 代码就绪 |
| `/api/system/health` | ✅ | ❌ | — | — |

**唯一卡点**：Node.js 未安装。

---

## 四、装好 Node 后第一时间要跑的命令

```powershell
cd C:\Popcorn
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run test           # 应得 ~75 passing
npm run dev            # 浏览器开 http://localhost:3000/api/system/health
```

`/api/system/health` 的预期返回（Ollama 在跑的情况下）：
```json
{
  "server": "up",
  "uptimeMs": 1,
  "ollama": { "reachable": true, "model": "qwen2.5:7b-instruct", "modelLoaded": true, ... }
}
```

如果还没装 Ollama，`ollama.reachable: false` 也算正常 — 不阻塞 W1 验收。

---

## 五、本次 session 产出的所有文件

### 新建
```
docs/backend.md                           # 后端方案设计文档（主交付物 #1）
docs/progress.md                          # 本文件

package.json                              # Next 14 + Prisma + Zod + tsx + vitest
tsconfig.json
next.config.js
next-env.d.ts
vitest.config.ts
.env / .env.example                       # DATABASE_URL + Ollama 配置

app/layout.tsx                            # 最小 Next App Router shell
app/page.tsx
app/api/system/health/route.ts            # 唯一已实现的 API 端点

src/lib/db/client.ts                      # 单例 PrismaClient
src/lib/db/json.ts                        # SQLite 无原生 Json，提供 fromJson/toJson
src/lib/llm/ollama.ts                     # Module 1
src/lib/llm/prompt-builder.ts             # Module 2

prisma/schema.prisma                      # 14 个 model
prisma/seed.ts                            # 调用 upsert
prisma/seed-data.ts                       # Prisma-free 数据，便于测试

tests/_setup.ts
tests/unit/json.test.ts                   # 11 cases
tests/unit/prompt-builder.test.ts         # 28 cases
tests/unit/ollama.test.ts                 # 17 cases
tests/unit/seed-data.test.ts              # 14 cases
tests/integration/seed-prompt.test.ts     # 5 cases
```

### 修改
```
.gitignore                                # 加 node_modules / .next / .env / *.db 等
```

`prototypes/web/**`、`scripts/start.ps1`、`README.md`、`docs/context.md`、`docs/web-ui-summary.md` 都**未动**。

---

## 六、`docs/backend.md` 里建议的 W1-W7 进度

| 周 | 内容 | 状态 |
|---|---|---|
| **W1** | Schema + Prisma migrate + seed 3 NPC + Module 1 + Module 2 | **代码 100% · 等 Node 装好做 install + migrate + test 验收** |
| W2 | Threads/Messages CRUD + SSE 流式聊天（接通主聊天界面） | 未开始 |
| W3 | Memory Engine v1（recent buffer + fact extract）+ 右侧 panel | 未开始 |
| W4 | Scenario Template 1 个全流程跑通（B3 trigger + active loop + summary + memory + relationship up） | 未开始 |
| W5 | Grammar Correction + Achievements + Journey 聚合接口 | 未开始 |
| W6 | Onboarding 数据回流 + Settings + System health | 健康端点已先做 |
| W7+ | 第 2 个 scenario template；P1 之一（Cross-NPC Memory / Dynamic Achievements） | 未开始 |

---

## 七、关键技术决策与已规避的坑

1. **SQLite 不支持原生 `Json` 类型** — 所有 JSON 字段在 schema 里用 `String` + `// JSON: <Type>` 注释；运行时通过 `src/lib/db/json.ts` 的 `fromJson` / `toJson` 序列化。`String @default("[]")` / `@default("{}")` 给出合理空值。
2. **Prisma-free seed data 模块** — `prisma/seed-data.ts` 不 import 任何 Prisma 类型，让 test 可以在 `prisma generate` 还没跑过的环境里直接验证种子数据形状。`prisma/seed.ts` 负责 upsert，引用 `seed-data.ts`。
3. **`chatJson` 的 3 次重试 + fallback** — context.md §六识别"7B JSON 输出稳定性"为最高风险，直接在 Module 1 层实现：JSON parse / Zod schema 任一失败都触发重试，第 2 次起追加 "previous response was not valid JSON" nudge prompt；max retries 后若提供 `fallback` 则返回 fallback、否则抛 `OllamaError(SCHEMA)`。配上 `format: "json"` + ```json``` fence 剥离逻辑。
4. **Scenario JSON 输出契约** — 写进 `prisma/seed-data.ts` 的 `mock_interview.systemPrompt`，要求模型每轮返回 `{ npcReply, stateDelta, isFinalTurn, nextChoices[] }`。这套契约直接被 W4 的 Scenario Orchestrator 复用，**测试已断言四个字段都在 prompt 里**。
5. **NPC 双语策略分三档**（落在 `languageProfile.codeSwitchTolerance` 里）：
   - Lily: `high` — code-switch welcome
   - Chen: `native` + `preferredPattern: "bilingual-mirror"` — EN/ZH 双行镜像
   - Emma: `none-but-curious` — 不懂中文但好奇要求用户翻译
   PromptBuilder 的 `renderLanguageBlock` 针对每档输出不同 instruction，**测试覆盖三档**。
6. **Recent buffer 默认 cap 10 轮**（20 条消息），可通过 `recentBufferLimit` 改。`buildMessages` **保留最近的 N 条**，老消息靠 W3 的 Memory Engine 摘要进系统 prompt。
7. **不用 `useAuth` / `bcrypt` 等** — context.md 是本地单用户单设备 demo，schema 里只有一个 `User`，`/api/session/init` 之后所有路由用 session token，不做密码 / OAuth。

---

## 八、新 session 如果想继续，三条路径

### A. 跑 W1 验收（首选）
等 Node 装好 → 执行第四节命令 → 看 `npm run test` 是否 75 通过。如果某些 ollama 测试 fail，大概率是 `ReadableStream` / `AbortSignal.timeout` 在 Node 18- 下行为不同 — Node 20 LTS+ 应稳。

### B. 直接进 W2（流式聊天）
不依赖 W1 验收也能开始写 — `app/api/threads/[npcId]/messages/route.ts` 写 SSE 处理器，调用 `chatStream`，落库 Message。对应 `docs/backend.md` §二 第 3 节、§三 SSE 协议、§六 工作流 A。

### C. 调整 W1 现有代码
如果用户想改 NPC persona、scenario JSON 契约、prompt 模板，直接改 `prisma/seed-data.ts` / `src/lib/llm/prompt-builder.ts`，**测试会立即反馈是否破坏既有契约**（特别是 `seed-data.test.ts` 的 JSON 契约四字段断言、`prompt-builder.test.ts` 的 mode block 断言）。

---

## 九、给新 session 的开场提示词模板

> 读 `docs/context.md` 了解项目背景、`docs/backend.md` 了解后端方案、`docs/progress.md` 了解当前进度。当前在 W1 末尾，Node.js 已（/未）装好，{接 A | 接 B | 接 C}。
