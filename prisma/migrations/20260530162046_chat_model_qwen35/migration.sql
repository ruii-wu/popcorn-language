-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "grammarCorrection" BOOLEAN NOT NULL DEFAULT true,
    "modelName" TEXT NOT NULL DEFAULT 'qwen3.5:9b',
    "uiLanguage" TEXT NOT NULL DEFAULT 'zh-CN',
    "voiceTTSEnabled" BOOLEAN NOT NULL DEFAULT false,
    "showAIRationale" BOOLEAN NOT NULL DEFAULT true,
    "memoryStrategy" TEXT NOT NULL DEFAULT 'hybrid',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_UserSettings" ("grammarCorrection", "id", "memoryStrategy", "modelName", "showAIRationale", "uiLanguage", "updatedAt", "userId", "voiceTTSEnabled") SELECT "grammarCorrection", "id", "memoryStrategy", "modelName", "showAIRationale", "uiLanguage", "updatedAt", "userId", "voiceTTSEnabled" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "UserSettings"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
