// @vitest-environment node
// The inline notation: three shapes, one separator, one escape, quotes that must close.
import { describe, expect, it } from 'vitest';
import { isDirective, MAX_NESTING, parse, type Value } from './notation';

const shape = (v: Value | null): unknown => {
  if (v === null) return null;
  if (v.kind === 'scalar') return v.quoted ? `"${v.text}"` : v.text;
  if (v.kind === 'list') return v.items.map(shape);
  return Object.fromEntries(v.items.map((it, k) => [it.name ?? `#${k}`, shape(it.value)]));
};
const read = (s: string) => {
  const p = parse(s);
  if (!p.ok) throw new Error(`${s}: ${p.diagnostic.message}`);
  return p.item.name ? { [p.item.name]: shape(p.item.value) } : shape(p.item.value);
};
const code = (s: string) => {
  const p = parse(s);
  return p.ok ? 'ok' : p.diagnostic.code;
};

describe('the three shapes', () => {
  it('a record: primary, bare words, name=value', () => {
    expect(read('{BETA, tag, c4}')).toEqual({ '#0': 'BETA', '#1': 'tag', '#2': 'c4' });
    expect(read('{BETA, shape=tag}')).toEqual({ '#0': 'BETA', shape: 'tag' });
  });
  it('a list, with empty elements holding their place', () => {
    expect(read('[Effort, Reach]')).toEqual(['Effort', 'Reach']);
    expect(read('[, Reach]')).toEqual([null, 'Reach']);
    expect(read('[a,,b,]')).toEqual(['a', null, 'b']);
    expect(read('[{Effort, 0..10, 5}, Reach]')).toEqual([{ '#0': 'Effort', '#1': '0..10', '#2': '5' }, 'Reach']);
  });
  it('a bare value keeps its inner spaces and loses the outer ones', () => {
    expect(read('Main path')).toBe('Main path');
    expect(read('{ok , 2026 Q1 }')).toEqual({ '#0': 'ok', '#1': '2026 Q1' });
  });
  it('a named item on its own (a trailing chart pill)', () => {
    expect(read('after=Design')).toEqual({ after: 'Design' });
    expect(read('today = Q3')).toEqual({ today: 'Q3' });
  });
});

describe('quotes', () => {
  it('protect separators and force the text type', () => {
    expect(read('["Cost, excluding tax", Value]')).toEqual(['"Cost, excluding tax"', 'Value']);
    expect(read('{"a=b"}')).toEqual({ '#0': '"a=b"' });
  });
  it('have exactly two escapes', () => {
    expect(read('"say \\"hi\\" \\\\ \\n"')).toBe('"say "hi" \\ \\n"');
  });
  it('an apostrophe is never special', () => {
    expect(read("[Customer's spend, Churn]")).toEqual(["Customer's spend", 'Churn']);
  });
  it('an unclosed quote is an error with a fix, never a scan for a partner', () => {
    const p = parse('{"unclosed, b}');
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.diagnostic.code).toBe('unclosed-quote');
      expect(p.diagnostic.fix?.insert).toBe('"');
    }
  });
  it('the unclosed quote named is the unmatched one, not the first', () => {
    const p = parse('{"a", "b');
    expect(!p.ok && [p.diagnostic.from, p.diagnostic.code]).toEqual([6, 'unclosed-quote']);
  });
  it('a span that ends before its brackets close gets the closers as a fix, innermost first', () => {
    const p = parse('[{Effort, 0..10');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.fix?.insert]).toEqual(['unclosed-bracket', '}]']);
    const q = parse('{BETA, "a}b"');
    expect(!q.ok && q.diagnostic.fix?.insert).toBe('}'); // a bracket inside quotes is text
    const r = parse('{a]');
    expect(!r.ok && r.diagnostic.code).toBe('syntax'); // mismatched: no guess
  });
});

describe('what is refused, and why', () => {
  it('"=" with no name before it gets a fix that quotes the value', () => {
    const p = parse('[{=>, Main path}]');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.fix]).toEqual(['stray-equals', { from: 2, to: 4, insert: '"=>"' }]);
  });
  it('a syntax error names the alternatives, not their character ranges', () => {
    const p = parse('{a, ,}');
    expect(!p.ok && p.diagnostic.message).toBe('expected "{", "[", "\\"" or a value, found ","');
  });
  it('"|" is reserved', () => expect(code('{a|b}')).toBe('reserved-pipe'));
  it('a space right after "{"', () => expect(code('{ ok, scene }')).toBe('space-after-brace'));
  it('"=" after something that is not a name', () => expect(code('{a b=c}')).toBe('bad-name'));
  it('a second "=" is inside the value, and the fix quotes the value', () => {
    const p = parse('{a=b=c}');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.fix]).toEqual(['stray-equals', { from: 3, to: 6, insert: '"b=c"' }]);
  });
  it('a named item inside a list', () => expect(code('[a, b=c]')).toBe('named-in-list'));
});

