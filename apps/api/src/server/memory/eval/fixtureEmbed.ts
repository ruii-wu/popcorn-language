// src/server/memory/eval/fixtureEmbed.ts
import type { OllamaClient } from '@/server/llm/ollama';

// Deterministic topic-classifier embedding for the ablation fixture: each text maps to one
// orthogonal basis vector, so cosine cleanly ranks the topically-matching corpus item first.
// Priority order matters (the summary text mentions both "hiking" and "cat" — hiking wins).
const E = {
  hobby: [1, 0, 0, 0, 0],
  pet: [0, 1, 0, 0, 0],
  job: [0, 0, 1, 0, 0],
  food: [0, 0, 0, 1, 0],
  other: [0, 0, 0, 0, 1],
};
const TOPICS: { vec: number[]; words: string[] }[] = [
  { vec: E.hobby, words: ['hiking', 'outdoor', 'weekend'] },
  { vec: E.pet, words: ['pet', 'cat'] },
  { vec: E.job, words: ['work', 'job', 'engineer'] },
  { vec: E.food, words: ['spicy', 'food', 'dish'] },
];

export async function fixtureEmbed(text: string): Promise<number[]> {
  const t = text.toLowerCase();
  for (const top of TOPICS) {
    if (top.words.some((w) => t.includes(w))) return top.vec;
  }
  return E.other;
}

// Shape the harness expects (Pick<OllamaClient, 'embed'>).
export const fixtureOllama: Pick<OllamaClient, 'embed'> = { embed: fixtureEmbed };
