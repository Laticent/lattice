---
status: shipped
summary: A five-lens review of the Studio's top toolbar — interaction, visual, accessibility, prior art, and a constraints audit — measured against the real bar at six widths × three stops × both color modes. It found one live rendering defect (the ⌘K pill wrapped to two lines and rendered 56px tall inside the 54px header at 1280 in Craft, invisible to every guard because they all measure WIDTH), one WCAG 1.4.3 AA failure (the unselected dial labels, the search placeholder and the slide-count meta all drew in `--text-muted`, which every theme documents as decorative and WCAG-exempt — 2.46–2.68:1 measured, below 4.5:1 in 21 of 36 palette×mode combos), a role that promised behavior it never implemented (`role="toolbar"` with eight tab stops and no roving focus), and an accent budget spent five times over. The owner's question — why does Share get the filled CTA and Present only an outline? — traced to StudioShell's FIRST commit, where Share simply inherited shadcn's default variant while Present was explicitly demoted; no reason was ever given anywhere, and a later decision doc then cited the accident as a premise. The owner's call: Present takes the fill, Share the outline, exactly one full-strength accent in the bar, and the dial moves inboard so the CTA is the terminal labeled action.
---

# Studio toolbar — placement, order, and where the accent goes

**Ask (2026-08-16):** the owner liked the toolbar but was uneasy about the
**order and placement** of its controls, and wanted "a scientific approach … to
ensure excellence user experience" from a UI/UX expert, a visual design expert,
"and any other expert." Mid-review they added a second, sharper question:
**"I am also bothered that share button gets a special treat rather than
present. Why does share get special treats?"**

## Method — measure first, then argue

Nothing here rests on looking at a screenshot. A throwaway probe drove real
headless Chromium over the live Studio and captured, for **6 widths × 3 stops ×
2 color modes**, both a crop of the header and the exact rect + accessible name
of every control in it. Five agents then reviewed the same artifacts from
different lenses, in parallel, and were told to argue from the numbers.

**Limitations of that probe, stated because two of them changed conclusions:**

- It did **not** wait for `document.fonts.ready`, so every measurement is one
  font state. `studio-header-fit.spec.ts` does wait, and records that the
  fallback font grows the dial 219 → 240px.
- The color-mode toggle **failed to fire at 1920** (the slim header at Read/Write
  has no mode button to click — see F1 below, which is itself a finding), so the
  1920 "light" and "dark" captures are byte-identical. 1440 and below are genuine.
- The three 390px "stops" are **one capture repeated** — the phone header has no
  dial, so the probe never switched.
- No 700px or 1024px capture, which are the two most constrained widths.

**`scrollWidth === clientWidth` is not a slack signal.** It was true in all 36
captures, including ones with 600px free; it means *no overflow*. The real free
space is the `flex-1` spacer, which is **0px at 820, 1100-Craft and 1280-Craft**.
Any pixel budget derived from the former is derived from nothing.

## The owner's question, answered

