-- A repeated retract in the legacy implementation could replace retractedAt
-- without replacing hiddenAt. For those rows, infer the nearest preceding
-- retracted user message after the exact timestamp backfill has had its chance.
UPDATE "Message"
SET "hiddenByMessageId" = (
  SELECT "source"."id"
  FROM "Message" AS "source"
  WHERE "source"."threadId" = "Message"."threadId"
    AND "source"."userId" IS NOT NULL
    AND "source"."role" = 'user'
    AND "source"."retractedAt" IS NOT NULL
    AND (
      "source"."createdAt" < "Message"."createdAt"
      OR (
        "source"."createdAt" = "Message"."createdAt"
        AND "source"."id" < "Message"."id"
      )
    )
  ORDER BY "source"."createdAt" DESC, "source"."id" DESC
  LIMIT 1
)
WHERE "hiddenAt" IS NOT NULL
  AND "hiddenByMessageId" IS NULL;

UPDATE "ScenarioSession"
SET "hiddenByMessageId" = (
  SELECT "source"."id"
  FROM "Message" AS "source"
  WHERE "source"."threadId" = "ScenarioSession"."threadId"
    AND "source"."userId" IS NOT NULL
    AND "source"."role" = 'user'
    AND "source"."retractedAt" IS NOT NULL
    AND "source"."createdAt" <= "ScenarioSession"."invitedAt"
  ORDER BY "source"."createdAt" DESC, "source"."id" DESC
  LIMIT 1
)
WHERE "hiddenAt" IS NOT NULL
  AND "hiddenByMessageId" IS NULL;
