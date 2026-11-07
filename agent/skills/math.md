---
name: math
description: "Use when a slide carries math: inline $x$ or a display equation, the math layout and its variants, legends for symbols, and when prose beats an equation."
kind: operate
studio: true
---

# Skill — Put math on a slide

> Typeset an equation so the room reads what it establishes, with every symbol
> defined on the slide and nothing set in ASCII.

**Read this when** a deck needs a formula, an estimate with its uncertainty, a
derivation, a theorem or a matrix, or when an author pastes `beta_hat = (X'X)^-1 X'y`
and wants it to look right. **You'll produce** either a `math` slide built around one
equation, or ordinary prose with inline `$…$` math.

---

## The 10/10 bar

- **The heading says what the math establishes**, as a sentence: *"One regression sets
  the renewal price for every account."* Not *"Pricing model"*, and never the
  equation restated in words.
- **One hero equation per slide.** Two competing forms go side by side (`math compare`);
  a chain of steps is a `math derivation`.
- **Every non-trivial symbol is defined on the slide**, in a legend that leads with the
  symbol exactly as it appears in the equation.
- **Real math markup, never ASCII.** `$\hat\beta$`, not `beta_hat`.
- **The audience can follow it.** For a board, the equation is support for a plain
  sentence. For researchers, it can be the argument.
- **It renders.** A TeX error shows as an inline error block, not a crash, so you only
  catch it by looking.

Mediocre looks like: a slide of three stacked display equations, undefined Greek
letters, `x^2` typed as text, and a heading that reads "The formula".

---

## Mental model

Math is two separate things that share a dollar sign:

1. **The `math` plugin** (`lib/plugins/math/`) adds `$…$` (inline) and `$$…$$` (display)
   to **every** slide. KaTeX draws both at parse time, the same call on every surface,
   so the CLI's PDF, the HTML player, the Studio and the Playground agree. In Node,
   KaTeX runs inside a sandbox (QuickJS compiled to WebAssembly, in
   `lib/plugins/host-katex-wall.js`) with no file system or network.
2. **The `math` slide class** (`lib/components/math/math/`) is a layout built around
   that plugin. Its variants arrange an equation with what each audience expects next
   to it: a legend, the steps, a theorem card, a plot, an estimate with its interval.

So a `$$…$$` on a plain `content` slide typesets exactly as it does on a `math` slide.
Pick the `math` layout when **the equation is the slide**; keep prose with inline math
when the equation supports a sentence.

### Inline or display

| You write | You get | Use it for |
|---|---|---|
| `$\pi r^2$` inside a sentence | inline math, scaled to the prose around it | a symbol or a short term in a sentence |
| a paragraph that is exactly `$$…$$` | a centered display equation | the hero equation |
| a ` ```math ` fence | the same display equation | math pasted from GitHub or GitLab |

**Currency is safe.** An opening `$` must not be followed by a space, and a closing `$`
must not follow a space or precede a digit, so `$400M, up 28%, ahead by $18M` stays text.

**Not supported:** `\(…\)` and `\[…\]`. Convert them to `$…$` and `$$…$$`. The TeX you
can use is KaTeX's (<https://katex.org/docs/supported.html>).

### Which variant

| The slide is | Class | What it adds |
|---|---|---|
| One closed form with its symbols | `math` (or `math feature`) | hero equation plus a "where:" legend |
| A point estimate with uncertainty | `math stats` | estimate, interval and n, then a plain reading |
| A chain of two to four steps | `math derivation` | a two-column table: step and justification |
| Definition, theorem, proof | `math theorem` | stacked cards from `>` blockquotes |
| Two or three formulations | `math compare` | one `###` column each |
| An equation and its shape | `math canvas` | the equation beside a `functionplot` graph |
| A matrix and its properties | `math matrix` | matrix plus a shape/rank legend |
| A factorization | `math matrix decompose` | a product of matrices, each term named |

---

## Where it lives

- **Layout:** `lib/components/math/math/math.docs.md` — slots, variant rule, mistakes.
- **Plugin:** `lib/plugins/math/math.docs.md` — syntax, failure behavior, styling.
  The grammar is `lib/plugins/math/math.syntax.mjs`; KaTeX is vendored in
  `lib/plugins/math/vendor/`.
- **Live examples:** `test/integration/baseline-decks/gallery.md` (search
  `_class: math`), `lib/components/math/math/math.gallery.md`, and the demo decks
  `examples/math-bare-equation.md`, `examples/math-split-structure.md`,
  `examples/math-form-frame.md`.
- **Commands:** `npm run new:slide -- math`; `npm run lint:deck -- deck.md`;
  `npx lattice deck.md deck.pdf`.

---

## Recipe

1. **Decide whether the audience needs the equation.** For a board, a sentence and a
   number often carry it better ("each claim adds about $41 to the renewal" is a
   `big-number` or a `math stats` slide, not a derivation). Keep the full form for an
   audience that will check it.
