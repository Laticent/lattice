/**
 * The inline-code dispatcher is a TABLE now (engineering/decisions/2026-09-29-inline-icons.md
 * § 6a, phase 1a): marks and pills are its first-party rows, and a plugin adds a row through
 * `contributes.inline`. Sparks were the third first-party row until the sparks plugin took them
 * (2026-10-16); the hand list below still names them, and the spark-row test pins the move. This pins the promise that made the refactor safe — every span in
 * the tracked corpus dispatches, escapes and renders exactly as the hand-written list did — and
 * the table's own contract: order, the escape, and a plugin row leaving when its plugin is off.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '../../..');
const table = require('../../../lib/core/inline-code-directives.js');
const { stateHtml, stateElement, parseInlineState } = require('../../../lib/core/state-marks.js');
const pills = require('../../../lib/core/inline-pills.js');
const sparks = require('../../../lib/plugins/sparks/sparks.inline.js');
const icons = require('../../../lib/plugins/icons/icons.inline.js');
const avatars = require('../../../lib/plugins/avatars/avatars.inline.js');
const { CORE } = require('../../../lib/core/segno-slots.js');
const { EXCLUDE_MIRRORS_SHELL } = require('../../helpers/generated-mirrors.js');

/** The hand-written dispatcher the table replaced, verbatim in behavior. */
const legacy = {
  dispatches: (t) => !!(parseInlineState(t) || sparks.resolve(t) || pills.resolve(t)),
  escapedText(text) {
    if (typeof text !== 'string' || text.length < 2 || text.charCodeAt(0) !== 0x5c) return null;
    const rest = text.slice(1);
    return legacy.dispatches(rest) || sparks.diagnose(rest) || pills.attempt(rest) ? rest : null;
  },
  renderHtml: (t) => stateHtml(t) || pills.pillHtml(t) || sparks.sparkHtml(t),
  renderElement: (doc, t) => stateElement(doc, t) || pills.pillElement(doc, t) || sparks.sparkElement(doc, t),
};

