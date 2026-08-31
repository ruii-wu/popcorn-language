import type { ScenarioChoice } from '@popcorn/shared';
import { ChoiceSchema } from './schemas';

export interface SanitizedScenarioChoice {
  id: string;
  text: string;
  tone: string;
  desc: string;
}

function canonicalText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isNearDuplicate(left: string, right: string): boolean {
  const a = canonicalText(left);
  const b = canonicalText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 12 && (a.includes(b) || b.includes(a))) return true;

  const aTokens = new Set(a.split(' '));
  const bTokens = new Set(b.split(' '));
  if (Math.min(aTokens.size, bTokens.size) < 4) return false;
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap / Math.min(aTokens.size, bTokens.size) >= 0.8;
}

export function sanitizeScenarioChoices(
  choices: ScenarioChoice[],
  previousChoiceTexts: string[] = [],
  minimumCount = 0,
): SanitizedScenarioChoice[] {
  const candidates: SanitizedScenarioChoice[] = [];
  const seenIds = new Set<string>();

  for (const [index, choice] of choices.entries()) {
    const text = choice.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (candidates.some((prior) => isNearDuplicate(text, prior.text))) {
      continue;
    }

    const baseId = choice.id.trim() || `choice-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (seenIds.has(id)) id = `${baseId}-${suffix++}`;
    seenIds.add(id);

    candidates.push({
      id,
      text,
      tone: (choice.tone ?? '').replace(/\s+/g, ' ').trim(),
      desc: (choice.desc ?? '').replace(/\s+/g, ' ').trim(),
    });
    if (candidates.length === 3) break;
  }

  const fresh = candidates.filter((choice) => (
    !previousChoiceTexts.some((prior) => isNearDuplicate(choice.text, prior))
  ));
  // Cross-turn repetition is primarily prevented by the prompt. Never collapse a
  // complete current set just because the local model reused older wording.
  return candidates.length >= minimumCount && fresh.length < minimumCount ? candidates : fresh;
}

export function choiceTextsFromJson(values: Array<string | null | undefined>): string[] {
  return values.flatMap((raw) => {
    if (!raw) return [];
    try {
      const parsed = ChoiceSchema.array().safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data.map((choice) => choice.text) : [];
    } catch {
      return [];
    }
  });
}
