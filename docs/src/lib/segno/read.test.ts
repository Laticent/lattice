// @vitest-environment node
// `@laticent/segno/read` is the reader alone: the main entry's functions re-exported from the same
// source, so a consumer that takes the small entry parses and binds exactly what the main entry
// does. This runs against the TypeScript sources, where they are one module; each BUILT entry
// (dist/*.cjs) bundles its own copy, so lib/ never compares values across entries by identity.
import { describe, expect, it } from 'vitest';
import * as main from './index';
import * as read from './read';

describe('the read entry', () => {
  it('re-exports the main entry\'s functions from the same source', () => {
    for (const name of Object.keys(read)) expect((read as Record<string, unknown>)[name]).toBe((main as Record<string, unknown>)[name]);
  });
  it('carries no part of the grammar compiler', () => {
    for (const name of ['compile', 'generate', 'lint']) expect(name in read).toBe(false);
  });
  it('carries the per-document consistency check, which reads binds and builds nothing', () => {
    expect(read.consistency).toBe(main.consistency);
  });
  it('parses and binds', () => {
    const slot = read.record({ positional: [{ name: 'n', type: read.number() }], params: { tone: read.oneOf(['tag', 'pill']) } });
    const b = slot.read('{3, tag}');
    expect(b.ok).toBe(true);
    expect(b.ok && b.value.tone).toBe('tag');
  });
});