/** Every inline-code span in every tracked Markdown file, fenced blocks left out. */
function corpusSpanSet() {
  const files = execSync(`git ls-files '*.md' ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT }).toString().trim().split('\n');
  const spans = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
    for (const m of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) spans.add(m[1]);
  }
  return spans;
}

/** The corpus less what a plugin reads and the named form, which the hand list never saw. */
function corpusSpans() {
  const spans = corpusSpanSet();
  // A span the icons plugin READS (`^{database}`, a pill's `icon=`) is new: the hand list never saw
  // one, so it has no "before" to equal; the plugin's fixtures pin those. Every other span — TeX's
  // `^{o}` included — must come out exactly as before, with the plugin ON.
  const { KINDS } = require('../../../lib/core/inline-code-directives.js');
  const pluginReads = (t) => KINDS.some((k) => k.plugin && (k.resolve(t) || k.diagnose(t)));
  // The named form (`@spark{…}`, the inline door) is new too, and the alias test below pins it.
  const named = (t) => table.canonicalText(t.replace(/^\\/, '')) !== t.replace(/^\\/, '');
  return [...spans].filter((s) => !/\bicon\s*=/.test(s) && !pluginReads(s) && !pluginReads(s.replace(/^\\/, '')) && !named(s));
}

describe('the inline-code table — first-party rows are byte-identical to the hand list', () => {
  const spans = corpusSpans();
  const firstParty = table.FIRST_PARTY.map((k) => k.name);
  // With no plugin row in play the whole table must equal the old list; plugin rows are ruled out
  // by switching their plugins off, so this holds whatever plugins ship.
  const off = new Set(table.KINDS.filter((k) => k.plugin).map((k) => k.plugin));

  test('the first-party rows are marks and pills, in that order', () => {
    assert.deepEqual(firstParty, ['state', 'pill']);
    assert.deepEqual(table.KINDS.slice(0, 2), [...table.FIRST_PARTY]);
  });

  test('the sparks plugin\'s row draws every corpus spark exactly as the first-party row did', () => {
    const row = table.KINDS.find((k) => k.name === 'spark');
    assert.equal(row.plugin, 'sparks');
    assert.equal(row.sigil, '~');
    const sparkSpans = [...corpusSpanSet()].filter((s) => sparks.resolve(s) || sparks.diagnose(s));
    assert.ok(sparkSpans.length > 50, `expected real sparks in the corpus, got ${sparkSpans.length}`);
    for (const s of sparkSpans) {
      assert.equal(table.renderHtml(s), sparks.sparkHtml(s), s);
      assert.equal(table.escapedText(`\\${s}`), s, `\\${s}`);
    }
    // With the plugin off, a spark is code, as every plugin kind is.
    const drawn = sparkSpans.find((s) => sparks.resolve(s));
    assert.equal(table.renderHtml(drawn, new Set(['sparks'])), null, drawn);
  });

  test(`every corpus span renders to the same HTML (${spans.length} distinct spans)`, () => {
    assert.ok(spans.length > 1000, `expected a real corpus, got ${spans.length} spans`);
    let rendered = 0;
    for (const s of spans) {
      const want = legacy.renderHtml(s);
      assert.equal(table.renderHtml(s, off), want, s);
      if (want) rendered++;
    }
    assert.ok(rendered > 50, `the corpus should hold real directives, found ${rendered}`);
  });

  test('every corpus span, and its backslash form, escapes the same way, with every plugin on', () => {
    for (const s of spans) {
      assert.equal(table.escapedText(s), legacy.escapedText(s), s);
      assert.equal(table.escapedText(`\\${s}`), legacy.escapedText(`\\${s}`), `\\${s}`);
      assert.equal(table.dispatches(s, off), legacy.dispatches(s), s);
      assert.equal(table.renderHtml(s), legacy.renderHtml(s), `${s} (plugins on)`);
    }
  });

  test('someone else\'s braces keep every backslash: TeX accents, superscripts, an empty pill', () => {
    // The red team's repro: the icon row once counted any `^{x}` as an attempt, so `\^{o}` lost
    // its backslash in a deck that writes no icon.
    for (const s of ['\\^{o}', '\\^{e}', '\\^{2}', '\\^{1,2}', '\\^{x', '\\^{\\o}', '\\{""}', '\\{"", c3}']) {
      assert.equal(table.escapedText(s), null, s);
    }
  });

  test('the DOM path builds the same element', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    for (const s of spans) {
      const want = legacy.renderElement(doc, s);
      const got = table.renderElement(doc, s, off);
      assert.equal(got ? got.outerHTML : null, want ? want.outerHTML : null, s);
    }
  });
});

describe('the inline-code table — against a FROZEN copy of the pre-table outputs', () => {
  // The oracle above calls today's kernels, so it proves the table equals them, not that they
  // still equal what shipped (HARD RULE #25 checker: this PR also changed the pill slot). The golden
  // is every directive-shaped span in the tracked corpus, plus edge cases, rendered and escaped by
  // the dispatcher at c1172cd, before the table. Regenerate it only for an intended change.
  const GOLDEN = require('./inline-code-table.golden.json');
  const { KINDS } = table;
  const iconReads = (t) => KINDS.some((k) => k.plugin && k.resolve(t.replace(/^\\/, '')));
  test(`every frozen span renders and escapes as it did (${Object.keys(GOLDEN).length} spans)`, () => {
    let compared = 0;
    for (const [span, [html, esc, escBackslash]] of Object.entries(GOLDEN)) {
      if (iconReads(span)) continue; // `^{database}` is new syntax: it was literal before, by design
      assert.equal(table.renderHtml(span), html, `render ${span}`);
      assert.equal(table.escapedText(span), esc, `escape ${span}`);
      assert.equal(table.escapedText(`\\${span}`), escBackslash, `escape \\${span}`);
      compared++;
    }
    assert.ok(compared > 1000, `compared ${compared}`);
  });
});

describe('the inline-code table — the lead table and the probe flags', () => {
  // `dispatches`, `renderHtml` and `renderElement` ask only the rows whose `lead` is the span's
  // first character, and `dispatches` / the escape pass a row `probe` / `explain: false` so it can
  // answer yes or no without building fields or a message. Both are speed-ups that must change
  // nothing, so this pins each against the plain call it stands in for, over every frozen span,
  // each also behind a leading space, a backslash, a tab and a BOM (a row that rendered such a
  // span would be skipped).
  const GOLDEN = require('./inline-code-table.golden.json');
  const PREFIXES = ['', ' ', '\\', '\t', '\ufeff', 'x'];
  const spans = Object.keys(GOLDEN).flatMap((g) => PREFIXES.map((p) => p + g));
  const { KINDS } = table;

  test('every row has an ASCII lead, or asks regardless', () => {
    for (const k of KINDS) assert.ok(k.lead === -1 || (Number.isInteger(k.lead) && k.lead >= 0 && k.lead < 128), `${k.name}: ${k.lead}`);
    assert.deepEqual(KINDS.filter((k) => k.plugin).map((k) => [k.name, k.lead]), KINDS.filter((k) => k.plugin).map((k) => [k.name, k.sigil.charCodeAt(0)]));
  });

  test('a row never renders or accepts a span that does not open with its lead', () => {
    for (const k of KINDS) {
      if (k.lead === -1) continue;
      for (const span of spans) {
        if (span.charCodeAt(0) === k.lead) continue;
        assert.equal(k.resolve(span, null) ? 'resolved' : null, null, `${k.name} resolved ${JSON.stringify(span)}`);
        assert.equal(k.html(span, null), null, `${k.name} drew ${JSON.stringify(span)}`);
      }
    }
  });

  test('the table gives the answer the full loop would, with every plugin on and off', () => {
    const fullLoop = (span, off) => KINDS.filter((k) => !k.plugin || !off?.has(k.plugin)).some((k) => k.resolve(span, off));
    for (const off of [null, new Set(['icons']), new Set(['avatars']), new Set(['icons', 'avatars'])]) {
      for (const span of spans) assert.equal(table.dispatches(span, off), fullLoop(span, off), `${JSON.stringify(span)} off=${off && [...off]}`);
    }
  });

  /** Every inline-code span in every tracked Markdown file, fenced blocks left out, plugin spans
   *  INCLUDED (the guard below must see avatars and icons, which the golden file leaves out). */
  function allCorpusSpans() {
    const files = execSync(`git ls-files '*.md' ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT }).toString().trim().split('\n');
    const out = new Set();
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
      for (const m of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) out.add(m[1]);
    }
    return [...out];
  }

  /** Seeded edits of the corpus's own directive spans: drop, swap or repeat a word, borrow a word
   *  from another span, change the closer. The words come from the repo's decks, so a rule a
   *  FUTURE kind adds (`bare` with `tone`, a blank name) is reachable without being named here. */
  function mutants(seeds) {
    let state = 0x2650;
    const rnd = (n) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % n; };
    const directive = seeds.filter((t) => /^\\?[~^!]?[{[]/.test(t));
    // Words from the repo's own spans, and from each kind's own spec (every named value of every
    // parameter), so a rule such as "frame with look" is reachable without a span that happens to say it.
    const specWords = [];
    for (const spec of [icons.SPEC, avatars.SPEC, ...Object.values(CORE)]) {
      for (const [name, t] of Object.entries(spec.params || {})) {
        const values = t.values || (t.prefix ? Array.from({ length: Math.min(t.max, 14) }, (_, i) => `${t.prefix}${i + 1}`) : []);
        for (const v of values) specWords.push(`${name}=${v}`, v);
        specWords.push(`${name}=`, `${name}=x`);
      }
    }
    const words = [...new Set([...specWords, ...directive.flatMap((t) => t.replace(/^\\?[~^!]?[{[]|[}\]]$/g, '').split(/,\s*/))])];
    const out = [];
    for (const seed of directive) {
      for (let i = 0; i < 40; i++) {
        const m = /^(\\?[~^!]?[{[])(.*?)([}\]]?)$/.exec(seed);
        if (!m) continue;
        const parts = m[2].split(/,\s*/);
        const at = rnd(parts.length);
        switch (rnd(6)) {
          case 0: parts.splice(at, 1); break;
          case 1: parts.splice(at, 0, words[rnd(words.length)]); break;
          case 2: parts[at] = words[rnd(words.length)]; break;
          case 3: parts.push(words[rnd(words.length)], words[rnd(words.length)]); break;
          case 4: parts.splice(at, 0, parts[at]); break;
          default: parts.reverse(); break;
        }
        out.push(m[1] + parts.join(', ') + (rnd(8) === 0 ? '' : m[3]));
      }
    }
    return out;
  }

  /** Every PAIR of one kind's own parameter words after a valid head, so a rule that looks at two
   *  options together (a frame with a look, a skin with a beard) is reached by construction. */
  function pairs() {
    // Valid heads, and the empty or blank ones a kind refuses (a blank name, an empty label).
    const kinds = [['^{database', icons.SPEC], ['!{Ada Okafor', avatars.SPEC], ['{BETA', CORE.pill], ['~{1 2 3', CORE.spark],
      ['!{""', avatars.SPEC], ['!{ ', avatars.SPEC], ['!{c3', avatars.SPEC], ['{""', CORE.pill], ['{ ', CORE.pill], ['^{', icons.SPEC], ['~{', CORE.spark]];
    const out = [];
    for (const [head, spec] of kinds) {
      const words = [];
      for (const [name, t] of Object.entries(spec.params || {})) {
        const values = t.values || (t.prefix ? Array.from({ length: Math.min(t.max, 6) }, (_, i) => `${t.prefix}${i + 1}`) : []);
        for (const v of values.slice(0, 12)) words.push(`${name}=${v}`, v);
      }
      for (let i = 0; i < words.length; i++) {
        out.push(`${head}, ${words[i]}}`);
        for (let j = i + 1; j < words.length; j++) out.push(`${head}, ${words[i]}, ${words[j]}}`);
      }
    }
    return out;
  }

  const corpus = allCorpusSpans();
  const probed = [...new Set([...spans, ...corpus, ...corpus.map((c) => `\\${c}`), ...mutants(corpus), ...pairs()])];

  test('a probe says what a full resolve says, and explain: false what a full diagnose says, for every kind', () => {
    // The two flags let a kind skip work, never change its answer. Over the frozen spans, the repo's
    // own spans (avatars and icons included) and seeded edits of them, so a kind that drifts (a rule
    // added to `resolve` and not to its probe, a blank name that a probe forgets) fails here.
    assert.ok(probed.length > 5000, `probed ${probed.length}`);
    for (const k of KINDS) {
      for (const span of probed) {
        assert.equal(Boolean(k.resolve(span, null, true)), Boolean(k.resolve(span, null)), `${k.name}.resolve probe ${JSON.stringify(span)}`);
        if (k.diagnose) assert.equal(Boolean(k.diagnose(span, null, false)), Boolean(k.diagnose(span, null)), `${k.name}.diagnose explain=false ${JSON.stringify(span)}`);
      }
    }
  });

  test('the escape and dispatches give the plain-loop answer over the same spans, with plugins on and off', () => {
    const plainDispatch = (t, off) => KINDS.filter((k) => !k.plugin || !off?.has(k.plugin)).some((k) => k.resolve(t, off));
    const plainDiag = (t) => KINDS.some((k) => k.diagnose?.(t, undefined));
    for (const span of probed) {
      for (const off of [null, new Set(['icons', 'avatars'])]) {
        assert.equal(table.dispatches(span, off), plainDispatch(span, off), `dispatches ${JSON.stringify(span)}`);
      }
      const rest = span.slice(1);
      const want = span.length >= 2 && span[0] === '\\' && (plainDispatch(rest, undefined) || plainDiag(rest)) ? rest : null;
      assert.equal(table.escapedText(span), want, `escapedText ${JSON.stringify(span)}`);
    }
  });

  test('ordinary code asks no row at all, and each directive asks only the row that opens with it', () => {
    // The speed-up in one deterministic line: a span that opens with a letter, a dash or a slash
    // consults nothing, so its cost does not grow with the number of kinds. A timing assertion here
    // would flake in the merge train; `npm run parser:bakeoff:segno` carries the timing.
    for (const code of ['npm run build', '--on-accent', '/src/lib', '.md', '$0', 'a', '']) {
      assert.deepEqual(table.rowsAsked(code, null).map((k) => k.name), [], JSON.stringify(code));
    }
    const asked = (t) => table.rowsAsked(t, null).map((k) => k.name);
    assert.deepEqual(asked('[x]'), ['state']);
    assert.deepEqual(asked('{LIVE}'), ['pill']);
    assert.deepEqual(asked('~{1 2 3}'), ['spark']);
    assert.deepEqual(asked('^{database}'), ['icon']);
    assert.deepEqual(asked('!{Ada Okafor}'), ['avatar']);
    assert.deepEqual(table.rowsAsked('^{database}', new Set(['icons'])).map((k) => k.name), [], 'a plugin that is off leaves the list');
  });

});

