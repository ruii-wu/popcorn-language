export interface NpcPromptInfo {
  name: string;
  personaPrompt: string;
  languageProfile: { primary: string; occasional: string[]; register: string };
}

export interface PromptContext {
  npc: NpcPromptInfo;
  userProfile?: { role?: string | null; goal?: string | null; interests?: string[] };
  relationshipStage?: 'acquaintance' | 'friend' | 'close';
  facts?: string[];
  recentSummary?: string;
  userLanguage: string; // 'zh-CN' | 'en-US'
  mode: 'casual' | 'scenario';
  scenario?: { roleName: string; instructions: string };
}
