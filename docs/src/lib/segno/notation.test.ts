// @vitest-environment node
// The inline notation: three shapes, one separator, one escape, quotes that must close.
import { describe, expect, it } from 'vitest';
import { isDirective, isName, MAX_NESTING, parse, plainRecordTree, type Value } from './notation';
import { parse as parseGenerated } from './notation.generated';
import { notationSpec, plainRecordSpec, TAGS } from './notation-grammar';

const shape = (v: Value | null): unknown => {
  if (v === null) return null;
  if (v.kind === 'scalar') return v.quoted ? `"${v.text}"` : v.text;
  if (v.kind === 'description') return { desc: v.text };
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
  it('a tagged record does, and only with its brace directly after the tag', () => {
    expect(isDirective('~{12 14 17}')).toBe('directive');
    expect(isDirective('^{database}')).toBe('directive');
    expect(isDirective('\\~{12 14}')).toBe('escaped');
    for (const code of ['~/projects/deck.md', '~ {12}', '~{ 12}', '~{}', '^', '~', '^x', '~~{1}']) expect(isDirective(code)).toBe(null);
  });
  it('dispatches on every tag in TAGS and on no other character, since isDirective spells them as char codes', () => {
    for (const tag of TAGS) expect(isDirective(`${tag}{a}`), tag).toBe('directive');
    for (let c = 0x21; c < 0x7f; c++) {
      const ch = String.fromCharCode(c);
      if (ch !== '{' && ch !== '\\' && !TAGS.includes(ch)) expect(isDirective(`${ch}{a}`), ch).toBe(null);
    }
  });
});

describe('tagged records', () => {
  it('a tag before the opening brace is carried on the top item', () => {
    const p = parse('~{12 14 17, bar}');
    expect(p.ok && p.item.tag).toBe('~');
    expect(p.ok && shape(p.item.value)).toEqual({ '#0': '12 14 17', '#1': 'bar' });
    const q = parse('^{database, c3}');
    expect(q.ok && [q.item.tag, q.item.from, q.item.to]).toEqual(['^', 0, 15]);
  });
  it('an untagged span carries no tag', () => {
    const p = parse('{BETA}');
    expect(p.ok && 'tag' in p.item).toBe(false);
  });
  it('a top-level bare value cannot start with a tag character, so it is not a directive', () => {
    expect(code('~/projects/deck.md')).not.toBe('ok');
    expect(code('^x')).not.toBe('ok');
    expect(code('~x=1')).not.toBe('ok');
  });
  it('inside a record or a list a tag character is ordinary text', () => {
    expect(read('{~5 min, ^up}')).toEqual({ '#0': '~5 min', '#1': '^up' });
    expect(read('[~a, ^b]')).toEqual(['~a', '^b']);
    expect(read('after=~x')).toEqual({ after: '~x' });
  });
  it('only a record can be tagged', () => {
    for (const s of ['~[a, b]', '~"x"', '^^{a}']) expect(code(s)).not.toBe('ok');
  });
});

