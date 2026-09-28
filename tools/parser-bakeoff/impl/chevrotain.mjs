/**
 * Chevrotain (LL(k), hand-built parser DSL over a regex lexer). One lexer + one
 * EmbeddedActionsParser per target. Chevrotain has no grammar file: the grammar IS the
 * TypeScript/JS class, which is why `grammarFiles` points here.
 *
 * Two things this library makes you do that the others do not, both visible below:
 *   - every side effect in a rule is wrapped in ACTION(), because Chevrotain runs each
 *     rule once at construction with fake tokens to RECORD the grammar;
 *   - repeated uses of the same DSL call in one rule are numbered (CONSUME1, MANY2, …).
 * Context the lexer cannot see (a quote's partner, an arrow's word start, the parts cap)
 * goes in GATE predicates, which are plain JS over the lookahead.
 */
import { createToken, EmbeddedActionsParser, EOF, Lexer } from 'chevrotain';
import * as h from '../shared.mjs';

export const name = 'chevrotain';
export const grammarFiles = ['impl/chevrotain.mjs'];

const lexOpts = { positionTracking: 'onlyOffset', ensureOptimizations: false };
const tok = (name, pattern, extra) => createToken({ name, pattern, ...extra });
const is = (t, T) => t.tokenType === T;

const t0 = performance.now();

// \u2500\u2500 inline \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const I = {
  Bs: tok('Bs', /\\/), LCurly: tok('LCurly', /{/), RCurly: tok('RCurly', /}/),
  LSq: tok('LSq', /\[/), RSq: tok('RSq', /]/), Colon: tok('Colon', /:/),
  Chunk: tok('Chunk', /[^\\{}[\]:]+/, { line_breaks: true }),
};
const I_ALL = Object.values(I);
const inlineLexer = new Lexer(I_ALL, lexOpts);

class InlineParser extends EmbeddedActionsParser {
  constructor() {
    super(I_ALL, { recoveryEnabled: false, maxLookahead: 3 });
    // A DSL call may appear once per rule, so "any token but X" is its own rule.
    this.RULE('notR', () => this.OR(I_ALL.filter((T) => T !== I.RCurly).map((T) => ({ ALT: () => this.CONSUME(T).image }))));
    this.RULE('notColon', () => this.OR(I_ALL.filter((T) => T !== I.Colon).map((T) => ({ ALT: () => this.CONSUME(T).image }))));
    this.RULE('start', () => this.OR([
      { ALT: () => {
        this.CONSUME(I.Bs);
        const r = this.SUBRULE(this.direct);
        return this.ACTION(() => (r ? { kind: 'escaped', text: this.input.slice(1).map((t) => t.image).join('') } : null));
      } },
      { ALT: () => this.SUBRULE2(this.direct) },
    ]));
    this.RULE('direct', () => this.OR2([
      { ALT: () => this.SUBRULE(this.state) },
      { ALT: () => this.SUBRULE(this.pill) },
    ]));
    this.RULE('state', () => {
      this.CONSUME(I.LSq);
      const m = this.CONSUME(I.Chunk).image;
      this.CONSUME(I.RSq);
      this.CONSUME(EOF);
      return this.ACTION(() => (m.length === 1 && h.STATE_MARKERS.includes(m) ? { kind: 'state', marker: m } : null));
    });
    this.RULE('pill', () => {
      this.CONSUME(I.LCurly);
      let v = '';
      this.MANY(() => { const s = this.SUBRULE(this.notR); this.ACTION(() => { v += s; }); });
      this.CONSUME(I.RCurly);
      const mods = [];
      this.MANY2(() => {
        this.CONSUME(I.Colon);
        let m = '';
        this.MANY3(() => { const s = this.SUBRULE(this.notColon); this.ACTION(() => { m += s; }); });
        this.ACTION(() => mods.push(m));
      });
      this.CONSUME2(EOF);
      return this.ACTION(() => h.pill(v, mods));
    });
    this.performSelfAnalysis();
  }
}
const inlineParser = new InlineParser();

