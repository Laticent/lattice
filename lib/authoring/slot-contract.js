/**
 * lib/authoring/slot-contract.js — the reader behind lint's `slot-contract` rule.
 *
 * A component manifest's `slots` say what an author writes for that layout. Each slot carries a
 * structured `match` (lib/components/manifest.schema.json `$defs.slotMatch`) that describes the
 * author's MARKDOWN, the markdown-it block tree before any transform, never the rendered DOM.
 * tools/build-stage-catalog.js packs every manifest's contract into ONE string of short CODES
 * (lib/authoring/slot-contract-pack.js `codeOf`), and lint.js hands it to lint-core in the
 * vocabulary as `slotContract`. This file reads a slide into a small `shape` and tests the codes
 * against it, working on the codes directly so the lint bundle carries no object model.
 *
 * A code is one letter and its arguments: h<levels> heading · l<depth><b|o|a> list (bullet,
 * ordered, any) · q / qi blockquote (top level / inside an item) · t table · m math · p paragraph ·
 * i image · n pane · f[:lang][#nth] fence · c[:prefix] code-line · x[:tag] html. A slot is its
 * alternatives joined by `,`, then `!` (required) or `?` (optional), or `-` (dropped by a variant).
 *
 * What it reports, as `slot-contract` errors (decision 5 of
 * engineering/decisions/2026-11-19-deterministic-authoring-audit.md): a required heading at the
 * wrong level, a required slot that is missing, and a list written with the marker a layout does
 * not read. Pure and fs-free (HARD RULE #7).
 */

const { PLUGIN_BLOCK_RULES } = require('../plugins/blocks.generated.mjs');

/** Block token type → the plugin that owns it (math's `$$` block). */
const PLUGIN_OF = new Map(Object.entries(PLUGIN_BLOCK_RULES).flatMap(([p, types]) => types.map((t) => [t, p])));

/**
 * Read a slide's Markdown into the shape the codes test. `md` is a markdown-it instance whose block
 * rules match the engine's (lib/core/boundary-parser.mjs `boundaryParser`). Raw HTML counts as the
 * element it names: a `<h2>`, an `<img>` or a `<blockquote>` fills the slot its Markdown form would.
 */
function slideShape(text, md) {
  const s = { h: [], l: [], q: [], t: 0, f: [], plug: new Set(), p: [], img: 0, html: [] };
  let depth = 0;
  let quoted = 0;
  const tokens = md.parse(String(text || ''), {});
  tokens.forEach((t, i) => {
    const y = t.type;
    if (y === 'bullet_list_open' || y === 'ordered_list_open') s.l.push({ d: ++depth, m: y[0], q: quoted > 0 });
    else if (y === 'bullet_list_close' || y === 'ordered_list_close') depth--;
    else if (y === 'blockquote_open') {
      s.q.push(depth);
      quoted++;
    } else if (y === 'blockquote_close') quoted--;
    else if (y === 'heading_open') {
      if (!t.level) s.h.push(+t.tag[1]);
    } else if (y === 'table_open') s.t++;
    else if (y === 'fence' || y === 'code_block') s.f.push(String(t.info || '').trim().split(/\s/)[0].toLowerCase());
    else if (y === 'html_block') {
      const b = t.content.trim();
      if (b.startsWith('<!--')) return;
      s.html.push(b);
      const h = /^<h([1-6])/i.exec(b);
      if (h && !depth) s.h.push(+h[1]);
      if (/<img\b/i.test(b)) s.img++;
      if (/^<blockquote/i.test(b)) s.q.push(depth);
    } else if (y === 'inline') {
      const kids = t.children || [];
      for (const c of kids) if (c.type === 'image' || (c.type === 'html_inline' && /^<img\b/i.test(c.content))) s.img++;
      const prev = tokens[i - 1];
      if (prev.type !== 'paragraph_open' || prev.level || depth || quoted) return;
      const solid = kids.filter((c) => !/break$/.test(c.type) && (c.type !== 'text' || c.content.trim()));
      const all = (type) => solid.length && solid.every((c) => c.type === type);
      // A paragraph that is only inline code is a code-line (the eyebrow shape); a block-level
      // HTML element written inline (`<svg …>`) is HTML, not prose.
      const kind = all('code_inline') ? 'c' : all('image') ? 'i' : solid.some((c) => c.type === 'html_inline' && /^<(svg|div|figure|table|video|audio|iframe|picture|object|canvas)\b/i.test(c.content)) ? 'x' : 'p';
      if (kind === 'x') s.html.push(t.content);
      s.p.push({ k: kind, text: t.content });
    } else if (PLUGIN_OF.has(y)) s.plug.add(PLUGIN_OF.get(y));
  });
  return s;
}

