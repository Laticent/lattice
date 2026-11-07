---
status: in-progress
summary: The Theme Studio gains an AI front door that delivers a COMPLETE, AA-verified palette so a user never has to tweak a color by hand. The model proposes only the 10 author-facing essentials PLUS a named categorical-ramp strategy (analogous / triad / brand-mono / complementary / spectrum); the deterministic kernel (lib/theme/derive.js) fans those into the full ~80-token contract in OKLCH, repairing every gate-checked pair to WCAG AA in both canvas modes before returning. So "the AI gives the full set, AA-verified" is delivered by derive's existing ensureContrast repair, not by asking the model to hand-author 100 values. The model is fed distilled canon (the themes README lightness contract + indaco as a worked example) so its essentials anticipate the OKLCH derivation. Colors stay hex + light-dark() on the wire (matching the 13 shipped themes); the engine already works in OKLCH internally, so no color-space migration is needed. The UI is the V4 "Pro Inspector" (token tree · live 3-specimen canvas · per-token light/dark inspector with that pair's WCAG), with the AI as a slim command-bar front door + refine chips — the honesty contract ("a fail is shown, never bypassed") now governs the optional manual-override path, while the AI's own output is always all-green.
---

# Theme Studio AI — a full, AA-verified palette with zero required tweaks

## The request, in the user's words

> "the ai needs to give full pallet set with AA verified so users don't have to
> tweak colors themselves at all."
> "we should also give the ai our full tokens example theme or readme file so it
> understands the task."
> "should we be using oklab colors? can the ai generate them? will ai have
> sufficient context to make greater decisions?"

Three requirements: (1) the AI delivers a *finished* accessible theme, not a
starting point; (2) the AI is *grounded* in our real token system; (3) decide
the color-space and how much latitude the model gets.

## What already exists (so we reuse, not reinvent — HARD RULE #1, #15)

- **`lib/theme/derive.js`** — `deriveTheme(essentials)` turns the 10 essentials
  into the full ~80-token contract and **repairs every gate-checked pair to AA
  in both canvas modes** via `ensureContrast`. The AA-verified guarantee is
  already the kernel's behavior, not something to bolt on.
- **`lib/theme/color.js`** — a full **OKLCH ↔ sRGB** stack (`hexToOklch`,
  `oklchToHex`, `withLightness`, `withChroma`, `rotateHue`, `mix` in oklab). The
  engine *already works perceptually*; the lightness contract (`cat-N-fill`
  L≈0.9, `cat-N-mark` L≈0.45) is placed in OKLCH today.
- **`lib/theme/ai.js`** — `ASK_SYSTEM` / `askMessages(current, prompt)` /
  `coerceEssentials(raw, fallback)`. The model already only ever PROPOSES an
  essential set; the deterministic core disposes.
- **`lib/theme/contrast.js`** — `auditBoth(vars)` runs the WCAG audit.
- **`Fabricate.tsx`** — the live theme studio (3 iframe specimens, 10 essentials,
  the 12-role light/dark contract, the data-viz band tray, the WCAG audit).

## The three answers

**1. OKLab — already in use where it counts (the math).** Derivation, the
lightness contract, and AA repair all run in OKLCH. We keep **hex +
`light-dark()`** as the serialization format (what all 13 shipped themes use,
proven through the PDF/PPTX export pipeline). An `oklch()` output format is a
cosmetic, later-spike polish with a PDF-gamut risk — out of scope here.

**2. The AI proposes hex; the engine works in OKLCH.** `coerceEssentials` /
`normalizeHex` validate hex robustly; `deriveTheme` converts to OKLCH on input.
Asking the model to emit `oklch()` directly raises malformed/out-of-gamut risk
for no gain. Hex-in / OKLCH-engine is the correct split.

**3. Context + latitude — essentials + a ramp strategy, plus real canon.**
   - **Canon:** `askMessages` feeds the model a distilled token reference — the
     README's two-tier lightness contract and `indaco` as a worked
     essentials→theme example — so its essentials anticipate the derivation
     (e.g. an accent with enough chroma to read as a saturated diagram stroke
     and to seed a 12-hue ramp).
   - **Latitude:** the model also returns a **`rampStrategy`** from a small enum
     the engine understands. `deriveTheme` consumes it to lay out the categorical
     cycle's hue spread in OKLCH — so the chart/diagram palette feels *intentional*
     — while the engine still owns the actual values and the AA repair. We do NOT
     let the model hand-author ~100 tokens; that would forfeit the no-tweak
     guarantee the same user asked for.