**Share's filled treatment was never a decision.** In the source, Share rendered
`<Button size="sm">` with **no `variant`** — shadcn's `defaultVariants.variant =
"default"` → `bg-primary text-primary-foreground`. Present was **explicitly**
`variant="outline"`. So Present was actively demoted and Share simply inherited
the framework default.

Provenance (the local clone is shallow, so this came from the GitHub API):
it appears in **`c9ecdae`, 2026-06-28, `StudioShell.tsx`'s first commit** —
825 additions, 0 deletions — already in its final form. Nothing preceded it; the
Drawing Board it succeeded was vanilla DOM with no filled/outline verb pair to
inherit from.

**No justification was ever given.** PR #567's body describes what Share *does*,
never its weight. The mockup-era `2026-06-21-app-redesign.md` mentions Share 14
times and never its emphasis. Then
`2026-07-03-studio-brand-mark-toolbar.md:39` — *"Share is the bar's only filled
CTA; folding both verbs leaves a toolbar with no visible actions at the payoff
moment"* — used the fact as a **premise**, as the third bullet of an argument for
a different conclusion, five days after it silently shipped. And
`2026-07-26-studio-mobile-eight-cell-bar.md:76` propagated the split to the phone
bar without re-deriving which verb deserved which tone.

**Verdict: an accreted default later treated as a decision.** Literally the
absence of a prop.

### The panel split 2–1, and the disagreement was real

| Lens | Verdict |
|---|---|
| Prior art | **Keep Share solid.** Across 17 tools the accent goes to Share/Publish in 8, to Present in 3, and 6 accent nothing. The predictor is not "presentation vs collaboration" (that hypothesis was tested and refuted) but **where the payoff is consumed**: if the artifact leaves the tool, Share gets the accent. Lattice's PDF leaves the tool. |
| Interaction | **Flip it.** Present outranks Share on frequency for every persona (author ≈1.5–3 vs 0.3–1 per session), repeats within a session where Share is once per deck *lifecycle*, and its trigger is time-pressured. Share publishes: the least reversible control should not be the most attractive target. |
| Visual | **Flip it.** Weight should track how much of the product an action commits. Present takes over the whole screen; Share opens a dialog of reversible choices. |

The dissent was narrower than it looks — prior art conceded the flip is
legitimate precedent (Prezi, Pitch) provided Present also takes the terminal
labeled slot. And the convention's *rationale* is a growth loop: Canva, Figma and
Miro accent the button that puts their product in front of a non-user. Lattice's
Share hands over a link to a rendered deck, not a seat invite, so the reason
behind the convention does not transfer even where the convention does.

**All three agreed on the rule that outranks the choice: exactly one
full-strength fill.** Zero of 17 comparables run two. Where a second tier is
genuinely needed, the answer is *tonal* (Google Slides' Slideshow), never a
second accent.

**Owner's call: Present takes the fill; Share takes the outline.**

## What shipped

### 1. The ⌘K pill stops bursting the header at 1280 (a live defect)

At 1280 in Craft the search pill rendered `Search or / run…` on two lines and
measured **56px tall inside a 54px header**, clipped, in both color modes.
1280 is Tailwind's `xl`, where the pill gains its label and ⌘K cap; it is also
where the full header is tightest (24px of slack, the title already truncated).
The pill carried no `shrink-0`, so it became the row's shock absorber.

The deck switcher is *supposed* to be the only thing that gives — it is `min-w-0`
with a truncating title, and its own comment states "every sibling is
`shrink-0`". **The pill was the sibling that never got the class.**

**Every existing guard missed it because they all measure WIDTH.**
`check:overflow` and `studio-header-fit.spec.ts` assert
`scrollWidth <= clientWidth`, and that held throughout — the row *did* fit; the
control just got taller than the bar. So the fit spec gains a **vertical oracle**
(no header control taller than the header) and now visits **1280**, a breakpoint
it already named as `XL` but stepped over, going 1100 → 1440. Verified failing
before the fix, with the defect's own message, and passing after.

### 2. Present takes the fill; Share takes the outline

Swapped in lockstep across **14 sites** — both headers, the mobile eight-cell
bar's `tone` props, and `StudioChromeSkeleton.tsx`'s four mirrors — because
`studio-shell-parity.spec.ts` compares every control's box between shell and app
within 2px, and the `outline` variant's 1px border moves each button by 2px.

### 3. The accent is spent once, not five times

Measured on the rendered bar, the accent hue appeared in **five** places: Share's
fill (84% of accent ink), the lit dial segment, the "Show me" tours glyph, the
deck dot — which the code itself labels *"DESKTOP-ONLY decoration"* — and the
brand mark. Accent is a pointer, and pre-attentive pop-out is an O(1) advantage
**only for a singleton**; with five draws the search degrades to serial and the
intended CTA loses most of its advantage.

- **Tours glyph** → `--text-body` with a hover tint. It was the only saturated
  icon in the run (a 1.44:1 luminance step plus a large chroma step off its
  neighbors) with the **largest clear space of any control**, for a
  ~0.05×/session detour this repo already judged cheap enough to bury one tap
  deeper on tablet (#1401). Maximum salience, minimum importance.
- **Deck dot** → `--text-muted`. `--primary` *is* `--accent`, so a self-declared
  decoration was drawing in the bar's scarcest signal color.
- **Dial's lit segment** → `--accent-soft` fill + `--text-heading` label,
  replacing a `bg-card` fill measured at **1.09:1** against the ground with the
  accent hue carrying the state. That failed twice: the fill was at the edge of
  perceptibility, and in the **13 combos where `--accent` resolves to
  `--text-heading`** the lit label was the same ink as an unlit one.

### 4. The CTA is the terminal labeled action — the dial moves inboard

The strongest derived convention across the comparable set: **the accent CTA is
the last *labeled* action; only icon-only utilities and the avatar sit outboard
of it.** Lattice violated it — a three-segment *labeled* mode dial and a feedback
icon sat to the right of the fill, so the eye's terminal fixation landed on
**Craft**, not on what the bar exists to do.

The dial now sits **before** the verbs, in **both** headers and all three
skeleton tails. Present-before-Share is kept: that split is genuinely unsettled
across tools (6 put Present left, 4–5 right), and it is the reading this bar
already had.

**This is the smallest edit that closes the violation.** A fuller
"CTA-terminal" reshuffle (Share, then Present, at the far right) was evaluated
and **rejected**: it would move the entire pinned tail for no motor gain, and it
would put the time-pressured verb at the maximum-distance edge while moving the
rarest control inward.

*Honest scope note:* Share remains labeled and outboard of Present, so the
convention is satisfied in spirit — no *mode* control steals terminal fixation —
rather than to the letter. The verbs read as one terminal pair with the fill
inside it.

### 5. WCAG 1.4.3 AA — three labels were drawing in the decorative channel

`text-muted-foreground` → `--text-muted`, which every theme documents as
*"decorative / de-emphasized — chrome, empty/skipped marks, glyphs;
WCAG-exempt"* (`themes/cuoio.css:108`). It was carrying load-bearing labels:

| Element | Before | After |
|---|---|---|
| Unselected dial labels (12px semibold) | **2.68:1** | **6.04:1** |
| ⌘K placeholder | **2.46:1** | **5.55:1** |
| Slide-count meta (11px) | **2.64:1** | *(moved to `--text-body`)* |

Sampled from rendered pixels, cuoio light, before and after. Not a cuoio quirk —
`--text-muted` is below 4.5:1 in **21 of 36** palette×mode combinations. This
also silently undid #1401, which spent 87px of header width precisely so those
two words would be legible on touch: a low-vision user saw one legible chip and
two ghosts.

### 6. A role that promised behavior it never implemented

The phone's deck-actions bar declared `role="toolbar"` — a **promise of
behavior**, obliging one tab stop plus arrow-key roving focus. Measured at 390px:
eight buttons, zero `tabindex` management, no `onKeyDown`. AT announced "Deck
actions, toolbar" and the user's model was then wrong in both directions.

It is now a real `<fieldset aria-label="Deck actions">` — the element carrying
the role rather than an attribute bolted onto a div, which is what
`lint/a11y/useSemanticElements` asks for and the idiom `PostureDial` already
uses. The dial's sr-only legend also moves from **"Workspace density"** — the one
place AT was told what the control *is*, saying something no other surface says —
to **"Workspace stop"**, the product's own vocabulary.

## Deliberately NOT done (and why)

- **Implementing the real toolbar pattern** (roving tabindex + arrows, taking
  eight tab stops to one). The better end state, but a keyboard-behavior change
  that needs its own spec updates. A half-built toolbar is what this removed.
- **Converting the dial to `radiogroup`/`radio`.** It is an exclusive 3-way
  choice exposed as three independent `aria-pressed` toggles, so a screen-reader
  user hears "not pressed" three times with nothing conveying exclusivity or
  "2 of 3". APG's Radio Group is the right pattern and would collapse three tab
  stops to one — but it changes Space/Enter to arrow selection. Own change.
- **Touch target sizes.** Dial segments are 27px tall and abut with a 0px gap at
  820 — a touch tier — and six 32×32 ghost buttons run at 38px centre-to-centre.
  This **passes** SC 2.5.8 (AA, 24px) and fails 2.5.5 (AAA, 44px) and the repo's
  own `min-h-11` floor, which `BarIcon` already honors. The header's `icon-sm`
  never got it. Cheap and free of layout cost (there is 13.5px of unused padding
  above and below each segment); still, a separate change.
- **Capping the header at ~1440px** to close the 624–930px void on ultrawide.
  Argued both ways by two lenses: it would freeze the composition at its
  best-composed width, but it would also break the identical right-gaps the bar
  currently holds across 1100/1280/1440/1920. Left alone.
- **The `hasFinePointer()` gap.** Every label-collapse here is gated on WIDTH, so
  a 1180px iPad Air gets the *desktop* header with five bare glyphs whose only
  labels are Radix tooltips — and Radix returns early on `pointerType === 'touch'`.
  The helper already exists and is used elsewhere. Real, and off-path for a
  placement pass.
- **The light/dark toggle missing from the desktop slim header.** Reachable only
  by stepping to Craft, which *persists* the posture. Filed; it is an availability
  bug, not a placement one.

## Contradictions found in the docs, worth correcting

- **The dial is not actually protected by the tail-x test.** Three places —
  `StudioShell.tsx`, and `CHANGELOG.md:2843` — claim Present/Share/**dial**/feedback
  hold their x across stops. `studio-header-fit.spec.ts:109`'s `TAIL` list omits
  the dial. It holds empirically; nothing would fail if it stopped.
- **`2026-06-30-studio-topbar-ia.md:96` is stale and unmarked.** Its desktop row
  still lists Architect/Inspector/Library/Workspace/avatar in the header; none has
  been there since the activity bar landed 2026-07-06.
- **`2026-07-03-studio-brand-mark-toolbar.md:39`** should carry a dated
  correction: its conclusion (keep both verbs on the bar) survives; its stated
  reason does not.
- **A latent landmine:** the two headers give Present/Share different padding
  classes (`px-2` vs `px-2 lg:px-3`) that are currently **inert**, because
  shadcn's `has-[>svg]:px-2.5` outranks both. Remove the icon from either button
  and the headers silently diverge, breaking the tail invariant.

## Round two — the owner's ordering, and the rule that makes it legible

After seeing the first cut, the owner proposed a different order —
**logo · deck · dial · … ** — and separately asked to keep a divider. Both
shipped. The reasoning, and the two things it cost:

**Why the order.** It reads as **descending scope**: which app, which deck, which
view of that deck, and only then utilities and actions. Nothing in the original
five-lens review proposed it — all three lenses that ruled put the dial in the
right cluster — but the constraints audit had already found that the dial's old
position *"sits after Present/Share rather than before. No doc says why,"* i.e.
it was accreted, not decided. Prior art also corrected the brief's premise:
*"the reliable constraint is inboard-of-CTA, not left,"* and **Figma Slides puts
its slides/design mode toggle on the left of the toolbar** — so the head of the
row is precedented, not novel.

**Why the rule earns its place, measured.** Ordering alone changed nothing
compositionally — max gap 144 → 143px, identical ink, identical island count. It
is the **divider** that does the work: with it the row's largest gap drops to
**130px**, because the left group gains a real terminal edge instead of letting
the dial float against open space. Without it the dial reads as a stray third
object; with it, `logo │ deck │ dial` reads as three deliberate bands.

**And the rule had to get heavier to be worth having.** The visual lens measured
`--border` against the bar ground at **1.32:1** (light) / 1.42:1 (dark) and
recommended deleting all three separators, on the grounds that a hairline that
faint cannot carry banding. The owner's call went the other way — keep the
device, make it readable. `--text-muted` measures **2.64:1**: visible at a
glance, still short of `--text-body` (5.95:1), which at 1px reads as a border
around a region rather than a seam between bands. Weight lives in one exported
constant, `BAR_RULE`, because the app header and the pre-paint skeleton both draw
it and the parity spec compares their boxes.

### The two costs, both real, both accepted knowingly

**1. The dial no longer holds a fixed x** — measured **171px** of travel across
the three stops at 1440. It now sits behind a content-sized, truncating deck
pill, so its position moves with the deck's *name* and with the stop (Read
renders a plain label, Write a switcher). This is the cheapest stability in the
row to spend: the 2026-07-03 review found the mode control is *"the least-used
control on the bar."* Present, Share and feedback keep their pinned x — the
#1371 invariant survives because it is about the **trailing run**, and everything
the full header carries that the slim one doesn't still sits left of those three,
absorbed by the flex spacer.

**2. The rule is DESKTOP-ONLY, and that is a budget fact.** A rule costs 7px here
(1px + one 6px gap). `studio-header-fit.spec.ts` measures ~19px of spare at the
700px floor against a ratcheted floor of 16 — about **3px to spend**. Shipped at
`!mobile` it took that floor to **9px** and turned the guard red, which is the
guard working exactly as its own comment promised (*"the answer is to free width
in the row, NOT to lower this number"*). Below desktop the row already does
without the other two rules and reads as a wider phone header (#1408), so the
band closes on proximity there instead. **The tablet needed no change at all** —
it already ordered the row logo · deck · dial · verbs, which is precisely why the
owner liked the tablet rendition and asked desktop to match it.

### Two failures this caused, and what they taught

**A missing rule in the skeleton.** Removing the dial from the SSR craft tail
also removed the rule that preceded it — but in the app that rule stayed, now
reading as "utilities end, actions begin". The shell rendered **3** rules where
the app rendered **4**, shifting every control after it. Caught by
`studio-shell-parity`, fixed by restoring the rule. The lesson is the one the
skeleton's own header comment already states: it mirrors control-for-control, and
an omission fails rather than ships.

**A 3px drift that only exists in production.** With the dial downstream of the
deck pill, `studio-shell-parity` failed on the dial's `left` by 3px at 1440 — in
a **preview build only**; a dev build measures **0.19px**. The cause is the seam
`PILL_TOL` already exists for and the spec already names: *"the deck pill reserves
a slot for a per-deck slide count the shell must not draw, so a few px there is
structural."* The dial now inherits that variance positionally, so `PILL_TOL`
extends to its `left` — and **only** its `left`. Its width and height stay at
`TOL`, because the dial's own size owes nothing to the pill and a real size
divergence must still fail. This is inheritance of a conceded drift, not a
widened guard; anything placed downstream of that pill in future inherits it too,
which is worth knowing before putting anything else there.

## The prior-art survey the reorder rests on

Recorded here because two load-bearing claims in the source comments cite it, and
a claim nobody can check is not evidence. Emphasis is the hardest thing to verify
from vendor docs (no help page says "the Share button is filled"), so **[V]** =
verified against a cited URL, **[R]** = recalled from direct familiarity.

| Tool | Accent CTA | Present vs Share | Filled buttons in bar |
|---|---|---|---|
| Google Slides | Share [V placement] | Present left [V] | 2, **tiered** — Slideshow tonal, Share full [R] |
| PowerPoint web | Share [V] | Present not in the bar [V] | 1 [R] |
| Keynote | — | Play left [V] | **0** [R] |
| Canva | Share [V] | Present left [V] | 1 [V-ish] |
| Pitch | Play [R] | Present right [V both top-right] | 1 [R] |
| Figma / FigJam | Share [R] | Present right, **icon-only** [R] | 1 [R] |
| Figma Slides | Share [R] | Present right [V] | 1 [R] |
| Notion | — | n/a | **0** — Publish is inside the popover [R] |
| Linear | — | n/a | **0** [R] |
| Miro | Share [R] | Present left, icon [R] | 1 [R] |
| Gamma | Share [R] | Present left [R] | 1 [R] |
| Beautiful.ai | Present [R] | Present left [R] | 1 [R] |
| Prezi | **Present** [V "this blue button"] | Present right [R] | 1 [V] |
| Deckset | — | n/a | **0** [R] |
| VS Code / Obsidian | — | n/a | **0** [R] |

**Derived, and these are the two the code cites:**

1. **Exactly one full-strength accent, or zero.** 9 tools run one, 6 run zero,
   **0 run two**. Google Slides is the only two-button case and it explicitly
   tiers them (tonal + full) — which is the precedent for a future "Present
   filled, Share tonal" if the outline ever reads too quiet.
2. **The accent CTA is the last labeled action**; only icon-only utilities and
   the avatar sit outboard of it (~13/15 of the tools that have a CTA).

**Not a rule:** Present left-vs-right of Share is genuinely split 6 vs 5. That is
why this change kept the existing Present-before-Share reading.

## Post-review corrections (the checker caught a regression I introduced)

An independent checker ran over the diff and found a **self-inflicted regression**
that the first cut shipped. Recorded rather than quietly patched, because the
*reasoning* error is the reusable lesson.

**The dial's lit chip was invisible in 8 of 36 palette×mode combos.** The first
cut used `--accent-soft` as the fill, justified in the source comment as
*"`--accent-soft` is distinct from `--accent` in ALL 36 combos."* That statement
is **true and irrelevant** — a chip has to be distinct from **the surface it sits
on**, not from `--accent`. The dial's container is `bg-background` = `--bg`, and
`--accent-soft` is byte-identical to `--bg` in ardesia, atelier, brina, burgundy,
crepuscolo, laguna, magnolia and mustard **dark**. Fill-vs-container went
**1.16–1.34:1 → 1.00:1** in those eight: no chip at all. Eleven combos were
strictly worse than before the change. The check that was run could not have
caught it, because the 8 broken combos are disjoint from the 13
`--accent === --text-heading` combos the comment reasons about.

**Fixed by construction, not by another lookup.** The fill is now mixed from
`--text-heading` into `--bg` — the theme's primary text pair, high-contrast in
every palette *by definition*, so any mix of the two necessarily differs from the
container. And the state is deliberately **over-determined** — fill, a
heading-colored label against body-colored neighbors, a solid accent hairline
(dashed on the transient arm, which is what still separates "saved home" from
"showing now"), and the shadow — so no single channel collapsing in some palette
nobody looked at can make the lit stop unreadable. Measured across all 36: fill
vs container **≥ 1.25**, label vs fill **≥ 7.67**, ring vs fill **≥ 1.65**; and
verified live in real Chromium across 20 palette×mode combos, including all 8
that were broken.

**The deck dot was also over-corrected.** `--text-muted` took it from 5.96:1 to
**2.64:1 in cuoio, the site's default palette** — trading a false pointer for a
dot nobody can see. It is `--text-body` now: legible, and still not accent.

**A keyboard behavior change that the first write-up did not name.** `deck-nav.ts`
yields the arrow keys only to elements matching an **explicit** `[role="…"]`
selector. `<fieldset>`'s `group` role is *implicit*, so removing `role="toolbar"`
means arrow keys — and the `+`/`-`/`0` zoom keys — now act on the deck from inside
the eight-cell bar, where they were previously inert. Measured: focus "Toggle
Coach" at 390px, press →, deck goes 1/7 → 2/7. This is arguably correct under the
shell's own contract ("arrows turn the deck from anywhere that isn't a typing
target") and it is kept — but it is a real change on a surface that had none, so
it is in the changelog rather than buried in "removed an unimplemented promise."

**Numbers reconciled.** The contrast figures quoted for `--text-body` come from
two methods: **5.95:1** is token-derived (cuoio light `#6B5D4F` on `--bg`) and is
the authoritative figure; **6.04:1** was sampled from rendered pixels, where
antialiasing shifts the darkest sampled ink. Both describe the same fix; the
token figure is the one to cite.

