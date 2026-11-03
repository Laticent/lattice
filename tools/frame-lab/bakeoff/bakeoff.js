#!/usr/bin/env node
/**
 * Table-type detection bake-off: which detector gives each table the right narrow layout?
 *
 * Scores candidate detectors against corpus.json (225 markdown tables from this repo, frozen
 * on 2026-11-03) and labels.json (each table's kind, labeled by an independent agent before
 * any detector was written). What matters is the LAYOUT a table gets when it runs out of width,
 * so the headline score groups kinds by layout: cards (records, prose), labels + a run of
 * columns (periods, options, crosstab), two-line rows (ranked, schedule), label over value
 * (keyvalue), one block per column (lists).
 *
 * The last row, `lib/core/table-shape.js`, is the detector that shipped; the others are the
 * contenders it beat. test/unit/core/table-shape.test.js holds the shipped one to a floor
 * on this same corpus, so a change to the kernel cannot quietly lose ground.
 *
 * Usage: npm run tables:bakeoff [-- --misses]   (--misses lists the shipped detector's misses)
 *
 * The corpus is a SNAPSHOT: its file paths and line numbers are where each table sat when it
 * was taken, and they will drift. Re-extract with `node tools/frame-lab/bakeoff/corpus.js`
 * only together with re-labeling, or the labels stop matching their tables.
 */

const path = require('node:path');
const corpus = require('./corpus.json');
const labels = Object.fromEntries(require('./labels.json').map((l) => [l.id, l]));
const { tableShape } = require('../../../lib/core/table-shape.js');

const TYPE = { 1: 'records', 2: 'keyvalue', 3: 'periods', 4: 'options', 5: 'crosstab', 6: 'lists', 7: 'ranked', 8: 'prose', 9: 'schedule', 0: 'other' };
const LAYOUT = { records: 'cards', prose: 'cards', other: 'cards', periods: 'labels+run', crosstab: 'labels+run', options: 'labels+run', ranked: 'two-line', schedule: 'two-line', keyvalue: 'label-over-value', lists: 'blocks' };

