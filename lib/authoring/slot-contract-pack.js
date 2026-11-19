/**
 * lib/authoring/slot-contract-pack.js — the BUILD-TIME half of the slot contract.
 *
 * lib/authoring/slot-contract.js (in lint-core's bundle) works on short codes. This file turns a
 * manifest slot's `match` object into its code (`codeOf`), packs a whole contract table into the
 * one string lint reads (`packContract`, called by tools/build-stage-catalog.js), and gives the
 * docs generator and the tests the object-shaped helpers (`describeMatch`, `matches`). Nothing in
 * lint-core requires it, so none of it rides the Studio's lint bundle.
 */
const { test } = require('./slot-contract.js');

const MARK = { b: '`-`', o: '`1.`' };
const arg = (code, sep) => (code.includes(sep) ? code.split(sep)[1].split(/[:#]/)[0] : '');
/** One code in an author's words. Never a bare run of backticks: in a Markdown table cell that
 *  opens a code span which swallows the rest of the row. Rendered here, at build time, into the
 *  packed contract's phrase dictionary, which is where lint reads it. */
function phraseOf(code) {
  const a = code.slice(1);
  const lang = arg(code, ':');
  switch (code[0]) {
    case 'h': return [...a].map((l) => `a \`${'#'.repeat(l)} \` heading`).join(' or ');
    case 'l': return `a ${MARK[a[1]] ? `${MARK[a[1]]} ` : ''}list${a[0] > 1 ? ` nested ${a[0] - 1} level${a[0] > 2 ? 's' : ''} under an item` : ''}`;
    case 'q': return `a \`>\` blockquote${a ? ' inside an item' : ''}`;
    case 'f': return `${+arg(code, '#') > 1 ? 'the second' : 'a'} fenced code block${lang ? ` tagged \`${lang}\`` : ''}`;
    case 'c': return lang ? `a \`${lang}…\` line` : 'a line of `inline code`';
    case 'x': return lang ? `an inline \`<${lang}>\`` : 'an HTML block';
    default: return { t: 'a table', m: 'a `$$` equation', p: 'a paragraph', i: 'an image (`![alt](src)`)', n: 'two panes' }[code[0]] || 'its content';
  }
}

const MARKER = { bullet: 'b', ordered: 'o', any: 'a' };
/** One `match` (or an any-of array) → its code (`l1b`, `h12`, `f:mermaid#2`; alternatives joined by `,`). */
function codeOf(m) {
  if (Array.isArray(m)) return m.map(codeOf).join(',');
  switch (m.kind) {
    case 'heading': return `h${[].concat(m.level).join('')}`;
    case 'list': return `l${m.depth}${MARKER[m.marker]}`;
    case 'blockquote': return m.inList ? 'qi' : 'q';
    case 'fence': return `f${m.lang ? `:${m.lang}` : ''}${m.nth ? `#${m.nth}` : ''}`;
    case 'code-line': return `c${m.prefix ? `:${m.prefix}` : ''}`;
    case 'html': return `x${m.tag ? `:${m.tag}` : ''}`;
    default: return { table: 't', math: 'm', paragraph: 'p', image: 'i', pane: 'n' }[m.kind];
  }
}

/**
 * The messages of the three contract rules, as templates the packed contract carries (`@key`
 * entries of its dictionary), so all their wording lives here and none of it rides the lint bundle.
 * `{c}` component · `{s}` slot · `{w}` what it reads · `{g}` what the slide writes · `{t}` the
 * class word · `{n}` the variant(s) it needs. No `;` or `|`: those separate the packed string.
 */
const TEMPLATES = {
  marker: "'{c}' reads its {s} from {w}, but this slide writes {g}, so the layout does not draw it.",
  markerFixO: 'Number the {g}items: `1.`, `2.`, `3.`.',
  markerFixB: 'Start each {g}item with `-`.',
  level: "'{c}' reads its {s} from {w}, but this slide writes {g}, so no {s} is built.",
  levelFix: 'Write it as {w} instead.',
  missing: "'{c}' needs its {s}, written as {w}. This slide has none, so that part of the layout is empty.",
  missingFix: 'Add {w}.',
  source: "'{t}' is not a class on '{c}': the layout reads it from how the Markdown is written, so the class does nothing.",
  sourceFix: "Remove '{t}' from the `_class`. {c}.docs.md says what to write instead.",
  requires: "'{c} {t}' acts only with '{n}', so on its own it does nothing.",
  requiresFix: "Add '{n}', or remove '{t}'.",
  foreign: "'{t}' is a variant of '{n}', not of '{c}', so it does nothing here.",
  foreignFix: "Remove '{t}', or use one of the variants '{c}'.docs.md lists.",
};

/** A `match` in an author's words (the component guides' "Write" column). */
const describeMatch = (m) => codeOf(m).split(',').map(phraseOf).join(' or ');

/** Does a slide shape (slot-contract.js `slideShape`) hold what `match` describes? */
const matches = (m, shape, facts = {}) => codeOf(m).split(',').some((c) => test(c, shape, facts.panes));

/** A slot → its packed text: the codes, then `!` required or `?` optional; `-` for a dropped slot. */
function slotText(s) {
  if (s === null) return '-';
  return `${s.match ? codeOf(s.match) : ''}${s.required === true ? '!' : s.required === false ? '?' : ''}`;
}

/**
 * The contract table (`{ component: { slots, variantSlots?, variantKinds?, variants? } }`) → the
 * packed string: `comp|slots|variants|overrides|kinds` per component, joined by `;`.
 */
function packContract(table) {
  const SAFE = /^[A-Za-z0-9=,:#!?@.+-]*$/;
  const entries = Object.entries(table).map(([name, e]) => {
    const fields = [
      name,
      Object.entries(e.slots).map(([k, s]) => `${k}=${slotText(s)}`).join(' '),
      (e.variants || []).join(' '),
      Object.entries(e.variantSlots || {}).map(([v, over]) => `${v}:${Object.entries(over).map(([k, s]) => `${k}=${slotText(s)}`).join('+')}`).join(' '),
      Object.entries(e.variantKinds || {}).map(([v, k]) => `${v}=${k.kind === 'source' ? 's' : `r:${k.requires.join(',')}`}`).join(' '),
    ];
    for (const f of fields) for (const w of f.split(' ')) if (!SAFE.test(w)) throw new Error(`slot contract: '${w}' (${name}) cannot be packed`);
    while (fields.length > 2 && !fields[fields.length - 1]) fields.pop();
    return fields.join('|');
  });
  // The phrase dictionary: every code the table uses (and each list code's first-level form, which
  // a marker message names), in an author's words.
  const slotTexts = Object.values(table).flatMap((e) => [
    ...Object.values(e.slots),
    ...Object.values(e.variantSlots || {}).flatMap((over) => Object.values(over)),
  ]).filter(Boolean).map(slotText);
  const codes = new Set(slotTexts.flatMap((t) => t.replace(/[!?]$/, '').split(',')).filter((c) => c && c !== '-'));
  const dict = [...[...codes].sort().map((c) => `${c}=${phraseOf(c)}`), ...Object.entries(TEMPLATES).map(([k, v]) => `@${k}=${v}`)];
  for (const d of dict) if (/[|;]/.test(d)) throw new Error(`slot contract: phrase '${d}' cannot be packed`);
  return [...entries, `~${dict.join('|')}`].join(';');
}

module.exports = { codeOf, phraseOf, describeMatch, matches, slotText, packContract };
