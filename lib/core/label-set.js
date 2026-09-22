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

const CATALOG = require('./label-set-catalog.generated.js');
const AXIS_CATALOG = require('./axis-catalog.generated.js');

/** The bracketed inline form, whole-string: `[{k, label}, {k, label}, …]`. */
const INLINE_SET = /^\[\s*\{[\s\S]*\}\s*\]$/;

/** One `{key, label}` member. The label runs to the closing brace and may carry
 *  spaces, periods and further commas — only the FIRST comma splits, because a
 *  label like "Good, but slipping" is prose and a key never is.
 *
 *  NO `\s*` AROUND THE CAPTURES, and that is a ReDoS fix rather than tidiness.
 *  The earlier form `\{\s*([^,{}]*?)\s*,\s*([^{}]*?)\s*\}` paired an ambiguous
 *  `\s*` against a lazy `[^,{}]*?` — both match a space, so a brace run of only
 *  spaces and no comma backtracks super-linearly: measured 500 spaces at 268ms,
 *  2000 at 3.2s and 3000 at 10.9s. That was survivable while one chart read the
 *  grammar from a known position; it stopped being survivable when `lint-core`
 *  began calling `parseInlineSet` on every lone code span, because lint-core is
 *  bundled for the browser and the Studio lints UNTRUSTED markdown (shared and
 *  AI-generated decks, HARD RULE #22) synchronously on the main thread.
 *  Dropping the `\s*` removes the ambiguity outright; `tidy()` already trims and
 *  collapses both captures, so the accepted language is unchanged. */
const MEMBER = /\{([^,{}]*),([^{}]*)\}/g;

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
/** Every component that declares a key, in catalog (sorted) order. The lint's
 *  advice is built from this rather than from a list in the lint, so it cannot
 *  name a component that stopped declaring one — or miss one that started. */
function labelSetNames() {
  return Object.keys(CATALOG);
}

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


/**
 * The axis a component DECLARES, or null when it owns none.
 *
 * Read from the generated catalog for the same reason `labelSetFor` is: a
 * hand-maintained list of component names in a reader is the drift the manifest
 * field exists to end. Three readers need this — the transforms, the narrator
 * and `lint:deck` — and they sit in three different layers.
 */
function axisSetFor(name) {
  return AXIS_CATALOG[String(name || '').trim()] || null;
}

module.exports = {
  axisSetFor,
  parseInlineSet, parseRegisterBlock, resolveLabelSet, unboundKeys,
  labelSetFor, derivedFrom, labelSetNames,
};
