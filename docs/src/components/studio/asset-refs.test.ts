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

describe('what the checker found', () => {
  it('an unmatched backtick does not hide a real image in a later paragraph', () => {
    const md = 'Type a ` to start code.\n\n![](asset:hero)\n\nAnd another ` here.\n';
    expect(R(md)).toBe('Type a ` to start code.\n\n![](asset:cover)\n\nAnd another ` here.\n');
    expect(decksUsingOutsideCode('hero', [md])).toBe(1);
  });

  it('leaves a top-level indented code block alone, but not an indented paragraph inside a list', () => {
    expect(R('Para\n\n    ![](asset:hero)\n')).toBe('Para\n\n    ![](asset:hero)\n');
    expect(R('Para\n\n\t![](asset:hero)\n')).toBe('Para\n\n\t![](asset:hero)\n');
    const list = '- item\n\n    ![](asset:hero)\n';
    expect(R(list)).toBe('- item\n\n    ![](asset:cover)\n');
    // The indented run ends at the next unindented line.
    expect(R('Para\n\n    code ![](asset:hero)\n    more\n\nBack ![](asset:hero)\n')).toBe('Para\n\n    code ![](asset:hero)\n    more\n\nBack ![](asset:cover)\n');
  });

  it('leaves a fence inside a list item alone, at any indentation', () => {
    expect(R('- item\n\n      ~~~\n      ![](asset:hero)\n      ~~~\n\n![](asset:hero)\n')).toBe('- item\n\n      ~~~\n      ![](asset:hero)\n      ~~~\n\n![](asset:cover)\n');
    expect(R('1. step\n   ~~~md\n   ![](asset:hero)\n   ~~~\n')).toBe('1. step\n   ~~~md\n   ![](asset:hero)\n   ~~~\n');
  });

  it('leaves an HTML pre, script, style or textarea block alone, up to the line holding its closing tag, blank lines included', () => {
    // CommonMark: the block starts at a line beginning with the tag and ends at the line that holds the closing tag.
    expect(R('<pre>![](asset:hero)</pre> ![](asset:hero)')).toBe('<pre>![](asset:hero)</pre> ![](asset:hero)');
    expect(R('<pre>\nline\n\nasset:hero\n\n</pre>\n![](asset:hero)')).toBe('<pre>\nline\n\nasset:hero\n\n</pre>\n![](asset:cover)');
    expect(R('<script>\nvar a = "asset:hero"\n</script>\n![](asset:hero)')).toBe('<script>\nvar a = "asset:hero"\n</script>\n![](asset:cover)');
    expect(R('<STYLE>\n/* asset:hero */\n</STYLE>\n![](asset:hero)')).toBe('<STYLE>\n/* asset:hero */\n</STYLE>\n![](asset:cover)');
    expect(R('<pre> never closed\n![](asset:hero)')).toBe('<pre> never closed\n![](asset:hero)');
  });

  it('does NOT treat an inline <code> or a mid-sentence <pre> as code: markdown inside it still renders', () => {
    expect(R('See <code>![](asset:hero)</code> here')).toBe('See <code>![](asset:cover)</code> here');
    expect(R('Text <pre>![](asset:hero)</pre> more')).toBe('Text <pre>![](asset:cover)</pre> more');
    expect(R('<prefix>![](asset:hero)</prefix>')).toBe('<prefix>![](asset:cover)</prefix>');
  });

  it('runs in linear time on hostile input', () => {
    const N = 120_000;
    const cases = ['`'.repeat(1) + 'a'.repeat(3) + '``'.repeat(1), '`a``b```c````d'.repeat(Math.floor(N / 14)), '<pre'.repeat(N / 4), '<code>x</code>'.repeat(N / 14), '- ```\n'.repeat(N / 6), '![](asset:hero) `'.repeat(N / 17), '\n\n    x'.repeat(N / 8)];
    for (const c of cases) {
      const start = performance.now();
      R(c);
      decksUsingOutsideCode('hero', [c]);
      expect(performance.now() - start, c.slice(0, 20)).toBeLessThan(800);
    }
  });
});

describe('what the second check found', () => {
  it('a backtick in one list item does not hide a reference in the next', () => {
    const md = '- Press ` to start\n- ![](asset:hero)\n- end ` here\n';
    expect(R(md)).toBe('- Press ` to start\n- ![](asset:cover)\n- end ` here\n');
    expect(decksUsingOutsideCode('hero', [md])).toBe(1);
  });

  it('a heading ends an inline code span', () => {
    const md = '# Use ` key\n![](asset:hero) and ` more\n';
    expect(R(md)).toBe('# Use ` key\n![](asset:cover) and ` more\n');
    expect(decksUsingOutsideCode('hero', [md])).toBe(1);
  });

  it('a quote and a rule end an inline code span too', () => {
    expect(R('> a ` b\n![](asset:hero)\n> c ` d\n')).toBe('> a ` b\n![](asset:cover)\n> c ` d\n');
    expect(R('x `\n***\n![](asset:hero) `\n')).toBe('x `\n***\n![](asset:cover) `\n');
  });

  it('a fence opened in a list item ends with the item, so a later paragraph is prose', () => {
    expect(R('- item\n  ```\n  asset:hero\n\nNext para ![](asset:hero)\n')).toBe('- item\n  ```\n  asset:hero\n\nNext para ![](asset:cover)\n');
    // And the sample inside it is still left alone.
    expect(R('- item\n  ```\n  ![](asset:hero)\n  ```\n')).toBe('- item\n  ```\n  ![](asset:hero)\n  ```\n');
  });

  it('an indented fence-looking line after paragraph text is text, not a fence', () => {
    expect(R('Some text\n    ```\n![](asset:hero)\n')).toBe('Some text\n    ```\n![](asset:cover)\n');
  });

  it('survives a block of a hundred and fifty thousand lines with no blank line', () => {
    const md = `${'| a | b |\n'.repeat(150_000)}![](asset:hero)\n`;
    const out = R(md);
    expect(out.endsWith('![](asset:cover)\n')).toBe(true);
  });
});
