// src/server/memory/eval/dataset.ts

export type EvalCorpusItem =
  | { key: string; kind: 'fact'; predicate: string; value: string; createdAt?: string }
  | { key: string; kind: 'summary'; summary: string; createdAt?: string };

export interface EvalProbe {
  queryText: string;
  relevantKeys: string[];
}

export interface EvalDataset {
  id: string;
  defaultK: number;
  description: string;
  evaluationTime?: string;
  // Ordered oldest -> newest unless an item supplies an explicit createdAt timestamp.
  corpus: EvalCorpusItem[];
  probes: EvalProbe[];
}

// The deterministic fixture embedder maps these aliases onto a shared topic. Keeping the
// vocabulary beside the labels makes the controlled benchmark straightforward to audit.
export const EVAL_TOPIC_TERMS: Record<string, string[]> = {
  hobby: ['hiking', 'trail', 'outdoor', 'weekend'],
  pet: ['pet', 'cat', 'kitten'],
  job: ['work', 'job', 'engineer', 'developer'],
  food: ['spicy', 'dish', 'chili'],
  hometown: ['hometown', 'suzhou', 'grew up'],
  city: ['live now', 'living', 'singapore', 'current city'],
  presentation: ['presentation', 'public speaking', 'slides'],
  travel: ['travel', 'japan', 'tokyo', 'spring trip'],
  sibling: ['sibling', 'brother', 'family'],
  music: ['music', 'jazz', 'saxophone'],
  sport: ['sport', 'badminton', 'racket'],
  books: ['book', 'books', 'novel', 'science fiction'],
  cooking: ['cook', 'baking', 'sourdough', 'bread'],
  schedule: ['tuesday', 'yoga', 'weekly routine'],
  education: ['degree', 'study', 'computer science', 'university'],
  company: ['company', 'startup', 'fintech', 'employer'],
  birthday: ['birthday', 'october', 'born'],
  allergy: ['allergy', 'allergic', 'peanut', 'peanuts'],
  drink: ['drink', 'latte', 'oat milk', 'coffee'],
  project: ['project', 'mobile app', 'application'],
  interview: ['interview', 'friday', 'hiring'],
  neighborhood: ['neighborhood', 'clementi', 'apartment'],
  volunteer: ['volunteer', 'shelter', 'charity'],
  learning: ['learn', 'examples', 'practice', 'learning preference'],
};

