/**
 * lib/core/type-tokens.js
 *
 * THE TYPE-SCALE TOKENS (HARD RULE #4), each with its role: the one list both the ownership gate
 * (tools/check-ownership.js `checkTypographyTokens`, which rejects any other `--fs-*` name) and the
 * Studio's CSS completion (docs/src/components/studio/css-token-complete.ts) read, so the editor offers
 * exactly the names the gate accepts. The values are computed in lib/base/base.tokens.css; the roles are
 * that file's "author's mental model" and engineering/typography.md.
 *
 * Pure data, no dependencies: CJS so the gate requires it, and the docs bundle imports it as source.
 */

const TYPE_TOKENS = Object.freeze([
  { name: '--fs-meta', role: 'Chrome and labels: pagination, footer, eyebrow' },
  { name: '--fs-body-compact', role: 'Code and chart keys, one step below reading size' },
  { name: '--fs-body', role: 'Reading size: cards, lists, table cells' },
  { name: '--fs-message', role: 'A slide-level statement body: statement, quote, lead' },
  { name: '--fs-emphasis', role: 'One lead or key-insight callout per slide' },
  { name: '--fs-h1', role: 'Heading level 1, the slide title (does not scale)' },
  { name: '--fs-h2', role: 'Heading level 2 (does not scale)' },
  { name: '--fs-h3', role: 'Heading level 3' },
  { name: '--fs-h4', role: 'Heading level 4' },
  { name: '--fs-h5', role: 'Heading level 5' },
  { name: '--fs-h6', role: 'Heading level 6' },
  { name: '--fs-hero', role: 'KPI, watermark and display numbers' },
  { name: '--fs-scale', role: 'The global multiplier the scale-* modifiers raise' },
].map((t) => Object.freeze(t)));

const TYPE_TOKEN_NAMES = Object.freeze(new Set(TYPE_TOKENS.map((t) => t.name)));

module.exports = { TYPE_TOKENS, TYPE_TOKEN_NAMES };
