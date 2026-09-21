/**
 * LABEL SETS — one way to name the members of a set, wherever a chart has one.
 *
 * A "set" here is anything a reader needs a key for: a heatmap's five ramp bands,
 * a roadmap's four status markers, a matrix-grid's three cell shapes, a chart's
 * categorical series. Twelve chart transforms emit legend markup today and only
 * three define a builder, so the same idea has been re-solved per chart — and
 * where an author is offered any control at all, the grammar differs. `roadmap`
 * derives its key from the data and then hard-codes the words in a `STATE_LABEL`
 * map, so a state cannot be renamed or described. `obligation-matrix` explains
 * the same three markers in a PROSE SENTENCE that nothing parses. `heatmap` says
 * nothing at all.
 *
 * ONE NORMALIZED ENTRY, three ways to write it:
 *
 *   { key, label, detail? }
 *
 *   1. DERIVED   — nothing authored. The chart generates the set from its own
 *                  data, which is what `roadmap` already does and what every
 *                  chart should do before it asks the author for anything.
 *   2. INLINE    — `[{1, Good}, {2, Better}, {3, The Best}]` in an inline-code
 *                  span. The compact one-slide override.
 *   3. REGISTER  — a front-matter block, for a deck-wide set with descriptions.
 *
 * WHY THE SHAPE MIRRORS `acronyms:`. The deck register at
 * `lib/core/resolve-captions.mjs` already stores `TERM: { expansion, definition }`
 * with a bare-scalar shorthand (`KPI: key performance indicator`), which is this
 * same key → label → description triple under different field names. Inventing a
 * second grammar for one data shape is what this module exists to stop, so form 2
 * is deliberately the shorthand of form 3 rather than its own thing.
 *
 * WHY A COMMA IS THE DISCRIMINATOR, AND WHY THAT IS SAFE. `{1}` and `{Good}` are
 * already INLINE PILLS (`lib/core/inline-pills.js`), so braces are spoken for. A
 * pill's text is a single token; a set entry is `key, label`. Measured against
 * `inline-code-directives.js`, `[{1, Good}, {2, Better}, {3, The Best}]`
 * dispatches to nothing today and `{1, Good}` dispatches to nothing either, while
 * `{1}` and `{Good}` both render pills. So the bracketed, comma-carrying form is
 * free real estate and the single-brace pill is untouched. This module does NOT
 * register itself with the inline-code dispatcher for that reason: a label set is
 * read by the component that owns the set, from a known position, not by a global
 * rule that would have to out-guess the pill grammar at every span.
 *
 * Pure: strings in, plain data out. No DOM, no markdown-it, no fs (HARD RULE #1).
 */

const { plainText } = require('./plain-text');
const CATALOG = require('./label-set-catalog.generated.js');

/** The bracketed inline form, whole-string: `[{k, label}, {k, label}, …]`. */
const INLINE_SET = /^\[\s*\{[\s\S]*\}\s*\]$/;

/** One `{key, label}` member. The label runs to the closing brace and may carry
 *  spaces, periods and further commas — only the FIRST comma splits, because a
 *  label like "Good, but slipping" is prose and a key never is. */
const MEMBER = /\{\s*([^,{}]*?)\s*,\s*([^{}]*?)\s*\}/g;

/** Collapse whitespace the way a rendered label would read it. */
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Parse the inline form. Returns `null` when `text` is not a label set at all,
 * which is the caller's signal to leave the span alone — the same pass-through
 * contract the chart family uses everywhere.
 *
 * A bracketed run with no well-formed member is `null` rather than `[]`: `[{}]`
 * and `[{oops}]` are far more likely a typo than an author asking for an empty
 * key, and returning `[]` would silently render a legend with no rows.
 *
 * @param {string} text  the inline-code span's text, without its backticks
 * @returns {Array<{key: string, label: string, detail?: string}>|null}
 */
function parseInlineSet(text) {
  const src = String(text ?? '').trim();
  if (!INLINE_SET.test(src)) return null;
  const out = [];
  MEMBER.lastIndex = 0;
  let m;
  while ((m = MEMBER.exec(src)) !== null) {
    const key = tidy(m[1]);
    const label = tidy(m[2]);
    if (key && label) out.push({ key, label });
  }
  return out.length ? out : null;
}

