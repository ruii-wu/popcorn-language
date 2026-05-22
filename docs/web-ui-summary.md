# Popcorn Language · Web UI 功能与用户旅程总结

> 基于 `docs/context.md` 项目背景 + 当前 web 原型代码（`prototypes/web/src/app.jsx` / `prototypes/web/src/scenario.jsx` / `prototypes/web/src/onboarding.jsx` / `prototypes/web/src/shared.jsx`）整理。所有数据均为前端 mock，未接 Ollama / 数据库。

---

## 一、总体结构

当前 web 原型由三个独立 HTML demo 页面 + 一份共享组件库组成，对应 context.md 第七节列出的三个 UI prompt：

| Demo 入口 | JSX 文件 | 对应 prompt | 主要承载内容 |
|---|---|---|---|
| `prototypes/web/main-app.html` | `prototypes/web/src/app.jsx` | Prompt 1 · 主应用 Shell | 日常聊天主界面（与 Lily 闲聊） |
| `prototypes/web/scenario.html` | `prototypes/web/src/scenario.jsx` | Prompt 2 · 嵌入式 Scenario | A/B/C/D 四态展示同一聊天的氛围流动 |
| `prototypes/web/onboarding-journey.html` | `prototypes/web/src/onboarding.jsx` | Prompt 3 · Onboarding + Journey | 3 步 onboarding + Your Journey 仪表盘 |
| `prototypes/web/design-canvas.html` | `prototypes/web/src/design-canvas.jsx` | — | 设计稿合集（已存在，不在本次摘要内） |

共享 `prototypes/web/src/shared.jsx` 暴露：`WebI`（图标集）、`NPCS_WEB`（Lily / Mr. Chen / Emma 三个 NPC mock）、`RELATIONSHIP_LABEL`、`WebAvatar`、`WebRelationshipDots`、`WebDock`、`WebNavRail`、`WebConversationsRail`。

三屏统一布局：**3-pane app shell** = 左侧 nav/Conversations rail + 中间 main pane + 右侧 context panel；右下角悬浮 `WebDock` 用于在三个 demo 间跳转。

---

## 二、已实现的核心功能

### 1. NPC 系统（mock 数据层）

三个 persona 写死在 `prototypes/web/src/shared.jsx`：

- **Lily** — Brooklyn 咖啡师 ☕，Friend 关系（2/3 点），"Usually replies quickly"，头像泡泡有 sparkle 提示有新消息
- **Mr. Chen** — 双语前辈 陈，Acquaintance 关系（1/3 点），消息含中英双语预览
- **Emma** — UK 大学生 E，Close friend 关系（3/3 点），活泼语气

关系等级以三档点状指示器（`WebRelationshipDots`）+ 标签呈现：Acquaintance / Friend / Close friend。

### 2. 主聊天界面（`prototypes/web/src/app.jsx`）

完整渲染了与 Lily 的一段 mock 对话（`LILY_THREAD_WEB`），覆盖：

- **3-pane 布局**：左 Conversations rail（搜索框 + 三个 NPC 列表 + Journey/Settings 快捷入口）、中 Chat、右 Persona Panel
- **Chat Header**：头像 + 姓名 + `AI · persona` 徽标 + 在线绿点 + 当前关系等级显示
- **消息气泡**：双向气泡（user 暖色 / NPC 灰白边框），day divider，typing indicator（"Lily is typing…"）
- **内嵌纠错卡** `CorrectionCard`：点击 "Lily noticed something" 展开，珊瑚色卡片，含修正句、中文语法解释（noteZh）、Grammar/Style tag
- **Composer**：建议短语 chips（"Tell me more" / "Why?" / "什么意思?" / "Recommend me one"）+ 多行输入框 + Send 按钮；脚注显示 "Grammar correction · ON" 与 "local model"
- **右侧 Persona Panel**：大头像 + persona 描述 + 关系概览（"chatted 8 times over 3 weeks"）+ "What Lily knows about you"（GRE / 猫 / 燕麦奶不加糖 / 住在 Murray's 附近）+ AI 生成的 Memory 卡（"Coffee Order Expert"）+ 使用语种标记（EN · 偶有中文）

### 3. 嵌入式 Scenario 系统（`prototypes/web/src/scenario.jsx`）

context.md 决策 3+4 的核心交互——**"NPC 主动引导 + 同界面氛围切换"**——以 4 个可切换 state 演示：

