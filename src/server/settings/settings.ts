// src/server/settings/settings.ts
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';

export const MEMORY_STRATEGIES = ['recency', 'summary', 'semantic', 'hybrid'] as const;
export type MemoryStrategyName = (typeof MEMORY_STRATEGIES)[number];

export interface SettingsView {
  grammarCorrection: boolean;
  modelName: string;
  uiLanguage: string;
  voiceTTSEnabled: boolean;
  showAIRationale: boolean;
  memoryStrategy: MemoryStrategyName;
}

// Mirrors the UserSettings model defaults (spec §八).
export const DEFAULT_SETTINGS: SettingsView = {
  grammarCorrection: true,
  modelName: 'qwen2.5:7b-instruct',
  uiLanguage: 'zh-CN',
  voiceTTSEnabled: false,
  showAIRationale: true,
  memoryStrategy: 'hybrid',
};

// Zod patch for PUT /api/settings — every field optional (partial update).
export const SettingsPatch = z.object({
  grammarCorrection: z.boolean().optional(),
  modelName: z.string().min(1).optional(),
  uiLanguage: z.string().min(1).optional(),
  voiceTTSEnabled: z.boolean().optional(),
  showAIRationale: z.boolean().optional(),
  memoryStrategy: z.enum(MEMORY_STRATEGIES).optional(),
});
export type SettingsPatchInput = z.infer<typeof SettingsPatch>;

function toView(row: {
  grammarCorrection: boolean; modelName: string; uiLanguage: string;
  voiceTTSEnabled: boolean; showAIRationale: boolean; memoryStrategy: string;
}): SettingsView {
  const strat = (MEMORY_STRATEGIES as readonly string[]).includes(row.memoryStrategy)
    ? (row.memoryStrategy as MemoryStrategyName)
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
  patch: SettingsPatchInput,
): Promise<SettingsView> {
  const row = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...patch },
    update: patch,
  });
  return toView(row);
}
