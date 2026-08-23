---
status: shipped
summary: >
  Four color defects with one shape — a token whose DECLARED contract does not match what it
  paints — fixed together, gated together. `--ink` was read six times (four in engine CSS, two
  the issue did not list) and declared nowhere, so `var(--ink, var(--accent))` shipped the
  "neutral ink" vignette rim in the BRAND hue on every theme since #1606, and a BARE
  `var(--ink)` made a chart→anima emphasis stroke inherit rather than emphasize.
  `--text-muted` carried two contracts that contradicted each other IN WRITING — its name
  classifies as ink at 4.5 via `lib/tokens/contracts.js`, its own declaration in all fourteen
  palettes said "decorative … WCAG-exempt" — and the value followed the comment while the reads
  followed the name, leaving it below AA on 44 of 72 palette-mode-surface pairs, worst 2.11:1.
  It is now split: `--text-muted` keeps the name and gains AA (44 → 0), `--muted-mark` is new
  and takes the decoration at the 3:1 graphical floor, seeded so 32 of 36 values are
  byte-identical. The four `a11y-*` palettes inherited onyx's red-green syntax family for
  SLIDE code panels — contrast was never the problem there and that is why no gate saw it;
  measured through a color-vision simulation over all twelve roles, 21 of 66 role pairs
  collapsed under deuteranopia and 22 under achromatopsia — where two roles were EXACTLY
  identical — now 0.1194 / 0.1143 / 0.1285 / 0.0511 cross-group worst-pair,
  6x to 8x better — on the LIVE slide preview, since the export path still loads the base
  after the theme and a first cut of this record wrongly claimed exported bytes changed there.
  And the Studio's deck editor installed no `syntaxHighlighting(...)` at all.
  Three new gates, each bitten before its green was trusted. The largest measured cost is
  stated rather than buried: on cuoio/light, AA for muted TEXT collapses its separation from
  `--text-body` from 0.198 to 0.038, which is a fact about that palette's 5.46:1 body ceiling
  and happens under every option considered.
---

# Four undeclared-contract color tokens — the class, the fix, and the gates

**#1715.** Split out of #1688/#1720, which triaged `--ink` and filed it rather than
smuggling a finish-preset visual change into a Studio token PR.

## 1. The thesis that makes this one change

Four defects, one shape: **a color token whose declared contract does not match what it
paints.** Not four unrelated bugs that happened to be open at once — the same failure mode
four times, and each one invisible to the gates for the *same* reason: every existing gate
measured either the value or the read, and never the relationship between the two.

| | what was DECLARED | what it PAINTED |
|---|---|---|
| `--ink` | nothing at all, on any theme, ever | the brand accent, via the fallback that always won |
| `--text-muted` | 4.5 by its NAME, "WCAG-exempt" by its own comment | real text, below AA on 44 of 72 pairs |
| `a11y-*` `--hljs-*` | nothing — inherited onyx's family through `a11y-base` | a red-green syntax pair, on the palettes named for avoiding it |
| deck editor | `studioHighlight`, a complete per-role map | nothing; the extension was never installed |

The last row is the same class stated most sharply. A `HighlightStyle` that is never
installed still passes every assertion about its contents.

## 2. `--ink` — the phantom, and two sites the issue did not have