/** The argument after `sep` in a code (`f:mermaid#2` → `mermaid` for `:`, `2` for `#`). */
const arg = (code, sep) => (code.includes(sep) ? code.split(sep)[1].split(/[:#]/)[0] : '');

/** Does `shape` hold what one code describes? `panes`: the slide splits into panes. */
function test(code, s, panes) {
  const a = code.slice(1);
  switch (code[0]) {
    case 'h': return s.h.some((l) => a.includes(l));
    case 'l': return s.l.some((l) => l.d === +a[0] && !l.q && (a[1] === 'a' || l.m === a[1]));
    case 'q': return s.q.some((d) => (a ? d > 0 : d === 0));
    case 't': return s.t > 0;
    // A fence counts at any depth: the engine lifts a ```mermaid block indented under a bullet.
    case 'f': return s.f.filter((l) => !arg(code, ':') || l === arg(code, ':')).length >= (+arg(code, '#') || 1);
    case 'm': return s.plug.has('math') || s.p.some((p) => p.text.includes('$'));
    case 'p': return s.p.some((p) => p.k === 'p');
    case 'c': return s.p.some((p) => p.k === 'c' && p.text.replace(/^`+\s*/, '').startsWith(arg(code, ':')));
    case 'i': return s.img > 0;
    case 'x': return s.html.some((h) => new RegExp(`<${arg(code, ':')}`, 'i').test(h));
    case 'n': return !!panes;
    default: return true;
  }
}

const MARK = { b: '`-`', o: '`1.`' };
/** One code in an author's words, from the phrase dictionary the packed contract carries (built by
 *  lib/authoring/slot-contract-pack.js `phraseOf`, so the wording costs the lint bundle nothing). */
const say = (code) => last[1]?.['~'][code] || code;
/** A rule message from its template in the same dictionary (`@missing`, …), `{x}` filled from `v`. */
const word = (key, v) => (last[1]?.['~'][`@${key}`] || key).replace(/\{(\w)\}/g, (_, k) => v[k] ?? '');

/** A slot's alternatives and requiredness, from its packed text (`l1b,t!`). */
const parseSlot = (text) => ({ alts: text.replace(/[!?]$/, '').split(',').filter(Boolean), req: text.endsWith('!') ? true : text.endsWith('?') ? false : undefined });

/**
 * The packed contract string → `{ component: { slots, over, kinds, variants } }`: `slots` maps a
 * slot name to its packed text, `over` maps a variant to the slots it changes. Memoized on the string.
 */
let last = [null, null];
function unpackContract(packed) {
  if (packed === last[0]) return last[1];
  const words = (f) => (f ? f.split(' ') : []);
  const pairs = (f, sep) => Object.fromEntries(words(f).map((w) => [w.slice(0, w.indexOf(sep)), w.slice(w.indexOf(sep) + 1)]));
  const table = { '~': {} };
  for (const entry of String(packed || '').split(';')) {
    // The `~` entry is the phrase dictionary: `~code=phrase|code=phrase`.
    if (entry[0] === '~') {
      for (const pair of entry.slice(1).split('|')) table['~'][pair.slice(0, pair.indexOf('='))] = pair.slice(pair.indexOf('=') + 1);
      continue;
    }
    const [name, slots, variants, over, kinds] = entry.split('|');
    if (!name) continue;
    table[name] = {
      slots: pairs(slots, '='),
      variants: words(variants),
      over: Object.fromEntries(Object.entries(pairs(over, ':')).map(([v, list]) => [v, pairs(list.replace(/\+/g, ' '), '=')])),
      kinds: pairs(kinds, '='),
    };
  }
  last = [packed, table];
  return table;
}

/**
 * The slots in force for a component on a slide: its own, overlaid in class order by each variant's
 * overrides. An override's code replaces the match and keeps the base requiredness unless it says
 * its own; `-` drops the slot.
 */
function slotsFor(entry, tokens) {
  const out = Object.fromEntries(Object.entries(entry.slots).map(([k, v]) => [k, parseSlot(v)]));
  for (const t of tokens) {
    for (const [name, text] of Object.entries(entry.over[t] || {})) {
      if (text === '-') delete out[name];
      else {
        const o = parseSlot(text);
        out[name] = { alts: o.alts.length ? o.alts : out[name]?.alts || [], req: o.req ?? out[name]?.req };
      }
    }
  }
  return out;
}

/**
 * The `slot-contract` problems on one slide, as `{ slot, kind, message, fix }` (the caller adds
 * slide, line and severity). `kind` is `marker`, `heading-level` or `missing`.
 */
function slotProblems(component, entry, tokens, shape, panes) {
  const out = [];
  for (const [name, { alts, req }] of Object.entries(slotsFor(entry, tokens))) {
    if (!alts.length) continue;
    const present = alts.some((c) => test(c, shape, panes));
    const one = alts.length === 1 && alts[0][0] === 'l' && alts[0][2] !== 'a' ? alts[0] : null;
    // A list slot that names ONE marker: a list at its depth in the other marker is the wrong
    // form even when the slot is optional, because the layout does not read it.
    if (one && !present && shape.l.some((l) => l.d === +one[1] && !l.q)) {
      const v = { c: component, s: name, w: say(one), g: MARK[one[2] === 'b' ? 'o' : 'b'] };
      out.push({ slot: name, kind: 'marker', message: word('marker', v), fix: word(one[2] === 'o' ? 'markerFixO' : 'markerFixB', { g: +one[1] > 1 ? 'nested ' : '' }) });
      continue;
    }
    if (present || !req) continue;
    const wrong = alts[0][0] === 'h' && shape.h.find((l) => l <= 2 && !alts[0].includes(l));
    const w = alts.map(say).join(' or ');
    out.push(wrong
      ? { slot: name, kind: 'heading-level', message: word('level', { c: component, s: name, w, g: `\`${'#'.repeat(wrong)} \`` }), fix: word('levelFix', { w: say(`h${alts[0].slice(-1)}`) }) }
      : { slot: name, kind: 'missing', message: word('missing', { c: component, s: name, w }), fix: word('missingFix', { w }) });
  }
  return out;
}

module.exports = { slideShape, test, unpackContract, slotsFor, slotProblems, word };