describe('the inline-code table — plugin rows', () => {
  test('every plugin row names its plugin, a tag sigil and the four functions', () => {
    for (const k of table.KINDS.filter((r) => r.plugin)) {
      assert.match(k.sigil, /^[~^!]$/, k.name);
      for (const fn of ['resolve', 'html', 'element', 'diagnose']) assert.equal(typeof k[fn], 'function', `${k.name}.${fn}`);
    }
  });

  test('a plugin that is off leaves its rows out of the render, but never out of the escape', () => {
    // The escape is about the author's text, not what renders, so it must not depend on admission:
    // the runtime and the flowchart reader have no `off` to pass, and they must agree with the engine.
    const icon = table.KINDS.find((k) => k.plugin === 'icons');
    assert.ok(icon, 'the icons plugin contributes a row');
    const off = new Set(['icons']);
    assert.equal(table.renderHtml('^{database}', off), null);
    assert.equal(table.dispatches('^{database}', off), false);
    assert.equal(table.escapedText.length, 1, 'escapedText takes no admission set');
    assert.equal(table.escapedText('\\^{database}'), '^{database}');
  });

  test('the resolver\'s copy of the host rows matches the table', () => {
    const { HOST_INLINE } = require('../../../lib/plugins/resolve');
    assert.deepEqual([...HOST_INLINE.kinds], table.FIRST_PARTY.map((k) => k.name));
    assert.deepEqual({ ...HOST_INLINE.sigils }, Object.fromEntries(table.FIRST_PARTY.filter((k) => k.sigil).map((k) => [k.sigil, k.name])));
  });
});

