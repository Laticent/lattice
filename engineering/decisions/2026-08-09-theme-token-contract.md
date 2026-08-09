---
status: shipped
summary: >
  #1450 asked for a theme manifest so nothing about a palette is silently missing. Its
  stated premise was inverted — measured, a hand-authored palette is gated on 107
  tokens (95 in token-parity.test.js + 12 in checkCatInkDeclared) and the Studio's
  generator on 83, and a generated theme FAILS the hand-theme contract on 27 tokens.
  But the instinct was right and the earlier "kill it" answers were wrong: the repo was
  already maintaining a per-theme manifest, smeared across TEN enumerations in two
  languages with no schema and no completeness gate, and they disagreed — `carta` is a
  shipped base palette that three suites had never tested and `new:theme carta` would
  have scaffolded over. The fix is a manifest that copies the RIGHT half of the
  component-manifest pattern: component manifests declare what KIND of thing a
  component is and gates prove it against the code; they do not enumerate its CSS
  properties. So `themes/<name>.manifest.json` declares IDENTITY and ROLE — role,
  family, tier/order/swatch, modes, darkCounterpart, cvd — and carries NO token names
  and NO token values. The rule: THE MANIFEST OWNS SCOPE, THE CODE OWNS CONTRACT. Four
  gates prove every declaration against the CSS. Separately and still open: the
  generator's contract is short by ~27 tokens, three of those families have no safe
  default, and a Studio-generated theme therefore paints SOLID BLACK Mermaid subgraph
  boxes in the real exported artifact (#1457) — that is a generator fix, not a manifest
  one. (An earlier draft also claimed sub-AA label text; that reproduces for a HAND
  palette stripped of its inks, not for generator output, whose marks clear AA because
  `deriveTheme` repairs them. Corrected in §5.) The boundary is SETTLED: the manifest is
  metadata, the CSS is the implementation and the source of truth for every token value,
  and the CSS is NOT generated. Manifest-as-input was re-opened and refused a SECOND
  time, on measurement rather than on prerequisites — `deriveTheme` fails an identity
  test on 13 of 14 shipped palettes, the accent hue alone drives 56 of its 83 tokens,
  and the LLM-authoring case it rested on already ships in `lib/theme/ai.js` with no
  manifest involved (§4 Q1).
---

# The theme manifest — scope is declared, contract stays computed

#1450 asked for a per-theme manifest. The idea had been raised and killed more than
once, each time for a reason that sounded right and was never written down. This note
records the reproduction, why the *stated* premise is inverted, why the earlier
rejections were nonetheless wrong, and what shipped.

Hardened by the adversarial trio (HARD RULE #25) before any design was written, then
by an independent checker on the diff (maker-checker). Both changed the outcome:
the trio killed the design I started with, and the checker found two holes in the
one that replaced it. Findings that survived are folded in below; findings of mine
that were refuted are corrected in place rather than quietly dropped.

## 1. The stated premise is inverted

#1450 rests on one sentence: *"the strictest contract governs the machine's output and
the loosest governs the human's — backwards from where mistakes actually come from."*

| Gate | Where | Tokens |
|---|---|---|
| `CONTRACT` | `test/unit/palette/token-parity.test.js` | **95** |
| `checkCatInkDeclared` | `tools/check-ownership.js` | **+12** |
| `checkThemeTokenParity` | `tools/check-ownership.js` | 10 (a subset of the 95) |
| **`REQUIRED_TOKENS`** | **`lib/theme/derive.js`** — *the generator* | **83** |

A hand-authored palette is held to **107** gated tokens; the generator to **83**.
`REQUIRED_THEME_TOKENS` (10) is the smallest of several gates, not "the human
contract". Serialize a theme through `deriveTheme` → `serializeTheme`, drop it in
`themes/`, and it fails the repo's own hand-theme gates on **27 tokens**.

Two further corrections to the issue and to my own first pass, both caught by the
fact-checker: the issue's "~232 tokens each" is wrong (real palettes declare
**116–130**), and my census regex used `[a-z0-9-]`, which cannot match
`--hljs-built_in` — so every per-theme count was low by one and that token looked
universally missing when it is universally declared. Exactly **2** required tokens are
declared by no palette, and both have deliberate `:root` defaults at
`lib/base/base.tokens.css:606-607`, documented as intentional inheritance.

**So the asymmetry argument does not support a manifest.** If it were the whole story,
the answer would be to widen the generator and stop.

## 2. Why the earlier rejections were still wrong

The reason a manifest kept dying is that a manifest *of token inventory* is a second
copy of the CSS, and two copies drift. That is not theory here:
`test/unit/palette/token-parity.test.js` and `tools/theme-scorecard.js` are two
hand-written lists of one contract and they had **already drifted, 95 vs 91**, on
exactly the four containment-edge tokens.

But that argument is about *inventory*, and it was applied to the whole idea. Look at
what a **component** manifest — the pattern #1450 cites as its model — actually
declares: `function`, `bucket`, `form`, `substance`, `render`, `stage`, `orientation`,
`adapt.mode`, `capacity`, `density`. It does **not** enumerate the CSS properties the
component sets. It declares *what kind of thing this is*, and gates cross-check the
declaration against the real code — `checkAdaptDeclarations` verifies `adapt.mode`
against the component's own CSS.

#1450 copied the wrong half of its own model. And the repo was already paying for the
missing half: **which themes a rule applies to was worked out eight different ways.**

| Where | What it said | How |
|---|---|---|
| `listBasePalettes()` | 14 | computed: `@import 'lattice'` |
| `checkCatInkDeclared` | 32 scanned → 15 | computed: a `--cat-1-mark` heuristic |
| `derive-cat-ink.js` | 15 | computed: a filename `-dark$` exclusion |
| `token-parity.test.js` | **13** | hardcoded — no `carta` |
| `theme-scorecard.js` | **13** | hardcoded — no `carta` |
| `structural-text-contrast.test.js` | **13** | hardcoded — no `carta` |
| `chart-contrast.test.js` | **13** | hardcoded — no `carta` |
| `containment-contrast.test.js` | 14 | hardcoded |
| `new-theme.js` `RESERVED` | **13 + lattice** | hardcoded — no `carta`, no `a11y-*` |
| `studio/palettes.ts` + `ThemePicker` | 18, **with grouping and swatches** | hardcoded, reconciled by a test |

`carta` is a shipped base palette. **Three suites had never tested it**, and
`npm run new:theme carta` would have offered to scaffold over it. A hardcoded list
cannot report what is missing from it; that is the defect, and it is a *scope* defect,
not a token one.

## 3. What shipped

**`themes/<name>.manifest.json`, one per theme file, under `themes/theme.schema.json`.**
It declares `role` · `extends` · `family` · `tier` · `order` · `modes` ·
`darkCounterpart` · `swatch` · `cvd` · `note`. **No token names, no token values.**

The governing rule, and the reason this version survives where inventory manifests did
not:

> **The manifest owns SCOPE — which themes a rule applies to.**
> **The code owns CONTRACT — what the rule requires.**

Every field is either impossible to state in CSS (`family`, `tier`, `order`, `swatch`,
`cvd`, `note`) or gated against it (`role`, `extends`, `modes`, `darkCounterpart`).

**Four gates, in `tools/check-ownership.js`:**

| Gate | Proves |
|---|---|
| `checkThemeManifestCoverage` | bijection: every CSS has a manifest, every manifest a CSS, names agree |
| `checkThemeManifestShape` | the manifest matches `theme.schema.json` — read *from* the schema file, not a hand mirror |
| `checkThemeRoles` | `role`/`extends` against the file's imports (**all** of them) and token count; `swatch`/`order` present and unique per group |
| `checkThemeModes` | `modes` against the palette's own `color-scheme` **specificity** and its `light-dark()` arms; `darkCounterpart` against disk |

The specificity distinction in the last one is load-bearing and was not obvious:
`:where(:root){color-scheme:X}` is a zero-specificity **default** (every base palette
ships one), `:root{…}` is a **pin** (the `-dark` wrappers), `:root:root{…}` is a
**hard pin** (a11y-base, whose color-vision separation is tuned for one canvas). A pin
narrows a palette to one face; a default does not.

**Nine of the ten enumerations now read scope from the manifests**: `listBasePalettes`,
`checkCatInkDeclared`, `derive-cat-ink.js`, `new-theme.js`, and the four palette
suites via a shared `baseThemeNames()` helper. **The tenth is not rewired**:
`docs/src/components/site/PaletteSelectItems.tsx` still decides family by string prefix
(`p.startsWith('a11y-')`), and it is not a forgotten call site — its input is
`palettes: string[]`, so it never receives `family` at all. Fixing it is a threading
change through the site chrome, not a one-liner. Until it lands, the claim this note
makes is nine-tenths true, and this sentence is the record of the missing tenth. `tools/build-theme-catalog.js` bakes the
Studio picker's groups and swatches into `docs/src/components/studio/palettes.generated.ts`
(the docs bundle cannot `fs`-load 32 manifests), gated by `theme-catalog:check`.

**What it fixed, concretely:** `carta` is now covered by all four palette suites and
`new:theme` refuses it; a stray `.css` in `themes/` gets one accurate message
("no manifest") instead of being adopted as a gate subject and reported as a broken
theme; `#1302`'s carbone question has a machine-readable, gated answer; and the picker's
two hand-kept lists became one generated file.

**Verified on the real surface** (HARD RULE #23): the built docs site driven in
Chromium, the actual Studio theme picker opened the way a user opens it — 18 palettes,
the deliberate indaco-first curated order preserved, every swatch matching its old
hardcoded hex. The generated module is byte-identical to the hand-written one it
replaced. No rendered output changes: the only `dist/lattice-emulator.js` delta is the
inlined `package.json` picking up two npm scripts, proved inert by re-rendering a
13-slide deck byte-identical to the pre-change output.

### What the checker caught, and what it means

Two of the four gates shipped with holes in the first cut, and both are the same
species — *a gate that cannot catch the defect it exists for is worse than no gate,
because it is also a claim* (`tools/check-ownership.js`, `RESHAPE_STRATEGIES`).

- **Nothing validated a manifest against its own schema.** `theme.schema.json` was
  decoration: deleting `tier` from `indaco.manifest.json` dropped the *default* palette
  out of `CURATED`, out of `BUILTIN_PALETTES`, out of the picker, with every gate
  green — and `StudioShell` then resets any visitor sitting on it. Strictly worse than
  the hand-kept array it replaced, where the same breakage was a visible name deleted
  from a reviewed diff. `checkThemeManifestShape` closes it.
- **The `light-dark()` arm split broke on any arm containing a paren.**
  `light-dark(var(--x), var(--x))` read as two *different* arms, so a palette re-tuned
  to degenerate arms would have kept its declared second face silently — the exact
  false negative the gate promises to catch. Now paren-aware, with the false negative
  pinned by a test.

Both now have BITE-tests that construct the violation rather than asserting the shipped
tree is clean.

## 4. The issue's three open questions

**Q1 — manifest-as-input (CSS generated) or manifest-beside-CSS?** **Neither.** Themes
stay hand-written CSS. **The manifest is metadata; the CSS is the implementation and
the source of truth for every token value.** That is the settled boundary.

This answer was re-opened after the note first shipped — the argument being that drift
should be concentrated in one place, and that LLM-authored themes need a validatable
structured input. Both are reasonable and both were **refused on measurement**:

- **`deriveTheme` cannot reproduce a shipped palette, and regenerating one moves it
  further than a *different* palette already is.** Feeding each theme its own ten
  essentials back through the generator and comparing in OKLab: **13 of 14 themes fail
  an identity test** (`derived(X)` is closer to some *other* shipped palette than to
  `X`), and for six of them the nearest shipped palette to `derived(X)` is not `X`.
  Palettes collapse into each other — `magnolia`~`burgundy` goes ΔE 11.8 → **0.6**,
  `cuoio`~`mustard` 10.3 → **0.8**. A sensitivity sweep says why: the accent hue alone
  drives **56 of 83** derived tokens, and two themes sharing an accent hue but differing
  in every other essential emit **18 tokens byte-identical**. "Ten essentials plus a
  ramp name" is, for the categorical cycle, the chart spectrum, the hljs set and the
  whole dark canvas, "one hue plus a ramp name."
- **So the `overrides` tier is not a junk drawer to police — it is the design.** An
  independent measurement puts it at **109–127 entries per theme**. That is
  `indaco.css` transcribed into JSON, minus the comments, plus a build step.
- **`serializeTheme` structurally cannot emit 18 of the 32 theme files** — it hardcodes
  `:where(:root) { color-scheme: light; }`, so no `-dark` wrapper (which needs a `:root`
  *pin*) and no `a11y-*` file (which needs `:root:root`) is expressible.
- **The prose is 61% of the artifact.** `themes/*.css` is 5,050 lines, 3,069 of them
  comments — measured contrast ratios, third-party attribution, why a hex is that hex,
  the specificity warning in `a11y-base.css` that exists because the bug already
  happened. JSON has nowhere to put that.
- **The LLM argument does not need a manifest, because it already ships.**
  `lib/theme/ai.js` already takes structured JSON from a model (ten essentials + a
  ramp-strategy enum), validates and repairs it deterministically, derives the full
  contract with AA repair, and serializes droppable CSS. Routing that through a
  committed manifest adds a second artifact to keep in sync, not a capability.
- **And validation only covers the easy half.** A schema-legal `rampStrategy:
  "analogous"` collapses 11 of 12 categorical fills to one pale blue (adjacent
  ΔE 0.55–0.71) while the contrast audit returns **ok**; `pass = warn = fail` passes
  schema and audit with every RAG signal one color. Nothing checks slot-vs-slot
  separation, semantic distinctness, or ramp appropriateness.

**Correction to this note's original reasoning.** It said the escaping hole was
contained because *"`deriveTheme`'s normalization is the only thing containing that."*
That is wrong in the unsafe direction. Two channels bypass `deriveTheme` entirely: the
`description`/`label` strings interpolated raw into the CSS comment header (and
populated from model output at `Fabricate.tsx:331`), and — worse — theme CSS taken
**verbatim** from an imported asset bundle (`asset-bundle.ts` `unpackBundle` →
`saveStudioTheme` → `extraTheme` → the preview's un-sanitized `<style>`). So escaping
`serializeTheme` is **not** a prerequisite for a future direction; the sink is
unguarded today, `checkPreviewHtmlSinks` only inspects the HTML half, and the
attacker-controlled channel is the zip import rather than the serializer. Re-scoped in
#1458.

**Q2 — require all 83, or declare which are deliberately inherited?** **Neither, as
posed.** "Deliberately inherited" is not a per-token global fact: obligation is per
token *per theme role* — `--accent` is authored for `onyx` and inherited for
`onyx-dark`. That is why the manifest declares **role** and lets the token contract
stay computed. The falsifiable question is *does this token have a safe default?*,
which is a property of the engine, not of a theme.

**Q3 — does this subsume the deferred categorical seed derivation?** **No — separate,
and neither blocks the other.** That item changes how the 12 slots are *computed*; this
changes who *declares* what. Nothing couples them.

## 5. Still open — and it is the part with the shipping bug

**The manifest does not fix #1411, and #1411 is a class.** The generator omits engine
tokens that have **no safe default**, and no gate can see it because a Studio theme
never lands in `themes/`. Three instances ship today: the 12 `--cat-N-ink`, the 6
`--c-*` containment tokens, and `--spectrum`.

Measured on the real render CLI to PNG bytes:

- A Studio-shaped theme paints Mermaid subgraph boxes **solid black on 5 of 8 slides**
  of `examples/containment-tier.md` (up to 23.9% of a slide) via the PDF path's
  documented black sentinel. indaco on the same slides: 0 black pixels.
- Stripping only indaco's 12 curated inks moves label text from **4.65:1 to 4.16:1**
  against `--bg-alt` — through the AA floor. Across all 14 palettes: **66 slot/palette
  pairs on 13 of them**, counting a slot once per palette where the light arm falls
  below 4.5:1 on `--bg-alt`. An independent re-derivation counting any of
  {light,dark} x {`--bg`,`--bg-alt`} gets **72**; both are right for their axis, and
  the earlier draft failed to state which it used.

  **This measures the wrong population, and the distinction matters for sizing #1457.**
  It is a HAND-AUTHORED palette with its inks removed, whose marks were curated to the
  graphical 3:1 floor and needed the solved ink tier to reach 4.5:1. Actual
  `deriveTheme` output is different: it repairs its own marks (25 AA-threshold
  `ensureContrast` calls), and across all four shipped starters — 12 slots x 2 modes x
  2 surfaces — the worst measured ratio is **5.86:1**, with zero sub-AA slots. So the
  ink gap is a real contract gap for generated themes, but it is **not** a shipping
  contrast defect for them. The black Mermaid box is.

That is **#1457**, and it is a generator fix: widen `REQUIRED_TOKENS` and port
`solveInk`/`separateArm` from `tools/derive-cat-ink.js` into the browser-bundled
`derive.js` (~200 lines with two throwing failure paths — *not* a data edit, as my
first draft wrongly claimed). One risk to settle first: the `brand-mono` ramp reaches
the anti-collapse guard on a `pine` starter, which would give `deriveTheme` a
browser-facing throw driven by a user's ramp choice.

Also still open, deliberately out of scope here: the 95-vs-91 `CONTRACT` drift between
`token-parity.test.js` and `theme-scorecard.js` (#1459) — this change fixed the *scope*
half of that pair, not the token-list half.

## 6. Not verified

- **The palette picker at tablet (~820px). UNVERIFIED, and not for want of trying.**
  1440px (Build → Inspector → Theme) and 390px (Settings → Deck → Theme) both carry
  artifacts and both list the 18 palettes in the declared order with the right swatches.
  At 820px the control is **not reachable at all** in the built Studio: the Inspector
  that holds it is not rendered, and neither `Settings`, `Slide settings`, `Menu` nor
  `Build` surfaces a theme control. That is pre-existing layout behavior — this change
  swaps where the picker reads its data, not what renders or at which breakpoint — but
  it means the QUALITY BAR's three-width evidence cannot be completed for this surface
  until the tablet gap is understood. Worth a look on its own.
- Whether `separateArm` actually *throws* on a derived `brand-mono` palette, as opposed
  to merely being reached.
- Whether a `-dark` wrapper's `modes: ["dark"]` survives an author
  `style: ":root{color-scheme:light}"` override — reasoned from specificity, not driven
  in a browser.
