// src/server/scenario/schemas.ts
import { z } from 'zod';

export const StressSchema = z.enum(['Low', 'Medium', 'High']);

export const ChoiceSchema = z.object({
  id: z.string(),
  text: z.string(),
  tone: z.string(),
  desc: z.string().default(''),
});

export const ScenarioTurnSchema = z.object({
  npcReply: z.string().min(1),
  stateDelta: z.object({ impression: z.number(), stress: StressSchema }),
  isFinalTurn: z.boolean(),
  suggestedChoicesNext: z.array(ChoiceSchema).default([]),
});
export type ScenarioTurnJson = z.infer<typeof ScenarioTurnSchema>;

export const ScenarioSummarySchema = z.object({
  grade: z.string().min(1),
  languageNote: z.string(),
  pragmaticsNote: z.string(),
  relationshipNote: z.string(),
  // Assessment rows are best-effort learning metadata. end.ts normalizes each
  // item independently so malformed rows do not erase the main summary.
  skillAssessments: z.unknown().optional(),
});
export type ScenarioSummaryJson = z.infer<typeof ScenarioSummarySchema>;

export const MemoryCardSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
});
export type MemoryCardJson = z.infer<typeof MemoryCardSchema>;
