/**
 * lib/core/resolve-heading-rule.js
 *
 * The deck front-matter `heading-rule:` register controls the HEADING RULE — the underline drawn
 * beneath a slide's heading (the `form` masthead hairline and any h1/h2 heading). An
 * ACCENT finish, sibling of finish:/mode:/spectrum:/stamp-shape:/tone:/card-lift: — a thin map from a
 * value to the `rule-<value>` class token appended to every `<section>`, overridable per
 * slide. Default = today's render (a full hairline where the masthead already draws one,
 * nothing on a plain content slide), so no existing deck moves a pixel.
 *
 *   heading-rule: auto   → (no token)   full hairline where drawn today, else nothing — the default
 *   heading-rule: full   → heading-rule-full    a full-width hairline under the heading
 *   heading-rule: short  → heading-rule-short   a short left-aligned rule under the heading
 *   heading-rule: accent → heading-rule-accent  a short rule painted in `--spectrum` / `--accent`
 *   heading-rule: none   → no-heading-rule    no heading underline anywhere
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 * See engineering/decisions/2026-07-15-accent-finish-consolidation.md.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Recognized values. `auto` is the default and maps to NO token (today's render); the
// other four each carry a `rule-<value>` class.
const HEADING_RULE_NAMES = Object.freeze(['auto', 'full', 'short', 'accent', 'none']);
/** The class tokens — the per-slide override set.
 *  The baseline's own token (`heading-rule-auto`) is the RESTORE token, the same move as
 *  `claim-framed`: it draws nothing of its own, and because it is in this
 *  set, a slide carrying it evicts the deck's token. So one slide inside a `heading-rule: accent` deck
 *  can return to the default, which no other spelling could ask for. */
// `none` is a SWITCH (lib/core/switches.mjs): `heading-rule: none` stamps `no-heading-rule`, and one slide brings the
// underline back with `with-heading-rule` (which, like `heading-rule-auto`, restores the default).
const HEADING_RULE_TOKENS = Object.freeze(['heading-rule-auto', 'heading-rule-full', 'heading-rule-short', 'heading-rule-accent', 'no-heading-rule', 'with-heading-rule']);

const HEADING_RULE_NAME_SET = new Set(HEADING_RULE_NAMES);

/** Extract the raw `heading-rule:` value from a deck source's front matter, or null. */
function readFrontMatterHeadingRule(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule + the SAME bare-name constraint this line used to fold into
  // one pattern. The old `$` anchor made a trailing YAML comment fail the whole
  // match, so an annotated register silently resolved to nothing.
  return frontMatterName(m[1], 'heading-rule');
}

/** True if `value` is a recognized heading-rule value. */
function isKnownHeadingRule(value) {
  return typeof value === 'string' && HEADING_RULE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a rule value to its class token. `auto` (default), empty, and unknown all map to
 *  `''` — only full/short/accent/none carry a token. */
function headingRuleClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  if (v === 'auto' || v === '' || !HEADING_RULE_NAME_SET.has(v)) return '';
  return v === 'none' ? 'no-heading-rule' : `heading-rule-${v}`;
}

/** Convenience: read `heading-rule:` from a full deck source + map it to its class token. */
function headingRuleClassFromSource(md) {
  return headingRuleClass(readFrontMatterHeadingRule(md) || '');
}

module.exports = {
  HEADING_RULE_NAMES,
  HEADING_RULE_TOKENS,
  readFrontMatterHeadingRule,
  isKnownHeadingRule,
  headingRuleClass,
  headingRuleClassFromSource,
};
