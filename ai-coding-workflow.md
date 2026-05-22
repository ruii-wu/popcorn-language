# AI 协作编码工作流 · Skill

> 给 AI 编码 agent 与人类协作者共用的执行流程。
> 核心:**先把"会失败的地方"在最便宜的时刻暴露出来**,而不是在写完一堆代码之后。
> 适用场景:中等以上复杂度的个人/小团队工程项目,有清晰交付目标,涉及多模块、外部依赖(LLM、DB、API),需要在数周时间内推进。

---

## 一、核心理念(读完这一节就懂为什么这套流程长这样)

1. **Cost of discovery 单调递增**。一个错误的假设在 plan 阶段发现成本 = 1,在 5 个模块写完后发现成本 = 50。流程的本质是把发现时机前移。
2. **"Done" 的标准是 running、green、可演示**,不是"代码写完了"。任何写完没跑过的代码本质上是 todo。
3. **Test-first ≠ Test-everything-first**。是每个待写的单元写之前,至少有 1-2 条 contract test 描述它该满足什么。不是写 75 个测试再写代码。
4. **风险驱动,不是路径驱动**。每个 phase 进去之前,识别"如果哪个假设错了,这个 phase 白做",优先验证它。
5. **Progress doc 是 working memory,不是 post-mortem**。在写的过程中持续更新,不是结束后补一份。

---

## 二、五阶段流程总览

```
Phase 0 · 环境与上下文校准   ← 防止"写完才发现没装 Node"
   ↓
Phase 1 · Plan & Roadmap      ← 整体方案 + 周维度 roadmap
   ↓
Phase 2 · Walking Skeleton    ← 最薄端到端跑通(防接缝错配)
   ↓
Phase 3 · 分阶段开发循环      ← 主循环,每个 phase 内部:
                                  risk-first → contract test → impl → run → record
   ↓
Phase 4 · 阶段验收 Gate       ← 不通过不开下一阶段
```

---

## 三、Phase 0 · 环境与上下文校准

**目标**:在写一行业务代码之前,确认所有外部依赖可用,所有上下文文档已读。

**清单(每条都要给出可验证的命令/产出)**:

- [ ] 列出全部 runtime 依赖,逐一验证版本:
  ```
  node --version          # >= 20.x
  npm --version
  python --version        # 如需
  ollama list             # 模型是否在本地
  sqlite3 --version
  ```
- [ ] 列出全部外部服务依赖,各跑一次最小 smoke test:
  ```
  curl http://localhost:11434/api/tags   # Ollama 可达
  ```
- [ ] 读完项目已有的 context 文档(类似 `docs/context.md`)。如不存在,写一份精简版(≤ 200 行):项目目标、硬约束、已 converge 的决策、不做清单。
- [ ] 识别**头号技术风险**——一个具体的、可验证的、如果错了会摧毁方案的假设。写进 `docs/risks.md` 头条。

**Anti-pattern**:
> "先开始写,缺什么再装"。后果见 Popcorn 项目 W1:写完 5 个模块 + 75 个测试,才发现 Node 没装,所有验证延后。

**输出**:`docs/env-check.md`(一次性的环境基线快照) + `docs/risks.md`(持续更新的风险登记)。

---

## 四、Phase 1 · Plan & Roadmap

**目标**:产出两份文档,让"接下来 N 周做什么"无歧义。

### 1.1 Overview Plan(整体方案设计)

写在 `docs/plan.md` 或按领域切分(如 `docs/backend.md` + `docs/frontend.md`)。**必须包含**:

- 系统模块清单 + 各自职责一句话
- 数据模型 schema 草图
- 关键工作流(从用户动作 → 系统响应的端到端序列)
- 外部接口契约(API 路径表、协议、错误处理)
- 与 UI/产品需求的映射表(UI 元素 → 后端动作)