function inline(s) {
  const lx = inlineLexer.tokenize(s);
  if (lx.errors.length) return null;
  inlineParser.input = lx.tokens;
  const r = inlineParser.start();
  return inlineParser.errors.length ? null : r;
}

// \u2500\u2500 gantt \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
// `[^]`, NOT `[\s\S]`, and the lint rule is wrong here: Chevrotain 12's "first char" lexer
// optimization reads `[\s\S]` as whitespace-only and DROPS every other character as a lexer
// error — measured, `tokenize('\`a é')` keeps only the space. The fuzz arm caught it as a
// parity loss on gantt. `[^]` makes the analysis give up and fall back, which is correct.
const G = {
  DotDot: tok('DotDot', /\.\./), Dot: tok('Dot', /\./), Digits: tok('Digits', /[0-9]+/),
  Dash: tok('Dash', /-/), Letters: tok('Letters', /[A-Za-z]+/),
  Ws: tok('Ws', /[\s\ufeff]+/, { line_breaks: true }),
  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: `[^]` on purpose, see the note above G
  Other: tok('Other', /[^]/, { line_breaks: true }),
};
const G_ALL = Object.values(G);
const ganttLexer = new Lexer(G_ALL, lexOpts);

class GanttParser extends EmbeddedActionsParser {
  constructor() {
    super(G_ALL, { recoveryEnabled: false, maxLookahead: 5 });
    const len = (k, n) => () => { const t = this.LA(k); return is(t, G.Digits) && t.image.length === n; };
    this.RULE('point', () => {
      this.OPTION(() => this.CONSUME(G.Ws));
      const p = this.OR([
        { GATE: () => len(1, 4)() && is(this.LA(2), G.Dash), ALT: () => {
          const y = this.CONSUME(G.Digits).image; this.CONSUME(G.Dash);
          const m = this.CONSUME2(G.Digits, { LABEL: 'm' }).image; this.CONSUME2(G.Dash);
          const d = this.CONSUME3(G.Digits).image;
          return this.ACTION(() => (m.length === 2 && d.length === 2 ? h.date(+y, +m, +d) : undefined));
        } },
        { ALT: () => {
          let y = null;
          this.OPTION2({ GATE: len(1, 4), DEF: () => { y = +this.CONSUME4(G.Digits).image; this.OPTION3(() => this.CONSUME2(G.Ws)); } });
          const w = this.CONSUME(G.Letters).image;
          let q = null;
          this.OPTION4(() => { q = this.CONSUME5(G.Digits).image; });
          return this.ACTION(() => {
            if (q !== null) return /^[qQ]$/.test(w) && /^[1-4]$/.test(q) ? h.quarter(y, q) : undefined;
            return h.month(y, w) ?? undefined;
          });
        } },
      ]);
      this.OPTION5(() => this.CONSUME3(G.Ws));
      this.CONSUME(EOF);
      return p;
    });
    this.performSelfAnalysis();
  }
}
const ganttParser = new GanttParser();

function point(tokens) {
  ganttParser.input = tokens;
  const r = ganttParser.point();
  return ganttParser.errors.length || r === undefined ? null : r;
}

function gantt(s) {
  const { tokens } = ganttLexer.tokenize(s);
  const at = tokens.findIndex((t) => is(t, G.DotDot));
  if (at < 0) return { point: point(tokens) };
  // `..` splits once; the end side keeps any later `..` as text, so it re-reads as a point.
  return { start: point(tokens.slice(0, at)), end: point(tokens.slice(at + 1)) };
}

