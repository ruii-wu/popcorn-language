// src/server/settings/settings.ts
import { MEMORY_STRATEGIES, type MemoryStrategy, type SettingsPatch } from '@popcorn/shared';
import type { PrismaClient } from '@prisma/client';

export interface SettingsView {
  grammarCorrection: boolean;
  modelName: string;
  uiLanguage: string;
  voiceTTSEnabled: boolean;
  showAIRationale: boolean;
  memoryStrategy: MemoryStrategy;
}

// Mirrors the UserSettings model defaults (spec §八).
export const DEFAULT_SETTINGS: SettingsView = {
  grammarCorrection: true,
  modelName: 'qwen3.5:9b',
  uiLanguage: 'zh-CN',
  voiceTTSEnabled: false,
  showAIRationale: true,
  memoryStrategy: 'hybrid',
};

function toView(row: {
  grammarCorrection: boolean; modelName: string; uiLanguage: string;
  voiceTTSEnabled: boolean; showAIRationale: boolean; memoryStrategy: string;
}): SettingsView {
  const strat = (MEMORY_STRATEGIES as readonly string[]).includes(row.memoryStrategy)
    ? (row.memoryStrategy as MemoryStrategy)
    : DEFAULT_SETTINGS.memoryStrategy;
  return {
    grammarCorrection: row.grammarCorrection,
    modelName: row.modelName,
    uiLanguage: row.uiLanguage,
    voiceTTSEnabled: row.voiceTTSEnabled,
    showAIRationale: row.showAIRationale,
    memoryStrategy: strat,
  };
}

// Effective settings: the row if present, else defaults (matches "no row = defaults").
export async function readSettings(prisma: PrismaClient, userId: string): Promise<SettingsView> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  return row ? toView(row) : { ...DEFAULT_SETTINGS };
}

// Upsert a partial patch; returns the resulting effective settings.
export async function writeSettings(
  prisma: PrismaClient,
  userId: string,
  patch: SettingsPatch,
): Promise<SettingsView> {
  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
  });
  return toView(row);
}
