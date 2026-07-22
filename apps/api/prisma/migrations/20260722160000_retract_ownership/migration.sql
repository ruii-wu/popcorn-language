ALTER TABLE "Message" ADD COLUMN "hiddenByMessageId" TEXT;
ALTER TABLE "ScenarioSession" ADD COLUMN "hiddenByMessageId" TEXT;

-- Existing recall rows used one timestamp for the retracting message and every
-- row it hid. Recover that ownership before new restores start matching by id.
UPDATE "Message"
SET "hiddenByMessageId" = (
  SELECT "source"."id"
  FROM "Message" AS "source"
  WHERE "source"."threadId" = "Message"."threadId"
    AND "source"."retractedAt" = "Message"."hiddenAt"
  ORDER BY "source"."createdAt" DESC, "source"."id" DESC
  LIMIT 1
)
WHERE "hiddenAt" IS NOT NULL;

UPDATE "ScenarioSession"
SET "hiddenByMessageId" = (
  SELECT "source"."id"
  FROM "Message" AS "source"
  WHERE "source"."threadId" = "ScenarioSession"."threadId"
    AND "source"."retractedAt" = "ScenarioSession"."hiddenAt"
  ORDER BY "source"."createdAt" DESC, "source"."id" DESC
  LIMIT 1
)
WHERE "hiddenAt" IS NOT NULL;

CREATE INDEX "Message_threadId_hiddenByMessageId_idx"
ON "Message"("threadId", "hiddenByMessageId");

CREATE INDEX "ScenarioSession_threadId_hiddenByMessageId_idx"
ON "ScenarioSession"("threadId", "hiddenByMessageId");
