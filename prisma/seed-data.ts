export interface NpcSeed {
  id: string; name: string; avatarGlyph: string; avatarBg: string; avatarInk: string;
  shortBio: string; personaPrompt: string;
  languageProfile: { primary: string; occasional: string[]; register: string };
  topicInterests: string[];
  scenarioRoles: { id: string; name: string; voice: string; defaultStress: string }[];
  introMessage: string;
}

export const NPCS: NpcSeed[] = [
  {
    id: 'lily', name: 'Lily', avatarGlyph: '☕', avatarBg: '#D5F2DC', avatarInk: '#15784A',
    shortBio: 'Brooklyn barista, 24',
    personaPrompt:
      'You are Lily, a friendly 24-year-old coffee-shop barista in Brooklyn. You are warm, casual, and use light NYC slang. You know a handful of Chinese words but answer in English. You previously worked in HR.',
    languageProfile: { primary: 'en', occasional: ['zh'], register: 'casual' },
    topicInterests: ['coffee', 'food', 'neighborhoods', 'daily life', 'interview'],
    scenarioRoles: [{ id: 'hr_manager', name: 'Linda', voice: 'professional, probing', defaultStress: 'Medium' }],
    introMessage: "hey! welcome in. you look new — what can i get started for you today? we've got a really good oat milk latte if you want a rec ☕",
  },
  {
    id: 'chen', name: 'Mr. Chen', avatarGlyph: '陈', avatarBg: 'oklch(0.93 0.02 250)', avatarInk: 'oklch(0.40 0.06 250)',
    shortBio: 'Bilingual senior coworker',
    personaPrompt:
      'You are Mr. Chen, a bilingual senior coworker and mentor figure. You are professional, measured, and supportive. You comfortably switch between English and Chinese.',
    languageProfile: { primary: 'en', occasional: ['zh'], register: 'professional' },
    topicInterests: ['work', 'career', 'projects', 'planning'],
    scenarioRoles: [{ id: 'manager', name: 'Mr. Chen', voice: 'measured, senior', defaultStress: 'Low' }],
    introMessage: 'Glad to have you on the team. Let me know when you have a moment to sync.',
  },
  {
    id: 'emma', name: 'Emma', avatarGlyph: 'E', avatarBg: 'oklch(0.93 0.04 340)', avatarInk: 'oklch(0.48 0.10 340)',
    shortBio: 'UK university student',
    personaPrompt:
      'You are Emma, an energetic UK university student. You are chatty, playful, and use British expressions. You speak English only.',
    languageProfile: { primary: 'en', occasional: [], register: 'casual' },
    topicInterests: ['cats', 'music', 'movies', 'student life'],
    scenarioRoles: [{ id: 'flat_host', name: 'Emma', voice: 'chatty, friendly, British', defaultStress: 'Low' }],
    introMessage: 'oi hello!! you new here? tell me everything — and do you have a cat',
  },
];

export interface ScenarioTemplateSeed {
  id: string; title: string; titleZh?: string; npcId: string; rolePlayedBy: string;
  minStage: string; estimatedMinutes: number; estimatedTurns: number;
  registerTags: string[]; systemPrompt: string; topicKeywords: string[]; enabled: boolean;
}

export const SCENARIO_TEMPLATES: ScenarioTemplateSeed[] = [
  {
    id: 'mock_interview', title: 'Mock Interview', titleZh: '模拟面试',
    npcId: 'lily', rolePlayedBy: 'hr_manager', minStage: 'friend',
    estimatedMinutes: 8, estimatedTurns: 6,
    registerTags: ['Formal register', 'Polite hedging'],
    systemPrompt:
      'Roleplay: you are Linda, a tough but fair HR manager interviewing the user for a junior marketing role. Ask probing questions, test composure under pressure, and stay in character. Keep each reply to 1-3 sentences.',
    topicKeywords: ['interview', 'job', 'hr', 'hiring', 'role', 'application'],
    enabled: true,
  },
  {
    id: 'flat_viewing', title: 'Flat Viewing', titleZh: '租房看房',
    npcId: 'emma', rolePlayedBy: 'flat_host', minStage: 'friend',
    estimatedMinutes: 6, estimatedTurns: 5,
    registerTags: ['Everyday register', 'Polite questions'],
    systemPrompt:
      'Roleplay: you are Emma, a current tenant showing the user a spare room in your shared flat. Be friendly but practical — describe the room, ask about their budget, move-in date, and living habits, and answer questions about rent, bills, and the area. Stay in character with light British expressions. Keep each reply to 1-3 sentences.',
    topicKeywords: ['flat', 'apartment', 'rent', 'room', 'viewing', 'move', 'flatmate', 'housing', 'lease', 'tenant'],
    enabled: true,
  },
];

export interface AchievementSeed {
  id: string; title: string; description: string; icon?: string; rule: string; ruleConfig?: Record<string, unknown>;
}

export const ACHIEVEMENTS: AchievementSeed[] = [
  { id: 'first_chat', title: 'First Chat', description: 'Finish your first conversation with any NPC.', rule: 'first_chat' },
  { id: 'three_friends', title: 'Three Friends', description: 'Reach Friend stage with all 3 NPCs.', rule: 'all_npcs_friend' },
  { id: 'scenario_survivor', title: 'Scenario Survivor', description: 'Complete your first scenario.', rule: 'first_scenario_completed' },
  { id: 'polite_mode', title: 'Polite Mode', description: 'Score B or above in a scenario.', rule: 'scenario_grade_min', ruleConfig: { minGrade: 'B' } },
  { id: 'bilingual', title: 'Bilingual', description: 'Use both Chinese and English in one conversation.', rule: 'bilingual_message' },
  { id: 'streak_week', title: 'Streak Week', description: 'Chat on 7 consecutive days.', rule: 'streak_days', ruleConfig: { days: 7 } },
];
