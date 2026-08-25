import { z } from 'zod';

// auth/login + auth/register (identical shape)
export const CredentialsBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type CredentialsBody = z.infer<typeof CredentialsBody>;

// profile PUT
export const ProfileBody = z.object({
  role: z.string().nullish(),
  goal: z.string().nullish(),
  interests: z.array(z.string()).default([]),
  language: z.string().optional(),
  cefrLevel: z.enum(['A2', 'B1', 'B2', 'C1']).nullish(),
});
export type ProfileBody = z.infer<typeof ProfileBody>;

// threads/:npcId/messages POST
export const SendMessageBody = z.object({
  text: z.string().min(1),
  lang: z.string().optional(),
});
export type SendMessageBody = z.infer<typeof SendMessageBody>;

// system/reset POST
export const SystemResetBody = z.object({ confirm: z.literal(true) });
export type SystemResetBody = z.infer<typeof SystemResetBody>;

// scenarios/sessions/:id/decline POST
export const DeclineBody = z.object({ reason: z.string().max(500).optional() });
export type DeclineBody = z.infer<typeof DeclineBody>;

// scenarios/sessions/:id/choose POST
export const ChooseBody = z.object({
  choiceId: z.string().min(1),
  tone: z.string().optional(),
  text: z.string().optional(),
});
export type ChooseBody = z.infer<typeof ChooseBody>;

// scenarios/sessions/:id/freetype POST
export const FreetypeBody = z.object({ text: z.string().min(1) });
export type FreetypeBody = z.infer<typeof FreetypeBody>;

// dev/memory-eval POST
export const MemoryEvalBody = z.object({
  datasetId: z.string().optional(),
  k: z.number().int().positive().max(20).optional(),
});
export type MemoryEvalBody = z.infer<typeof MemoryEvalBody>;

// scenarios/recommendation/dismiss POST
export const DismissRecommendationBody = z.object({
  templateId: z.string().min(1),
});
export type DismissRecommendationBody = z.infer<typeof DismissRecommendationBody>;

// settings PUT — partial update (every field optional). Single source for the
// memory-strategy enum, shared by the request schema and the response type.
export const MEMORY_STRATEGIES = ['recency', 'summary', 'semantic', 'hybrid'] as const;
export type MemoryStrategy = (typeof MEMORY_STRATEGIES)[number];

export const SettingsPatch = z.object({
  grammarCorrection: z.boolean().optional(),
  modelName: z.string().min(1).optional(),
  uiLanguage: z.string().min(1).optional(),
  voiceTTSEnabled: z.boolean().optional(),
  showAIRationale: z.boolean().optional(),
  memoryStrategy: z.enum(MEMORY_STRATEGIES).optional(),
});
export type SettingsPatch = z.infer<typeof SettingsPatch>;