describe('the named form — `@kind{…}` is its alias, on both paths (2026-10-14-plugin-inline-door.md)', () => {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const doc = window.document;
  // Every shipped span written with a sigil, or as an untagged pill, in the corpus: spelled the named way
  // it must draw what its alias draws, byte for byte, on the markdown-it path and the DOM path alike.
  const ALIAS = { '~': 'spark', '^': 'icon', '!': 'avatar' };
  const files = execSync(`git ls-files '*.md' ${EXCLUDE_MIRRORS_SHELL}`, { cwd: ROOT }).toString().trim().split('\n');
  const aliased = new Set();
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '');
    for (const m of text.matchAll(/(?<!`)`([~^!]?\{[^`\n]*)`(?!`)/g)) if (table.dispatches(m[1], null)) aliased.add(m[1]);
  }
  const named = (s) => (ALIAS[s[0]] ? `@${ALIAS[s[0]]}${s.slice(1)}` : `@pill${s}`);
  // The icons and avatars draw nothing until their data is provided (an engine does it; a unit test
  // that builds none does it itself), and nothing equals nothing: load both, and count real drawings.
  const { provideData } = require('../../../lib/plugins/plugin-data.js');
  provideData('icons', () => require('../../../lib/plugins/icons/icons.data.generated.js'));
  provideData('avatars', () => require('../../../lib/plugins/avatars/avatars.data.generated.js'));

  test(`every drawn alias span draws the same in its named spelling (${aliased.size} spans)`, () => {
    assert.ok(aliased.size > 100, `expected a real corpus, got ${aliased.size} spans`);
    for (const sig of ['~', '^', '!']) {
      assert.ok([...aliased].some((s) => s[0] === sig && /<svg/.test(table.renderHtml(named(s), null) || '')), `a drawn ${ALIAS[sig]} in its named spelling`);
    }
    // Byte for byte, but for `data-src`: a drawn kind stamps the author's own span there, so an editor
    // finds `@spark{…}` as written (the Studio's spark-fit fix keys on it), and that one attribute differs.
    const esc = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const src = (html, text) => (html || '').replace(` data-src="${esc(text)}"`, ' data-src=""');
    for (const s of aliased) {
      const a = table.renderHtml(s, null);
      const n = table.renderHtml(named(s), null);
      assert.equal(src(n, named(s)), src(a, s), named(s));
      if (a?.includes(' data-src=')) assert.ok(n.includes(` data-src="${esc(named(s))}"`), `${named(s)} stamps the author's spelling`);
      assert.equal(src(table.renderElement(doc, named(s), null)?.outerHTML, named(s)), src(table.renderElement(doc, s, null)?.outerHTML, s), `${named(s)} (DOM)`);
      assert.equal(table.canonicalText(named(s)), s);
    }
  });

  test('every data plugin\'s usage probe sees both spellings of its kinds, or a browser never fetches the drawings', () => {
    const { DATA_PLUGINS } = require('../../../lib/plugins/data-probe.generated.mjs');
    const rows = table.KINDS.filter((k) => k.plugin && k.sigil);
    assert.ok(rows.length >= 2, 'the shipped inline kinds (icon, avatar)');
    for (const k of rows) {
      const probe = DATA_PLUGINS.find((d) => d.name === k.plugin);
      if (!probe) continue;
      assert.equal(probe.detect(`- A \`${k.sigil}{x}\``), true, `${k.plugin} probe: ${k.sigil}{`);
      assert.equal(probe.detect(`- A \`@${k.name}{x}\``), true, `${k.plugin} probe: @${k.name}{`);
    }
  });

  test('a named span follows its plugin: off with it, and the escape keeps it literal', () => {
    assert.equal(table.dispatches('@icon{database}', new Set(['icons'])), false);
    assert.equal(table.offPlugin('@icon{database}', new Set(['icons'])), 'icons');
    assert.equal(table.escapedText('\\@icon{database}'), '@icon{database}');
  });

  test('only `@` + a known kind + `{` directly after it is a call: a mention, a scope, a spaced brace, a zip kind stay code', () => {
    for (const t of ['@ada', '@laticent/segno', '@Override', '@avatar {Ada}', '@Icon{database}', '@gantt-bar{Design, 2}', '@state{x}', '@named{x}']) {
      assert.equal(table.dispatches(t, null), false, t);
      assert.equal(table.escapedText(`\\${t}`), null, `\\${t} keeps its backslash`);
    }
  });
});