| State | 标签 | 视觉变化 | 关键 UI |
|---|---|---|---|
| **A · Casual** | 普通闲聊 | 中性暖色背景 | 用户提到明天有英文面试、紧张 |
| **B · Invitation** | NPC 发出 scenario 邀请 | 同界面，仅气泡后追加邀请卡 | `InvitationCard`（珊瑚色描边）+ "Yeah, let's do it" / "Maybe later" 按钮；副标 "Lily is suggesting · 一起练习"，并标注 ~8 min / roleplay |
| **C · Active** | Scenario 进行中 | "灯光变暗"暖色背景切换；header 显示 "Lily as Linda · Roleplay · HR Manager"；新增 `ScenarioHUD`（Impression 6/10 进度条 + Stress · Medium 指示） | 输入区从文本框换成 `ChoiceComposer`（3 张选项卡 A/B/C：Diplomatic / Confident / Reflective），每张写明语气与策略副标 |
| **D · Aftermath** | Scenario 结束回到 casual | 背景恢复，但聊天历史中永久保留 summary 卡 | `ScenarioSummaryCard`：成绩 B+ / Language / Pragmatics / Relationship 三栏点评 + "saved to journey" 标签 + transcript 链接 |

右侧 panel 每个 state 都有专用版本：
- **A**：Lily 的对话洞察（紧张 / 早餐没吃 / 时间习惯）+ 话题 chips
- **B**：解释 "Why Lily is suggesting this"（提及面试、persona 含 HR 经验、关系达到 Friend），以及 "If you accept" 的规则提示（6 轮 / 8 分钟 / 随时可暂停）
- **C**：Linda 视角内心独白 + 测试维度（沉稳 / 自我评估 / 礼貌缓和）+ 实时状态 + 三个选项的预期影响
- **D**：变化总结（关系 Friend → Close friend、+1 scenario、+1 memory），新生成 memory 卡 "Polite Disagree-er"，以及推荐的下一个 scenario "Salary Negotiation"

### 4. Onboarding 流程（`prototypes/web/src/onboarding.jsx`，3 步）

全屏式（非 app shell），顶部蓝绿色径向渐变 ambient wash，步骤指示点。

- **Step 0 · Welcome**：大字标语 "Practice English the way you'd practice life — with friends."；右侧 `PreviewStack` 展示 Lily / Mr. Chen / Emma 三张卡片堆叠（Lily 含 sparkle + 邀请按钮预览）；底部 pill 标注 `Local-first · qwen2.5:7b` `EN ← 中文` `CEFR A2 – B2` `macOS · Windows · Linux`
- **Step 1 · Profile**：三个问题——身份（Student / Software engineer / …）、学习目的（Work / Travel / Study abroad / Daily life，单选）、兴趣（10 个 tag 中选 3-5 个，含 Coffee / Cats / Tech 等）；附 AI 解释说明 NPC 将基于这些 personalize（"选 Cats，Emma 一周内就会问你要猫图"）
- **Step 2 · Meet Lily**：大头像 + 在线徽章 + persona 介绍（Brooklyn / 24 / 咖啡师）+ 4 个 trait pill + AI 提醒（"她会基于话题主动邀请 scenario，你可拒绝"）+ 首条 preview message；按钮 "Start chatting" 进入主应用

### 5. Your Journey 仪表盘（`prototypes/web/src/onboarding.jsx` · `JourneyDashboard`）

宽屏 dashboard 形态，使用左侧 `WebNavRail`（含 7-day streak strip + Chats/Journey/Settings 链接 + 用户名 footer）。

- **大字摘要**：`17 days, 3 friendships.` + 4 个 StatBox（days / conversations / scenarios / memories）
- **Relationships 区**：三张卡（Lily / Mr. Chen / Emma），含头像、关系等级、对话/scenario 计数、最近一次互动 note（如 "Invited you to Mock Interview yesterday"）
- **Scenarios 区**：四个 mock 记录（Mock Interview B+、Coffee Order A−、Apartment Dispute declined、Late to a meeting in-progress），每张带状态徽标、register tag chips、字母成绩
- **Memories 区**（紫色 AI 强调）：四张 AI 观察卡（Cat Person Diplomat / Coffee Order Expert / Polite Disagree-er / Tense-Switcher），每张含标题 + 行为模式描述 + "noticed today/Tuesday" 时间戳
- **页脚**："memories generated by qwen2.5:7b · local · all observations on this device"，呼应 local-first 主张

---

## 三、当前 UI 体现的用户旅程

按 onboarding → 日常 → scenario 触发 → 回流四阶段：

### Stage 0 · 安装与启动
用户初次打开 app，落地 onboarding 渐变页。看到产品定位（与"朋友"练习 vs flashcard）、本地模型承诺、双语支持范围。

### Stage 1 · Onboarding · 3 步
1. **Welcome** 阅读概念，看到三个 NPC 卡片预览，先建立"和具体人物对话"的预期
2. **Profile** 填写身份/目的/兴趣，UI 显式告知这些数据会注入 NPC 行为（建立"你的输入会被记住"的信任锚点）
3. **Meet Lily** 认识第一个朋友 + 看到首条 message 预览 + 被预告 scenario 触发机制（一致呼应决策 3 的 B3 路径）

完成后进入主聊天，初始默认对话对象为 Lily。

### Stage 2 · 日常社交聊天
用户在主应用 shell 内：
- 在左侧 rail 切换 NPC（Lily / Mr. Chen / Emma）
- 与 NPC 自由聊天，输入中英混合均可
- 出错时收到 `CorrectionCard` 内嵌反馈，含中文语法解释（context.md 中"中→英为主"的语向选择落地点）
- 右侧 panel 持续展示 NPC "记得"的关于用户的事，建立持续记忆的可见感

