import { describe, expect, it } from 'vitest';
import { mergeProfileOptions, toggleProfileInterest } from './profileOptions';

describe('profile options', () => {
  it('keeps custom interests while matching built-ins case-insensitively', () => {
    expect(mergeProfileOptions(['Coffee', 'Cats'], ['coffee', 'hiking'])).toEqual([
      'Coffee',
      'Cats',
      'hiking',
    ]);
  });

  it('toggles an existing interest without changing its stored casing', () => {
    expect(toggleProfileInterest(['coffee', 'hiking'], 'Coffee')).toEqual(['hiking']);
  });

  it('does not add more than five interests', () => {
    expect(toggleProfileInterest(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