`git log -S"--ink:" -- lib themes` is empty: it was never declared and later removed, it was
phantom from the moment the reads were written (#1606). Six sites, not four:

| site | form | why it matters |
|---|---|---|
| `lib/base/base.finish.css` 598/604/692/698 | `var(--ink, var(--accent))` | the `finish-halo` / `finish-nimbus` vignette rims |
| `docs/src/components/studio/finish-generate.ts:461-462` | same | every Studio-fabricated finish reproduced it |
| **`docs/src/lib/chart-anima.ts:216`** | **BARE `var(--ink)`** | **not in the issue** — the default emphasis stroke |
| **`docs/src/components/studio/FinishStudio.tsx:595`** | `var(--ink, var(--accent))` | **not in the issue** — the wash-hotspot handle |
| `examples/finish-override.md` 17/27/35 | `var(--ink, var(--accent))` | taught the pattern, with a committed PDF |

**The rims are the visible half.** The rule's own comment says "a low-alpha ink rim", and the
wash directly above it (`base.finish.css:575-585`) is already
`color-mix(in srgb, var(--accent) 6%, var(--fin-canvas))`. So the rim landed in the same hue
family as the wash it exists to seat against — least visible exactly where the accent is
near-achromatic (`onyx`, `concrete`), and reading indigo on `indaco` where a neutral was
wanted. All four now read `--text-heading` directly: it is in `REQUIRED_TOKENS`, so it needs
no fallback at all, which also removes the chain `KNOWN_CONTRACT_DROPS` was tracking. That
ledger fails on stale entries, so the row is deleted in the same commit.

**The bare read is the worse half, and it is a production path.**
`chart-anima-hydrate.ts:65` calls `chartToScene` with `highlightMarks: worstMarks(svg)` and
no `highlightColor`, so the default is what ships. `resolveColor`
(`docs/src/lib/anima/backends/paint.ts:16`) sets the value on a probe `<span>` parented to
the host and reads `getComputedStyle`. `color` is an INHERITED property, so an undeclared
custom property makes the declaration invalid at computed-value time and the probe returns
the HOST's own text color — the correction #1720 §7 had to make about this same mechanism,
after a change was built on the premise that it renders colorless.

**Measured, not asserted** — see §7. The stroke does render; it renders the *inherited* text
color instead of an emphasis color. Wrong, not invisible. The fix stands either way, and the
severity is "the highlight is accidental" rather than "the highlight does nothing".

**Two tests pinned the phantom rather than catching it.** `chart-anima.test.ts` passed
`highlightColor: 'var(--ink)'` IN and asserted it came back OUT, and nothing tested the
default — the value production actually uses. There is now a test for the default.

## 3. `--text-muted` — two written contracts, contradicting each other

This is the largest part, and the reason it took a decision rather than an edit.

**The contradiction is in the repo, in writing, twice.** `lib/tokens/contracts.js` reads a
token's floor off its NAME, because HARD RULE #11 makes role-based names canonical:

```
contractOf('--text-muted') -> { floor: 4.5, role: 'ink', sanctioned: false }
```

And every one of the fourteen palettes annotated the same line:

```
--text-muted: light-dark(#A69882, …);   /* decorative / de-emphasized — chrome,
                                           empty/skipped marks, glyphs; WCAG-exempt */
```

with `lib/theme/derive.js` agreeing in the generator: *"Muted is DECORATIVE / WCAG-exempt —
pass through, no repair."*

**The value followed the comment. The reads followed the name.** Below AA on 44 of 72
palette-mode-surface pairs, worst **2.11:1** (magnolia/light on `--bg-alt`), while a census
of the reads found the token doing two jobs with two different floors.

`origin/main` carries **124** reads of `--text-muted` in `lib/**/*.css` (comments stripped).
After the split, the same tree carries **53 `--text-muted` + 73 `--muted-mark` = 126** — the
two extra being the new `--quadrant-target-ink` declarations §"what a checker found" covers.
`docs/src` carries a further 106 reads, almost all `color:`.

| | engine CSS reads | fails its floor |
|---|---|---|
| paints TEXT (`color:`, SVG label `fill:`, `-fg` / `-ink` locals) | **53** | 44 of 72 pairs |
| paints DECORATION (borders, strokes, grid lines, 6% washes, state rings) | **73** | 6 of 72 pairs |

*An earlier draft of this record said 45 / 78 / 123 here and "88 sites" in its summary. None
of the three reproduced against the tree; the numbers above are counted with comments
stripped and are reproducible by the one-liner in §"what a checker found".*

That asymmetry is the whole argument. Raising one token to AA fixes the 44 and drags 78
decorative sites darker for no accessibility reason; leaving it fixes nothing. **So the role
is split, and neither reading is declared the loser** — both were describing something real.

### The design model, and what was measured before choosing

Three directions were considered and measured before any code was written.

**(a) Re-author 36 values by hand.** Cheapest, best per-palette taste, no new machinery — and
it over-corrects the 78 decorative sites across ~30 component stylesheets.

**(b) Derive with a two-sided solve** (AA floor plus a minimum ΔE from `--text-body`).
Measured: on the tight palettes lightness alone is nearly exhausted, so it needs chroma as a
second lever — and the maximum-separation answers a free search returns are off-brand
saturated colors (`#ff293a` as burgundy's "muted", `#0591ff` as brina's). A chroma-BOUNDED
solver lands within noise of (a)'s hand answer, so it adds machinery without changing the
result. Rejected on its own measurement.

**(c) Split the role.** Chosen. `--text-muted` keeps the name and gains the floor the name
always promised; `--muted-mark` is new, named for what it is, and takes the decoration at the
3:1 graphical floor.

**The number that decided it against (a).** `--text-body`'s own worst contrast is the ceiling
muted can approach, and its minimum across all 36 palette-modes is 5.46:1 (cuoio/light) — so
there the entire legal window is `[4.5, 5.46]`. A one-lever solve is provably nearly
exhausted on that palette *whatever option is picked*; what (c) buys is that the cost is
confined to the sites that actually need AA.

### What was measured, and what it cost

The 24 hand-authored palette values are solved with `solveInk` (`lib/theme/cat-ink.js`), so
hue and chroma are held and the move is the minimum lightness change — the same recipe the
categorical ink tier uses (HARD RULE #1).

**That is NOT true of the Studio's generator, and an earlier draft of this paragraph said it
was.** `lib/theme/derive.js` repairs the tier with bare `ensureContrast`, which walks to the
AA boundary rather than making a minimum move — so the one path that ships to users unattended
got the solver WITHOUT `MIN_DIST`. See §8.

| | before | after |
|---|---|---|
| `--text-muted` sub-AA pairs | **44 of 72** | **0 of 72** |
| worst `--text-muted` contrast | 2.11:1 | 4.65:1 |
| values that moved | — | 24 of 36 (12 already cleared) |
| ended LOUDER than `--text-body` | — | **0 of 36** |
| `--muted-mark` values byte-identical to today | — | **32 of 36** |

**The cost, stated plainly because #1720 reverted a change over exactly this.** On
**cuoio/light — the default palette and mode** — OKLab ΔE between the muted text and
`--text-body` falls from **0.198 to 0.038**. That reproduces #1720 §3's measurement to three
decimal places, and it is a fact about the palette rather than about the solve: with body at
5.46:1 there is no room for a quieter AA value.

**The distribution, not just the worst case**, because "34 of 36 keep ΔE ≥ 0.065" is a count
standing in for a shape and an inversion pass was right to ask for the shape:

| | |
|---|---|
| palette-modes that LOST separation | **24 of 36** (12 unchanged, **0 gained**) |
| median change across all 36 | **−20.4%** |
| median change among those that lost | −28.9% |
| lost more than 30% / 40% | 11 / 7 |
| worst | cuoio/light **−80.8%** (0.198 → 0.038), concrete/dark −64.7%, brina/light −50.5% |

For comparison, #1720's own docblock describes the version it REVERTED as "26 of 36
palette-modes lost separation; none gained any." **That is the same distribution.** What
separates this change from that one is not the amount of separation lost — it is where the
loss lands (see below), not how much.

A second consequence the first draft never computed: on the palettes with the least room, the
repaired `--text-muted` lands close to `--text-secondary`, which already carries AA. Measured
on the 15 palette-modes whose ramp resolves to literals, **4 sit within 0.035** — brina/light
at ΔE **0.0021** and cuoio/light at **0.0118** are the same color to the eye. So on the
default palette the ink ramp now has two named tiers that render alike, and the split bought
nothing there that `--text-secondary` would not have given free.

Two things bound the cost, and both are why this ships where #1720's attempt did not:

- **The ORDERING survives everywhere** — no palette-mode ends up louder than `--text-body`.
- **Every text reader moves together.** This is the real difference from #1720, and it is
  worth being precise that it is the ONLY one.

And the inversion that killed #1720's version does not arise here. That change lifted only
the editor's comment row while `.cm-gutters` and `.cm-completionDetail` stayed on the raw
token — **the chrome dimmer than the content it numbered**. Splitting the token moves every
text reader together, gutter included, and leaves every decorative reader where it was.

### The 4 values that DID move on the decorative side

`--muted-mark` is seeded to today's `--text-muted`, so 32 of 36 are byte-identical and those
pixels do not move. Four were below even the 3:1 graphical floor and are lifted:
cuoio/light (2.43 → 3.11), concrete/dark (2.95 → 3.11), crepuscolo/light (3.00 → 3.12),
magnolia/light (2.11 → 3.11). Pre-existing, and on this change's path — HARD RULE #18 says
fix them here rather than log them.

### Three things the split had to repair rather than merely move

- **`lib/theme/derive.js`** — the Studio's generator emitted the same unrepaired muted for
  every theme a user creates, so the defect was being manufactured downstream. It now derives
  both tiers with the two floors.
- **`lib/layout/ai.js`** — the component-generation prompt taught models `--text-muted` for
  decorative borders and washes in five places, including a worked example
  (`border-left:3px solid var(--text-muted)`). Same class as #1720 §7's `var(--text)` prompt
  defect: a hand-copied sample that no gate could see.
- **`docs/src/lib/lint-theme.js`** — mixed `--text-muted` 55% into `--text-body` to drag the
  lint tooltip's rule id past 3:1, with a comment explaining that the bare token bottoms out
  at 2.47:1. That workaround existed *only* because the token had no floor, and keeping it
  would now cause the very de-emphasis collapse described above. It reads the token directly,
  and its test — which asserted that bare `--text-muted` FAILS 3:1 somewhere — is inverted to
  pin the contract that replaced it rather than deleted.

### Two regressions the first cut introduced, and what caught them

Both from one bad line in the migration script: the property was extracted with
`([-a-zA-Z_]+)\s*:\s*`, which matches a **selector fragment** as readily as a property.

- `section.split-panel.mirror :is(header, footer) { color: … }` — `mirror` followed by
  ` :is(` parsed as a property named `mirror`, so a `color:` fallback was repointed at the
  3:1 token. Caught by `checkFallbackContracts`: *"`--marp-slide-header-color → --muted-mark`
  (4.5:1 → 3:1)"*.
- `roadmap.styles.css:356` — a horizon label's `color:var(--state-color, …)` fallback, same
  cause.

Both are back on `--text-muted`. Recorded because the lesson is not "write a better regex" —
it is that a mechanical migration over 251 sites needs a gate that measures the RESULT, and
the two gates that caught these were both pre-existing.

## 4. The `a11y-*` syntax families — where contrast was never the question

The four `a11y-*` palettes declared no `--hljs-*` family, so `a11y-base`'s import of `onyx`
gave them onyx's: `--hljs-string` green at hue 144° beside `--hljs-keyword` red at 17°. That
is the red-green axis `a11y-deuteranopia` and `a11y-protanopia` exist to avoid. #1720 routed
the Studio's EDITOR around this; a deck rendered on these palettes still got green strings.

**Why no gate saw it, and this is the interesting part.** `checkHljsContrast` holds every
`--hljs-*` to AA against `--code-bg`, and on these four it **passed the whole time** — every
inherited value clears the floor comfortably. Two colors can both clear contrast and still be
the same color to the reader the palette is for. `tools/cvd-audit.js` measures collapse under
simulation but covers the categorical cycle and the status trio, not the syntax family — and
it had **no achromatopsia arm at all**, so the condition one shipped palette is named for was
unmeasurable.

| palette | pairs distinct normally that COLLAPSE under the condition | worst pair before | after |
|---|---|---|---|
| `a11y-deuteranopia` | 21 of 66 | 0.0104 (`built_in`/`variable`) | **0.1194** |
| `a11y-protanopia` | 12 of 66 | 0.0041 (`built_in`/`variable`) | **0.1143** |
| `a11y-tritanopia` | 3 of 66 | 0.0204 (`built_in`/`variable`) | **0.1285** |
| `a11y-achromatopsia` | 22 of 66 | **0.0000** (`built_in`/`type`) | **0.0511** |

**Those "before" numbers are a correction, and the direction matters.** The first cut of this
table quoted 17/11/3/19 of **55** pairs with worst 0.0147/0.0139/0.0224/0.0064 — computed over
ELEVEN roles, silently omitting `--hljs-built_in`. That is where the worst collapse lives under
every condition, including an exact **ΔE 0.0000** tie with `--hljs-type` under achromatopsia
(`#70C0B8` and `#90B8D0` both simulate to `#B2B2B2`). The strongest single piece of evidence
for this change was missing from its own table. Found by an independent checker recomputing it.

The "after" column is the **cross-group** worst, which is what `checkHljsSeparation` holds.
Over all 56 distinct pairs the worst is 0.0575 / 0.0541 / 0.0643 / 0.0511. On the three
dichromacies that worst pair is `comment`/`punctuation` — both quiet by design, and
`checkHljsContrast`'s to police. On achromatopsia it is **`keyword`/`string`** at 0.0511, the
same number the cross-group column reports; an earlier draft named the quiet pair for all four
and was wrong on the fourth (its comment/punctuation sits at 0.0541).

Three things the design turns on:

- **The panel is an INVERTED surface.** `--code-bg` resolves to `--surface-inverse` — #000000,
  inherited from onyx — while these palettes pin `color-scheme: light`. So the seeds are the
  **dark** side of each palette's own curated `--pass`/`--warn` pair, not the light side the
  rest of the palette renders: deuteranopia's light-mode `--pass` #004982 is 1.5:1 here.
- **Six groups, not twelve.** A twelve-way color distinction does not survive a dichromacy and
  certainly not achromatopsia. Roles that cannot be told apart under the condition are made
  DELIBERATELY identical rather than accidentally so.
- **`--code-text` is a FIXED member of the separation set.** The panel also paints
  un-highlighted text (#D9D9D9), and a role colliding with it is as unreadable as two roles
  colliding. An earlier cut of the ladder put achromatopsia's string row at `#d7d7d7`.

**What an existing gate corrected, and it was right.** The first cut made `--hljs-comment` and
`--hljs-punctuation` byte-identical — both are "quiet", so merging them looked like the same
deliberate-collapse move as the other groups. `checkHljsContrast` polices exactly that pair by
name against the 0.010 collapse floor, after an earlier change had lifted both to one AA target
and merged them into one gray in eight palettes. The design was changed to six groups rather
than the gate weakened, and the new gate steps aside on that pair instead of duplicating it
with a second, different number.

**NOT reached, and stated rather than rounded up.** Tritanopia's worst cross-group pair is
0.1285, under the **0.15** `tools/cvd-audit.js` uses for CATEGORICAL distinctness. A free
search does reach 0.1670 — and returns a palette not worth shipping: a brown "quiet" comment
(`#9b7d5b`), three roles at one lightness, an off-axis teal at 190°. A constrained variant
reaches 0.1515 by painting keywords gray and identifiers dark red at 4.59:1, which inverts the
convention it is meant to serve. 0.15 is a bar for large flat areas of color; these are small
text that also carries italics (`.hljs-comment`, `.hljs-built_in`, `.hljs-title`) and language
structure. The ladder was kept and the shortfall is recorded here.

### Where these actually paint — a claim this change had to correct about itself

The first cut of this work said, in its commit message and in four theme files, that it
"changes exported PDF bytes for any deck on an a11y palette." **That is false, and rendering
the deck is what showed it.**

`lib/base/base.tokens.css` says so in as many words at its own `--hljs-*` block:
`lattice-emulator.js` concatenates `paletteCSS + layoutCSS`, so on the EXPORT path the base
is loaded AFTER the theme and the base's values WIN — *"a theme's own `--hljs-*` never paints
there"*. That inversion is #1527 and is not shipped.

Measured both ways rather than reasoned about:

| surface | `--hljs-keyword` on `a11y-deuteranopia` | |
|---|---|---|
| exported PDF (page sampled at the `function` token) | **#C792EA** | the BASE's value, byte-exact |
| live Studio slide preview (real built site) | **#E39B00** | this change's value |
| live Studio slide preview, `a11y-achromatopsia` | **#A7A7A7** | this change's value |

So Part 3 **changes no exported bytes today**. It repairs the live slide preview — the Studio
and the docs site, which load the theme last — and it repairs the export the moment #1527
flips the concatenation order. That is still worth shipping, and `checkHljsSeparation` holds
it either way; but "the deck renders green strings in a PDF" was wrong and the corrected
statement is narrower.

**`lib/theme/cvd.js` gained an ACHROMATOPSIA arm**, because measuring this needed a primitive
that did not exist. It is a monochromacy, not a dichromacy, so it stays OUT of `CVD_TYPES` —
that list is the three Machado matrices and a unit test
pins it as exactly three — and lands in a new `SIMULATED_TYPES`. There is no matrix because it
is not a matrix problem: with no functioning cones only luminance survives, so the simulation
is WCAG relative luminance (the same function the contrast gates use, not an ad-hoc
0.299/0.587/0.114 average) re-encoded to a neutral gray. Like the matrices it preserves
achromatic input exactly, which is the invariant its test asserts.

*A first draft of that simulation multiplied by 255 twice, clamped every value to white, and
reported ΔE 0.0000 for all 55 pairs — including pairs 2.4x apart in contrast. It was caught
because a measurement claiming total collapse everywhere is as suspicious as one claiming
none, not because anything failed.*

## 5. The deck editor installed no highlighter

`Editor.tsx` composed `markdown()` + `editorTheme` and no `syntaxHighlighting(...)`, so the
deck source rendered as bare text nodes with ZERO token spans — the one Studio editing surface
with no highlighting, while `CodeField` (`studioHighlight`) and the Playground
(`latticeHighlight`) both had it.

**The human call**, asked up front rather than assumed: a deck is prose, and heavy Markdown
colorization could read as noise on a writing surface. Answered yes, and the reasoning is
worth keeping — CodeMirror's Markdown token set is inherently restrained (heading, emphasis,
link, code span, quote), so this is structural affordance rather than code colorization: it is
what makes a deck's `<!-- _class: X -->` directives and its heading spine visible at a glance.
`studioHighlight` is reused rather than a bespoke Markdown style, so this surface and
`CodeField` cannot drift — `syntax-highlight-parity.test.ts` already pins them per role.

**That parity test could not have caught this**, and that is the finding. Every per-role
assertion in it passed the entire time, because a `HighlightStyle` that is never installed
still has correct contents. It now also checks each surface for the extension itself, at the
source, which is where the omission lived.

## 6. Gates

Three new, all via `build:check`, all **bitten before their green was trusted**.

### `checkPhantomTokenReads` — budget 0, no allowlist for the thing it polices

Two arms, one rule: **"engine-declared, or provably WRITTEN at runtime."**

- **Arm A** walks every `var(--a, var(--b))` chain in `lib/` via `fallbackHops()`, the one
  scanner with no `themeTokens` restriction and therefore the only one that can see a token no
  palette declares. This is why neither existing gate could: `checkNoSafeDefaultTokens`'s
  `fallbackOnlyTokens` arm opens `if (!themeTokens.has(token) …) continue;`, so a phantom is
  invisible to the gate built to police fallbacks *because* it is a phantom.
- **Arm B** walks the docs modules that emit CSS/SVG destined for a slide, **including bare
  reads**. Arm A cannot see `chart-anima.ts:216`, which has no fallback at all.

**Runtime-set is proven by a WRITE, never asserted by a ledger row.** Three writer idioms are
recognized, and the third had to be added: `plugins.js` emits the five `--logo-*` placement
tokens as `['--logo-y', …]` **pair arrays**, which `declaredCustomProps` did not know about, so
two real writers read as phantoms.

**The writer scan reads CODE, never pages** — `lib/**.{js,mjs}` plus `docs/src` TS/JS, and
deliberately not `.astro` or `.css` under `docs/src`. That is not fastidiousness: seven docs
prototypes (cadenza, vetrina, lente, suono, the two proto pages) declare their own page-local
`--paper/--stage/--ink/--muted` palette, and **those declarations are exactly what let
`checkDanglingTokenReads` pass `chart-anima.ts`** — that gate accepts a token declared anywhere
it looked. `grep -rn -- "--ink:" .` returns hits, and every one is a red herring.

Two `AUTHOR_SET_ENGINE_TOKENS` remain (`--fill`, `--font`), both set by a DECK rather than by
code, and the list errors on a stale entry. Arm A is scoped to fallback CHAINS rather than
every bare read in `lib/` for a measured reason: a bare-read version reports 18 residue tokens,
which is the "large runtime-set allowlist for little return" #1715 predicted — all allowlist,
no signal.

| mutation | gate |
|---|---|
| restore `var(--ink, var(--accent))` in `base.finish.css` | **RED** (arm A) |
| restore the bare `'var(--ink)'` default in `chart-anima.ts` | **RED** (arm B) |
| a stale `AUTHOR_SET_ENGINE_TOKENS` entry | **RED** |

*An earlier cut compared `--`-prefixed declarations against the bare names `bareVarReads`
returns, so every hop was skipped and the gate reported a clean tree on a tree that still had
`--ink` in it. It was caught by running it against `origin/main` and getting the same answer.*

### `checkMutedTierFloors` — each half against its own floor

4.5 for `--text-muted`, 3.0 for `--muted-mark`, over every palette file in both modes.
**Pinned literals**, not imported from `lib/theme/color.js` and deliberately not reusing
`CAT_TEXT_FLOOR` — #1720 §5's finding is that a gate taking its floor from the thing it
measures cannot fail when that thing moves. **Fails closed** on a value it cannot resolve:
`catContrast` returns null on an unreadable value, and `null < 4.5` is TRUE in JS while
`NaN < 4.5` is FALSE, so guessing either way is how a gate ends up measuring nothing. The
anti-vacuous floor is DERIVED from the number of palette files rather than hardcoded.

Bitten by restoring magnolia's pre-#1715 `--text-muted` (2.47:1, RED), restoring cuoio's
un-lifted `--muted-mark` (2.64:1, RED), and an unresolvable value (RED, fail-closed arm).

### `checkHljsSeparation` — the SIMULATED values, which nothing measured before

Reads the EMITTED theme files, simulates each value under that palette's own condition, and
holds every cross-group pair to a pinned literal floor. **Two floors, because the conditions
are structurally different** and one number covering both would be the weaker everywhere:
0.11 for the dichromacies (lightness plus one chromatic axis survive) and 0.048 for the
monochromacy (only lightness survives, so the ceiling is arithmetic).

Deliberately-identical roles are skipped — that is the design, not a collapse — and the
comment/punctuation pair is left to `checkHljsContrast`, which already owns it.

Bitten by deleting a palette's family so it inherits onyx again (RED), by putting onyx's green
string back beside the amber keyword (**ΔE 0.1047 under deuteranopia**, RED), and by colliding
a role with `--code-text` (RED).

## 7. Verification (HARD RULE #23)

**The real built docs site**, `astro preview` over `npm run build`, real Chromium — not a
harness and not jsdom.

**`tools/verify-studio-syntax.js` (committed, pre-existing): PASS, 252 comparisons.** Every
rendered token color equals its own palette-mode's emitted token value across all 36
palette-modes. This is the check that `--text-muted` moving did not disturb #1720's syntax ink
tier — and separately, the emitted `--syntax-*-ink` values are **byte-identical** to `main`,
which is consistent with #1720's own note that its `avoid` constraint is inert on the shipped
palettes.

**The deck editor now paints (Part 4).** On the real Studio: **7 token spans in 2 distinct
colors**, against zero spans before. Headings resolve to `rgb(122, 90, 16)` = `#7A5A10` =
cuoio/light's `--syntax-keyword-ink`; the `<!-- _class: X -->` directives resolve to
`rgb(118, 104, 84)` = `#766854` = cuoio/light's **new** `--text-muted`. So Part 2 and Part 4
are verified on the same pixels.

**The `--ink` severity question, measured rather than asserted.** The issue and the brief both
reasoned that the anima emphasis stroke "probably does nothing"; the instruction was not to
claim it without measuring. Driving `resolveColor`'s own mechanism on a real host:

| probe | resolves to | |
|---|---|---|
| the host's inherited color | `rgb(107, 93, 79)` | `#6B5D4F` — cuoio/light `--text-body` |
| `var(--ink)` — what shipped | **`rgb(107, 93, 79)`** | **identical to the inherited value** |
| `var(--text-heading)` — what ships now | `rgb(30, 26, 21)` | `#1E1A15`, declared |

**Confirmed, with the severity corrected:** the stroke was never invisible. It painted the
host's own body text color, so a "highlighted" mark was outlined in the same ink as the prose
around it. Wrong, not absent — and the fix demonstrably changes it.

**The vignette rim, measured at the corner** because a 7%-alpha rim is not something to
eyeball. Rendering one slide with the rim forced to the old effective value (`--accent`) and
one with the new (`--text-heading`), sampling the extreme corner at 60dpi:

| palette | OLD rim corner | NEW rim corner | |
|---|---|---|---|
| `indaco` | `srgb(241,245,247)` | `srgb(241,241,242)` | blue-tinted → neutral |
| `onyx` | `srgb(241,241,241)` | `srgb(241,241,241)` | **byte-identical** |

Which is exactly the shape the issue predicted and could not confirm: the repair is visible on
a hued accent and a no-op where the accent is already near-achromatic. Small in magnitude, real
in direction.

**The front-matter repair, verified on the real Studio after the trio.** A red team found
that deck front matter parses as a CommonMark SETEXT HEADING — the closing `---` is the
underline — so `marp: true / theme: …` rendered bold in the accent color, indistinguishable
from `# Title`, as the first thing an author sees on opening any deck. Re-measured on the
rebuilt Studio after wrapping the language in `yamlFrontmatter`, by typing a deck with front
matter into the real editor:

| span | computed | |
|---|---|---|
| `marp`, `theme` (keys) | `rgb(30,26,21)` = `--text-heading`, weight **400** | no longer a heading |
| `:` (separators) | `rgb(118,104,84)` = `--text-muted` | |
| `# A heading` | `rgb(122,90,16)` = `--syntax-keyword-ink`, weight **600** | still a heading |

**Responsive review at 1440 / 820 / 390** (QUALITY BAR). The deck editor's highlighting reads
as structural affordance rather than colorization at every width; at 390 the Studio defaults to
the Preview pane, so the Source tab was tapped to put the editor on screen — no jank, wrapping
and gutter hold. Screenshots in the PR.

**Gates and suites**: `npm run lint`, `npm test` (6648), the docs vitest suite (3181),
`npm run build:check`, and `cd docs && npm run typecheck` all pass. Each of the three new gates
was mutated to RED and back to GREEN before its pass was trusted; the mutations are listed in
§6.

**UNVERIFIED, stated rather than blurred:** the deployed Cloudflare Pages preview, so every
measurement above is against the real built site served locally.

**RETESTED on this branch rather than inherited**, because a limitation carried forward on
someone else's say-so is exactly the shape HARD RULE #12's retirement was about — a claim
nobody had re-run since it was written. Against this PR's own deployment
(`3387ac9d.lattice-docs-5ji.pages.dev`): `curl` returns **200**, and Chromium returns
**`net::ERR_CONNECTION_RESET`** both bare and with `--proxy-server` pointed at the agent
proxy plus `--ignore-certificate-errors`. Same asymmetry #1720 recorded, reproduced here.
So the surface is genuinely out of reach from this sandbox, and "couldn't test" stays
"couldn't test".

## 8. What a checker found (HARD RULE #25)

An independent checker ran on the complete diff and changed the outcome substantially. It is
recorded because every finding is the same species as the ones this change is *about*: a
claim the code did not make good on.

**Three sites where TEXT ended up at the graphical floor** — the migration's own defect,
committed twice more than the two already caught:

| site | what it paints | measured |
|---|---|---|
| `base.variants.css` 281/283 | the `tbd` / `archived` STAMP LABELS ("TBD", "[ Archived ]") via `--stamp-color`, read as `color:` in six stamp variants | 3.38:1 on `--bg`, 3.07:1 on the pill wash — the AA sibling gives 5.07:1 |
| `roadmap.styles.css:257` | the skipped cell's `--state-color`, read as `color:` on `.cell-state-label` | the earlier repair fixed the FALLBACK at the read, which never fires when the local is set |
| `quadrant.styles.css:336` | `.quadrant-target-badge`, an SVG `<text>` carrying the numeric threshold | 2.52:1 |

The last one was a token serving two floors one level down: `--quadrant-target` is a
78%-alpha tint used as the target LINE's stroke *and* the badge's fill. It is split the same
way the change splits `--text-muted`, into `--quadrant-target-ink`. That site was sub-AA
before this branch too (~2.0:1 on the old muted), so it is a pre-existing defect squarely on
the path — HARD RULE #18 says fix it here.

**Four decorative sites left behind, each half of a paired recipe whose other half moved** —
state-chart's SVG node gradient, radar's three legend swatches, map's unmatched-region swatch
stroke. They were byte-identical to their CSS partner before this branch and would not have
been after: OKLab ΔE between the two tokens differs on 24 of 28 palette-modes, worst 0.1054.

**Two real holes in the new gates**, both of which made them claim more than they did:

- `checkMutedTierFloors` **never noticed a palette that omits `--muted-mark` entirely** — it
  checked the value of a declared token and skipped an undeclared one. Demonstrated by
  stripping the token from `indaco`: zero errors. 73 engine reads would have been invalid at
  computed-value time on the default palette. It now keys the obligation on the SIBLING (a
  palette that authors `--text-muted` owns both halves), and that arm immediately found a
  real gap in this very change — `carbone` had `--scheme-dark-text-muted` and no
  `--scheme-dark-muted-mark`. `--muted-mark` also joined `REQUIRED_THEME_TOKENS` and the
  `token-parity` CONTRACT.
- `runtimeWrittenTokens()` **counted a token named in a COMMENT as a proven runtime write**,
  in the one function whose docblock says runtime-set is "proven by a write, never asserted".
  27 of 137 entries (20%) existed only in prose, including front-matter keys like `--class`
  and `--theme`. The concrete failure: re-introduce `var(--ink, var(--accent))` while any
  non-test file mentions `--ink:` in a comment — which *this record* makes likely — and the
  phantom gate goes green on its own subject. Comments are stripped now (137 → 110 entries,
  all four legitimate writers retained), and the exact scenario is bitten.
- Its anti-vacuous floor was `themes.length * 2` under a comment claiming 112 measurements;
  the real count is 256 over 32 files, so the guard tolerated losing **75%** of coverage. It
  is now `themes.length * 8` plus a minimum corpus size — because a floor derived from
  `themes.length` alone scales down with the loss and cannot see the palette list itself
  collapsing (verified: a two-theme directory passed the derived floor cleanly).

**Two censuses in this record that did not reproduce**, both corrected above: the a11y
"before" numbers (§4) and the read counts (§3).

**The export-path claim was right but too broad.** §"Where these actually paint" says the base
loads after the theme; that is true of `lattice-emulator.js` (`paletteCSS + layoutCSS`), the
PDF/HTML player path, and FALSE of `lib/engine/css.js`, which inlines the base at the theme's
`@import 'lattice'` position — base first, theme last. Verified by composing both: the engine
path resolves `--hljs-keyword` to `#E39B00` on `a11y-deuteranopia`. So a consumer taking
`engine.render().css` DOES get the new syntax families today; it is the emulator-driven export
that does not.

**Stale claims elsewhere in the tree**, all repaired: `design/skills/theme.md` — the canonical
"author a theme from scratch" doc — still taught `--text-muted` as "chrome only / WCAG-exempt"
and would have manufactured the retired contract into every new theme, the same argument that
justified fixing `derive.js` and `ai.js` and a third instance nobody had noticed. Plus the
exempt-tier ledger in `slide-contrast.test.js`, whose ceilings this change drove from 14/14/12
to **1/1/0** while printing the instruction to lower them; `tools/check-slide-contrast.js`,
whose exempt-ink resolver keyed on `--text-muted` and now also on `--muted-mark`; the docs-site
SSR fallback palette, which had no `--muted-mark` and a stale `--text-muted`; and four code
comments quoting the old contract's numbers.

## 8b. What a Munger inversion found (HARD RULE #25)

The inversion was asked to destroy the change and could not destroy its SHAPE — it measured
the `--text-secondary` alternative and reported that the split beats it (median separation
0.1898 vs 0.1155; the split is no worse on 33 of 36), and it declined to manufacture an
objection to the `--muted-mark` name. What it did break is the claims defending the design.

**The finding that would have shipped broken.** `lib/theme/derive.js` — the Studio's theme
factory, run on user- and model-supplied essentials — repairs `--text-muted` with a FLOOR and
no ceiling. Measured, HEAD vs `origin/main`, same inputs:

| essentials | main: ΔE(muted, body) | HEAD |
|---|---|---|
| `bg #EDEDED`, body `#5F5F5F` | 0.1479 | **0.0177** |
| `bg #FFFFFF`, body `#767676` | 0.1411 | **0.0000** — muted byte-identical to body |

That second row is three text tiers in one color, from essentials a Studio user can plausibly
pick, and **every gate was green on it** (4.95:1 clears the AA arm). It is a regression this
change introduced: before, the generator passed the author's muted through untouched.

**The proposed mechanism did not work, and that is worth recording.** The inversion suggested
switching the generator to `solveInk`. Measured, it changes nothing: on those palettes AA is
the binding constraint and both solvers converge on the same boundary value (`#646464` /
`#6f6f6f`). A "step MIN_DIST from body" variant was also tried and is worse — it makes ROOMY
palettes quieter than the author asked for. **There is no better value available**: on a
palette whose body ink is itself near the AA floor, a quieter AA tier does not exist. The
generator is reporting a bad palette, not producing a bad answer.

So the fix is the one thing that WAS missing — **making the collapse visible**.
`checkMutedTierFloors` gains a CEILING arm (`MUTED_SEPARATION_FLOOR = 0.030`) asserting
`ΔE(--text-muted, --text-body)` per palette-mode. It pins today's worst (cuoio/light, 0.0380)
as the worst the repo will tolerate, and it is bitten two ways. What it does NOT cover is the
generator, which runs in a browser on values that are never committed — stated in §9.

**Three more repairs it forced:** the fifth stale contract comment (`editor-theme.ts`, still
teaching "NOT AA / 44 of 72 / tracked separately" in the present tense, in the module most
directly downstream); the Breaking note, which said undeclared `--muted-mark` "reads heavier"
when the decoration actually DISAPPEARS (rendered and confirmed — a `checklist` `[/]` row
loses its status disc entirely, the component's own color-blind-safe channel); and ten
decoration sites in `docs/src` that stayed on the text tier, including `BAR_RULE`, both
concept-graph edge pairs and two scrollbar thumbs.

**Where it was directionally right and numerically off**, checked rather than taken: it
reported 3 palette-modes losing >40% (7), and 13 of 36 muted/secondary collisions (4 of the 15
that resolve to literals). The shape of both claims held; the magnitudes are corrected above.

## 9. What this does NOT fix

- **cuoio/light muted text is 0.038 from body text in OKLab.** Stated in §3 with the reason.
  The only thing that would recover it is re-tuning `--text-body` or `--bg` on that palette,
  which is a palette redesign and not this change.
- **Tritanopia's syntax separation is 0.1285, under `cvd-audit.js`'s 0.15.** §4, with the two
  measured alternatives and why neither ships.
- **`checkHljsSeparation` covers only the four `a11y-*` palettes.** The fourteen hued palettes
  are not measured under simulation for their syntax families; they are brand palettes that
  encode meaning in hue and would report collapses by design, which is the same reason
  `tools/cvd-audit.js` exits 0 on them.
- **`--state-color` paints TEXT on one roadmap row** (`roadmap.styles.css:356`) while
  `lib/tokens/contracts.js` sanctions it as GRAPHICAL at 3:1. Pre-existing, found while
  migrating, off this change's path — logged here rather than pulled in.
- **The base engine palette declares no `--text-muted` of its own**, so
  `--marp-slide-header-color: var(--text-muted)` in `base.tokens.css` resolves only once a
  theme is loaded. Pre-existing and off-path; recorded because the next reader of that file
  will wonder.
- **Part 3 does not reach the export path**, and cannot until #1527 flips the base/theme
  concatenation order. Measured above; stated here because a reader looking for green strings
  to disappear from a PDF will not find them.
- **The separation ceiling covers COMMITTED palettes, not `deriveTheme`'s output.** A theme a
  user fabricates in the Studio from a palette with no room can still emit `--text-muted`
  equal to `--text-body`, and nothing surfaces it: `lib/theme/contrast.js` — the meter the
  Studio actually shows — has no separation concept at all (no `oklabDistance` import). Wiring
  a separation row into that meter is the real repair and is its own change.
  **DONE — `2026-08-23-measurement-primitives-reach-the-reader.md` §2.** The meter carries
  `muted^body` AND `secondary^body` as a second row KIND; measured, `--text-secondary` has the
  same defect and `deriveTheme` collapses it harder (byte-identical to body on a near-ceiling
  essential set, where muted merely gets close).
- **`checkMutedTierFloors` cannot catch a `--muted-mark` READ that paints text.** It polices
  the token's value, not its use sites; the three the checker found were caught by reading,
  not by a gate. A use-site classifier is what `lib/tokens/contracts.js` argues against
  building, so this stays a review property.
- **`tools/cvd-audit.js` still has no achromatopsia arm.** `lib/theme/cvd.js` can now simulate
  it and `checkHljsSeparation` uses it, but wiring it through the audit's own CLI and its
  categorical/status groups is a separate pass.
  **DONE — `2026-08-23-measurement-primitives-reach-the-reader.md` §3.** The audit loops
  `SIMULATED_TYPES` with a per-condition AND per-group collapse floor (0.065 for the crowded
  groups, from this note's own 0.048/0.11 ratio; 0.11 for the three-token status trio, which is
  small enough to reach the dichromacy floor and does); `CVD_TYPES` is still the three matrices. It finds a
  status-trio collapse on 31 of 32 palettes, worst ΔE 0.003.
