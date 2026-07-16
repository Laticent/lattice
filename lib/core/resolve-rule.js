/**
 * lib/core/resolve-rule.js
 *
 * The deck front-matter `rule:` register controls the HEADING RULE — the underline drawn
 * beneath a slide's heading (the `form` masthead hairline and any h1/h2 heading). An
 * ACCENT finish, sibling of finish:/mode:/spectrum:/stamp:/tone:/lift: — a thin map from a
 * value to the `rule-<value>` class token appended to every `<section>`, overridable per
 * slide. Default = today's render (a full hairline where the masthead already draws one,
 * nothing on a plain content slide), so no existing deck moves a pixel.
 *
 *   rule: auto   → (no token)   full hairline where drawn today, else nothing — the default
 *   rule: full   → rule-full    a full-width hairline under the heading
 *   rule: short  → rule-short   a short left-aligned rule under the heading
 *   rule: accent → rule-accent  a short rule painted in `--spectrum` / `--accent`
 *   rule: none   → rule-none    no heading underline anywhere
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists.
 * See engineering/decisions/2026-07-15-accent-finish-consolidation.md.
 */

// Recognized values. `auto` is the default and maps to NO token (today's render); the
// other four each carry a `rule-<value>` class.
const RULE_NAMES = Object.freeze(['auto', 'full', 'short', 'accent', 'none']);
/** The class tokens — the per-slide override set (everything except the `auto` baseline). */
const RULE_TOKENS = Object.freeze(['rule-full', 'rule-short', 'rule-accent', 'rule-none']);

const RULE_NAME_SET = new Set(RULE_NAMES);

/** Extract the raw `rule:` value from a deck source's front matter, or null. */
function readFrontMatterRule(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*rule:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized heading-rule value. */
function isKnownRule(value) {
  return typeof value === 'string' && RULE_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a rule value to its class token. `auto` (default), empty, and unknown all map to
 *  `''` — only full/short/accent/none carry a token. */
function ruleClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'auto' || v === '' || !RULE_NAME_SET.has(v) ? '' : `rule-${v}`;
}

/** Convenience: read `rule:` from a full deck source + map it to its class token. */
function ruleClassFromSource(md) {
  return ruleClass(readFrontMatterRule(md) || '');
}

module.exports = {
  RULE_NAMES,
  RULE_TOKENS,
  readFrontMatterRule,
  isKnownRule,
  ruleClass,
  ruleClassFromSource,
};
