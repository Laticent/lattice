// @vitest-environment node
// `@laticent/segno/read` is the reader alone: the SAME functions the main entry exports, so a
// consumer that takes the small entry parses and binds exactly what the main entry does.
import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as read from './read';

describe('the read entry', () => {
  it('re-exports the main entry\'s functions, not copies', () => {
    for (const name of Object.keys(read)) expect((read as Record<string, unknown>)[name]).toBe((main as Record<string, unknown>)[name]);
  });
  it('carries no part of the grammar compiler', () => {
    for (const name of ['compile', 'generate', 'consistency', 'lint']) expect(name in read).toBe(false);
  });
  it('parses and binds', () => {
    const slot = read.record({ positional: [{ name: 'n', type: read.number() }], params: { tone: read.oneOf(['tag', 'pill']) } });
    const b = slot.read('{3, tag}');
    expect(b.ok).toBe(true);
    expect(b.ok && b.value.tone).toBe('tag');
  });
});