## Logged, not fixed here (pre-existing, off-path — HARD RULE #18)

- **`ComposeView.tsx:398` and `:989` declare `role="toolbar"`** with no
  `tabIndex` or `onKeyDown` anywhere in the file — exactly the 4.1.2 role-misuse
  this change removed from the deck-actions bar, still live two files away.
- **The three committed `@visual` Studio baselines are badly stale** — the
  expected `studio-desktop-linux.png` shows a header with *no posture dial at
  all* and a deck titled "Welcome to Latti…", and the diff covers the editor
  gutter and preview slide, which this change never touches. They were **not**
  re-blessed here: doing so would silently bake in months of unrelated drift.
  `@visual` is not in CI (`test:e2e:smoke` is `--grep @smoke`), which is why it
  rotted unnoticed. Needs its own change.
- **On the phone bar, the active cell and the filled CTA are byte-identical in
  the 13 combos where `--accent === --text-heading`.** The mechanism is
  pre-existing and the `--bg` bottom rule still tells them apart. What the swap
  changes is *which words* collide: "Preview" and "Share" before, "Preview" and
  "**Present**" now — two identical cells labeled with near-homographs. A
  scannability cost worth naming.
- **Two rotation tests in `studio-instant-shell.spec.ts` are FLAKY on `main`** —
  `:443` "rotating a phone into landscape leaves no chrome behind" and `:527`
  "a rect from another orientation is not replayed in portrait". Measured on a
  clean `origin/main` checkout with a fresh preview build: **2 of 3 runs fail**,
  and the same two tests fail on this branch at the same rate. Both are
  orientation/timing cases gated on `ENGINE_HOLD_MS`, and neither touches the
  header. They live in the NIGHTLY tier and carry no `@smoke` tag, so the
  per-PR `studio-smoke` job never runs them — the #780 shape again, now as
  flake rather than drift.

  **Method note, because the first attempt got this exactly backwards.** An
  initial comparison showed base passing 3/3 and this branch failing 2/3, which
  read as a self-inflicted regression. It was an artifact: `playwright.config.ts`
  sets `reuseExistingServer: !isCI`, so checking out `main` and re-running
  WITHOUT killing the preview server on :4321 silently re-tested the branch's
  build under the base checkout. Kill the server between checkouts or the
  comparison is meaningless — the whole conclusion inverted once it was killed.

## Verification (HARD RULE #23)

Real headless Chromium against the running Studio, plus the repo's own gates:

- `studio-header-fit.spec.ts` — passes, now including 1280 and the vertical
  oracle. **Verified able to fail:** reverting only the pill fix reproduces
  `Search or run a command 56px` at 1280 on Craft.
- `studio-shell-parity.spec.ts` + `studio-instant-shell.spec.ts` — 43 passing,
  so the app and the SSR skeleton agree on every control's box after the reorder
  and the emphasis swap.
- `StudioShell.test.tsx` — 92 passing.
- Tail-x invariant re-measured after the reorder: dial / Present / Share /
  feedback at x = 1450 / 1680 / 1781 / 1874, **identical at Read, Write and
  Craft** at 1920.
- Contrast sampled from rendered pixels before and after (table above).
- `npm run lint` and the docs typecheck clean.

**UNVERIFIED:** real touch on a physical tablet, and iOS Safari — neither is
reachable from this sandbox. Every touch claim here is geometry, not a tap.
