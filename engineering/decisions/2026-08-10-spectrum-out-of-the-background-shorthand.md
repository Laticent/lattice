---
status: shipped
summary: >
  A theme missing a token the engine paints with did not lose the decoration, it lost the
  CANVAS: one undefined var() makes the WHOLE declaration invalid at computed-value time, so
  `background: var(--spectrum) …, var(--bg)` fell to its initial value rather than back to the
  earlier `section` rule. Measured on a real render — a `_class: dark` slide came out white
  with its near-white headline invisible on it. #1535 fixed the SOURCE (the Studio's generator
  now emits the token); this closes the trap for every source the contract will never reach —
  third-party themes, hand-edited palettes, imported bundles — by splitting six canvas-bearing
  shorthands across five files into longhands. Three of the six came from sweeping for the
  SHAPE rather than the token, and one of those, section.accent.dark, was missed by the first
  sweep and found by the checker: it paints from --accent, which has NO engine :root default at
  all. The code panels are exposed on the DEFAULT path too, not only under `spectrum-trim: on`,
  because --spectrum-structure derives from --accent/--border. Verified byte-identical across 26
  renders and, independently, across 7 themes x 88 section-class combinations x 9 background
  longhands with zero substantive computed differences — so the shorthand-to-longhand change is
  provably inert on a well-formed theme. Records a process lesson: the first draft's cascade
  audit was enumerated by hand and was wrong twice (it missed three background-image longhand
  rules and about a dozen competing selectors) while reaching the right conclusion; CSSOM
  enumeration plus a computed-style sweep is the instrument that shape of claim needs.
---

# Getting `--spectrum` out of the `background:` shorthand

**#1528.** Follow-on from #1457, recommended by that work's Munger-inversion pass as "the
one concrete thing I would put in this PR or the very next one." Deliberately not in
#1535: that change fixed the *source*, this one closes the *trap*.

## 1. The mechanism, restated because it is counterintuitive

CSS says: if **any** `var()` in a declaration is undefined, the **entire declaration** is
invalid at computed-value time, and the property takes its **initial** value. It does
*not* fall back to an earlier, lower-specificity rule that set the same property.

So this —

```css
section { background: var(--bg); }              /* base.elements.css */
section.dark { background: var(--spectrum) top / 100% 1px no-repeat, var(--bg); }
```

— does not degrade to "dark slide, no ribbon" when `--spectrum` is absent. It degrades to
`transparent`. The `var(--bg)` sitting *next to* the missing token goes down with it, and
the `section` rule underneath cannot rescue it, because `background` on `section.dark` is
not unset — it is invalid, which is a different thing.

**Reproduced on the real export path** (`node lattice-emulator.js`, Chromium 131, indaco
with its `--spectrum` / `--spectrum-vertical` declarations stripped): the `_class: dark`
slide rendered white, its near-white display headline invisible on it, and the divider the
same. Losing the canvas is a larger defect than losing the ribbon, and it hides underneath
it.

## 2. Why this is worth doing after #1535 already fixed the generator

#1535 made `deriveTheme` emit the family, so the Studio can no longer *produce* a theme
short of `--spectrum`. That is the right fix for the source it covers, and it covers one
source. A palette can also arrive as a third-party theme, a hand-edited file, or an
imported asset bundle — and `REQUIRED_TOKENS` is a promise the generator makes, not a
property of every CSS file the engine will ever load. This change makes the *reader* safe
instead of trusting every writer.

## 3. What shipped

**Six declarations across five files**, split from the `background:` shorthand into
longhands. The rule for which ones qualify is narrow: **one layer of a multi-layer
shorthand reads a token a theme may omit, and a DIFFERENT layer is the canvas or a panel
surface** — so a miss costs more than the decoration.

| site | droppable token | what the miss used to take with it |
|---|---|---|
| `base.modifiers.css` `section.dark` | `--spectrum` | `var(--bg)` — the slide canvas |
| `shared.styles.css` `section.accent.dark` | `--accent` | `var(--bg)` — the slide canvas |
| `divider.styles.css` `section.divider` | `--spectrum-vertical` | `var(--surface-inverse)` — the slide canvas |
| `code.styles.css` `section.code pre` | `--spectrum-structure` | `var(--code-bg)` — the code panel surface |
| `compare-code.styles.css` (two rules) | `--spectrum-structure` | `var(--code-bg)` — the code panel surface |

**`section.accent.dark` was missed by the first sweep and found by the checker.** It is the
same shape with a different token: the dark-canvas accent stripe is
`linear-gradient(…var(--accent)…), var(--bg)`, and `--accent` has **no engine `:root`
default at all** — the only engine declaration of it is the print remap — so a theme short
of it lost the canvas exactly like a theme short of `--spectrum`. That is worth stating
plainly: the hazard is a token *being absent*, and scoping the sweep to the token name that
motivated the issue nearly shipped the fix with its own last instance intact.

