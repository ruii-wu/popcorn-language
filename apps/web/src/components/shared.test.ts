import { describe, expect, it } from 'vitest';
import { filterConversations, filterSectionNavItems } from './shared';

const conversations = [
  { id: 'lily', name: 'Lily', relationship: 'close', lastPreview: 'Coffee after work?' },
  { id: 'chen', name: 'Mr. Chen', relationship: 'friend', lastPreview: 'Review the proposal' },
  { id: 'emma', name: 'Emma', relationship: 'friend', lastPreview: 'Mochi missed you' },
];

describe('filterConversations', () => {
  it('matches NPC names case-insensitively', () => {
    expect(filterConversations(conversations, 'EMMA').map((npc) => npc.id)).toEqual(['emma']);
  });

  it('matches recent messages and relationship labels', () => {
    expect(filterConversations(conversations, 'coffee').map((npc) => npc.id)).toEqual(['lily']);
    expect(filterConversations(conversations, 'close friend').map((npc) => npc.id)).toEqual(['lily']);
  });

  it('returns the full list for a blank query', () => {
    expect(filterConversations(conversations, '  ')).toEqual(conversations);
  });
});

describe('filterSectionNavItems', () => {
  const items = [
    { id: 'overview', label: 'Overview', description: 'Progress and relationships', icon: null },
    { id: 'learning', label: 'Learning', description: 'Focus skills and recommendations', icon: null },
  ];

  it('matches section labels and descriptions case-insensitively', () => {
    expect(filterSectionNavItems(items, 'LEARNING').map((item) => item.id)).toEqual(['learning']);
    expect(filterSectionNavItems(items, 'relationships').map((item) => item.id)).toEqual(['overview']);
  });

  it('returns all sections for a blank query', () => {
    expect(filterSectionNavItems(items, '  ')).toEqual(items);
  });
});