// Cell text for the features: markdown emphasis and links unwrapped, inline HTML tags removed.
// Repeated until nothing changes, so a tag split by another (`<b<i>>`) cannot survive one pass.
const strip = (s) => {
  let out = String(s).replace(/\*\*|__|`|\[([^\]]*)\]\([^)]*\)/g, '$1');
  for (let prev = null; prev !== out;) { prev = out; out = out.replace(/<[^<>]*>/g, ''); }
  return out.trim();
};
const words = (s) => strip(s).split(/\s+/).filter(Boolean).length;
const NUM = /^[-+±~≈]?[$€£¥]?\s*[\d.,]+\s*(%|x|×|ms|s|kb|mb|gb|k|m|b|pt|px|em|rem|\$m|\$k)?$/i;
const MARK = /^(✓|✔|✗|✕|×|—|–|-|yes|no|y|n|n\/a|partial|●|○|◐|✅|❌|⚠️?|true|false|on|off)$/i;
const PERIOD = /^(q[1-4]|h[12]|fy\s?\d{2,4}|\d{4}|(19|20)\d{2}\s?q[1-4]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|week\s?\d+|w\d+|day\s?\d+|v?\d+(\.\d+)+|step\s?\d+|phase\s?\d+|before|after|now|today|current|next|previous|prior)$/i;
const DATEISH = /^(\d{1,2}\s\w{3,9}|\w{3,9}\s\d{1,2}(,\s?\d{4})?|\d{4}-\d{2}(-\d{2})?|\d{1,2}\/\d{1,2}(\/\d{2,4})?|q[1-4]\s?\d{4}|(19|20)\d{2}|v?\d+\.\d+(\.\d+)?)$/i;
const share = (arr, re) => (arr.length ? arr.filter((c) => re.test(strip(c))).length / arr.length : 0);

function features(t) {
  const h = t.head.map(strip), n = h.length;
  const body = t.body.map((r) => r.slice(0, n));
  const rest = body.flatMap((r) => r.slice(1)).filter((c) => strip(c) !== '');
  const first = body.map((r) => r[0] || '');
  return {
    n, rows: body.length,
    numRest: share(rest, NUM), markRest: share(rest, MARK),
    periodHead: n > 1 ? h.slice(1).filter((x) => PERIOD.test(x)).length / (n - 1) : 0,
    dateFirst: share(first, DATEISH),
    rankFirst: /^(#|rank|no\.?|pos(ition)?)$/i.test(h[0]) || first.every((c, i) => strip(c) === String(i + 1)),
    timeHead0: /^(date|when|time|day|week|month|year|quarter|version|release|deadline|due)$/i.test(h[0]),
    wordsRest: rest.length ? rest.reduce((a, c) => a + words(c), 0) / rest.length : 0,
  };
}

const DETECTORS = {
  // No detection: every table gets the one reshape that existed before, row → card.
  'A. default only': () => 'records',
  // The smallest structural rule set: two columns, number-heavy grids, else cards.
  'B. structure only': (_t, f) => (f.n === 2 ? 'keyvalue' : f.numRest >= 0.6 ? 'crosstab' : 'records'),
  // Ordered rules over structure and content.
  'C. rules': (_t, f) => {
    if (f.n === 2) return 'keyvalue';
    if (f.rankFirst && f.rows >= 3) return 'ranked';
    if (f.timeHead0 || f.dateFirst >= 0.75) return 'schedule';
    if (f.periodHead >= 0.6) return 'periods';
    if (f.markRest >= 0.5) return 'options';
    if (f.numRest >= 0.6) return 'crosstab';
    if (f.wordsRest >= 7) return 'prose';
    return 'records';
  },
  // C, with every threshold raised so an unsure call falls back to cards.
  'D. rules, cautious': (_t, f) => {
    if (f.n === 2) return 'keyvalue';
    if (f.rankFirst && f.rows >= 3) return 'ranked';
    if (f.timeHead0 && f.dateFirst >= 0.5) return 'schedule';
    if (f.periodHead >= 0.8 && f.numRest >= 0.5) return 'periods';
    if (f.markRest >= 0.7) return 'options';
    if (f.numRest >= 0.8) return 'crosstab';
    if (f.wordsRest >= 9) return 'prose';
    return 'records';
  },
  // The shipped kernel: which way the values line up decides row labels, then rules.
  'E. lib/core/table-shape.js': (t) => tableShape({ headers: t.head, rows: t.body }) || 'records',
};

/** Score one detector. Exported for the unit test's floor. */
function score(detect) {
  const r = { n: 0, layout: 0, type: 0, deckN: 0, deckLayout: 0, misses: [] };
  for (const t of corpus) {
    const truth = TYPE[labels[t.id].type];
    const guess = detect(t, features(t));
    r.n++;
    if (guess === truth) r.type++;
    const ok = LAYOUT[guess] === LAYOUT[truth];
    if (ok) r.layout++;
    else r.misses.push({ id: t.id, file: `${t.file}:${t.line}`, truth, guess });
    if (t.src === 'deck') { r.deckN++; if (ok) r.deckLayout++; }
  }
  return r;
}

if (require.main === module) {
  const pct = (a, b) => `${(100 * a / b).toFixed(0)}%`;
  console.log(`${corpus.length} tables (${corpus.filter((t) => t.src === 'deck').length} from decks), labeled independently.\n`);
  console.log('detector                       right layout   right type   right layout (decks)');
  let shipped = null;
  for (const [name, detect] of Object.entries(DETECTORS)) {
    const r = score(detect);
    if (name.startsWith('E.')) shipped = r;
    console.log(`${name.padEnd(30)} ${pct(r.layout, r.n).padStart(8)}     ${pct(r.type, r.n).padStart(8)}     ${pct(r.deckLayout, r.deckN).padStart(8)} of ${r.deckN}`);
  }
  if (process.argv.includes('--misses')) {
    console.log(`\nshipped detector misses (${shipped.misses.length}):`);
    for (const m of shipped.misses) console.log(`  ${m.id}  ${LAYOUT[m.truth]} → ${LAYOUT[m.guess]}  (${m.truth} read as ${m.guess})  ${m.file}`);
  }
}

module.exports = { score, DETECTORS, LAYOUT, TYPE, corpusPath: path.join(__dirname, 'corpus.json') };
