import { describe, expect, it } from 'vitest';
import { plainText, removeTags, stripTags } from './text';

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
    const t = performance.now();
    expect(removeTags(`${'<'.repeat(200000)}x`)).toBe(`${'<'.repeat(200000)}x`);
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe('stripTags and plainText', () => {
  it('fold &nbsp; and decode entities', () => {
    expect(stripTags('<p>a&nbsp;b</p>')).toBe('a b');
    expect(plainText('<b>Ops &amp; IT</b> &amp;lt;')).toBe('Ops & IT &lt;');
  });
});