// \u2500\u2500 value \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const V = {
  Ws: tok('Ws', /[\s\ufeff]+/, { line_breaks: true }), LParen: tok('LParen', /\(/), RParen: tok('RParen', /\)/),
  Plus: tok('Plus', /\+/), Minus: tok('Minus', /[-\u2212]/), Digits: tok('Digits', /[0-9]+/),
  Sep: tok('Sep', /[,.]/), Letters: tok('Letters', /[A-Za-z]+/), Pct: tok('Pct', /[%\u2030]/),
  Sym: tok('Sym', /[^\w\s\ufeff]/),
  // biome-ignore lint/correctness/noEmptyCharacterClassInRegex: `[^]` on purpose, see the note above G
  Other: tok('Other', /[^]/, { line_breaks: true }),
};
const V_ALL = Object.values(V);
const valueLexer = new Lexer(V_ALL, lexOpts);
const SYMS = [V.LParen, V.RParen, V.Plus, V.Minus, V.Sep, V.Pct, V.Sym];

class ValueParser extends EmbeddedActionsParser {
  constructor() {
    super(V_ALL, { recoveryEnabled: false, maxLookahead: 2 });
    const isSym = (t) => SYMS.some((T) => is(t, T));
    this.RULE('sym', () => this.OR9(SYMS.map((T) => ({ ALT: () => this.CONSUME9(T) }))));
    this.RULE('pill', () => {
      this.OPTION(() => this.CONSUME(V.Ws));
      this.OPTION2(() => this.OR([{ ALT: () => this.CONSUME(V.LParen) }, { ALT: () => this.CONSUME(V.Plus) }, { ALT: () => this.CONSUME(V.Minus) }]));
      this.OPTION3(() => this.CONSUME2(V.Ws));
      let n = 0;
      this.MANY({
        GATE: () => n < 3 && isSym(this.LA(1)),
        DEF: () => { this.SUBRULE(this.sym); this.ACTION(() => { n++; }); },
      });
      this.OPTION4(() => this.CONSUME3(V.Ws));
      this.OPTION5(() => this.CONSUME2(V.Minus));
      this.CONSUME(V.Digits);
      this.MANY2(() => this.OR3([{ ALT: () => this.CONSUME2(V.Digits) }, { ALT: () => this.CONSUME(V.Sep) }]));
      this.OPTION6(() => this.CONSUME4(V.Ws));
      this.OPTION7(() => this.OR4([
        { ALT: () => this.CONSUME(V.Pct) },
        { GATE: () => this.LA(1).image.length <= 6, ALT: () => this.CONSUME(V.Letters) },
      ]));
      this.OPTION8(() => this.CONSUME5(V.Ws));
      this.OPTION9(() => this.CONSUME(V.RParen));
      this.CONSUME(EOF);
    });
    this.performSelfAnalysis();
  }
}
const valueParser = new ValueParser();

function value(s) {
  const t = s.trim();
  const lx = valueLexer.tokenize(t);
  valueParser.input = lx.tokens;
  valueParser.pill();
  return valueParser.errors.length ? null : h.numberOf(t);
}

