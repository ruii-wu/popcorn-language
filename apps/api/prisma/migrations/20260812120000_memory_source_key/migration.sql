-- Idempotency key for generated memories. Nullable keys keep manually-created
-- and legacy unkeyed memories unrestricted.
ALTER TABLE "Memory" ADD COLUMN "sourceKey" TEXT;

-- Keep the earliest card for duplicate source tuples before creating the key.
DELETE FROM "Memory"
WHERE "sourceRef" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Memory" AS earlier
    WHERE earlier."userId" = "Memory"."userId"
      AND earlier."sourceType" = "Memory"."sourceType"
      AND earlier."sourceRef" = "Memory"."sourceRef"
      AND (
        earlier."noticedAt" < "Memory"."noticedAt"
        OR (earlier."noticedAt" = "Memory"."noticedAt" AND earlier."id" < "Memory"."id")
      )
  );

UPDATE "Memory"
SET "sourceKey" = "userId" || ':' || "sourceType" || ':' || "sourceRef"
WHERE "sourceRef" IS NOT NULL;

CREATE UNIQUE INDEX "Memory_sourceKey_key" ON "Memory"("sourceKey");