describe('isDirective — what may dispatch in prose', () => {
  it('only a record does', () => {
    expect(isDirective('{BETA, tag}')).toBe('directive');
    expect(isDirective('\\{BETA}')).toBe('escaped');
    for (const code of ['{ ok, scene }', '{}', 'var(--bg)', 'npm test', '[x]', '$4.2M', '']) expect(isDirective(code)).toBe(null);
  });
});

describe('a fix, applied, makes progress (the checker found fixes that did not)', () => {
  const apply = (s: string) => {
    const p = parse(s);
    if (p.ok || !p.diagnostic.fix) return null;
    const f = p.diagnostic.fix;
    return s.slice(0, f.from) + f.insert + s.slice(f.to);
  };
  it('an escaped backslash does not escape the quote after it', () => {
    const p = parse('{"x\\\\", "b');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.from]).toEqual(['unclosed-quote', 8]);
    expect(parse('{"x\\\\"').ok).toBe(false);
    const q = parse('{"x\\\\"');
    expect(!q.ok && q.diagnostic.code).toBe('unclosed-bracket');
  });
  it('no fix where the fix could not parse', () => {
    for (const s of ['{"Cost"=5}', '{[a]=b}', '{a,', '{a=', '{a, b=']) {
      const p = parse(s);
      expect(p.ok, s).toBe(false);
      expect(!p.ok && p.diagnostic.fix, s).toBeUndefined();
    }
  });
  it('a quoted fix keeps a tab a tab', () => {
    expect(apply('{a\tb=c}')).toBe('{"a\tb=c"}');
  });
  it('every space and tab after "{" goes in one fix', () => {
    expect(apply('{  \tok}')).toBe('{ok}');
  });
  it('the nesting limit the message states is the real one', () => {
    const at = (d: number) => parse(`${'['.repeat(d)}x${']'.repeat(d)}`);
    expect(at(MAX_NESTING).ok).toBe(true);
    const p = at(MAX_NESTING + 1);
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.message]).toEqual(['too-deep', `a span nests at most ${MAX_NESTING} levels of brackets`]);
  });
  it('too deep is its own error', () => {
    const p = parse(`${'['.repeat(80)}${']'.repeat(80)}`);
    expect(!p.ok && p.diagnostic.code).toBe('too-deep');
  });
  it('property: on 5,000 fuzzed spans, every fix parses or moves the error past its edit', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const ALPHA = ['{', '}', '[', ']', ',', '=', '"', '\\', ' ', '\t', 'a', 'b', '1', '|', '.', '#'];
    let fixes = 0;
    for (let k = 0; k < 5000; k++) {
      let s = rnd(2) ? '{' : '[';
      const n = 1 + rnd(9);
      for (let j = 0; j < n; j++) s += ALPHA[rnd(ALPHA.length)];
      const p = parse(s);
      if (p.ok || !p.diagnostic.fix) continue;
      fixes++;
      const f = p.diagnostic.fix;
      const fixed = s.slice(0, f.from) + f.insert + s.slice(f.to);
      const q = parse(fixed);
      expect(q.ok || q.diagnostic.from >= f.from + f.insert.length, `${JSON.stringify(s)} -> ${JSON.stringify(fixed)}`).toBe(true);
    }
    expect(fixes).toBeGreaterThan(100);
  });
});

describe('the reader, at its edges', () => {
  it('a tab before a separator is trimmed like a space', () => {
    expect(read('[a\t, b\t]')).toEqual(['a', 'b']);
  });
  it('a parameter name is read in any case', () => {
    const p = parse('{x, STAGE=beta}');
    expect(p.ok && p.item.value.kind === 'record' && p.item.value.items[1].name).toBe('stage');
  });
  it('an escaped quote inside a quote does not close it', () => {
    const p = parse('{a, "x\\"');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.from]).toEqual(['unclosed-quote', 4]);
  });
});
