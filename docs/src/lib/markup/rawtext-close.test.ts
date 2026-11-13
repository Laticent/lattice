import MarkdownIt from 'markdown-it';
import { describe, expect, it } from 'vitest';
import { RAWTEXT_CLOSE, tolerateRawtextClose } from './rawtext-close';

const hrCount = (md: MarkdownIt, src: string) => md.parse(src, {}).filter((t) => t.type === 'hr').length;

describe('tolerateRawtextClose (#2052)', () => {
  it('ends a RAWTEXT block on `</name >`, so the next separator is a separator', () => {
    const src = '<style>\na{}\n</style >\n\n---\n\nnext\n';
    expect(hrCount(new MarkdownIt('commonmark', { html: true }), src)).toBe(0);
    expect(hrCount(tolerateRawtextClose(new MarkdownIt('commonmark', { html: true })), src)).toBe(1);
  });

  it('accepts only the HTML end-tag whitespace before `>`', () => {
    for (const ok of ['</style>', '</pre >', '</textarea\t>', '</SCRIPT\f>']) expect(RAWTEXT_CLOSE.test(ok)).toBe(true);
    for (const no of ['</style >', '</style >', '</style x>']) expect(RAWTEXT_CLOSE.test(no)).toBe(false);
  });
});
