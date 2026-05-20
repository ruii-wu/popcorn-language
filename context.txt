# Popcorn Language Capstone Project — Session Context

> 用于在新session中无缝延续讨论。包含项目背景、关键决策路径、当前方案、未决事项。

---

## 一、项目基本信息

**项目名称**：Popcorn Language（产品名暂定 Popcorn Social）

**项目类型**：CP5106 Computing Capstone Project (with Internship) — Internal Project，NUS Master of Computing项目

**项目性质**：CS Master工程探索性capstone，**不是商业产品**，不是research paper

**时长**：4个月，2025年5月中 - 2025年9月中（实际开发约9-11周可用，扣除Interim/Final Report时间）

**人员**：单人开发

**评估标准**（来自Spec）：
- Understanding Project Scope
- Technical Contribution
- Presentation and Writing
- 交付物：Interim Report（1个月末）+ Final Report + 30-40分钟Presentation

**Phase 1要求**（5/18 - 6/18）：
- Literature Review
- Problem Statement定义
- Background Reading
- Implementation Plan
- **不强制写代码**，思考和文献阅读为主
- Interim Report通过web form提交

---

## 二、项目原始Spec

来自项目说明的三个目标：
1. Expand AI-powered generation capabilities from English-centric to multiple languages
2. Refine the overall user journey and interface based on feedback
3. Develop an achievement system (game play features) to improve **user engagement and retention**

**关键解读**：spec原文强调"engagement and retention"——这是gameplay角度的项目，不是教学效果项目。

---

## 三、硬性约束

1. **实时使用的AI模型必须使用Ollama本地部署**（教授要求，非可选）
2. **必须支持中文和英文两种语言**
3. **可选三个MVP核心方向**之一（用户原始问题）：
   - Web + Mobile双端
   - Web-based AI核心
   - Web-based gameplay核心

4. **澄清后的事实**（用户后续提供）：
   - **从零开始构建**，不是扩展现有平台
   - 项目性质是**工程+产品demo**，不是research
   - 重心是**AI integration + engineering**，不是语言学习效果

---

## 四、关键决策路径（核心决策回溯）

### 决策1：方向选择

经过多轮讨论，**否决了**：
- 双端开发（工程量18-25周，超budget）
- 纯AI核心（差异化不足、像"工程exercise"）
- 纯gameplay核心（抄Duolingo，无技术深度）
- 多个创意方案（侦探解谜、生活模拟器、多元宇宙、互动小说等）

**最终方向**：**Duolingo-style framework + AI深度集成**，进一步演化为 **Popcorn Social（Social外壳 + Scenario事件内核）混合架构**

### 决策2：混合架构的rationale

**核心论据**：本地7B级开源LLM最大的弱点是**长期一致性**（人格漂移、状态遗忘、跨会话连贯性）。混合架构通过两种模式分别规避此弱点：

- **Social模式**：碎片化短交互对一致性容忍度高（类即时通讯体验）
- **Scenario模式**：封闭单幕剧把状态空间限制在事件内，事件结束即释放

### 决策3：Scenario触发机制

讨论了三个路径：
- **B1: 关键词检测** — 简单但机械、假阳性高
- **B2: LLM意图分类** — 学术价值高但每条消息额外LLM调用，工程难度大、稳定性差
- **B3: NPC主动引导触发**（最终选择）— 由NPC人格驱动，在对话中自然埋下scenario邀请，用户接受后进入scenario模式

**B3的优势**：
- 触发是规则化的（NPC对话轮数+关系阈值），不依赖7B模型classifier能力
- "scenarios由角色引出而非系统弹出"是genuinely novel的设计论述
- 完美对齐Problem Statement里"AI as core engagement driver, not auxiliary feature"的论点

### 决策4：Scenario在UI上的呈现

**否决了**：独立页面/全屏接管（feels like "going to do homework"）

**选择**：**嵌入式模式切换** — 同一聊天界面，氛围升温式过渡：
- 同一layout，同一NPC，同一对话连续性
- 配色subtle变化（"灯光变暗"而非"换房间"）
- 顶部出现ambient状态条（impression、stress等）
- 输入区从文本输入变为选择按钮卡片
- Scenario结束后总结卡作为聊天历史的"记忆"永久保留

---

## 五、当前确定的方案 — Popcorn Social

### Problem Statement (Phase 1版本)

> *"Existing AI-enhanced language learning platforms predominantly rely on cloud-based proprietary LLMs (e.g., Duolingo Max's GPT-4 integration), which constrains personalization at scale due to API costs, and limits architectural exploration. Furthermore, most current AI features—such as 'Explain My Answer' or one-off conversational Roleplay—operate as auxiliary additions to traditional gamification loops rather than as core engagement drivers. This project investigates how locally-deployed open-source LLMs can be architected as the central engagement engine in a language learning platform, through a hybrid system combining (a) persistent social interactions with AI-driven NPCs and (b) episodic scenario-based gameplay events. The work explores: memory and consistency architectures for sustained AI character interactions under local model constraints; bounded gameplay modes that leverage LLM strengths while controlling for known limitations (drift, context loss, structured output instability); AI-aware progression and achievement systems that respond dynamically to conversational behavior; and bilingual (Chinese-English) interaction patterns that exploit code-switching."*

### MVP Scope - P0必交付

1. **Persistent NPC社交系统**：2-3个核心NPC，角色卡注入System Prompt，一对一聊天，双语输入支持，内嵌纠错
2. **轻量化记忆模块**：摘要式记忆 + 近期对话缓存 + SQLite持久化（项目最关键工程模块）
3. **Scenario事件系统**：1-2个事件（先做精一个），独立Prompt + JSON状态机，NPC主动邀请触发
4. **关系与进度系统**：三档亲密度（陌生/朋友/密友），关系阈值触发scenario解锁
5. **静态成就系统**：5-6个固定成就，规则触发不依赖LLM
6. **双语支持**：中→英为主，英→中作架构验证

