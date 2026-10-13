// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decksUsingOutsideCode, mapOutsideCode, renameAssetRefsOutsideCode, usesAssetOutsideCode } from './asset-refs';

const R = (s: string) => renameAssetRefsOutsideCode(s, 'hero', 'cover');

describe('renaming asset references', () => {
  it('rewrites a prose image, a background and a front-matter value', () => {
    expect(R('![](asset:hero)\n\n![bg](asset:hero)\n')).toBe('![](asset:cover)\n\n![bg](asset:cover)\n');
    expect(R('---\nlogo: asset:hero\n---\n')).toBe('---\nlogo: asset:cover\n---\n');
  });

  it('is case-insensitive, like the grammar, and whole-name only', () => {
    expect(R('![](asset:Hero) ![](asset:hero-2) ![](asset:hero_b) ![](asset:heroes)')).toBe('![](asset:cover) ![](asset:hero-2) ![](asset:hero_b) ![](asset:heroes)');
  });

  it('does not touch a name that is not a valid reference', () => {
    expect(R('![](asset:hero.jpg)')).toBe('![](asset:hero.jpg)');
    expect(R('Sentence ends with ![](asset:hero).')).toBe('Sentence ends with ![](asset:cover).');
  });

  it('leaves fenced code alone, with either mark and a longer closing fence', () => {
    const md = ['![](asset:hero)', '```md', '![](asset:hero)', '```', '~~~', '![](asset:hero)', '~~~~', '![](asset:hero)'].join('\n');
    // The tilde fence closes only at a tilde fence at least as long: `~~~~` closes `~~~`.
    expect(R(md)).toBe(['![](asset:cover)', '```md', '![](asset:hero)', '```', '~~~', '![](asset:hero)', '~~~~', '![](asset:cover)'].join('\n'));
  });

  it('keeps going through a fence that never closes, so nothing after it is rewritten', () => {
    expect(R('![](asset:hero)\n```\n![](asset:hero)\n')).toBe('![](asset:cover)\n```\n![](asset:hero)\n');
  });

  it('does not treat a backtick info string with a backtick as a fence', () => {
    expect(R('``` `x` \n![](asset:hero)\n')).toBe('``` `x` \n![](asset:cover)\n');
  });

  it('leaves inline code alone and rewrites around it', () => {
    expect(R('Write `asset:hero` to use it: ![](asset:hero)')).toBe('Write `asset:hero` to use it: ![](asset:cover)');
    expect(R('Double ``a `asset:hero` b`` then ![](asset:hero)')).toBe('Double ``a `asset:hero` b`` then ![](asset:cover)');
  });

  it('treats an unmatched backtick as plain text', () => {
    expect(R('a ` b ![](asset:hero)')).toBe('a ` b ![](asset:cover)');
  });

  it('returns a source with no asset reference unchanged, and never loses a character', () => {
    const md = 'plain\n\n```\ncode\n```\n';
    expect(R(md)).toBe(md);
    const messy = '  ```\r\nx\r\n  ```\n![](asset:hero) \n';
    expect(R(messy).replace('cover', 'hero')).toBe(messy);
  });
});

describe('counting decks that still use a name', () => {
  it('counts what renders and agrees exactly with what the rewrite changes', () => {
    const sources = ['![](asset:hero)', '`asset:hero` only in code', '```\nasset:hero\n```', 'no photos', '![](asset:hero-2)', '![](asset:HERO)'];
    expect(decksUsingOutsideCode('hero', sources)).toBe(2);
    for (const s of sources) expect(usesAssetOutsideCode(s, 'hero')).toBe(renameAssetRefsOutsideCode(s, 'hero', 'cover') !== s);
  });
});

describe('mapOutsideCode', () => {
  it('hands the function only prose', () => {
    const seen: string[] = [];
    mapOutsideCode('a\n```\nb\n```\nc `d` e', (p) => {
      seen.push(p);
      return p;
    });
    expect(seen).toEqual(['a', 'c ', ' e']);
  });
});
