// src/server/memory/eval/dataset.ts

// A labeled corpus item. Facts carry predicate+value (the harness embeds `value`, matching
// factExtract.ts); summaries carry `summary` text (the harness embeds the summary text).
export type EvalCorpusItem =
  | { key: string; kind: 'fact'; predicate: string; value: string }
  | { key: string; kind: 'summary'; summary: string };

// A probe query and the set of corpus keys that *should* be recalled for it.
export interface EvalProbe {
  queryText: string;
  relevantKeys: string[];
}

export interface EvalDataset {
  id: string;
  defaultK: number;
  // Ordered oldest -> newest; the harness seeds createdAt by index.
  corpus: EvalCorpusItem[];
  probes: EvalProbe[];
}

// Default ablation set: four topical facts (oldest) + four filler facts + one summary (newest).
// Designed so the topical facts sit *outside* the recency window, exposing the recall gap
// between the recency baseline and the semantic/hybrid strategies.
const DEFAULT: EvalDataset = {
  id: 'default',
  defaultK: 3,
  corpus: [
    { key: 'pet', kind: 'fact', predicate: 'has_pet', value: 'cat' },
    { key: 'job', kind: 'fact', predicate: 'works_as', value: 'software engineer' },
    { key: 'hobby', kind: 'fact', predicate: 'likes', value: 'hiking' },
    { key: 'food', kind: 'fact', predicate: 'dislikes', value: 'spicy food' },
    { key: 'filler1', kind: 'fact', predicate: 'lives_near', value: 'Clementi' },
    { key: 'filler2', kind: 'fact', predicate: 'studies_for', value: 'IELTS exam' },
    { key: 'filler3', kind: 'fact', predicate: 'goal', value: 'move to Canada' },
    { key: 'filler4', kind: 'fact', predicate: 'has_sibling', value: 'younger brother' },
    { key: 'sum', kind: 'summary', summary: 'User discussed weekend hiking plans and their cat.' },
  ],
  probes: [
    { queryText: 'Tell me about your pet', relevantKeys: ['pet'] },
    { queryText: 'What do you do for work?', relevantKeys: ['job'] },
    { queryText: 'Any weekend outdoor plans?', relevantKeys: ['hobby', 'sum'] },
    { queryText: 'How do you feel about spicy dishes?', relevantKeys: ['food'] },
  ],
};

export const DATASETS: Record<string, EvalDataset> = { [DEFAULT.id]: DEFAULT };
export const DEFAULT_DATASET_ID = DEFAULT.id;

// Resolve a dataset by id, falling back to the default for unknown/omitted ids.
export function getDataset(id?: string): EvalDataset {
  return (id && DATASETS[id]) || DATASETS[DEFAULT_DATASET_ID];
}
