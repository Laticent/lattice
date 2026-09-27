# math — conformance fixtures

The plugin harness (`test/unit/plugins/conformance.test.js`) runs every case below. Each `##`
heading is one case: the ` ```markdown ` fence is the input, rendered by the engine, and each
bullet is an assertion about that render:

- `renders` — the HTML contains the quoted text
- `omits` — the HTML does not contain it
- `detect true` / `detect false` — what `detect(source)` must answer

On every case the harness also checks that `detect` finds whatever the parser turned into this
plugin's tokens — it may find more, never less — and that the render does not throw.

## inline math typesets

```markdown
The area is $\pi r^2$ for a circle.
```

- renders `class="katex"`
- renders `<annotation encoding="application/x-tex">\pi r^2</annotation>`
- detect true

## display math is a centered block

```markdown
$$
E = mc^2
$$
```

- renders `class="katex-display"`
- detect true

## currency prose stays text

```markdown
Revenue hit $400M, up 28% YoY, ahead by $18M.
```

- omits `class="katex"`
- renders `$400M`

## a matrix body is opaque — the lone `=` is TeX, not a heading

```markdown
$$
\begin{pmatrix} 2 & 1 \\ 4 & 3 \end{pmatrix}
=
\begin{pmatrix} 1 & 0 \\ 2 & 1 \end{pmatrix}
$$
```

- renders `class="katex-display"`
- omits `<h1`
- detect true

## an escaped dollar is not an opener

```markdown
It costs \$5 and \$6.
```

- omits `class="katex"`

## malformed TeX degrades inside the formula, never the deck

```markdown
Broken: $\frac{1}{$ and fine: $x^2$.
```

- renders `katex-error`
- renders `<annotation encoding="application/x-tex">x^2</annotation>`
- detect true

## an unclosed display block stays prose

```markdown
$$
x^2 with no closer
```

- omits `class="katex-display"`
- detect true

## a math fence is a display equation

```markdown
~~~math
\sigma(x) = \frac{1}{1 + e^{-x}}
~~~
```

- renders `class="katex-display"`
- renders `<annotation encoding="application/x-tex">\sigma(x) = \frac{1}{1 + e^{-x}}</annotation>`
- detect true
