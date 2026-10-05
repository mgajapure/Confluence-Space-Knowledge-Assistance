import { describe, expect, it } from 'vitest';
import { buildDescendantsCql, buildExactTitleCql, buildRecentCql, buildSearchCql, escapeCqlLiteral } from '../src/confluence/cql.js';

describe('CQL builder', () => {
  it('always scopes normal search to the configured space', () => {
    expect(buildSearchCql({ spaceKey: 'IFA', query: 'WLTP-V' })).toBe(
      'space = "IFA" AND type = page AND text ~ "WLTP-V"'
    );
  });

  it('escapes quotes and backslashes', () => {
    expect(escapeCqlLiteral('a"b\\c')).toBe('a\\"b\\\\c');
  });

  it('builds exact-title CQL', () => {
    expect(buildExactTitleCql('IFA', 'Home')).toBe('space = "IFA" AND type = page AND title = "Home"');
  });

  it('builds recent-update CQL', () => {
    expect(buildRecentCql('IFA', 7)).toContain('lastmodified >= now("-7d")');
  });

  it('builds descendant CQL using a numeric ancestor', () => {
    expect(buildDescendantsCql('IFA', '94450529')).toBe('space = "IFA" AND type = page AND ancestor = 94450529');
  });
});