describe('the no-break space is a space', () => {
  it('separates and trims like a space', () => {
    expect(read('{a,\u00a0b\u00a0}')).toEqual({ '#0': 'a', '#1': 'b' });
    expect(read('\u00a0[x,\u00a0y]')).toEqual(['x', 'y']);
  });
  it('is kept inside quotes, as every space is', () => {
    expect(read('{"\u00a0a"}')).toEqual({ '#0': '"\u00a0a"' });
  });
  it('directly after "{" is the space-after-brace error, with a fix', () => {
    const p = parse('{\u00a0a}');
    expect(!p.ok && [p.diagnostic.code, p.diagnostic.fix]).toEqual(['space-after-brace', { from: 1, to: 2, insert: '' }]);
    expect(isDirective('{\u00a0a}')).toBe(null);
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

describe('the cheap filters keep their meaning', () => {
  // `isName` replaced a regular expression and `isDirective` got a faster first branch; both are
  // held to the definitions they replaced on every short string over an alphabet that reaches each branch.
  const strings = (alphabet: string[], max: number): string[] => {
    const out = [''];
    let layer = [''];
    for (let n = 0; n < max; n++) {
      layer = layer.flatMap((p) => alphabet.map((c) => p + c));
      out.push(...layer);
    }
    return out;
  };
  it('isName is the name pattern', () => {
    for (const s of strings(['a', 'Z', '0', '-', ' ', '_', '\u00e9', '\n', '='], 4)) expect(isName(s), JSON.stringify(s)).toBe(/^[A-Za-z][A-Za-z0-9-]*$/.test(s));
  });
  it('isDirective is the tag-then-brace test', () => {
    const was = (text: string) => {
      let i = 0;
      let escaped = false;
      if (text.charCodeAt(0) === 0x5c) { escaped = true; i = 1; }
      if ('~^!'.includes(text[i] ?? '\0')) i++;
      if (text.charCodeAt(i) !== 0x7b) return null;
      const c = text.charCodeAt(i + 1);
      if (Number.isNaN(c) || c === 32 || c === 9 || c === 160 || c === 0x7d) return null;
      return escaped ? 'escaped' : 'directive';
    };
    for (const s of strings(['\\', '~', '^', '!', '{', '}', ' ', 'a', '\t', '\u00a0', '['], 4)) expect(isDirective(s), JSON.stringify(s)).toBe(was(s));
  });
});

// The plain-record parser (notation.ts `plainRecordTree`) is generated from `plainRecordSpec`, the
// notation `restrict`ed to records of bare words. It is a second way to build the flat tree a fast
// bind walks, so it must build the SAME tree, node for node. It may refuse a span (null) and leave it
// to the full parser; it may never accept a span the full parser refuses, and never build a
// different tree. That is restrict()'s promise on an LL(1) grammar, held here. Followup 2718-p3.
describe('the plain-record parser builds the full parser\'s tree', () => {
  const tree = (b: Int32Array | null) => (b ? Array.from(b.slice(0, b[3])) : null);
  // `expect` only on a difference: the pools hold a third of a million spans, and an `expect` each costs seconds.
  const compare = (s: string) => {
    const plain = tree(plainRecordTree(s));
    if (plain === null) return 'declined';
    const g = parseGenerated(s);
    if (!g.ok) expect.fail(`${JSON.stringify(s)}: the plain parser accepted a span the full parser refuses`);
    const want = Array.from(g.tree.buf.slice(0, g.tree.top));
    if (plain.length !== want.length || plain.some((x, k) => x !== want[k])) expect(plain, JSON.stringify(s)).toEqual(want);
    return 'equal';
  };
  const pool = (alphabet: string[], depth: number) => {
    const out: string[] = [''];
    let layer = [''];
    for (let n = 0; n < depth; n++) {
      layer = layer.flatMap((p) => alphabet.map((c) => p + c));
      for (const s of layer) out.push(s);
    }
    return out;
  };
  it('on every short span over the characters that steer a plain record', () => {
    // One character per class: a word character, a space of each kind, the two separators, a line
    // break (a bare character, not a space), and one past ASCII.
    let equal = 0;
    for (const body of pool(['a', '1', ' ', ',', '=', '\t', '\u00a0', '-', '\n', '\u00e9'], 5)) {
      for (const s of [`{${body}}`, `{${body}} `, `{${body}}\u00a0\t`]) if (compare(s) === 'equal') equal++;
    }
    expect(equal).toBeGreaterThan(20000); // the pool really exercised the parser, not only its refusals
  });
  it('on every short span over the characters that leave the plain shape', () => {
    // Nesting, lists, quotes, the reserved bar and a tag: what the restriction removes or keeps.
    let equal = 0;
    for (const body of pool(['a', ',', '=', ' ', '{', '}', '[', ']', '"', '|', '~'], 4)) {
      for (const s of [`{${body}}`, `~{${body}}`, ` {${body}}`]) if (compare(s) === 'equal') equal++;
    }
    expect(equal).toBeGreaterThan(100); // measured 154: nested records the restriction keeps
  });
  it('refuses lists, quotes, tags and everything the full grammar refuses', () => {
    for (const s of ['{a, [b]}', '{"a"}', '{a|b}', ' {a}', '~{1 2}', '{a}\n', '{a} b', '[a]', 'a', '{', '{}', '{ a}', '{a,}', '{a=}', '{a=b=c}', '{=a}']) {
      expect(plainRecordTree(s), JSON.stringify(s)).toBeNull();
    }
  });
  it('accepts the shapes the decks write, nested records included', () => {
    for (const s of ['{2, 82}', '{who=prospect, mood=5}', '{$420k, 18%, size=1200}', '{LIVE, tag}', '{STEP 2, chevron-right}', '{icon=gateway, c2}', '{a = b ,  c}', '{a, {b}}']) {
      expect(compare(s), s).toBe('equal');
    }
  });
  it('is derived, not written: the restriction removed lists, quotes, tags and descriptions and nothing else', () => {
    expect(Object.keys(plainRecordSpec.rules).sort()).toEqual(['first', 'item', 'record', 'span', 'top', 'value']);
    expect(JSON.stringify(plainRecordSpec)).not.toMatch(/"list"|"quoted"|"tagged"|"desc"/);
    expect(plainRecordSpec.rules.span).not.toBe(notationSpec.rules.span); // `span` held the tagged branch
    expect(plainRecordSpec.rules.item).not.toBe(notationSpec.rules.item); // `item` held lists and quotes
  });
});

describe('descriptions: `{> prose}`', () => {
  it('the whole record is the prose, trimmed', () => {
    expect(read('{> Slipped a week}')).toEqual({ desc: 'Slipped a week' });
    expect(read('{>   padded   }')).toEqual({ desc: 'padded' });
    expect(read('{>}')).toEqual({ desc: '' });
  });
  it('`>` opens a description wherever it is the record\'s first character, so `{>5}` is not a value', () => {
    expect(read('{>5}')).toEqual({ desc: '5' });
    expect(read('{>a}')).toEqual({ desc: 'a' });
  });
  it('a later item keeps `>` as ordinary text', () => {
    expect(read('{3, >5}')).toEqual({ '#0': '3', '#1': '>5' });
    expect(read('{a, b=>c}')).toEqual({ '#0': 'a', b: '>c' });
  });
  it('separators, equals signs, quotes, brackets and pipes are prose', () => {
    expect(read('{> a, b=c "d" [e] | f}')).toEqual({ desc: 'a, b=c "d" [e] | f' });
  });
  it('a backslash escapes `}` and itself; any other backslash stays', () => {
    expect(read('{> a \\} b \\\\ c \\n}')).toEqual({ desc: 'a } b \\ c \\n' });
  });
  it('an unescaped `}` ends it, so what follows is not part of the span', () => {
    expect(code('{> a} b')).toBe('syntax');
  });
  it('it never closes by itself: an open description is an unclosed record with a fix', () => {
    const p = parse('{> a');
    expect(p.ok).toBe(false);
    if (!p.ok) {
      expect(p.diagnostic.code).toBe('unclosed-bracket');
      expect(p.diagnostic.fix?.insert).toBe('}');
    }
    expect(code('{> a \\}')).toBe('unclosed-bracket');
  });
  it('a space before `>` is still the refused space after the brace', () => {
    expect(code('{ > x}')).toBe('space-after-brace');
  });
  it('a description nested in a record or a list is a description value, for the binder to refuse', () => {
    expect(read('{{> x}}')).toEqual({ '#0': { desc: 'x' } });
    expect(read('[{> x}, y]')).toEqual([{ desc: 'x' }, 'y']);
  });
  it('a tag may precede it', () => {
    expect(code('~{> x}')).toBe('ok');
  });
  it('the plain-record parser refuses it and the full parser reads it', () => {
    expect(plainRecordTree('{> x}')).toBeNull();
    expect(plainRecordTree('{x}')).not.toBeNull();
    expect(parseGenerated('{> x}').ok).toBe(true);
  });
  it('it reads in time linear in its length', () => {
    const t = (n: number) => { const s = `{> ${'ab, '.repeat(n)}}`; const a = performance.now(); parse(s); return performance.now() - a; };
    t(2000);
    const small = Math.max(t(20000), 0.05);
    expect(t(200000) / small).toBeLessThan(40); // 10x the input; linear is ~10, quadratic ~100
  });
  it('the LL(1) prefix property holds for descriptions: a tail never moves an error into the valid part', () => {
    const TAIL = ['}', ']', '{', '[', ',', '"', '=', ' ', 'a', '\\', '|', '>'];
    for (const base of ['{> x}', '{>}', '{> a, b=c}', '{> a \\} b}', '{3, >5}']) {
      for (const t of TAIL) {
        for (const u of ['', ...TAIL]) {
          const p = parse(base + t + u);
          if (!p.ok) expect(p.diagnostic.from, JSON.stringify(base + t + u)).toBeGreaterThanOrEqual(base.length - 1);
        }
      }
    }
  });
  it('unclosed and escape-heavy descriptions stay linear', () => {
    const run = (mk: (n: number) => string) => {
      const t = (n: number) => { const s = mk(n); const a = performance.now(); parse(s); return performance.now() - a; };
      t(3000);
      const small = Math.max(t(20000), 0.05);
      return t(200000) / small;
    };
    expect(run((n) => `{> ${'a, '.repeat(n / 3)}`)).toBeLessThan(40);
    expect(run((n) => `{> ${'a \\} '.repeat(n / 5)}}`)).toBeLessThan(40);
  });
});
