/**
 * lib/core/switches-retired.mjs — the switch spellings retired on 2026-11-04, and their replacements.
 *
 * A module of its own, apart from lib/core/switches.mjs, because only lint reads it (it reports each
 * old spelling with a fix that rewrites it), and lint is a lazy chunk: the engine and runtime boot
 * bundles, which carry switches.mjs, do not pay for this table (docs/route-budget.json `engineJsGz`).
 * Decision note: engineering/decisions/2026-11-04-switch-vocabulary.md.
 */

/**
 * The retired spellings and their replacements. A hard rename: these are refused, never aliased —
 * lint reports each with a fix that rewrites it (lib/authoring/lint-core.js, `unknown-class`).
 * `tag-none` is here though it is not a switch: it never meant "no tag" (the tag stays, drawn as
 * bare text), so the rename to `tag-bare` removes the last `-none` without pretending it is one.
 */
export const RETIRED_SWITCHES = Object.freeze({
  'callout-off': 'no-callout',
  'callout-on': 'with-callout',
  'motion-off': 'no-motion',
  'motion-on': 'with-motion',
  'spectrum-off': 'no-spectrum',
  'spectrum-on': 'with-spectrum',
  'spectrum-edge-off': 'no-spectrum-edge',
  'spectrum-card-off': 'no-spectrum-card',
  'spectrum-card': 'with-spectrum-card',
  'spectrum-trim-off': 'no-spectrum-trim',
  'spectrum-trim': 'with-spectrum-trim',
  'row-label': 'with-row-label',
  'no-rule': 'no-spine',
  'rule-none': 'no-heading-rule',
  'treatment-none': 'no-treatment',
  'finish-none': 'no-finish',
  'backdrop-none': 'no-backdrop',
  'tag-none': 'tag-bare',
});

/** The replacement for a retired spelling, or null when `token` is not one. */
export function retiredSwitch(token) {
  return Object.hasOwn(RETIRED_SWITCHES, token) ? RETIRED_SWITCHES[token] : null;
}
