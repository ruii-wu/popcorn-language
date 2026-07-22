-- Emma is an initial companion alongside Lily. Provision a Friend relationship for existing
-- users that do not have one yet, then lift only lower stages without downgrading stronger ones.
INSERT INTO "Relationship" ("id", "userId", "npcId", "stage", "stageValue", "relationshipPoints")
SELECT lower(hex(randomblob(16))), "id", 'emma', 'friend', 2, 30
FROM "User"
WHERE EXISTS (SELECT 1 FROM "Npc" WHERE "id" = 'emma')
  AND NOT EXISTS (
    SELECT 1
    FROM "Relationship"
    WHERE "Relationship"."userId" = "User"."id"
      AND "Relationship"."npcId" = 'emma'
  );

UPDATE "Relationship"
SET
  "stage" = 'friend',
  "stageValue" = 2,
  "relationshipPoints" = CASE
    WHEN "relationshipPoints" < 30 THEN 30
    ELSE "relationshipPoints"
  END
WHERE "npcId" = 'emma'
  AND "stageValue" < 2;