## The ramp strategies

The cycle today is a fixed 30°/slot full-wheel spread around the accent. We
generalize the hue layout to a named strategy (lightness tiers + AA repair
unchanged):

| Strategy | Hue layout (around accent hue H) | Feel |
|---|---|---|
| `spectrum` (default — today's behavior) | H + i·30° across 12 slots | broad, distinct |
| `analogous` | tight fan within ±~50° of H | calm, cohesive |
| `triad` | three families at H, H+120°, H+240° | balanced, lively |
| `complementary` | split between H and H+180° | high-contrast pairs |
| `brand-mono` | hue locked to H; vary L/C only | restrained, single-hue |

`spectrum` is the default so an un-specified strategy reproduces today's output
exactly (no regression for existing derivations). The chart-family spectrum
(`chart-cat1..8`) follows the same strategy.

## Delivered state vs. honesty contract

- **AI-delivered = always all-AA.** Propose essentials + strategy → `deriveTheme`
  (repairs to AA) → `auditBoth` confirms. The user receives a finished theme;
  touching a color is optional. Per the user's call, repair runs **until AA**,
  preserving hue where it can.
- **Honesty contract, relocated.** "A failing pair is shown, never bypassed" now
  governs the *manual-override* path: if the user drags a well into a failing
  color, that pair turns red live. The AI's own output never ships a fail.
- **A failed request names its cause (2026-11-06).** `generateTheme`, `generateComponent`
  and `refineComponent` pass `surfaceErrors: true` to the model adapter, which otherwise
  floors any failure into an empty reply. They return `{ status: 'failed', note }`, and
  `note` comes from `describeModelError` (`docs/src/components/studio/model-error.ts`), the
  same sentence the chat shows: a 401 says reconnect, a 402 says the account is out of
  credits, a 429 says wait, and no network says the request never reached OpenRouter.
  Before this, a 402 read as "the model returned no usable palette".
  The finish and motion faculties (`generateFinish`, `generateDrawing`) do the same. Only
  cloud failures are lifted: an on-device failure still floors, since the sentences read
  OpenRouter's statuses.

## UI — the V4 Pro Inspector (chosen over four alternatives)

Five responsive variants were built and independently red-teamed (raw +
re-weighted scoring, feasibility reality-check, bias check). V4 won on both
passes: highest ceiling AND a near-superset of today's `Fabricate` code (the
token tree / inspector is the existing `Well` / `BandTray` / derive loop
relocated). Layout: **left** grouped searchable token tree · **center** live
3-specimen canvas with a light/dark toggle · **right** per-token inspector
(light + dark wells, engine-derived note, that token's WCAG pairs). The AI is a
slim **command-bar front door** ("Describe a look") + **refine chips**, not a
separate chat column. The canvas selected-token highlight is descoped to a
flagged fast-follow (the inspector already shows the swatch + per-pair contrast,
so the glow is reinforcement, not mechanism).

## Mobile + no-model refinements (post-preview review)

Reviewing the live Cloudflare preview on a phone surfaced two gaps, both folded
into the same PR:

- **No model connected → the AI bar grays out + a Connect affordance.** Showing a
  live-looking "Describe a look" bar with no model behind it wasted intent (a tap
  just earned a toast). The bar now reads the architect status: when no model is
  connected the input grays out and the send button becomes a **Connect** dropdown
  — one tap to **Connect cloud** (OpenRouter OAuth), **Use on-device**, or **Open
  Workspace** (where the on-device tier + spend controls live). A line reminds the
  author they can still edit every token by hand. Honest: a dead control never
  looks live.
- **Master–detail breaks on mobile → inline-expand.** With the inspector as the
  right column, selecting a token on a stacked mobile layout meant scrolling past
  the whole tree to edit it. Below desktop, the inspector now renders **inline
  directly under the selected row** (the editor appears where you tapped); the
  desktop column is unchanged. Gated by `useBreakpoint()` in JS (not CSS) so only
  one inspector instance is ever in the DOM.

## Scope boundaries

- Hex + `light-dark()` output only; no `oklch()` serialization (later spike).
- The model never emits the full token set; essentials + strategy only.
- File-upload of user docs (#16) and real prompt caching (#17) remain separate
  slices; the canon here is inlined into the system prompt.
