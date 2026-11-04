/**
 * lib/authoring/switches-retired.mjs — the switch spellings retired on 2026-11-04, and their replacements.
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
// Built from the three regular shapes (`X-off` / `X-on` / `X-none`) plus the exceptions, rather than
// written out pair by pair: this table ships in the lint core, which has a byte ceiling
// (docs/route-budget.json `lintCoreGz`). The test pins every pair (test/unit/core/switches.test.js).
const pairs = [
  ...['callout', 'motion', 'spectrum'].flatMap((x) => [[`${x}-off`, `no-${x}`], [`${x}-on`, `with-${x}`]]),
  ...['spectrum-edge', 'spectrum-card', 'spectrum-trim'].map((x) => [`${x}-off`, `no-${x}`]),
  ...['spectrum-card', 'spectrum-trim', 'row-label'].map((x) => [x, `with-${x}`]),
  ...['treatment', 'finish', 'backdrop'].map((x) => [`${x}-none`, `no-${x}`]),
  ['no-rule', 'no-spine'], ['rule-none', 'no-heading-rule'], ['tag-none', 'tag-bare'],
];
export const RETIRED_SWITCHES = Object.freeze(Object.fromEntries(pairs));

/** The replacement for a retired spelling, or null when `token` is not one. */
export function retiredSwitch(token) {
  return Object.hasOwn(RETIRED_SWITCHES, token) ? RETIRED_SWITCHES[token] : null;
}
