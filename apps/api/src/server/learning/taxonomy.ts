// Fixed learning-skill taxonomy. Skill codes are stable ids used across LearningSignal,
// ScenarioTemplate.targetSkills, and the learner-model API. LLM outputs are validated
// against this list — unknown codes are dropped rather than silently creating new skills.

export type SkillCategory = 'grammar' | 'vocabulary' | 'pragmatics' | 'interaction';

export interface Skill {
  code: string;
  category: SkillCategory;
  labelEn: string;
  labelZh: string;
  cefrHint: 'A2' | 'B1' | 'B2' | 'C1';
}

export const SKILLS: Skill[] = [
  // grammar (10)
  { code: 'grammar.past_tense', category: 'grammar', labelEn: 'Past tense', labelZh: '过去时', cefrHint: 'A2' },
  { code: 'grammar.articles', category: 'grammar', labelEn: 'Articles', labelZh: '冠词', cefrHint: 'A2' },
  { code: 'grammar.modal_verbs', category: 'grammar', labelEn: 'Modal verbs', labelZh: '情态动词', cefrHint: 'B1' },
  { code: 'grammar.conditionals', category: 'grammar', labelEn: 'Conditionals', labelZh: '条件句', cefrHint: 'B1' },
  { code: 'grammar.tense_sequence', category: 'grammar', labelEn: 'Tense sequence', labelZh: '时态一致', cefrHint: 'B1' },
  { code: 'grammar.prepositions', category: 'grammar', labelEn: 'Prepositions', labelZh: '介词', cefrHint: 'A2' },
  { code: 'grammar.subject_verb_agreement', category: 'grammar', labelEn: 'Subject-verb agreement', labelZh: '主谓一致', cefrHint: 'A2' },
  { code: 'grammar.plurals', category: 'grammar', labelEn: 'Plurals', labelZh: '复数形式', cefrHint: 'A2' },
  { code: 'grammar.relative_clauses', category: 'grammar', labelEn: 'Relative clauses', labelZh: '关系从句', cefrHint: 'B2' },
  { code: 'grammar.gerunds_infinitives', category: 'grammar', labelEn: 'Gerunds & infinitives', labelZh: '动名词与不定式', cefrHint: 'B1' },
  // vocabulary (6)
  { code: 'vocabulary.workplace', category: 'vocabulary', labelEn: 'Workplace vocabulary', labelZh: '职场词汇', cefrHint: 'B1' },
  { code: 'vocabulary.interview', category: 'vocabulary', labelEn: 'Interview vocabulary', labelZh: '面试词汇', cefrHint: 'B1' },
  { code: 'vocabulary.marketing', category: 'vocabulary', labelEn: 'Marketing vocabulary', labelZh: '市场营销词汇', cefrHint: 'B2' },
  { code: 'vocabulary.social_casual', category: 'vocabulary', labelEn: 'Casual social vocabulary', labelZh: '日常社交词汇', cefrHint: 'A2' },
  { code: 'vocabulary.food_daily', category: 'vocabulary', labelEn: 'Food & daily life vocabulary', labelZh: '饮食与生活词汇', cefrHint: 'A2' },
  { code: 'vocabulary.academic', category: 'vocabulary', labelEn: 'Academic vocabulary', labelZh: '学术词汇', cefrHint: 'B2' },
  // pragmatics (8)
  { code: 'pragmatics.polite_disagreement', category: 'pragmatics', labelEn: 'Polite disagreement', labelZh: '礼貌反对', cefrHint: 'B2' },
  { code: 'pragmatics.hedging', category: 'pragmatics', labelEn: 'Hedging', labelZh: '委婉表达', cefrHint: 'B1' },
  { code: 'pragmatics.formal_register', category: 'pragmatics', labelEn: 'Formal register', labelZh: '正式语体', cefrHint: 'B1' },
  { code: 'pragmatics.small_talk', category: 'pragmatics', labelEn: 'Small talk', labelZh: '寒暄', cefrHint: 'A2' },
  { code: 'pragmatics.apology', category: 'pragmatics', labelEn: 'Apologies', labelZh: '致歉', cefrHint: 'A2' },
  { code: 'pragmatics.making_requests', category: 'pragmatics', labelEn: 'Making requests', labelZh: '提出请求', cefrHint: 'B1' },
  { code: 'pragmatics.giving_feedback', category: 'pragmatics', labelEn: 'Giving feedback', labelZh: '给予反馈', cefrHint: 'B2' },
  { code: 'pragmatics.expressing_uncertainty', category: 'pragmatics', labelEn: 'Expressing uncertainty', labelZh: '表达不确定', cefrHint: 'B1' },
  // interaction (6)
  { code: 'interaction.self_introduction', category: 'interaction', labelEn: 'Self-introduction', labelZh: '自我介绍', cefrHint: 'A2' },
  { code: 'interaction.describing_experience', category: 'interaction', labelEn: 'Describing experience', labelZh: '描述经历', cefrHint: 'B1' },
  { code: 'interaction.expressing_opinion', category: 'interaction', labelEn: 'Expressing opinion', labelZh: '表达观点', cefrHint: 'B1' },
  { code: 'interaction.narration', category: 'interaction', labelEn: 'Narration', labelZh: '叙事', cefrHint: 'B1' },
  { code: 'interaction.clarification', category: 'interaction', labelEn: 'Asking for clarification', labelZh: '请求澄清', cefrHint: 'A2' },
  { code: 'interaction.turn_taking', category: 'interaction', labelEn: 'Turn-taking', labelZh: '话轮转换', cefrHint: 'B1' },
];

const SKILL_MAP = new Map(SKILLS.map((s) => [s.code, s]));

export function isSkillCode(code: unknown): code is string {
  return typeof code === 'string' && SKILL_MAP.has(code);
}

export function getSkill(code: string): Skill | null {
  return SKILL_MAP.get(code) ?? null;
}

export const CEFR_LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === 'string' && (CEFR_LEVELS as readonly string[]).includes(value);
}

// Numeric prior for bootstrapping mastery when no signals exist. Maps the gap between
// the user's self-reported CEFR and the skill's expected CEFR to a starting level.
const CEFR_ORDER: Record<CefrLevel, number> = { A2: 1, B1: 2, B2: 3, C1: 4 };

export function initialLevelFromCefr(userCefr: string | null | undefined, skillCefr: CefrLevel): number {
  if (!isCefrLevel(userCefr)) return 0.5; // neutral prior
  const gap = CEFR_ORDER[userCefr] - CEFR_ORDER[skillCefr];
  if (gap >= 2) return 0.75;
  if (gap === 1) return 0.65;
  if (gap === 0) return 0.5;
  if (gap === -1) return 0.35;
  return 0.25;
}