**判断 plan 够不够的标准**:把这份文档丢给一个不熟悉项目的工程师,他能不能照着开工而**不需要追问大方向问题**。如果会被问到"那 X 怎么处理"且这是设计层问题,plan 没写够。

### 1.2 Roadmap(周维度时间线)

写在 `docs/roadmap.md`。**必须包含**:

- 总时间预算与硬截止日期
- 按周切分的 milestone(W1 / W2 / ...),每周一个**可演示的成果**
- 每周与头号风险的关系(本周验证了哪个假设)
- 明确不在此 roadmap 内的事(deferred / wont-do)

**重要**:每个 milestone 必须可演示。"完成 Module X" 不算 milestone,"用户能发一条消息看到 NPC 流式响应"算。

**Anti-pattern**:
> Roadmap 用"完成 Module 1/2/3"作为 milestone。后果:每个模块都"完成"了,但没有任何一个用户场景能跑通,因为接缝没接。

---

## 五、Phase 2 · Walking Skeleton(强烈建议,常被跳过)

**目标**:在做任何深度模块开发之前,用 **fake/stub 实现**把最关键的一条端到端路径打通一次。

**Walking Skeleton 的判定标准**:从用户最核心的一个动作出发(如"按发送按钮"),数据流穿过所有层(UI → API → DB → 外部服务 → 返回 → UI 渲染),全部用最 stub 的实现连起来。**所有接缝先对上,再去填肉**。

**Popcorn 项目应该做但没做的 Walking Skeleton**:
```
前端按 Send → /api/threads/lily/messages →
落 user message 到 SQLite →
调 Ollama(prompt 写死成"echo: {user_msg}") →
SSE 流式返回 → 前端渲染气泡
```
这一条跑通,所有接缝(SSE 协议格式、Prisma session 处理、Ollama stream chunking、前端 EventSource 解析)都验证过了。**这个时候才去深度做 PromptBuilder、Memory Engine。**

**收益**:接缝错配在 Day 1-2 发现,而不是 W2 集成时。
**成本**:1-2 天。
**何时可以跳过**:项目极小、所有接缝你都做过、堆栈完全熟悉。否则不要跳。

---

## 六、Phase 3 · 分阶段开发主循环(核心)

每个 phase(通常对应 roadmap 里的 1 周)内部跑这套循环:

### 6.1 Phase Kickoff(< 30 分钟)

写在 `docs/phases/W{n}-kickoff.md`:

- 本 phase 的可演示交付物(一句话)
- 本 phase 要验证 / 攻克的技术风险
- 拆解出 3-7 个 tasks,**按风险从高到低排序**(不是按依赖顺序!)

**关键**:**风险高的先做,即使下游模块还没有**。如果头号风险是"7B JSON 输出可靠性",第一个 task 就是"写 20 个 prompt + 真实跑 Qwen + 测 JSON parse 成功率",不是"写 Ollama client wrapper"。

### 6.2 每个 Task 的内部流程(TDD 节奏)

对每个 task,**严格按这个顺序**:

#### Step 1 · 写 Contract Test(先写)
- 给这个 task 的产出物(函数/模块/API)写出 **public interface 签名**
- 写 **1-3 条 contract test**:描述"调用方期望它满足什么"
- **此时测试一定 fail**(因为还没实现)。这是好事——证明测试在测真东西。
- 跑一次,确认 fail message 是预期的(不是 import error 之类的伪 fail)。

#### Step 2 · 最小实现
- 写**刚好让 contract test 通过**的代码。不优化,不加特性。
- 跑测试,green。

#### Step 3 · 补充 edge case test + 重构
- 现在追加边界条件、错误处理的测试。
- 实现 → 跑测试 → green。
- 重构:命名、抽象。**每次重构后立刻跑测试**。

#### Step 4 · 集成验证
- 这个 task 的产出跟上游/下游真接一次。**用真实数据/真实服务**(不只是 mock)。
- 例如:Ollama client 写完,跑一次真实 prompt,看返回结构是否如预期。