The code-panel rules are one hop out: they read `--spectrum-structure`. The first draft
called `spectrum-trim: on` the reachable path, and that understated it — the **default**
value is exposed too, since `base.variants.css` derives it as
`linear-gradient(var(--spectrum-quiet), …)` and `--spectrum-quiet` is
`color-mix(… var(--accent) …, var(--border))`. So a theme short of `--accent` *or*
`--border` poisons the token with no register set at all. Measured: with `--accent`
undefined and no `spectrum-trim`, the old CSS computed `background-color: rgba(0,0,0,0)`
on `section.code pre`; the new CSS keeps `--code-bg`. A custom property that is invalid at
computed-value time poisons everything that reads it, which is what makes this class travel
further than it looks.

**The other ~10 spectrum-in-shorthand sites are deliberately untouched** — `thead tr`
rails, `section hr`, the `list-steps` spine, `matrix-grid`. Each is a *single-layer*
background whose only content is the decoration, so an invalid declaration loses exactly
the decoration. That is already the correct degradation, and converting them would be a
larger diff for no behavior change.

Note that the divider's existing `var(--spectrum-vertical, var(--spectrum))` fallback did
**not** save it. A theme missing the family is missing both, and a fallback chain that
ends in another undefined token is itself invalid at computed-value time — the same trap
`checkNoSafeDefaultTokens` learned to resolve rather than parse (#1535 §4d).

## 4. The cascade audit, and why hand-enumeration was the wrong instrument

Shorthand → longhand changes what a *later* rule does. Today a rule setting `background:`
competes with one declaration; afterwards it resets all five longhands. That is the right
behavior for every rule involved here — each one *replaces* the canvas rather than tuning
it — but it had to be checked rather than assumed.

**The first draft of this section checked it by hand and got it wrong twice**, which is
worth recording because the conclusion was right and the reasoning was not. It listed six
competing rules and claimed (a) every rule setting `background` on these selectors uses the
shorthand and (b) the finish layer paints only on a `section.finish > .backdrop` child and
so never competed. An independent checker refuted both: three rules set a **`background-image`
longhand** directly on the section — `base.finish.css`'s `section.finish-none,
section.backdrop-none` and `base.treatments.css`'s `tint-*`/`mark-*` rule — and the first of
those is (0,1,1), equal to `section.dark`, and *later* in the bundle, so on a
`dark finish-none` slide it already suppressed the ribbon, before and after this change. And
the six-rule list was missing about a dozen more, including `section.accent.dark`,
`section.title`, `section.closing`, the six `*-cover` split classes, and
`section.dark:is(.spectrum-edge-*)`.

**The right instrument is enumeration by the CSSOM, not by grep.** Walking every rule in the
built bundle and testing `element.matches()` against synthetic sections finds **81** distinct
(target, selector) matches on these four elements. Every one is either a `background:`
shorthand at higher specificity (resets all longhands — behavior unchanged) or a
`background-image`-only rule whose winner the split does not affect.

That was then verified rather than argued: **7 themes × 88 section-class combinations × 4
target elements × 9 background longhands in real Chromium, with zero substantive computed
differences.** The only raw diffs were the trailing `image: none` layer the old two-layer
shorthand carried, which is not a rendered difference.

Two smaller corrections from the same pass: `background-blend-mode` is **not** a
`background` shorthand sub-property, so it was never among "the longhands the shorthand
would also reset"; and `background-clip` is set in four places, not one — but none of them
is on a `section`, so nothing sets `background-clip` / `-origin` / `-attachment` on a rule
that matches here, and the conclusion stands. The finish layer is still the precedent for
the shape adopted here: it already writes `background-image: var(--fin-texture, none),
var(--fin-wash, none)` as longhands.

## 5. Verification (HARD RULE #23)

Real surface, real artifact — `node lattice-emulator.js` to PNG in Chromium 131, opened and
looked at, not merely diffed.

**The defect, on a theme short of the family** (indaco with `--spectrum` and
`--spectrum-vertical` removed):

| slide | before | after |
|---|---|---|
| `_class: dark` | white canvas, headline invisible on it | dark canvas, headline legible, no ribbon |
| `divider` | white canvas, headline invisible on it | inverse canvas, headline legible, no rail |

The `accent dark` slide behaves the same way with `--accent` stripped: white paper and an
invisible headline before, the dark canvas and no stripe after.

**The no-regression case, on complete themes.** Byte-comparing rendered PNGs before and
after: a four-slide deck (default, `dark`, `divider`, `code`) under **indaco, onyx, cuoio
and carta** — 16 of 16 identical; a six-slide deck at `spectrum-trim: on` covering
`dark spectrum-off`, `divider spectrum-off`, `divider light`, `dark print`, `code` and
`divider spectrum-edge-off` — 6 of 6 identical; and an `accent dark` slide across the same
four palettes — 4 of 4 identical.

**Those counts describe scratch decks, so they are not by themselves re-runnable, and the
stronger evidence is.** An independent checker measured the same claim with a better
instrument and reported it in full: **7 themes × 88 section-class combinations × 4 target
elements × 9 background longhands, zero substantive computed-style differences**, plus 8 of
8 byte-identical renders of its own deck. The combination list covers every rule §4's CSSOM
enumeration surfaced — `spectrum-off`, all four `spectrum-edge-*`, `divider light`,
`print`, all six `*-cover` classes, `spectrum-trim`, `spectrum-trim-restrained`, `finish`,
`finish-none`, `backdrop-none`, `sketch`, `tint-*`, `mark-*`, `focus`, `build`,
`fluid-view`, `title`, `closing`, `image`, `scene`, `chart-frame`, and the
`code`/`compare-code`/`compare-code-block` cross-products. The rule to take from this: for
a change whose whole claim is "nothing renders differently", a computed-style sweep across
the real combination space beats any number of hand-chosen probe decks.

`npm run lint`, `npm test`, `npm run build:check`, `npm run lint:deck:all` and the
integration tier all pass.

## 6. What this does not fix

- **The guard is a STRUCTURAL rule, after a token-list version was defeated four ways.**
  `checkBackgroundLayerVars` in `tools/check-ownership.js` (budget 0, empty allowlist, the
  `SANCTIONED_MARGINS` idiom) fails any multi-layer `background:` shorthand in `lib/**` that
  reads a `var()`. The first cut was a unit test enumerating "droppable" tokens
  (`--spectrum*`, `--sp-fill-*`, `--accent`) and "surface" tokens (`--bg`, `--code-bg`, …).
  Two independent adversarial passes defeated it with four rules a reasonable author would
  write, each losing the canvas in real Chromium: a single layer naming **both** kinds (the
  `color-mix(… var(--accent) …, var(--bg-alt))` idiom, live in `roadmap.styles.css`), an
  uppercase `BACKGROUND:` (CSS property names are case-insensitive; the scan was not), a
  droppable token outside the list (there are **107** theme tokens with no engine `:root`
  default), and a surface token outside the list (`--accent-soft`, `--tag-bg`, `--pass-bg`).
  The structural rule subsumes all four, needs no judgment about which layer is load-bearing,
  and has no list to rot. It is reachable **at budget 0 today**: after this change `lib/**`
  holds exactly one multi-layer `background:` shorthand and it reads no `var()` at all.
  That correction matters beyond this PR — #1535 landed a day earlier explicitly replacing a
  hand-kept list with a computed obligation, and the first cut here reintroduced one.
- **The single-layer sites stay as shorthands** (see §3), so the codebase now contains both
  spellings. The rule distinguishing them lives here and in the test's own comment rather
  than being enforceable.
- **Nothing here derives or validates `--spectrum` for a third-party theme.** A theme short
  of the family still ships without a ribbon; it just no longer ships without a slide.
- **No per-feature demo deck (HARD RULE #9), deliberately.** The whole claim of this change
  is that nothing renders differently on a well-formed theme — 16/16, 6/6, 4/4 byte-identical
  and a zero-diff computed sweep say so. A demo deck would demonstrate nothing, and the
  behavior it *would* need to show requires a deliberately broken theme, which does not
  belong in `examples/`. Stating the exception rather than leaving it silent, since #9 is
  written without one.
- **~~PPTX and HTML export paths are UNVERIFIED.~~ CLOSED (#1596, 2026-08-11.)** Only the
  PDF/PNG path was rendered here. Both were subsequently measured before and after this
  commit across all six hoisted sites: 14 PPTX slide rasters and 14 HTML-player slide
  screenshots byte-identical, the player's DOM outside its inlined `<style>` byte-identical,
  and its file bytes larger by exactly 5,060 — the inlined CSS, nothing it paints. That work
  also sharpens the sweep's phrasing above: the computed background is **not** identical, it
  is two layers to one, because the shorthand's final layer carries the canvas color with
  `background-image: none`. Nothing that paints differs, which is what "zero *substantive*
  computed differences" was carrying. See `2026-08-11-hoist-pptx-html-player.md`.
- **The Studio's own generator path is UNVERIFIED.** A short theme was simulated by
  stripping declarations from a shipped palette, not by driving the Studio in a browser. The
  mechanism is CSS-level and palette-independent, so the simulation is faithful to it.
