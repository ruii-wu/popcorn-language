import { describe, expect, it } from 'vitest';
import { choiceTextsFromJson, sanitizeScenarioChoices } from '@/server/scenario/choiceQuality';

describe('scenario choice quality', () => {
  it('removes duplicates within the current set and against earlier turns', () => {
    const choices = sanitizeScenarioChoices([
      { id: 'a', text: 'I can move in next Monday.', tone: 'Direct', desc: 'Answer clearly.' },
      { id: 'b', text: '  I can move in next Monday! ', tone: 'Friendly', desc: '' },
      { id: 'c', text: 'Could you confirm whether bills are included?', tone: 'Curious', desc: '' },
      { id: 'd', text: 'My budget is around eight hundred pounds.', tone: 'Practical', desc: '' },
    ], ['Could you confirm whether bills are included?']);

    expect(choices.map((choice) => choice.text)).toEqual([
      'I can move in next Monday.',
      'My budget is around eight hundred pounds.',
    ]);
  });

  it('repairs duplicate ids and safely reads persisted choice text', () => {
    const choices = sanitizeScenarioChoices([
      { id: 'same', text: 'First answer.', tone: 'Calm', desc: '' },
      { id: 'same', text: 'Second answer.', tone: 'Direct', desc: '' },
    ]);
    expect(choices.map((choice) => choice.id)).toEqual(['same', 'same-2']);
    expect(choiceTextsFromJson([
      JSON.stringify(choices),
      '{bad',
      null,
    ])).toEqual(['First answer.', 'Second answer.']);
  });

  it('keeps a complete current set when cross-turn filtering would leave too few cards', () => {
    const choices = sanitizeScenarioChoices([
      { id: 'a', text: 'I can move in next Monday.', tone: 'Direct', desc: '' },
      { id: 'b', text: 'Could you confirm whether bills are included?', tone: 'Curious', desc: '' },
      { id: 'c', text: 'What are the usual quiet hours?', tone: 'Practical', desc: '' },
    ], [
      'I can move in next Monday.',
      'Could you confirm whether bills are included?',
    ], 3);

    expect(choices).toHaveLength(3);
  });
});
