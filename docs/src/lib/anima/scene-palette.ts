// Anima — the RECOMMENDED scene color palette.
//
// Deliberately NOT in `vocabulary.ts`, whose docblock opens "the CLOSED vocabulary … Closed by
// design". This list is the opposite: a recommendation the prompt teaches, which the validator
// does not enforce (see below). Housing a recommendation in the closed-vocabulary module would
// misfile it — and it would also put it inside the module graph the exported HTML player
// bundles, whose bytes are a sign-off surface. Its own file keeps `anima-player-bundle.generated.mjs`
// byte-identical.

// ── The RECOMMENDED scene color palette ───────────────────────────────────
//
// The colors the Architect prompt teaches a model to paint an Anima scene with, written as
// the full `var(--token)` literal a scene actually carries. `PRIMITIVES` and `MOTION_VERBS`
// are CLOSED — the validator rejects anything outside them. This list is deliberately NOT:
// it is what a model is TOLD to use, and `validateColor` still accepts any well-formed
// `var(--token)`. The difference is the whole reason this list exists, so it is worth stating
// precisely.
//
// WHAT IT FIXES (#1688). The prompt used to hand-list four examples, one of which —
// `var(--text)` — is a token the engine does not declare (it has `--text-body` and
// `--text-heading`). Because the prompt was a hand-copied sample rather than generated from
// anything, nothing could notice. Now the prompt is built from THIS array and
// `checkAnimaColorVocabulary` (tools/check-ownership.js) asserts every entry is declared in
// the ENGINE's own CSS — `lib/**.css` / `dist/**.css`, not merely somewhere under docs/,
// which would not resolve inside a slide. A phantom can no longer be taught.
//
// WHY THESE TOKENS. `--accent` plus the twelve categorical marks are the deck's
// distinguishable-by-design cycle — the right vocabulary for the parts of a mechanism.
// `--accent-soft` and `--border` carry quiet structure; `--on-accent` is the one value
// legible ON an accent fill; the three text roles label. `--bg` / `--bg-alt` are deliberately
// absent: a part painted in the canvas color is an invisible part.
//
// WHY `validateColor` DOES NOT ENFORCE IT, which was tried and reverted on measurement.
// Rejecting — or silently dropping — an off-list token looks like the obvious hardening and is
// a net REGRESSION, for two reasons a checker measured:
//
//   1. The premise was wrong. An undeclared custom property is invalid at computed-value time,
//      and `color`/`fill` are INHERITED properties, so the declaration falls back to the
//      inherited value — not to "no color". `backends/paint.ts`'s `resolveColor` makes that
//      concrete: it probes `getComputedStyle` on a span parented to the host, so `var(--text)`
//      resolved to the host's own text color. A phantom color was WRONG, never invisible.
//   2. The list is a recommendation, so enforcing it punishes correct scenes. `var(--fail)`,
//      `var(--chart-cat1)`, `var(--cat-3-ink)` and `var(--code-bg)` are all real engine tokens
//      that render correctly and are not on this list. Enforcement turned a correct red part
//      into flat `#888888`.
//
// A real existence check is still worth having, but it has to be sourced from the ENGINE's
// declared tokens rather than from a curated palette — and `parseScene` runs on the export
// path (`hydrate.ts`'s `decodeSpec` re-validates the embedded spec at playback), so getting
// that population wrong downgrades an already-exported deck. That is a generated
// engine-token list plus its own staleness gate, and it does not belong in the same change as
// this one. Tracked, not smuggled in.
export const SCENE_COLOR_TOKENS = [
  'var(--accent)',
  'var(--accent-soft)',
  'var(--on-accent)',
  'var(--text-heading)',
  'var(--text-body)',
  'var(--text-muted)',
  'var(--border)',
  'var(--cat-1-mark)',
  'var(--cat-2-mark)',
  'var(--cat-3-mark)',
  'var(--cat-4-mark)',
  'var(--cat-5-mark)',
  'var(--cat-6-mark)',
  'var(--cat-7-mark)',
  'var(--cat-8-mark)',
  'var(--cat-9-mark)',
  'var(--cat-10-mark)',
  'var(--cat-11-mark)',
  'var(--cat-12-mark)',
] as const;
export type SceneColor = (typeof SCENE_COLOR_TOKENS)[number];