// \u2500\u2500 axis \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const A = {
  Ws: tok('Ws', /[\s\ufeff]+/, { line_breaks: true }), Comma: tok('Comma', /,/),
  LCurly: tok('LCurly', /{/), RCurly: tok('RCurly', /}/), DQ: tok('DQ', /"/), SQ: tok('SQ', /'/),
  LSq: tok('LSq', /\[/), RSq: tok('RSq', /]/), Text: tok('Text', /[^\s\ufeff,{}"'[\]]+/),
};
const A_ALL = Object.values(A);
const axisLexer = new Lexer(A_ALL, lexOpts);

class AxisParser extends EmbeddedActionsParser {
  constructor() {
    super(A_ALL, { recoveryEnabled: false, maxLookahead: 2 });
    let cap = 0;
    let count = 0;
    this.setCap = (n) => { cap = n; };
    this.RULE('any', () => this.OR9(A_ALL.map((T) => ({ ALT: () => this.CONSUME9(T).image }))));
    // A quote opens only when a partner that ENDS A PART exists further on.
    const partnerAhead = () => {
      const q = this.LA(1).tokenType;
      for (let k = 2; ; k++) {
        const t = this.LA(k);
        if (t.tokenType === EOF) return false;
        if (t.tokenType !== q) continue;
        let n = this.LA(k + 1);
        if (is(n, A.Ws)) n = this.LA(k + 2);
        if (n.tokenType === EOF || is(n, A.Comma) || is(n, A.RCurly) || is(n, A.RSq)) return true;
      }
    };
    const atBrace = () => is(this.LA(1), A.LCurly) || (is(this.LA(1), A.Ws) && is(this.LA(2), A.LCurly));

    this.RULE('part', (stops = []) => {
      let raw = '';
      let quoted = false;
      this.OPTION(() => this.CONSUME(A.Ws));
      this.OPTION2({
        GATE: () => (is(this.LA(1), A.DQ) || is(this.LA(1), A.SQ)) && partnerAhead(),
        DEF: () => {
          const q = this.OR([{ ALT: () => this.CONSUME(A.DQ) }, { ALT: () => this.CONSUME(A.SQ) }]);
          raw += q.image;
          this.MANY({ GATE: () => this.LA(1).tokenType !== q.tokenType, DEF: () => { const s = this.SUBRULE(this.any); this.ACTION(() => { raw += s; }); } });
          this.OR3([{ ALT: () => this.CONSUME2(A.DQ) }, { ALT: () => this.CONSUME2(A.SQ) }]);
          this.ACTION(() => { raw += q.image; quoted = true; });
        },
      });
      this.MANY2({
        GATE: () => !stops.includes(this.LA(1).tokenType),
        DEF: () => { const s = this.SUBRULE2(this.any); this.ACTION(() => { raw += s; }); },
      });
      return this.ACTION(() => h.partValue(raw.trimEnd(), quoted));
    });

    this.RULE('braced', () => {
      this.OPTION(() => this.CONSUME(A.Ws));
      this.CONSUME(A.LCurly);
      this.ACTION(() => { count = 0; });
      const parts = [];
      const one = (p) => this.ACTION(() => { if (p) { parts.push(p); count++; } });
      const stops = () => (cap && count >= cap - 1 ? [A.RCurly] : [A.Comma, A.RCurly]);
      one(this.SUBRULE(this.part, { ARGS: [stops()] }));
      this.MANY({ GATE: () => is(this.LA(1), A.Comma), DEF: () => { this.CONSUME(A.Comma); one(this.SUBRULE2(this.part, { ARGS: [stops()] })); } });
      this.OPTION2(() => this.CONSUME(A.RCurly));
      this.OPTION3({ GATE: () => is(this.LA(1), A.Comma) || (is(this.LA(1), A.Ws) && is(this.LA(2), A.Comma)), DEF: () => { this.OPTION4(() => this.CONSUME2(A.Ws)); this.CONSUME2(A.Comma); } });
      return parts;
    });

    this.RULE('inner', () => {
      const members = [];
      let done = false;
      this.MANY({
        GATE: () => !done && this.LA(1).tokenType !== EOF,
        DEF: () => this.OR([
          { GATE: atBrace, ALT: () => { const m = this.SUBRULE(this.braced); this.ACTION(() => members.push(m)); } },
          { ALT: () => {
            const p = this.SUBRULE(this.part, { ARGS: [[A.Comma]] });
            this.ACTION(() => members.push(p ? [p] : []));
            this.OR2([{ ALT: () => this.CONSUME(A.Comma) }, { ALT: () => { this.CONSUME(EOF); this.ACTION(() => { done = true; }); } }]);
          } },
        ]),
      });
      return this.ACTION(() => h.finalizeMembers(members));
    });
    this.performSelfAnalysis();
  }
}
const axisParser = new AxisParser();

function axisWith(maxParts) {
  return (s) => {
    const { tokens } = axisLexer.tokenize(s);
    let a = 0;
    let b = tokens.length - 1;
    if (a <= b && is(tokens[a], A.Ws)) a++;
    if (b >= a && is(tokens[b], A.Ws)) b--;
    if (b <= a || !is(tokens[a], A.LSq) || !is(tokens[b], A.RSq)) return null;
    axisParser.setCap(maxParts);
    axisParser.input = tokens.slice(a + 1, b);
    const r = axisParser.inner();
    return axisParser.errors.length ? null : r;
  };
}

// \u2500\u2500 flow \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const F = {
  Nl: tok('Nl', /\n/, { line_breaks: true }), Sp: tok('Sp', /[ \t\r]/, { line_breaks: true }),
  Lt: tok('Lt', /</), Gt: tok('Gt', />/), Dash: tok('Dash', /-/), Eq: tok('Eq', /=/), Bs: tok('Bs', /\\/),
  Punct: tok('Punct', /[!-/:-@[-`{-~]/), Word: tok('Word', /[^ \t\r\n!-/:-@[-`{-~]+/, { line_breaks: true }),
};
const F_ALL = Object.values(F);
const flowLexer = new Lexer([F.Nl, F.Sp, F.Lt, F.Gt, F.Dash, F.Eq, F.Bs, F.Punct, F.Word], lexOpts);
const isSp = (t) => is(t, F.Nl) || is(t, F.Sp);
const isB = (t) => t.tokenType === EOF || isSp(t);

class FlowParser extends EmbeddedActionsParser {
  constructor() {
    super(F_ALL, { recoveryEnabled: false, maxLookahead: 3 });
    this.RULE('any', () => this.OR9(F_ALL.map((T) => ({ ALT: () => this.CONSUME9(T) }))));

    // One arrow, read the way readArrow reads it; BACKTRACK'd from the row so a failed
    // attempt costs nothing but time.
    this.RULE('arrow', () => {
      let left = false;
      this.OPTION(() => { this.CONSUME(F.Lt); this.ACTION(() => { left = true; }); });
      const c = this.OR([{ ALT: () => this.CONSUME(F.Dash) }, { ALT: () => this.CONSUME(F.Eq) }]).tokenType;
      const heavy = c === F.Eq;
      const same = (k) => this.LA(k).tokenType === c;
      // One token of lookahead, so the GATEs decide: at depth 3 the LL(k) analysis could
      // not see that a doubled shaft may end the input, and `--` stopped being an arrow.
      return this.OR2({ MAX_LOOKAHEAD: 1, IGNORE_AMBIGUITIES: true, DEF: [
        { GATE: () => same(1), ALT: () => {
          let n = 0;
          this.AT_LEAST_ONE({ GATE: () => n < 2 && same(1), DEF: () => { this.SUBRULE(this.any); this.ACTION(() => { n++; }); } });
          const g = this.OR3([
            { GATE: () => is(this.LA(1), F.Gt) && isB(this.LA(2)), ALT: () => { this.CONSUME(F.Gt); return true; } },
            { GATE: () => isB(this.LA(1)), ALT: () => false },
          ]);
          return { heavy, label: '', dir: g ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: g || left || n === 2 };
        } },
        { GATE: () => is(this.LA(1), F.Gt) && isB(this.LA(2)), ALT: () => { this.CONSUME2(F.Gt); return { heavy, label: '', dir: left ? 'both' : 'out', mermaid: false }; } },
        { GATE: () => !isSp(this.LA(1)) && !is(this.LA(1), F.Gt) && this.LA(1).tokenType !== EOF, ALT: () => {
          let label = '';
          let prevSp = false;
          // Scan to the first shaft that follows a non-space and ends the word.
          const closes = () => same(1) && !prevSp && (isB(this.LA(2)) || (is(this.LA(2), F.Gt) && isB(this.LA(3))));
          // `<` may OPEN a label, as it does in readArrow; it may not appear later.
          const fits = () => label.length + (this.LA(1).image || '').length <= h.LABEL_MAX + 1;
          this.MANY({
            GATE: () => !closes() && fits() && this.LA(1).tokenType !== EOF && (!is(this.LA(1), F.Lt) || label === '') && !is(this.LA(1), F.Gt) && !is(this.LA(1), F.Nl),
            DEF: () => { const t = this.SUBRULE2(this.any); this.ACTION(() => { label += t.image; prevSp = is(t, F.Sp); }); },
          });
          // The scan stopped: it is an arrow only if it stopped ON a closing shaft.
          const g = this.OR4([{ GATE: () => label !== '' && closes(), ALT: () => {
            this.OR6([{ ALT: () => this.CONSUME3(F.Dash) }, { ALT: () => this.CONSUME3(F.Eq) }]);
            return this.OPTION2({ GATE: () => is(this.LA(1), F.Gt), DEF: () => { this.CONSUME4(F.Gt); return true; } }) || false;
          } }]);
          return { heavy, label, dir: g ? (left ? 'both' : 'out') : (left ? 'in' : 'none'), mermaid: false };
        } },
        // Chevrotain allows an empty alternative only in last place.
        { GATE: () => left && isB(this.LA(1)), ALT: () => ({ heavy, label: '', dir: 'in', mermaid: false }) },
      ] });
    });

    const tryArrow = this.BACKTRACK(this.arrow);
    this.RULE('row', () => {
      const items = [];
      let wordStart = true;
      this.MANY(() => this.OR5([
        { GATE: () => wordStart && (is(this.LA(1), F.Dash) || is(this.LA(1), F.Eq) || is(this.LA(1), F.Lt)) && tryArrow.call(this),
          ALT: () => { const a = this.SUBRULE(this.arrow); this.ACTION(() => { items.push({ a }); wordStart = true; }); } },
        { GATE: () => is(this.LA(1), F.Bs) && /^[!-/:-@[-`{-~]/.test(this.LA(2).image || ''),
          ALT: () => { this.CONSUME(F.Bs); const t = this.SUBRULE2(this.any); this.ACTION(() => { const ch = t.image[0]; items.push({ t: ch === '&' ? h.ESC_AMP : ch }); if (t.image.length > 1) items.push({ t: t.image.slice(1) }); wordStart = false; }); } },
        { ALT: () => { const t = this.SUBRULE3(this.any); this.ACTION(() => { items.push({ t: t.image }); wordStart = isSp(t); }); } },
      ]));
      // Without an explicit EOF the LL(k) lookahead cannot see that a rule may END here,
      // and `--` at the end of a row stopped being an arrow.
      this.CONSUME(EOF);
      return items;
    });
    this.performSelfAnalysis();
  }
}
const flowParser = new FlowParser();

// readArrow's label may OPEN with `<` (only later characters are barred), so a label
// token scan that refuses `<` everywhere would miss `-<x->`; the Lt check above is on
// later tokens only when the label is non-empty. Kept honest by the fuzz arm.
function flow(s) {
  const { tokens } = flowLexer.tokenize(s);
  flowParser.input = tokens;
  const items = flowParser.row();
  const parts = [''];
  const arrows = [];
  for (const it of items) {
    if (it.a) { arrows.push(it.a); parts.push(''); } else parts[parts.length - 1] += it.t;
  }
  return { parts, arrows };
}

export const buildMs = performance.now() - t0;

export const impl = {
  axis: axisWith(3),
  axisUncapped: axisWith(0),
  flow,
  gantt,
  value,
  inline,
};

/** The library's own message for a value pill it refuses (errors.mjs). */
export function diagnose(s) {
  valueParser.input = valueLexer.tokenize(s.trim()).tokens;
  valueParser.pill();
  return valueParser.errors[0]?.message ?? null;
}
