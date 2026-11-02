// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeHtml } from './index';

describe('escapeHtml / escapeAttr', () => {
  it('escapes element text, leaving quotes', () => {
    expect(escapeHtml('a < b && c > "d"')).toBe('a &lt; b &amp;&amp; c &gt; "d"');
  });
  it('escapes an attribute value, quotes included', () => {
    expect(escapeAttr('x="1" & <y>')).toBe('x=&quot;1&quot; &amp; &lt;y&gt;');
  });
  it('never escapes an entity twice, and reads any value as text', () => {
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeAttr(42)).toBe('42');
    expect(escapeHtml(null)).toBe('null');
  });
  it('matches the chained replaces it stands in for', () => {
    const chained = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    for (const s of ['', '&<>"\'', 'plain', '<<&&>>', '&lt;']) {
      expect(escapeHtml(s)).toBe(chained(s));
      expect(escapeAttr(s)).toBe(chained(s).replace(/"/g, '&quot;'));
    }
  });
});