### MVP Scope - P1 Stretch（选1-2个深做）

四个novel整合角度：
1. **AI-Generated Dynamic Achievements** — LLM根据用户行为生成个性化成就
2. **Cross-NPC Memory Network** — NPCs之间共享部分信息，构造knowledge propagation graph
3. **AI Reflective Companion** — 每周/每scenario后LLM做meta-analysis生成反思总结
4. **Code-Switching as Gameplay** — 不同NPC对中英文混用有不同反应

### 明确不做

- ❌ 移动端
- ❌ 群聊/多角色同时对话
- ❌ 语音/实时对话
- ❌ 复杂亲密度数值
- ❌ 双向双语对称内容（只做中→英内容深度）
- ❌ 用户学习效果对照实验
- ❌ Skill tree / 排行榜 / 付费
- ❌ 5个以上NPC、3个以上Scenario

### 技术栈

- Next.js 14 (App Router) + TypeScript（前后端一体）
- Tailwind CSS
- SQLite + Prisma ORM
- Ollama本地HTTP API + 流式响应(SSE)
- 推荐模型：Qwen 2.5 7B-Instruct
- TTS：浏览器Web Speech API

### NPC设计（已构思）

1. **Lily** — NYC barista，英文母语，懂少量中文，friendly casual
2. **Mr. Chen** — 双语senior coworker（mentor figure），professional tone
3. **Emma** — UK university student，英文only，chatty和energetic

### Phase 1时间表

- 第1-2周：文献调研（10-15篇精读）
  - AI in Language Learning（Duolingo Max技术博客等）
  - Persistent AI Characters & Persona Consistency
  - Local LLM Benchmarks & Deployment
  - LLM Memory Architectures
  - Gamification in Education
- 第2-3周：与导师对齐problem statement
- 第3-4周：写Interim Report

---

## 六、已识别的关键风险

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| 7B模型JSON输出稳定性 | Scenario状态机不可用 | Ollama `format: "json"` + schema验证 + 重试 |
| 记忆模块召回准确性 | NPC"失忆"体验崩 | 多种记忆策略对比作为论文章节 |
| 本地推理延迟 | 用户等待不可接受 | 流式响应 + "正在输入"UI + 量化模型 |
| 双语prompt设计不对称 | 中→英 vs 英→中体验差 | 主做中→英，英→中作架构验证 |
| 角色一致性漂移 | 长对话NPC"出戏" | 系统prompt重申 + 记忆模块校准 |

---

## 七、UI生成已完成的Prompts

已为用户生成三个Claude Design UI prompts（基于嵌入式scenario模式 + NPC主动引导的新交互逻辑）：

1. **Prompt 1**: 主应用Shell + 日常聊天（Contact List, Casual Chat, Settings）
2. **Prompt 2**: Scenario涌现 + 嵌入式Scenario模式（4个State展示同一聊天的氛围流动：Casual → Invitation → Active → Aftermath）
3. **Prompt 3**: Onboarding + Achievements（含AI-Generated Memories区域）

设计语言核心：warm-neutral palette，避开Duolingo美学，sophisticated但不corporate，**"atmospheric mode shifting"概念——scenario不是新页面，是同一聊天的氛围升温**。

---

## 八、与导师仍需确认的开放问题

1. Technical contribution的边界——工程实现就够，还是需要带small evaluation？
2. Engagement metrics的具体定义——用什么指标证明"AI as engagement engine"成立？
3. 双语支持的深度期望——architectural support就够，还是要完整中英内容？
4. P1四个novel integration angles的优先级——导师对哪个最感兴趣？

---

## 九、用户的工作风格与倾向（对话观察）

- **倾向于反复探索方案**，需要主动push converge到执行
- **对脑暴新方向有强惯性**，前期曾出现"方案囤积"问题
- 会主动用其他AI工具（ChatGPT/DeepSeek）做并行咨询并带回结果给我评估
- 接受批评和recalibration，但需要批评有具体依据
- **关键澄清能力强**——在我跑偏时（如过度强调"学习效果"）能直接纠正项目重心
- 当前已converge，处于Phase 1执行启动阶段

**对AI advisor的期待**：brutally honest，挑战thinking，揭示blind spots，不要flattery（在userPreferences中明确）

---

## 十、当前对话停留点

最后一轮：用户要求基于嵌入式scenario交互逻辑的新UI prompts，已交付3个prompt。

**下一步可能的方向**：
- Literature Review的具体papers推荐
- Interim Report各章节的结构和措辞
- NPC角色卡的具体设计（包括Lily/Mr. Chen/Emma的backstory和prompt模板）
- Scenario具体设计（第一个event内容、JSON状态机schema、生成prompt）
- 技术原型验证步骤（Ollama部署、Qwen模型测试、JSON output稳定性测试方法）
- 与导师对齐前的materials准备

---

## 十一、新Session继续对话建议

如果继续对话，**已经converge的事项不需要重新讨论**：
- 项目方向（Popcorn Social + Scenario）
- 触发机制（NPC主动引导，路径B3）
- UI模式（嵌入式氛围切换）
- Phase 1重心（文献+定义问题，不是赶代码）

**应优先推进的**：进入Phase 1的具体执行——文献查找、Problem Statement打磨、NPC具体设计、第一个scenario的详细设计、和导师讨论前的materials准备。

**保持的AI advisor风格**：brutal honest，不flatter，挑战assumptions，但**已converge的决策不再回炉**——如果用户提出新方向偏离当前方案，需要warning并要求明确rationale才能调整。