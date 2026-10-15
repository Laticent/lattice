---
kind: plugin
name: Math
order: 1
promise: Write TeX in a slide; get a sharp equation in the deck's colors.
intro: Type `$\pi r^2$` in a sentence, or a `$$…$$` block on its own line, and Lattice typesets it with KaTeX the moment the deck renders. The PDF, the HTML export and the Studio all draw the same equation, in the slide's text color — and "$400M" in a revenue bullet stays plain text.
mark: /plugin-math-mark.svg
useWhen: Your slides carry formulas — a model, a proof, a rate — and a screenshot of an equation won't do.
syntax: '$\pi r^2$  ·  $$ E = mc^2 $$'
facts:
  - { k: You write, v: '$…$, $$…$$ or a ```math fence' }
  - { k: Draws with, v: 'KaTeX 0.16 (MIT), bundled' }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: By default }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/math/math.docs.md
    note: Every rule for where a $ opens and closes, the options, and how errors show.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/math/math.fixtures.md
    note: Exactly what each input renders to — the tests every surface passes.
  - label: The math slide
    href: /components/math/math/
    note: The slide layout built around an equation, with all its variants.
  - label: KaTeX's supported functions
    href: https://katex.org/docs/supported.html
    note: The TeX commands you can use.
examples:
  - key: inline
    label: In a sentence
    caption: Single dollars set math inline. The dollar amount stays text.
    sample: |
      ## Inline math reads like prose.

      The area of a circle is $\pi r^2$, and its circumference is $2\pi r$.

      Revenue hit $400M, up 28% — that dollar sign stays text.
  - key: slide
    label: On a math slide
    caption: The math slide frames one equation and explains its terms.
    sample: |
      <!-- _class: math -->

      ## The scoring model fits on one line.

      $$
      \hat\beta = (X^\top X)^{-1} X^\top y
      $$

      - $\hat\beta$ — the signal-weight vector
      - $X$ — the design matrix, $n \times p$
      - $y$ — the observed outcomes, length $n$
  - key: fence
    label: GitHub's spelling
    caption: A ```math fence is the same as $$…$$, so math from a README pastes in unchanged.
    sample: |
      ## Paste it from GitHub unchanged.

      ```math
      \sigma(x) = \frac{1}{1 + e^{-x}}
      ```
  - key: matrix
    label: A matrix
    caption: Environments like pmatrix work, and a lone = line stays math.
    sample: |
      ## A matrix, factored.

      $$
      \begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix}
      =
      \begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
      \begin{pmatrix} 2 & 1 \\ 0 & 1 \end{pmatrix}
      $$
  - key: typo
    label: A typo
    caption: A broken formula shows its source in the theme's warning color. The rest of the deck still renders.
    sample: |
      ## A typo quotes itself; the deck survives.

      Broken: $\frac{1}{$ — and fine: $x^2$.
---

## The problem

Equations in most slide tools are pictures: pasted from another app, blurry in the PDF, the wrong color on a dark slide, and impossible to edit without going back to wherever they came from.

A quant presenting a scoring model wants `\hat\beta = (X^\top X)^{-1} X^\top y` set properly, in the deck's own colors, and editable in the same text as the bullets beside it. A teacher wants the same for a quadratic. Both want a currency figure in the next bullet left alone.

## The idea

You write TeX, the notation mathematicians, scientists and engineers already use, and Lattice draws it.

- **Single dollars for inline math.** `$\pi r^2$` sits inside a sentence.
- **Double dollars for display math.** A `$$ … $$` block gets its own centered line. A ` ```math ` fence means the same thing — it's the spelling GitHub and GitLab use, so math from a README or a notebook pastes in unchanged.
- **Money stays money.** An opening `$` can't be followed by a space, and a closing `$` can't come after a space or right before a digit. So "Revenue hit $400M, ahead by $18M" stays plain text, and `\$5` is always a literal dollar.
- **It draws as the deck renders.** There's no waiting for a browser script: every surface — the PDF, the HTML export, the Studio, the Playground — typesets the same equation from the same call.
- **The color is the slide's.** Equations take the slide's text color, so they recolor with the theme, light or dark.

## How to use it

Math is on in every deck, so you can write it straight away. Inline:

```markdown
The area of a circle is $\pi r^2$.
```

On its own line:

```markdown
$$
E = mc^2
$$
```

To make an equation the subject of a slide, use the `math` slide, which frames the equation and explains its terms:

```markdown
<!-- _class: math -->

## The energy-mass equivalence.

$$
E = mc^2
$$

- `E` — energy (joules)
- `m` — mass (kilograms)
- `c` — the speed of light (m/s)
```

The `math` slide also has variants for a derivation, a theorem, two equations compared, a matrix, and an equation beside its plot (with the [Function plots](/plugins/function-plot/learn/) plugin).

If you get a formula wrong, you'll see it: KaTeX shows the source in the theme's warning color, and the rest of the deck renders normally.

## Where else it fits

TeX is the shared language of math, physics, machine learning, statistics and finance. KaTeX, the library this plugin uses, is a fast TeX renderer used across documentation sites and note-taking tools. So the plugin suits anything that explains with formulas: research talks, lectures, model reviews, pricing logic, engineering design reviews.

## How Lattice uses it

The `math` slide is designed around this plugin and loads it automatically. The syntax itself works on any slide: `$$…$$` on an ordinary slide typesets exactly as it does on a `math` slide. HTML exports carry the KaTeX stylesheet and fonts inside the file, so a copy opened on another machine still typesets — and a deck with no math carries none of it.

## What it doesn't do

- **No `\(…\)` or `\[…\]` delimiters.** Use `$…$` and `$$…$$`.
- **KaTeX's TeX, not all of LaTeX.** You can't load arbitrary LaTeX packages; KaTeX's list of supported functions is linked below.
- **A typo ships visibly.** A broken formula never breaks the deck, which also means you need to look before you present.
- **PowerPoint gets a picture.** The PowerPoint export is an image per slide, so equations come through as pixels.