const LEGACY_SMALL: EvalDataset = {
  id: 'default',
  defaultK: 3,
  description: 'Legacy smoke fixture with four topical facts, four distractors, and one summary.',
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

const oldTargets: EvalCorpusItem[] = [
  { key: 'target-pet', kind: 'fact', predicate: 'has_pet', value: 'a rescued cat named Miso' },
  { key: 'target-job', kind: 'fact', predicate: 'works_as', value: 'a backend software engineer' },
  { key: 'target-hobby', kind: 'fact', predicate: 'likes', value: 'hiking on forest trails' },
  { key: 'target-food', kind: 'fact', predicate: 'dislikes', value: 'very spicy chili dishes' },
  { key: 'target-hometown', kind: 'fact', predicate: 'grew_up_in', value: 'Suzhou' },
  { key: 'target-city', kind: 'fact', predicate: 'lives_in', value: 'Singapore' },
  { key: 'target-presentation', kind: 'fact', predicate: 'learning_goal', value: 'confident public speaking and presentations' },
  { key: 'target-travel', kind: 'fact', predicate: 'plans_to_visit', value: 'Japan during the spring trip' },
];

const middleTargets: EvalCorpusItem[] = [
  { key: 'target-sibling', kind: 'fact', predicate: 'has_sibling', value: 'a younger brother' },
  { key: 'target-music', kind: 'fact', predicate: 'likes_music', value: 'jazz and saxophone records' },
  { key: 'target-sport', kind: 'fact', predicate: 'plays', value: 'badminton regularly' },
  { key: 'target-books', kind: 'fact', predicate: 'reads', value: 'science fiction novels' },
  { key: 'target-cooking', kind: 'fact', predicate: 'is_learning', value: 'baking sourdough bread' },
  { key: 'target-schedule', kind: 'fact', predicate: 'weekly_routine', value: 'yoga on Tuesday evenings' },
  { key: 'target-education', kind: 'fact', predicate: 'studied', value: 'computer science at university' },
  { key: 'target-company', kind: 'fact', predicate: 'works_at', value: 'a small fintech startup' },
];

const recentTargets: EvalCorpusItem[] = [
  { key: 'target-birthday', kind: 'fact', predicate: 'birthday_month', value: 'October' },
  { key: 'target-allergy', kind: 'fact', predicate: 'is_allergic_to', value: 'peanuts' },
  { key: 'target-drink', kind: 'fact', predicate: 'favorite_drink', value: 'an oat milk latte' },
  { key: 'target-project', kind: 'fact', predicate: 'is_building', value: 'a mobile app project' },
  { key: 'target-interview', kind: 'fact', predicate: 'has_event', value: 'an interview on Friday' },
  { key: 'target-neighborhood', kind: 'fact', predicate: 'lives_near', value: 'an apartment near Clementi' },
  { key: 'target-volunteer', kind: 'fact', predicate: 'volunteers_at', value: 'a local animal shelter' },
  { key: 'target-learning', kind: 'fact', predicate: 'learns_best_with', value: 'concrete examples and repeated practice' },
];

const fillerValues = [
  'a red umbrella', 'bus route 96', 'an east-facing window', 'the number seven',
  'a blue notebook', 'a dentist appointment on Monday', 'a package in the lobby', 'a museum ticket',
  'a rainy morning', 'a low phone battery', 'a new desk lamp', 'a delayed train',
  'a green backpack', 'a nature documentary', 'a pot of basil', 'a flat bicycle tire',
  'a visiting cousin', 'a chess set', 'a lost scarf', 'a repaired keyboard',
  'new curtains', 'meeting room B', 'the winter season', 'a lemon recipe',
  'an expiring subway card', 'a camera lens', 'a desk on the third floor', 'an early bedtime',
  'new headphones', 'a postcard collection', 'a haircut appointment', 'a silver laptop',
];

const fillers: EvalCorpusItem[] = fillerValues.map((value, index) => ({
  key: `distractor-${index + 1}`,
  kind: 'fact',
  predicate: 'mentioned',
  value,
}));

const supportingSummaries: EvalCorpusItem[] = [
  { key: 'summary-pet', kind: 'summary', summary: 'They shared photos of their cat after adopting it.' },
  { key: 'summary-job', kind: 'summary', summary: 'They described a difficult backend engineering task at work.' },
  { key: 'summary-hobby', kind: 'summary', summary: 'They planned an outdoor hiking route for the weekend.' },
  { key: 'summary-food', kind: 'summary', summary: 'They asked for a dish without spicy chili.' },
  { key: 'summary-hometown', kind: 'summary', summary: 'They compared their current home with their hometown of Suzhou.' },
  { key: 'summary-city', kind: 'summary', summary: 'They discussed daily life while living in Singapore.' },
  { key: 'summary-presentation', kind: 'summary', summary: 'They practiced presentation slides and public speaking.' },
  { key: 'summary-travel', kind: 'summary', summary: 'They drafted a spring travel plan for Japan.' },
];

// 64 memories and 24 probes. Targets are distributed across old, middle, and recent positions;
// 8 topics have both a fact and supporting summary, and 32 unrelated memories act as distractors.
const EXPANDED: EvalDataset = {
  id: 'expanded-v1',
  defaultK: 5,
  description: 'Controlled synthetic benchmark with 24 topics, 32 distractors, and multi-evidence probes.',
  corpus: [
    ...oldTargets,
    ...fillers.slice(0, 12),
    ...middleTargets,
    ...supportingSummaries,
    ...fillers.slice(12, 24),
    ...recentTargets.flatMap((target, index) => [target, fillers[24 + index]]),
  ],
  probes: [
    { queryText: 'What pet did the learner adopt?', relevantKeys: ['target-pet', 'summary-pet'] },
    { queryText: 'What kind of developer job does the learner have?', relevantKeys: ['target-job', 'summary-job'] },
    { queryText: 'Which outdoor activity do they enjoy?', relevantKeys: ['target-hobby', 'summary-hobby'] },
    { queryText: 'Which kind of dish should be avoided?', relevantKeys: ['target-food', 'summary-food'] },
    { queryText: 'Where is the learner\'s hometown?', relevantKeys: ['target-hometown', 'summary-hometown'] },
    { queryText: 'What is their current city?', relevantKeys: ['target-city', 'summary-city'] },
    { queryText: 'Which public speaking skill are they improving?', relevantKeys: ['target-presentation', 'summary-presentation'] },
    { queryText: 'Where are they planning to travel in spring?', relevantKeys: ['target-travel', 'summary-travel'] },
    { queryText: 'Do they have a sibling?', relevantKeys: ['target-sibling'] },
    { queryText: 'What music do they listen to?', relevantKeys: ['target-music'] },
    { queryText: 'Which sport do they play?', relevantKeys: ['target-sport'] },
    { queryText: 'What kind of books do they read?', relevantKeys: ['target-books'] },
    { queryText: 'What are they learning to cook?', relevantKeys: ['target-cooking'] },
    { queryText: 'What happens in their Tuesday weekly routine?', relevantKeys: ['target-schedule'] },
    { queryText: 'What degree did they study at university?', relevantKeys: ['target-education'] },
    { queryText: 'What type of company employs them?', relevantKeys: ['target-company'] },
    { queryText: 'In which month is their birthday?', relevantKeys: ['target-birthday'] },
    { queryText: 'What allergy should we remember?', relevantKeys: ['target-allergy'] },
    { queryText: 'What is their usual coffee drink?', relevantKeys: ['target-drink'] },
    { queryText: 'What application project are they building?', relevantKeys: ['target-project'] },
    { queryText: 'When is the upcoming interview?', relevantKeys: ['target-interview'] },
    { queryText: 'Which neighborhood is their apartment near?', relevantKeys: ['target-neighborhood'] },
    { queryText: 'Where do they volunteer?', relevantKeys: ['target-volunteer'] },
    { queryText: 'What learning preference helps them practice?', relevantKeys: ['target-learning'] },
  ],
};

export const DATASETS: Record<string, EvalDataset> = {
  [LEGACY_SMALL.id]: LEGACY_SMALL,
  [EXPANDED.id]: EXPANDED,
};
export const DEFAULT_DATASET_ID = LEGACY_SMALL.id;
export const REPORT_DATASET_ID = EXPANDED.id;

export function getDataset(id?: string): EvalDataset {
  return (id && DATASETS[id]) || DATASETS[DEFAULT_DATASET_ID];
}
