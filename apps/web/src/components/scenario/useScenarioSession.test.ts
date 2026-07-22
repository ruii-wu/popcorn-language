import { describe, it, expect } from 'vitest';
import { choiceToTurnPayload, declinedReplyToCasualMessage } from './useScenarioSession';

describe('choiceToTurnPayload', () => {
  it('includes the selected text and tone with the choice id', () => {
    expect(choiceToTurnPayload({ id: 'c1', text: 'I am a developer.', tone: 'Confident' })).toEqual({
      text: 'I am a developer.',
      tone: 'Confident',
    });
  });
});

describe('declinedReplyToCasualMessage', () => {
  it('promotes a persisted decline reply into the casual timeline', () => {
    expect(declinedReplyToCasualMessage({
      id: 'npc-message-1',
      from: 'npc-c',
      text: 'No problem, we can keep chatting.',
      time: '14:30',
    })).toEqual({
      id: 'npc-message-1',
      from: 'npc',
      text: 'No problem, we can keep chatting.',
      time: '14:30',
      correction: null,
    });
  });

  it('does not persist a transient decline error as an NPC message', () => {
    expect(declinedReplyToCasualMessage({ from: 'system', text: 'Please try again.' })).toBeNull();
  });
});
