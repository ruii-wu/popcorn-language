-- Lily is the onboarding companion, so both existing and newly provisioned
-- relationships start from the Friend threshold. Preserve stronger stages.
UPDATE "Relationship"
SET
  "stage" = 'friend',
  "stageValue" = 2,
  "relationshipPoints" = CASE
    WHEN "relationshipPoints" < 30 THEN 30
    ELSE "relationshipPoints"
  END
WHERE "npcId" = 'lily'
  AND "stageValue" < 2;