2. **Write the heading** as the claim the equation supports.
3. **Pick the variant** from the table above. Open
   `lib/components/math/math/math.docs.md` and grep a live example (HARD RULE #6).
4. **Write the equation in TeX**, one display block. Long expressions are fine: on a
   non-16:9 deck the plugin reflows a display equation at safe break points
   (`lib/plugins/math/shared/tex-linebreak.js`).
5. **Write the legend.** One bullet per symbol, leading with the symbol in `$…$`
   exactly as the equation shows it, then an em dash and a plain definition.
6. **Count against the venue.** The `math` layout holds about 7 legend lines at
   `laptop`, 6 at `huddle`, 3 at `conference` and 2 at `hall`. Past that,
   `lint:deck` warns `capacity-scale` and the slide clips.
7. **Lint, render, look.** A TeX error renders the source in the theme's warning color
   on a tinted box. Find it by looking at every math slide.

---

## The contract / skeleton

**Hero equation with a legend** (the default `math` layout):

```markdown
<!-- _class: math -->

`Renewal pricing · OLS`

## One regression sets the renewal price for every account.

$$ \hat{p} = \beta_0 + \beta_1 \, \text{claims} + \beta_2 \, \text{tenure} $$

- $\hat{p}$ — the renewal price the model proposes
- $\beta_0$ — the base price for a new account
- $\beta_1$ — what each claim in the last year adds
- $\beta_2$ — what each year as a customer takes off
```

**An estimate with its uncertainty:**

```markdown
<!-- _class: math stats -->

`Claims effect · 2,418 accounts`

## Each claim adds about forty dollars to the renewal.

$$ \hat\beta_1 = 41.2 \pm 3.8 $$

> 95% interval: $[33.6,\; 48.8]$
> $n = 2{,}418$

The effect is large and stable across regions, so the committee can price on it with confidence.
```

**Inline math in prose** (no `math` layout needed):

```markdown
<!-- _class: content -->

`Why the model stays linear`

## A straight line is the price we can explain to a customer.

- The model adds one term per factor, so $\beta_1$ reads as dollars per claim.
- A tree model fit the data 2% better and could not say why a price rose.
- The pricing team reviews the coefficients every quarter.
```

**Slots on `math`:** an optional eyebrow (a backticked paragraph directly above the
heading), the `## ` heading (required), the equation (`$$…$$` or a ` ```math ` fence,
required) and the legend (`- $x$ — definition`, optional). With no legend, the
equation takes the whole stage, centered; `align-*` modifiers move it.

**Styling is the theme's.** Math takes its color from the slide (`section.math` sets
`var(--text-heading)`) and inline math inherits from the text around it, so it follows
light, dark and print. KaTeX math also grows with `venue:` and `scale-*`. Never color
an equation by hand: `\color{red}` sets a fixed color that ignores the palette.

---

## What good looks like

- A heading that a non-specialist can repeat after the slide is gone.
- One display equation; every symbol in it appears once in the legend.
- Legend lines that lead with the rendered symbol and define it in plain words.
- An estimate shown with its interval and n, then one sentence on what it means.
- Inline `$x$` in a content slide when the math supports a sentence rather than
  carrying the slide.

## What bad looks like

- `beta_hat = (X'X)^-1 X'y` as text. Fix: `$$ \hat\beta = (X^\top X)^{-1} X^\top y $$`.
- Two display equations in the base layout. Fix: `math compare` or `math derivation`.
- A legend that says "beta hat — the coefficient". Fix: lead with `$\hat\beta$`.
- Three symbols nobody defined. Fix: add them to the legend, or simplify.
- `## The OLS estimator` over the equation. Fix: say what it establishes.
- A five-step derivation for a board. Fix: the result in a `math stats` slide, the
  steps in an appendix or the speaker notes.

---

## Ship checklist

- [ ] The heading is one complete sentence stating what the math establishes.
- [ ] One hero equation per slide; competing forms use `compare`, chains `derivation`.
- [ ] Every non-trivial symbol has a legend line leading with the symbol in `$…$`.
- [ ] No ASCII math, no `\(…\)` or `\[…\]`, no `\color`.
- [ ] Prose `$` amounts stay text (no space after an opening `$` in real math).
- [ ] Legend length fits the deck's `venue:`; no `capacity-scale` warning.
- [ ] `npm run lint:deck -- deck.md` reports no errors or warnings.
- [ ] Rendered and every math slide looked at: no TeX error boxes (TeX source in
      the warning color on a tinted box).

---

## Common mistakes

1. **Plain-text eyebrow.** The eyebrow must be a backticked paragraph directly before
   the `## `; plain or bold text renders as a stray paragraph.
2. **Legend items that lead with words** instead of the rendered symbol, which breaks
   the visual match with the equation.
3. **Assuming a math slide stays whole on a portrait, story or mobile deck.** It
   splits on its structure: a legend becomes one page per symbol with the equation
   repeated, a `theorem` one card per page. Write each legend line and step so it
   reads on its own. 16:9 never splits.
4. **LaTeX delimiters from a paper.** `\[…\]` stays text. Use `$$…$$`.
5. **A math slide for one inline symbol.** Use `content` with `$x$` in the sentence.
6. **Trusting the build.** A malformed formula never aborts the deck; it renders an
   error block in place. Look at the slide.

---

## Canonical sources

- `lib/components/math/math/math.docs.md` — the `math` layout: slots, every variant,
  the split behavior on non-16:9 decks.
- `lib/plugins/math/math.docs.md` — the `$` syntax, KaTeX, failure behavior, styling.
- `engineering/typography.md` §7 — KaTeX math rides the global font scale.
- `engineering/science.md` — the display-equation reflow (`tex-linebreak.js`).
- `design/editorial.md` — headings are complete sentences.
- `design/skills/deck.md` — where a math slide sits in the deck's arc.
