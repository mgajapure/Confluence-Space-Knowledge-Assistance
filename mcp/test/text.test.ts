import { describe, expect, it } from 'vitest';
import { storageToText, truncateText } from '../src/confluence/text.js';

describe('storageToText', () => {
  it('converts basic Confluence storage markup into readable text', () => {
    const html = '<h2>WLTP</h2><p>Hello &amp; welcome</p><ul><li>One</li><li>Two</li></ul>';
    const text = storageToText(html);
    expect(text).toContain('WLTP');
    expect(text).toContain('Hello & welcome');
    expect(text).toContain('- One');
    expect(text).toContain('- Two');
  });
});

describe('truncateText', () => {
  it('marks truncated content', () => {
    const result = truncateText('1234567890', 5);
    expect(result.truncated).toBe(true);
    expect(result.text.startsWith('12345')).toBe(true);
  });
});
