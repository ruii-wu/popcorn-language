// src/server/memory/eval/fixtureEmbed.ts
import type { OllamaClient } from '@/server/llm/ollama';
import { EVAL_TOPIC_TERMS } from './dataset';

// Deterministic topic-classifier embedding for controlled ablation fixtures. Each topic maps to
// an orthogonal basis vector; the final dimension is reserved for unrelated distractors.
const TOPICS = Object.values(EVAL_TOPIC_TERMS);
const DIMENSIONS = TOPICS.length + 1;

function basis(index: number): number[] {
  return Array.from({ length: DIMENSIONS }, (_, i) => (i === index ? 1 : 0));
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text);
}

export async function fixtureEmbed(text: string): Promise<number[]> {
  const t = text.toLowerCase();
  for (let i = 0; i < TOPICS.length; i++) {
    if (TOPICS[i].some((word) => containsTerm(t, word))) return basis(i);
  }
  return basis(TOPICS.length);
}

// Shape the harness expects (Pick<OllamaClient, 'embed'>).
export const fixtureOllama: Pick<OllamaClient, 'embed'> = { embed: fixtureEmbed };
