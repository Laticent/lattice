/**
 * graph-key — the key under a graph chart (the flowchart and the state chart), built from
 * the grammar's derived key (`deriveKey` in lib/core/flowchart-grammar.js).
 *
 * One builder for both charts, so a status word, a heavy line or a slot decodes the same
 * way wherever it is drawn. The markup is the flowchart's (`fc-key*`), and the flowchart's
 * stylesheet paints it on both charts' slides.
 *
 * ONE ENTRY PER TONE. A key decodes COLOR, and two status words that paint the same tile
 * are one color: listed apart, `on-track` and `done` showed two identical green chips that
 * read as a duplicated key (the state chart's legend fixed this first, followups.d 2355-p3).
 * Words sharing a tone share an entry, their labels joined with a middle dot, in the order
 * they first appear.
 */
const { escAttr, escHtml } = require('./transform-utils');

// The status word -> tone table. The stylesheets' status tables are the other statements of
// it, and a unit test holds them equal.
const STATUS_TONE = {
  'on-track': 'pass', done: 'pass',
  live: 'info', pilot: 'info', decision: 'info',
  'at-risk': 'warn', warn: 'warn',
  blocked: 'fail', fail: 'fail',
  deferred: 'mute',
};

/** One key entry's swatch: the mark it decodes, drawn in CSS from data attributes. */
function keySwatch(k, model) {
  // A line swatch is a short run of the line itself, so its weight and dash are the
  // chart's own rather than a CSS border's approximation of them.
  const line = (attrs) => `<svg class="fc-key-swatch" data-kind="line" viewBox="0 0 20 10" aria-hidden="true"><path class="fc-key-line"${attrs} d="M1 5H19"/></svg>`;
  if (k === '=>' || k === '->') return line(k === '=>' ? ' data-heavy="1"' : '');
  if (k === 'dashed' || k === 'dotted') return line(` data-pattern="${k}"`);
  // A head swatch is a short line ending in that head, drawn (HARD RULE #29), never typed.
  if (k === 'open' || k === 'dot' || k === 'cross') {
    const heads = {
      open: '<path class="fc-key-head" d="M8 1.5L12 5L8 8.5"/>',
      dot: '<circle class="fc-key-head" data-fill="1" cx="11" cy="5" r="2.4"/>',
      cross: '<path class="fc-key-head" d="M8.5 2L13 8M13 2L8.5 8"/>',
    };
    return `<svg class="fc-key-swatch" data-kind="head" viewBox="0 0 14 10" aria-hidden="true"><path class="fc-key-head" d="M0.5 5H${k === 'dot' ? 9 : 11}"/>${heads[k]}</svg>`;
  }
  const slot = /^c([1-8])$/.exec(k);
  if (slot) {
    const onGroup = (model.groups || []).some((g) => g.slot === +slot[1]);
    // A tile swatch keys the category-painted shapes, which carry the mark contract, so it
    // carries it too and a chart finish repaints key and shapes together. A group swatch keys
    // a group, which is a container a finish leaves alone, so it carries none.
    const contract = onGroup ? '' : ` data-hue="${slot[1]}" data-encodes="hue" data-paint="bg"`;
    return `<span class="fc-key-swatch" data-kind="${onGroup ? 'group' : 'tile'}" data-slot="${slot[1]}"${contract} aria-hidden="true"></span>`;
  }
  if (Object.hasOwn(STATUS_TONE, k)) return `<span class="fc-key-swatch" data-kind="tile" data-s="${escAttr(k)}" aria-hidden="true"></span>`;
  return '';
}

/**
 * The key as markup, or '' when the chart uses nothing that needs decoding. `model.key` is
 * the grammar's `[{ key, label }]`, already renamed by any authored key. `chart` names the
 * member on the key itself (`data-chart`), so a rule for one member's key holds wherever the
 * key sits: the state chart's `inline` variant writes its key after the figure, not inside it.
 */
function buildKey(model, chart) {
  if (!model.key?.length) return '';
  const entries = [];
  for (const e of model.key) {
    const tone = Object.hasOwn(STATUS_TONE, e.key) ? STATUS_TONE[e.key] : null;
    const same = tone && entries.find((x) => x.tone === tone);
    if (same) { if (!same.labels.includes(e.label)) same.labels.push(e.label); continue; }
    entries.push({ key: e.key, tone, labels: [e.label] });
  }
  const items = entries.map((e) =>
    `<li class="fc-key-item">${keySwatch(e.key, model)}<span class="fc-key-label">${e.labels.map(escHtml).join(' · ')}</span></li>`).join('');
  return `<ol class="fc-key"${chart ? ` data-chart="${chart}"` : ''}>${items}</ol>`;
}

module.exports = { STATUS_TONE, buildKey, keySwatch };
