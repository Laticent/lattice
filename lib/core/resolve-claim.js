/**
 * lib/core/resolve-claim.js
 *
 * The deck front-matter `claim:` register selects how much of the frame the
 * content CLAIMS vs the chrome — one universal, purpose-coupled dial. It is a
 * sibling of `mode:` (resolve-mode.js) and `finish:` (resolve-finish.js): the
 * three render paths read the key and APPEND the mapped class token to every
 * `<section>`, and a per-slide `claim-*` token overrides the deck-wide value.
 *
 *   claim: framed   → (no class)      the standard frame — full chrome (default)
 *   claim: quiet    → `claim-quiet`   recede secondary chrome, tighten one step
 *   claim: hero     → `claim-hero`    drop the bands; content fills the stage
 *   claim: bleed    → `claim-bleed`   true edge-to-edge (media/canvas only)
 *
 * `framed` is the named baseline (renders no class); omitting the key renders it.
 * A per-slide `_class: claim-framed` opts one slide OUT of a deck-wide claim
 * (the marker renders no CSS — it just signals "framed here", like `mode:
 * boardroom`). The preset CSS lives in the shared Cell CSS lib/forms/cell/stage/
 * stage.css (padding-only insets — HARD RULE #20 — plus chrome-recede via
 * `display`), and the chart-family hero band in
 * lib/components/chart/_chart-family/chart-family.css. See
 * engineering/decisions/2026-07-03-claim-content-claims-the-stage.md.
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice-emulator.js (via lib/engine),
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

// Register name → the class token appended to every section. '' = framed
// (the baseline claim: no class, the standard frame applies).
const CLAIM_REGISTER = Object.freeze({
  framed: '',
  quiet: 'claim-quiet',
  hero: 'claim-hero',
  bleed: 'claim-bleed',
});

/** The recognized claim names (for the deck-lint vocabulary + docs). */
const CLAIM_NAMES = Object.freeze(Object.keys(CLAIM_REGISTER));

/** The class tokens a `claim:` can stamp, plus the `claim-framed` per-slide
 *  opt-out marker — used by the deck-class propagator to detect a per-slide
 *  claim and scope the deck-wide-vs-per-slide rule. */
const CLAIM_TOKENS = Object.freeze(['claim-quiet', 'claim-hero', 'claim-bleed', 'claim-framed']);

/** Extract the raw `claim:` value from a deck source's front matter, or null. */
function readFrontMatterClaim(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*claim:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized claim register name. */
function isKnownClaim(value) {
  return typeof value === 'string' && Object.hasOwn(CLAIM_REGISTER, value.trim().toLowerCase());
}

/** Map a claim value to its class token ('' for framed/unknown). */
function claimClasses(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(CLAIM_REGISTER, key) ? CLAIM_REGISTER[key] : '';
}

/** Convenience: read the `claim:` value from a full deck source + map it. */
function claimClassesFromSource(md) {
  return claimClasses(readFrontMatterClaim(md) || '');
}

module.exports = {
  CLAIM_REGISTER,
  CLAIM_NAMES,
  CLAIM_TOKENS,
  readFrontMatterClaim,
  isKnownClaim,
  claimClasses,
  claimClassesFromSource,
};
