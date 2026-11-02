// @vitest-environment node
import hljs from 'highlight.js';
import { describe, expect, it } from 'vitest';
import { splitCodeLines } from './index';

describe('splitCodeLines', () => {
  it('gives one balanced fragment per source line, even inside a multi-line token', () => {
    expect(splitCodeLines('<span class="hljs-string">"a\nb"</span>\nnext')).toEqual(['<span class="hljs-string">"a</span>', '<span class="hljs-string">b"</span>', 'next']);
  });
  it('re-opens every span that was open, in order', () => {
    expect(splitCodeLines('<span class="a"><span class="b">x\ny</span></span>')).toEqual(['<span class="a"><span class="b">x</span></span>', '<span class="a"><span class="b">y</span></span>']);
  });
  it('does not count a span that closes after the final newline as a line (every template language)', () => {
    expect(splitCodeLines('<span class="language-xml">a\nb\nc\n</span>')).toHaveLength(3);
    const html = hljs.highlight('<%= user.name %>\n<p>{{ title }}</p>\n<% end %>\n', { language: 'erb' }).value;
    expect(splitCodeLines(html)).toHaveLength(3);
  });
  it('treats the final newline as a terminator, not an empty extra line', () => {
    expect(splitCodeLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitCodeLines('a\n\n')).toEqual(['a', '']);
    expect(splitCodeLines('')).toEqual(['']);
  });
});
