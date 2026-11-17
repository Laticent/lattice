// The front-matter register family's one shape: a deck register that takes ONE value from a closed list (`finish:`,
// `mode:`, `stamp:`, the five spectrum dials, `pace:` …), reported when the value the line carries is not on the list,
// with a did-you-mean fix when exactly one name is close. Twenty-three lint-core validators had this shape and differed
// only in the key, the list, how they read the line and the sentence they print, so here each is one row of
// ./index.js and this module is the reading they share.
//
// Each row reads its line the way the register's resolver does, from `lattice-deck`'s `fm-key` nodes, never by
// re-parsing the text:
//
//   pick   'loose'   the last column-0 line for the key, else the first indented one (`looseKey`, the read every
//                    register resolver shares through `frontMatterValue`)
//          'top'     the last column-0 line only (`color-mode:`, `preset:`, whose resolvers read column 0)
//   value  'bare'    the shared scalar rule, then a bare name (`frontMatterName`); when that is no name (mismatched
//                    quotes), lint-core's own token read, so the port is never quieter than lint-core
//          'scalar'  the shared scalar rule, `frontMatterScalar` (the fm-key's `value` attr): quotes and a trailing
//                    comment stripped
//          'venue'   lint-core's own venue pattern: any text up to a quote or `#`
//
// ONE DELIBERATE CHANGE FROM LINT-CORE. lint-core's seventeen 'bare' validators matched
// `^…:\s*["']?([A-Za-z0-9_-]+)["']?\s*$`, so a trailing comment (`finish: hallo  # for the board`) made the line fail
// to match and the rule said nothing, while the engine read `hallo` and rendered no backdrop. `inline-code:`, `pace:`,
// `color-mode:` and `preset:` had been moved onto the scalar rule for that reason; these had not. The port reads them
// all through it. The reference diff lists the findings this adds as intended (tools/squadra/explained.json), and the
// fixtures pin one per row. Everything else is lint-core's reading, which the diff holds at 0.
//
// Pure and fs-free: the Studio bundles the ruleset.

const { editsFix } = require('@laticent/squadra/runtime');

/** Edit distance with an early exit past `max` (lint-core's `editDistance`, the bound included). */
function editDistance(a, b, max) {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > max) return max + 1;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * The one candidate close enough to be the name the author meant, or null (lint-core's `nearestRegion`): the bound
 * scales with the word's length, and the first candidate at the best distance wins, so the list's order matters and
 * the vocab bridge keeps a register's names in their authored order.
 */
function nearest(name, candidates) {
  const q = name.toLowerCase();
  const max = q.length <= 4 ? 1 : q.length <= 8 ? 2 : 3;
  let best = null;
  let bestD = max + 1;
  for (const c of candidates) {
    const d = editDistance(q, c.toLowerCase(), max);
    if (d < bestD) {
      bestD = d;
      best = c;
      if (d === 0) break;
    }
  }
  return bestD <= max ? best : null;
}

const BARE_NAME = /^[A-Za-z0-9_-]+$/;
// lint-core's own bare read, for a value the scalar rule cannot clean into a name: mismatched quotes (`mode: "sketchy'`)
// read as no name to the engine, so the deck keeps its default, and lint-core named the word inside. Kept, so the port
// is never quieter than lint-core on a line the engine ignores.
const LEGACY_BARE = /^\s*["']?([A-Za-z0-9_-]+)["']?\s*$/;

/**
 * lint-core's venue read, `^[ \t]*["']?([^"'#\n]*?)["']?[ \t]*(?:#.*)?$`, as a scan: that pattern is polynomial (its
 * lazy body and the blanks after it both take spaces), so the census refuses it. The value can hold no quote and no
 * `#`, so it is the text up to the first of them, and the line reads only when what follows is a closing quote and
 * blanks, a comment, or nothing.
 */
function readVenue(raw) {
  const rest = raw.replace(/^[ \t]*["']?/, '');
  const i = rest.search(/["'#]/);
  if (i >= 0 && rest[i] !== '#' && !/^[ \t]*(?:#|$)/.test(rest.slice(i + 1))) return null;
  return (i < 0 ? rest : rest.slice(0, i)).trim();
}

/** The value a line's raw text reads as, or null when it reads none. */
function readValue(mode, key) {
  if (mode === 'bare') return BARE_NAME.test(key.attrs.value) ? key.attrs.value : (LEGACY_BARE.exec(key.attrs.raw)?.[1] ?? null);
  if (mode === 'venue') return readVenue(key.attrs.raw);
  return key.attrs.value;
}

/** The line a row reads (the last column-0 line for the key, else, for a loose row, the first indented one) and its value. */
function pickLine(fmKeys, row) {
  const named = fmKeys.filter((k) => k.attrs.name === row.key);
  const line = named.findLast((k) => k.attrs.top) ?? (row.pick === 'top' ? null : named[0]);
  if (!line) return null;
  const value = readValue(row.value, line);
  return value === null ? null : { key: line, value };
}

/**
 * One register rule from its row:
 *   { name, key, vocab, pick, value, message(value), hint(names), suggest }
 * `suggest: false` reports without a fix (lint-core's `unknown-corners` never attached one).
 */
function registerValueRule(row) {
  const { name, key, vocab, suggest = true } = row;
  return {
    id: `deck/${name}`,
    language: 'lattice-deck',
    severity: 'warning',
    summary: `A \`${key}:\` value that is not one of the register's names.`,
    examples: `front-matter/${name}.fixtures.md`,
    legacy: name,
    reads: { vocab: [vocab] },
    fixable: suggest,
    budget: { ops: 20_000 },
    visit: {
      'front-matter'(node, ctx) {
        const line = pickLine(node.kids.filter((k) => k.kind === 'fm-key'), row);
        if (!line?.value) return;
        const names = ctx.vocab(vocab);
        const known = new Set(names.map((n) => n.toLowerCase()));
        if (known.has(line.value.toLowerCase())) return;
        // The value's span: the fm-key's value part is the raw text less its blanks, and every reading takes the value
        // verbatim from it (inside its quotes, before its comment), so it is found there.
        const written = ctx.raw(line.key.parts.value);
        const at = written.indexOf(line.value);
        const span = at >= 0 ? { from: line.key.parts.value.from + at, to: line.key.parts.value.from + at + line.value.length } : { from: line.key.from, to: line.key.to };
        const near = suggest ? nearest(line.value, names) : null;
        const fixes = near && near !== line.value && at >= 0 ? [editsFix(`Write \`${near}\`.`, [{ op: 'replace', span, text: near }])] : undefined;
        ctx.report({ span, message: row.message(line.value), hint: row.hint(names, line.value), fixes, data: near && near !== line.value ? { didYouMean: near } : undefined });
      },
    },
  };
}

module.exports = { registerValueRule, nearest, editDistance };