/**
 * Parse the front-matter register form. Accepts, per key, either the bare-scalar
 * shorthand or an inline-flow object — the two shapes `acronyms:` already takes:
 *
 *   scale:
 *     1: Cold
 *     3: { label: Warm, detail: "Holding; watch the next cohort." }
 *
 * Deliberately a FLAT one-level read, matching the house front-matter assumption
 * that a value is a scalar or an inline flow — not a nested block. A block-mapped
 * value is skipped rather than half-read, so a deck that reaches for YAML this
 * module does not speak gets no set instead of a wrong one.
 *
 * @param {string} body  the register's indented block, without its own key line
 * @returns {Array<{key: string, label: string, detail?: string}>}
 */
function parseRegisterBlock(body) {
  const out = [];
  for (const raw of String(body ?? '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([^:#\s][^:]*?)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = tidy(m[1]).replace(/^["']|["']$/g, '');
    const rest = m[2].trim();
    if (!key || !rest) continue;
    const flow = rest.match(/^\{([\s\S]*)\}$/);
    if (flow) {
      const fields = {};
      for (const pair of flow[1].split(',')) {
        const f = pair.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*([\s\S]*?)\s*$/);
        if (f) fields[f[1]] = unquote(f[2]);
      }
      const label = tidy(fields.label);
      if (label) out.push(entry(key, label, fields.detail));
    } else {
      out.push(entry(key, tidy(unquote(rest))));
    }
  }
  return out;
}

function unquote(v) {
  const s = String(v ?? '').trim();
  return /^(".*"|'.*')$/.test(s) ? s.slice(1, -1) : s;
}

function entry(key, label, detail) {
  const e = { key, label };
  const d = tidy(detail);
  if (d) e.detail = d;
  return e;
}

/**
 * Resolve the set a component should render: the author's, where they gave one,
 * otherwise the chart's own derived set.
 *
 * The merge is BY KEY and PARTIAL, which is the behavior the whole construct is
 * for — naming one band without having to restate the other four. An authored
 * entry replaces the derived label and adds the detail; a derived entry with no
 * authored match keeps its generated label; an authored key matching nothing
 * derived is DROPPED rather than appended, because a legend row that binds to no
 * band is a row a reader cannot act on (and, for the ramp, one that would paint
 * no swatch).
 *
 * Key comparison is string-wise after trimming, so `1` and `'1'` are the same
 * band whether the register quoted it or not.
 *
 * @param {Array} derived   the chart's own set, in render order — the spine
 * @param {Array} authored  the author's entries, any subset, any order
 */
function resolveLabelSet(derived, authored) {
  const base = Array.isArray(derived) ? derived : [];
  const over = new Map((Array.isArray(authored) ? authored : []).map((e) => [String(e.key).trim(), e]));
  return base.map((d) => {
    const a = over.get(String(d.key).trim());
    if (!a) return { ...d };
    const merged = { ...d, label: a.label || d.label };
    const detail = a.detail ?? d.detail;
    if (detail) merged.detail = detail; else delete merged.detail;
    return merged;
  });
}

/**
 * The keys an authored set names that the derived set does not carry.
 *
 * Reported rather than silently dropped, on the same contract `parseSeries` uses
 * for its own overflow: an author who writes `{6, Hottest}` against a five-band
 * ramp has made a mistake worth telling them about, and a linter that can name
 * the key is more use than a legend that quietly lost a row.
 */
function unboundKeys(derived, authored) {
  const known = new Set((Array.isArray(derived) ? derived : []).map((d) => String(d.key).trim()));
  return (Array.isArray(authored) ? authored : [])
    .map((a) => String(a.key).trim())
    .filter((k) => !known.has(k));
}


