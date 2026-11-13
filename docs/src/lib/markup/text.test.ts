import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { plainText, removeTags, stripTags } from './text';

// The root's work counter (test/helpers/work-count.js), CommonJS.
const { charReads } = createRequire(import.meta.url)('../../../../test/helpers/work-count.js') as {
  charReads: <T>(fn: () => T) => { result: T; scanned: number; reads: number };
};

describe('removeTags', () => {
  it('removes tags, to a fixed point', () => {
    expect(removeTags('<b>a</b> <i>b</i>')).toBe('a b');
    expect(removeTags('<scr<script>ipt>x')).toBe('ipt>x');
    expect(removeTags('<span title="a > b">x</span>')).toBe(' b">x');
  });
  it('keeps what is not a tag', () => {
    expect(removeTags('a < b')).toBe('a < b');
    expect(removeTags('<>')).toBe('<>');
    expect(removeTags('a <b')).toBe('a <b');
    expect(removeTags('x > y')).toBe('x > y');
  });
  it('is linear on many unclosed <', () => {
    // The work is counted, not timed (HARD RULE #32, F1): every character searched, sliced or read by code. Once no
    // `>` remains, no later `<` can open a tag; a search for `>` from every `<` would read n / 2 per character.
    const src = `${'<'.repeat(200000)}x`;
    const w = charReads(() => removeTags(src));
    expect(w.result).toBe(src);
    expect(w.reads + w.scanned, `${w.reads + w.scanned} for ${src.length} characters`).toBeLessThan(8 * src.length); // 2.0x measured
  });
});

describe('stripTags and plainText', () => {
  it('fold &nbsp; and decode entities', () => {
    expect(stripTags('<p>a&nbsp;b</p>')).toBe('a b');
    expect(plainText('<b>Ops &amp; IT</b> &amp;lt;')).toBe('Ops & IT &lt;');
  });
});