**Anti-pattern**:
> 一次写 5 个模块所有功能,最后统一写 75 个测试,再统一跑。后果见 Popcorn W1。
>
> 这种节奏的隐藏 cost:测试本身的 bug、mock 与真实行为偏差、契约理解错误——全部累积到最后一次性爆出来。

### 6.3 持续更新 Phase Progress Doc

`docs/phases/W{n}-progress.md` **在每个 task 完成后立刻更新**,不要积压到结尾:

```markdown
# W{n} 进度

## 完成 / 状态
- [x] Task A — 含测试 12 条全通过,集成 smoke 已跑
- [/] Task B — 主路径完成,2 个 edge case 未覆盖,见 todo
- [ ] Task C

## 验证了的假设
- [x] Qwen 7B 在 20 个 mock_interview prompt 下 JSON 输出成功率 19/20

## 推翻 / 修正的决策
- 原计划 X 改为 Y,因为...

## 遇到的问题与解决
- 问题:Prisma migrate 在 Windows path 含中文目录会失败
- 解决:项目移到 C:\Popcorn,避开 OneDrive 同步目录

## 未决 TODO(明确归属:本 phase 内修 / 下 phase / 不修)
- [ ] (本 phase) suggestion chips 还没接真实 LLM
- [ ] (下 phase) Memory recall 的 fallback 策略
- [ ] (won't fix) IE 浏览器支持
```

**关键属性**:这是 working doc,不是 report。**写得粗糙也比不写好**。

---

## 七、Phase 4 · 阶段验收 Gate(不通过不开下一阶段)

每个 phase 结束做一次硬验收。**全部 ✓ 才能进下一 phase**:

- [ ] 所有计划内 task 状态明确(done / partial / dropped),不能"待确认"
- [ ] 所有测试在干净环境下能从零跑通(`git clean -fdx && npm install && npm test`)
- [ ] 本 phase 的可演示交付物**真的演示一次**(自己录屏或在导师面前跑一遍)
- [ ] Phase progress doc 更新完毕,与代码状态一致
- [ ] 下 phase 的 kickoff doc 草稿写好(避免空窗)

**Anti-pattern**:
> "Task 都打了 ✓ 但代码没在干净环境跑过"。这种 phase 不算完成。Popcorn W1 就是这种状态——5 个 task completed,实际状态"代码就绪,等装 Node"。这应该叫 W1 90% 完成,不叫 done。

---

## 八、AI 协作编码的额外注意点

当 AI(如 Claude)作为执行者参与时,以下行为模式比独立工程师更需要警惕:

1. **AI 倾向于"完成感"驱动**:打勾、推进、产出代码,容易跳过"跑一次"这一步。**人类协作者的关键作用是把住 Definition of Done**。
2. **AI 会在缺少环境时"假装"继续**:写出能编译但没跑过的代码并标记完成。**Phase 0 的环境校准对 AI 协作尤其重要——前置堵死这条路**。
3. **AI 写测试时容易"过拟合到已有实现"**:test-after 写出来的测试常常只复述代码的当前行为,不是验证 contract。**坚持 test-first 能避免这个问题**。
4. **长对话中 AI 会丢失早期决策**:务必维护 `docs/context.md`(决策日志 + 已 converge 事项),新 session 让 AI 先读。
5. **AI 给出的工程量估计常常乐观**:roadmap 时间预算给 AI 的估算 × 1.5 是合理 buffer。

---

## 九、文档结构推荐

```
project-root/
├── docs/
│   ├── context.md              # 项目背景、决策日志、不做清单(持续更新)
│   ├── plan.md / backend.md    # 整体方案(Phase 1 产出)
│   ├── roadmap.md              # 周维度 milestone(Phase 1 产出)
│   ├── env-check.md            # 环境基线快照(Phase 0 产出)
│   ├── risks.md                # 风险登记 + 验证状态(持续更新)
│   └── phases/
│       ├── W1-kickoff.md
│       ├── W1-progress.md
│       ├── W2-kickoff.md
│       └── ...
├── src/
├── tests/
└── ...
```

