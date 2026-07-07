import { describe, it, expect } from 'vitest';
import { choiceToTurnPayload } from './useScenarioSession';

describe('choiceToTurnPayload', () => {
  it('includes the selected text and tone with the choice id', () => {
    expect(choiceToTurnPayload({ id: 'c1', text: 'I am a developer.', tone: 'Confident' })).toEqual({
      text: 'I am a developer.',
      tone: 'Confident',
    });
  });
});
