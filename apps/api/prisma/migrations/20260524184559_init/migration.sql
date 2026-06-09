-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayName" TEXT NOT NULL DEFAULT 'You',
    "language" TEXT NOT NULL DEFAULT 'zh-CN',
    "targetLang" TEXT NOT NULL DEFAULT 'en-US',
    "cefrLevel" TEXT
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "goal" TEXT,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "grammarCorrection" BOOLEAN NOT NULL DEFAULT true,
    "modelName" TEXT NOT NULL DEFAULT 'qwen2.5:7b-instruct',
    "uiLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "voiceTTSEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showAIRationale" BOOLEAN NOT NULL DEFAULT true,
    "memoryStrategy" TEXT NOT NULL DEFAULT 'hybrid',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Npc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "avatarGlyph" TEXT NOT NULL,
    "avatarBg" TEXT NOT NULL,
    "avatarInk" TEXT NOT NULL,
    "shortBio" TEXT NOT NULL,
    "personaPrompt" TEXT NOT NULL,
    "languageProfile" TEXT NOT NULL DEFAULT '{}',
    "topicInterests" TEXT NOT NULL DEFAULT '[]',
    "scenarioRoles" TEXT NOT NULL DEFAULT '[]',
    "introMessage" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'acquaintance',
    "stageValue" INTEGER NOT NULL DEFAULT 1,
    "relationshipPoints" INTEGER NOT NULL DEFAULT 0,
    "conversationCount" INTEGER NOT NULL DEFAULT 0,
    "scenarioCount" INTEGER NOT NULL DEFAULT 0,
    "declineCount" INTEGER NOT NULL DEFAULT 0,
    "lastInteractionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Relationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Relationship_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RelationshipEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "relationshipId" TEXT NOT NULL,
    "fromStage" TEXT NOT NULL,
    "toStage" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipEvent_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "Relationship" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Thread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMsgAt" DATETIME,
    CONSTRAINT "Thread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Thread_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "langDetect" TEXT,
    "correction" TEXT,
    "meta" TEXT,
    "tokensUsed" INTEGER,
    "modelName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scenarioSessionId" TEXT,
    CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Message_scenarioSessionId_fkey" FOREIGN KEY ("scenarioSessionId") REFERENCES "ScenarioSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "fromMsgId" TEXT NOT NULL,
    "toMsgId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "embedding" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSummary_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "titleZh" TEXT,
    "npcId" TEXT NOT NULL,
    "rolePlayedBy" TEXT NOT NULL,
    "minStage" TEXT NOT NULL DEFAULT 'friend',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 8,
    "estimatedTurns" INTEGER NOT NULL DEFAULT 6,
    "registerTags" TEXT NOT NULL DEFAULT '[]',
    "systemPrompt" TEXT NOT NULL,
    "topicKeywords" TEXT NOT NULL DEFAULT '[]',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ScenarioTemplate_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT '{}',
    "invitedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "declineReason" TEXT,
    "triggerRationale" TEXT,
    CONSTRAINT "ScenarioSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioSession_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ScenarioSession_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioSession_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ScenarioTemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "userChoiceId" TEXT,
    "userChoiceTone" TEXT,
    "userFreeText" TEXT,
    "userMessageId" TEXT,
    "npcMessageId" TEXT,
    "stateBefore" TEXT NOT NULL DEFAULT '{}',
    "stateAfter" TEXT NOT NULL DEFAULT '{}',
    "nextChoices" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScenarioSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioTurn_userMessageId_fkey" FOREIGN KEY ("userMessageId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "languageNote" TEXT NOT NULL,
    "pragmaticsNote" TEXT NOT NULL,
    "relationshipNote" TEXT NOT NULL,
    "transcriptUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScenarioSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScenarioSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "npcId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "noticedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" DATETIME,
    "meta" TEXT,
    CONSTRAINT "Memory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoryFact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'user',
    "predicate" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.7,
    "embedding" TEXT,
    "sourceMsgId" TEXT,
    "knownToNpcs" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MemoryFact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AchievementDef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "rule" TEXT NOT NULL,
    "ruleConfig" TEXT,
    "isDynamic" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "unlockedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" TEXT,
    CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "AchievementDef" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MemoryRetrievalLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "retrievedIds" TEXT NOT NULL DEFAULT '[]',
    "k" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "tokenCost" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryRetrievalLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_userId_npcId_key" ON "Relationship"("userId", "npcId");

-- CreateIndex
CREATE UNIQUE INDEX "Thread_userId_npcId_key" ON "Thread"("userId", "npcId");

-- CreateIndex
CREATE INDEX "Message_threadId_createdAt_idx" ON "Message"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationSummary_threadId_createdAt_idx" ON "ConversationSummary"("threadId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioTurn_userMessageId_key" ON "ScenarioTurn"("userMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioTurn_sessionId_turnIndex_key" ON "ScenarioTurn"("sessionId", "turnIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioSummary_sessionId_key" ON "ScenarioSummary"("sessionId");

-- CreateIndex
CREATE INDEX "Memory_userId_noticedAt_idx" ON "Memory"("userId", "noticedAt");

-- CreateIndex
CREATE INDEX "MemoryFact_userId_predicate_idx" ON "MemoryFact"("userId", "predicate");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "ActivityEvent_userId_type_createdAt_idx" ON "ActivityEvent"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryRetrievalLog_userId_strategy_createdAt_idx" ON "MemoryRetrievalLog"("userId", "strategy", "createdAt");
