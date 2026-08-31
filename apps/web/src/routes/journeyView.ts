import type { RelationshipCard } from '@popcorn/shared';

export function countFriendships(relationships: RelationshipCard[]): number {
  return relationships.filter((relationship) =>
    relationship.stage === 'friend' || relationship.stage === 'close').length;
}

export function formatLastChat(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