### Stage 3 · Scenario 由 NPC 主动引出（决策 3 · B3 路径的可视化）
当用户在对话中透露足够 context（如"明天有面试 / 紧张"），NPC 基于 persona 在合适时机抛出 `InvitationCard`：
- **不是系统弹窗**：邀请就是 NPC 的一条消息，嵌在聊天流中
- **可拒绝**："Maybe later" 选项保留用户主权
- 接受后**同一界面氛围渐变**——背景升温、header 标签变 "as Linda · Roleplay"、顶部出现 HUD、输入区从自由文本变为 3 选项卡片

### Stage 4 · Scenario 进行中
- 角色暂时切换为 NPC 扮演的另一角色（Lily → Linda）
- 用户通过 ChoiceComposer 选答案（每选项标注 tone 与策略副标，含教学意味）
- HUD 实时显示 Impression 和 Stress
- 右侧 panel 提供 meta 视角（这个角色在测什么 + 各选项预期效果）
- 可随时 Pause / Exit，关系不受影响

### Stage 5 · Scenario 结束（Aftermath）
- 系统消息 "Mock interview ended · 8 minutes · 6 exchanges"
- `ScenarioSummaryCard` 嵌入聊天历史作为永久记忆（Language / Pragmatics / Relationship 三栏）
- NPC 自然回到 casual 语气（"phew you did SO well i'm proud of you 🥹"）
- 关系等级跃迁（Friend → Close friend），右侧 panel 显示变化
- 生成新的 AI Memory 卡，沉淀到 Journey

### Stage 6 · 回顾自己的旅程
用户在 Journey dashboard 看到：
- 时间维度的累计指标
- 三个 NPC 的关系卡（哪个最熟、最近聊了什么、谁邀请过 scenario）
- Scenarios 历史（成绩、状态、涉及的 register）
- AI 生成的人格化 Memory（被 LLM 注意到的语言行为模式）

形成"日常聊天 → scenario 事件 → 关系成长 + AI 观察沉淀"的闭环。

---

## 四、UI 已落地 vs context.md 中尚未实现

### ✅ UI 上已呈现（mock 程度）
- 3 NPC 角色、persona、双语聊天框架
- 关系三档（陌生 / 朋友 / 密友）的视觉表达
- 嵌入式 scenario 模式 + NPC 主动邀请触发 + 氛围切换
- Scenario summary 作为永久记忆
- AI 生成的"Memory"卡片展示
- 内嵌纠错（中文解释 + tag 分类）
- Local-first 强调（"qwen2.5:7b · local"标签反复出现）

### ❌ UI 仍是静态 mock，未接后端 / 模型
- 真实 Ollama 流式响应
- 摘要式记忆模块（SQLite 持久化）
- JSON 状态机（HUD 数字目前是硬编码）
- 静态成就系统（5-6 个成就，目前 Journey 只有 Memory 区域，没看到成就 grid）
- NPC 之间的关系数值真实变动
- 多语种内容动态切换（中→英 / 英→中）

### 🟡 部分体现
- "What Lily knows about you" 是静态列表，但概念已落地
- Scenario 触发条件（"NPC 对话轮数 + 关系阈值"）在 UI 上用副标说明，但无真实门控逻辑
- 输入建议 chips 与选项卡的 tone 标注呼应了"AI as engagement driver"，但尚未真正由 LLM 生成

---

## 五、设计语言要点（贯穿三屏）

- **Warm-neutral palette + 暖珊瑚强调色**——刻意避开 Duolingo 美学（context.md 第七节明示）
- **"Atmospheric mode shifting"**——Scenario 不是新页面，是同一聊天的氛围升温（背景色 / 边框 / HUD 渐入）
- **Sparkle + Plum 紫**专属标记 AI 生成内容（Memory 卡、persona 旁的 sparkle、AI · observed eyebrow）
- **Mono 小字 + Serif 大字**双轨：mono 用于元信息/标签/时间戳，serif 衬线体用于标题与数字 KPI
- **双语标签习惯**：UI 关键区均给出 EN + 中文副标（"Recent · 最近" "你的旅程"），与目标用户（中文母语者学英文）匹配

---

## 六、下一步若要继续推进 UI 的合理切入点

1. 把现有 mock 数据接入 Prisma + SQLite，让 NPC list、对话历史、Memory 真正持久化
2. 接 Ollama 流式响应，让 typing indicator 不再是装饰
3. 实现 InvitationCard 的真实触发逻辑（关系等级 + 对话轮数阈值）
4. 实现 Scenario JSON 状态机驱动 HUD 数字与 summary 评分
5. 加入"静态成就"模块的 UI（目前 Journey 缺这块）
6. Onboarding 数据回流：用户选的 role / goal / interests 真正注入 NPC system prompt