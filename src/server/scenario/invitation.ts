// src/server/scenario/invitation.ts
import type { TriggerRationale } from './trigger';

export interface InvitationDraft {
  title: string;
  detail: string;
  estMinutes: number;
  rationale: string;
}

interface TemplateLike {
  title: string;
  titleZh?: string | null;
  estimatedMinutes: number;
  registerTags: string; // JSON string[]
}

export function buildInvitationDraft(template: TemplateLike, rationale: TriggerRationale): InvitationDraft {
  let tagList: string[] = [];
  try {
    tagList = JSON.parse(template.registerTags) as string[];
  } catch {
    tagList = [];
  }
  const tags = tagList.join(', ');
  return {
    title: template.title,
    detail: `A short roleplay to practise: ${tags || 'real-world register'}.`,
    estMinutes: template.estimatedMinutes,
    rationale: `You mentioned "${rationale.topicMatch}" — want to try this while we're on the topic?`,
  };
}

export function invitationText(template: TemplateLike): string {
  return `Hey — want to try a "${template.title}" with me? I'll stay in character, it's about ${template.estimatedMinutes} minutes. Totally optional — just say the word.`;
}
