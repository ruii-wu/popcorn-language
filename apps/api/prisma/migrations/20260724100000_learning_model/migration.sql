-- Fixed learning-skill taxonomy (static dictionary). Rows seeded by seed-base.
CREATE TABLE "LearningSkill" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelZh" TEXT NOT NULL,
    "cefrHint" TEXT NOT NULL
);

-- Immutable learning-event evidence. Aggregated at read-time.
CREATE TABLE "LearningSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "skillCode" TEXT NOT NULL,
    "polarity" TEXT NOT NULL,
    "score" REAL NOT NULL DEFAULT 0.0,
    "confidence" REAL NOT NULL DEFAULT 0.7,
    "weight" REAL NOT NULL DEFAULT 1.0,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "evidence" TEXT,
    "npcId" TEXT,
    "sourceMessageId" TEXT,
    "scenarioSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningSignal_sourceMessageId_fkey" FOREIGN KEY ("sourceMessageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningSignal_scenarioSessionId_fkey" FOREIGN KEY ("scenarioSessionId") REFERENCES "ScenarioSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningSignal_userId_sourceType_sourceRef_skillCode_key"
    ON "LearningSignal"("userId", "sourceType", "sourceRef", "skillCode");
CREATE INDEX "LearningSignal_userId_skillCode_createdAt_idx"
    ON "LearningSignal"("userId", "skillCode", "createdAt");
CREATE INDEX "LearningSignal_sourceMessageId_idx"
    ON "LearningSignal"("sourceMessageId");
CREATE INDEX "LearningSignal_scenarioSessionId_idx"
    ON "LearningSignal"("scenarioSessionId");

-- Adaptive-recommender inputs on scenario templates.
ALTER TABLE "ScenarioTemplate" ADD COLUMN "targetSkills"  TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ScenarioTemplate" ADD COLUMN "difficulty"    TEXT NOT NULL DEFAULT 'B1';
ALTER TABLE "ScenarioTemplate" ADD COLUMN "successRubric" TEXT NOT NULL DEFAULT '{}';