/**
 * Lift the author's label set out of a section's HTML, or report that there is none.
 *
 * Read from a ONE-CODE paragraph whose whole text is the bracketed set — a KNOWN
 * POSITION, which is the whole reason this module does not register itself with
 * the inline-code dispatcher (see the header). A known position competes with
 * nothing; a global rule would have to out-guess the pill grammar at every span
 * in every deck.
 *
 * EVERY one-code paragraph is a candidate, not just the first, and that is the
 * bug this function exists to keep fixed. A slide routinely carries an EYEBROW in
 * exactly this shape — `` `Retention · 2026 cohorts` `` — and it sets ABOVE the
 * set. Testing only the first match found the eyebrow, failed to parse it, gave
 * up, and an authored set rendered as a subtitle while the key never appeared.
 * `matrix-grid` documents the same trap from the other side: its axis eyebrow is
 * discriminated by holding TWO code spans, so a one-code paragraph there is an
 * ordinary eyebrow and must survive this scan untouched. `parseInlineSet`
 * returning `null` for a non-set is what makes that safe — the pass-through is
 * load-bearing, not defensive.
 *
 * WHY IT LIVES HERE rather than in the first adopter. `heatmap` defined it and
 * exported it from the component; a second adopter would have imported across
 * components (against HARD RULE #1) or re-derived it and re-met the trap above.
 * Four components now share it.
 *
 * The matched paragraph is REMOVED from the html, so the set NAMES the members
 * instead of also printing as a stray eyebrow above the figure.
 *
 * @param {string} html  the section's html
 * @returns {{html: string, set: Array|null}}  html with the set paragraph removed
 *   (unchanged when there is no set), and the parsed set or `null`.
 */
function liftLabelSet(html) {
  // A fresh regex per call: a module-level /g regex carries `lastIndex` between
  // calls, and two charts on one slide would then start the second scan wherever
  // the first stopped. (The original kept one and reset it by hand at the top of
  // every call, which works until someone returns early.)
  const re = /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const set = parseInlineSet(plainText(m[1]));
    if (set) return { html: html.slice(0, m.index) + html.slice(m.index + m[0].length), set };
  }
  return { html, set: null };
}


/**
 * The label set a component DECLARES, or `null` when it declares none.
 *
 * The catalog is generated from the `labelSet` manifest field, so this and the
 * deck lint read the same rows the transform renders from — a key vocabulary
 * that disagrees with the render is not expressible (HARD RULE #1). A component
 * with no entry has no closed set: `null` is the honest answer, and it is what
 * stops the lint inventing a vocabulary for a component that never had one.
 *
 * @param {string} cls  component/class name, e.g. 'roadmap'
 * @returns {{aria: string, members: Array, derivedLabels?: string, unkeyed?: Array}|null}
 */
function labelSetFor(cls) {
  const name = String(cls || '').trim();
  return (name && CATALOG[name]) || null;
}

/**
 * The DERIVED set for a slide: the component's declared members, in declaration
 * order, narrowed to the keys this slide actually uses.
 *
 * This is `roadmap.buildStatusLegend`'s behavior lifted into the kernel, because
 * all three of its properties are the ones `label-set.js` was built to preserve
 * and every adopter wants them identically:
 *
 *   - ONE ROW PER MEMBER ACTUALLY PRESENT. A key that names a state no cell
 *     carries is a row a reader cannot find on the slide.
 *   - CANONICAL ORDER, not first-appearance. The declaration order is a
 *     lifecycle (shipped → in flight → planned → out of scope); reading order
 *     should not depend on which cell happened to come first.
 *   - NOTHING AT ALL when no member is present. A roadmap with no markers needs
 *     no key, and an empty `<ul>` is chrome with no content.
 *
 * A member whose manifest omits `label` is returned WITHOUT one: its label is
 * derived from the data by the component (heatmap's band ranges), and inventing
 * a word here is exactly what the manifest's `derivedLabels` note forbids.
 *
 * @param {string} cls          component/class name
 * @param {Iterable<string>} presentKeys  the keys this slide uses
 * @returns {Array<{key: string, label?: string, detail?: string}>}
 */
function derivedFrom(cls, presentKeys) {
  const set = labelSetFor(cls);
  if (!set) return [];
  const present = new Set([...(presentKeys || [])].map((k) => String(k).trim()));
  return set.members
    .filter((m) => present.has(String(m.key).trim()))
    .map((m) => ({ ...m }));
}

module.exports = {
  parseInlineSet, parseRegisterBlock, resolveLabelSet, unboundKeys, liftLabelSet,
  labelSetFor, derivedFrom,
};