---

## 十、快速自检清单(每天开工前 30 秒)

- [ ] 我现在在哪个 phase 的哪个 task?
- [ ] 这个 task 我先写测试了吗?写了就开始实现,没写就先去写。
- [ ] 我上一次跑全套测试是什么时候?如果超过 2 小时,先跑一次再写新代码。
- [ ] Phase progress doc 是不是今天还没更新过?

---

## 十一、Anti-pattern 速查

| 反模式 | 症状 | 修正 |
|---|---|---|
| 环境裸奔 | "缺什么再装" | Phase 0 一次性校准 |
| Test-after | 写完代码再补测试 | TDD 节奏,每 task 先写 contract test |
| 一次写完再统一测 | 攒 75 个测试再跑 | 写一个 task → 跑一次测试 |
| 完成感驱动 | 打 ✓ 但没真跑过 | DoD = 在干净环境跑通并演示 |
| 路径顺序优先 | 按依赖顺序排 task | 风险高的先做 |
| 没有 Walking Skeleton | 模块都完成,接缝不对 | Phase 2 先打通 stub 版端到端 |
| Progress doc 是 report | 结束后补一份 | working doc,持续写 |
| 假设不验证就盖架构 | 围绕"7B JSON 不稳"做 retry 没真测过 | 第一时间用真实样本验证假设 |
| Milestone 是"完成 Module X" | 没法演示给用户 | Milestone 必须可演示 |
| 决策只在脑里 | 新 session AI 不知道前因 | context.md 持续更新决策日志 |

---

## 附录 A · Phase Progress Doc 模板

```markdown
# W{n} · {主题} · Progress

> 最后更新:YYYY-MM-DD HH:MM

## 一句话状态
{本 phase 现在是什么状态}

## 计划任务
- [x] Task 1 · {名称} — 测试 N 条全过 · 集成 smoke ✓
- [/] Task 2 · {名称} — 主路径完成,edge case X / Y 待补
- [ ] Task 3 · {名称}

## 本 phase 验证的风险假设
- [x] {假设} → {结果}
- [ ] {假设} → 未验证

## 推翻 / 修正的决策
- {决策点}:从 X 改为 Y · 原因 · 影响范围

## 遇到的问题
- 问题:{描述}
- 调查:{尝试过什么}
- 解决 / 暂态:{当前处置}

## 未决 TODO
- [ ] (本 phase) ...
- [ ] (下 phase) ...
- [ ] (won't fix) ...

## 下 phase 入口提示
{为开 W{n+1} 准备的 kickoff 草稿要点}
```

---

## 附录 B · 给 AI Agent 的开场提示词模板

```
请按 docs/ai-coding-workflow.md 的流程执行。

当前进入 Phase {0|1|2|3|4}。

如果是 Phase 3,本周是 W{n},task 列表见 docs/phases/W{n}-kickoff.md。

每完成一个 task:
1. 必须 test-first,先写 contract test 并确认 fail
2. 实现到测试 pass
3. 补 edge case test
4. 跑一次集成 smoke
5. 更新 docs/phases/W{n}-progress.md

任何阻塞(环境、外部依赖、决策不清)立刻停止当前 task,
在 progress.md 标注阻塞原因后等待人类确认,不要绕过。

Definition of Done = 代码 + 测试全过 + 在干净 shell 跑通 + 演示一次。
打勾之前必须满足全部。
```

---

> 版本 v1 · 提炼自 Popcorn Language Capstone 项目复盘
> 核心修正:加入 Phase 0 环境校准、Phase 2 Walking Skeleton、Risk-first 任务排序、TDD 节奏(对每个 task 而非整个 phase)、Phase 验收硬 Gate
