# How to write a Lattice deck

> Read this first. It is the whole authoring contract in one file.

## The file

A deck is one Markdown file. It opens with front matter, then slides separated by a
line containing only `---`, and every slide opens with `<!-- _class: NAME -->`.

```
---
marp: true
theme: cuoio
paginate: true
---
```

`theme:` must name a palette your renderer has registered. `cuoio` and `cuoio-dark`
work on every route this kit documents. The engine ships many more, but a name your
renderer does not carry falls back to unstyled output with no error.

## What a good deck looks like


> This is the Lattice Studio chat's own deck canon, sent with **every turn** it takes.
> Read it before writing slides. The component files tell you how to author a layout
> correctly; this tells you whether the deck is worth showing.

It ends with the traps the deck reviewer actually flags — each with its fix. Avoiding
them up front is cheaper than being told afterwards.

### The canon

```
HOW A BOARDROOM DECK WORKS (so your edits read as an argument, not a file dump):
• ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the slide's claim — never a label ("Q2 Results"), never a question. The body then DELIVERS the claim (the mechanism, the number); it never just restates the heading.
• NARRATIVE ARC: a title that states the stakes -> sections that build the argument -> a closing that names ONE ask. Read top to bottom, the headings alone should BE the argument.
• RHYTHM: interleave a prose claim, an evidence beat (a number / chart), a human beat (a quote), a decision beat. Never run three prose slides in a row.
• RESTRAINT: aim ~70 words of body and <= 6 bullets per slide (a deck declaring `profile: teaching` gets 95). Chrome soft budgets: title <= 10 words, eyebrow <= 5, subtitle <= 12, key-insight <= 18. When content overflows, SPLIT the slide — never shrink the font.
• RIGHT COMPONENT per slide, chosen by INTENT then CAPACITY: match the intent to a component in the catalog, then COUNT the content against that component's capacity — if it exceeds the hard budget, use the escalateTo target or split across slides. Pick from the catalog, never memory.
• CARD-style layouts nest "- Title" then a two-space-indented "  - body" — never an inline "- **Title.** body".
• BOOKENDS are stereotyped: the title slide puts "# h1" FIRST, then a backtick `eyebrow`, then a one-sentence subtitle; both the title and the closing carry `silent`. The closing is ONE sentence plus a signature — never a bulleted "next steps" list.
TRAPS TO AVOID (each is exactly what the deck reviewer flags — self-avoid them up front):
  - a heading that is a category label, not the takeaway → make the heading the message itself — "Revenue grew 18%, led by APAC"
  - a title slide with placeholder text, or no subtitle to orient the room → name the deck, and add one plain line of framing under the h1
  - a data slide whose heading names the topic, not the "so what" → put the conclusion the data supports in the h2, not just its subject
  - a hero number with nothing to compare it to → add a baseline, direction, or target — a bare number is a boast, not a claim
  - a slide dense enough that it holds more than one idea → split it, or cut to the essential point and push detail to speaker notes
  - an element run well past its word budget → tighten hard to the essential point
  - an element crowding its word budget → trim toward the soft target so it reads light
  - a state marker written with braces, which makes a pill rather than a mark → use brackets — `` `[x]` `` inline, or `- [x] text` bare at the start of a bullet
  - a heading too long to land on one tight line → trim to a single assertion; qualifiers and caveats go in the body
  - a numbered divider whose heading fills the band under the section mark and runs off the frame → trim the section name, or drop `numbered` on that slide
  - stacked possessives ("the system’s policy’s…") that stumble read aloud → one possessive at a time; restructure the phrase to speak cleanly
  - three or more headings opening the same way → vary the opening and verb — identical openings read as a drone
  - two slides making the same claim → give each a distinct takeaway, or merge the duplicate slides
  - a heading with no body — a placeholder shipped as content → fill it with the supporting content, or make it a deliberate divider
  - an image that carries meaning but has no alt text → describe what it shows in the brackets so screen readers reach it
  - a deck that never states what it wants from the room → add a decision slide or a plain "we recommend…" line near the close
  - a long deck with no roadmap the audience can track → add an agenda slide near the top
  - more slides than the talk time supports → aim for ~1–2 minutes per slide; cut the rest
  - a chrome slot (eyebrow, subtitle, key-insight) over its word budget → tighten the slot toward its soft budget — chrome frames the slide, it doesn’t carry it
```

### The short form

A small on-device model loses the thread on a long system prompt, so the Studio sends
this reduced canon to local models instead. Use it when context is very tight — it is
the load-bearing subset, not a summary.

```
HOW A BOARDROOM DECK WORKS (keep edits an argument, not a file dump):
• ONE idea per slide. Every "## " heading is a COMPLETE DECLARATIVE SENTENCE that IS the claim — never a label ("Q2 Results"), never a question. The body DELIVERS the claim; it never just restates the heading.
• ARC: a title that states the stakes -> sections that build the argument -> a closing that names ONE ask. The headings alone should read as the argument.
• RESTRAINT: aim ~70 words of body and <= 6 bullets per slide (95 under `profile: teaching`; title <= 10 words). When content overflows, SPLIT the slide — never shrink the font.
• RIGHT COMPONENT by INTENT then CAPACITY: match the intent to a catalog component, count the content against its capacity, and split or escalate if it exceeds the budget. Pick from the catalog, never memory.
• CARD-style layouts nest "- Title" then a two-space-indented "  - body" — never an inline "- **Title.** body".
• BOOKENDS: the title slide is "# h1" then a backtick `eyebrow` then a one-sentence subtitle; the closing is ONE sentence plus a signature (never a bulleted next-steps list); both carry `silent`.
```

---

Source: `lib/authoring/deck-canon.js`. Generated by `tools/build-agent-kit.mjs`.


## The mechanics


These are the half a per-component file cannot tell you: how classes compose, how card
layouts nest, what a title slide is. Shared verbatim with the Studio chat.

> Where a rule says "below" or "listed with each layout", it means **the component file
> you open next** (`components/<name>.md`) — or `authoring/primer.md`, which carries
> every layout skeleton in one document.

- Author every slide as plain Markdown. Choose a layout with `<!-- _class: NAME -->` at the top of the slide; separate slides with a line containing only `---`.
- Use each layout’s skeleton below VERBATIM as the structure — match its heading levels and bullet nesting exactly. Do not invent a structure.
- A variant can change a layout’s authoring STRUCTURE, not just its look. When a variant below shows its OWN skeleton, match THAT skeleton for that variant — not the base one (e.g. `list-tabular` rows are `1. Name` + a nested description, but `list-tabular metric` is `1. Name \`value\`` with no description row).
- Card-style layouts (cards-grid, cards-stack, compare-prose, matrix-2x2, verdict-grid, decision, citation-card, pricing, q-and-a, cycle, policy-recommendation, team-profile) and the panel-split layouts (split-panel, split-compare) take NESTED bullets — a top-level bullet is the card title, a nested bullet is its body. NEVER write inline `- **Title.** body` on these; the body would inherit the title’s bold. Indent a nested bullet to match its parent’s marker width: 2 spaces under a `-` parent, 3 under a `1.` parent. Any layout whose skeleton shows `1.` rows (premise, timeline-list, kpi, list-tabular, …) needs 3.
- Title slides: `<!-- _class: title silent -->`, then an `# H1`, then a backtick-wrapped `eyebrow` paragraph, then a single plain subtitle paragraph — that order exactly, nothing more. The eyebrow is matched as the paragraph IMMEDIATELY after the h1, so authoring the subtitle first silently renders the eyebrow as a second subtitle line instead. Closing slides follow the same order.
- Compose tokens on the class, space-separated: a layout’s own VARIANTS (listed with each layout, e.g. `list-steps timeline`) plus the cross-cutting BASE MODIFIERS — `dark`, `numbered`, `mirror`, `silent`, the `tint-*` / `mark-*` / `with-*` families, and the `tone-pass` / `tone-fail` / `tone-warn` / `tone-skip` state markers. Colors come from theme tokens — never author raw hex.
- Rich blocks are supported: ```mermaid or ~~~mermaid (25 diagram types), ```functionplot (plotted functions), ```anima (motion scenes), and $$…$$ (KaTeX math). There is NO ```chart fence — the chart layouts (funnel, progress, quadrant, radar, piechart, …) are authored as nested Markdown lists like every other layout, chosen with `_class`.
- Keep it tight — slides are glance media, not documents. Respect each layout’s `Budget:` line (max elements + words per element). Universal limits on ANY slide regardless of layout: eyebrow ≤ 5 words, slide title ≤ 10, subtitle ≤ 12, a `> ` key-insight ≤ 18 (one memorable sentence), a status pill 1–2 words. When an element needs more, cut it or move the detail to speaker notes — never let a card become a paragraph.

---

Source: `docs/src/components/studio/ai/architect-knowledge.js` (`AUTHORING_RULES`).


## Rendering and checking


You have a `.md` file. Here is how to see it.

### How Marp and Lattice divide the work

Read this once and the rest of the page explains itself.

**Marp** splits the Markdown into slides and drives a headless Chrome to print them.
It does not know what `kpi` or `quadrant` means — to Marp a `<!-- _class: kpi -->`
comment is just a class name to put on a `<section>`.

**Lattice** is what gives that class name a meaning, in two parts:

- **`lattice.css`** lays the slide out, and a palette like **`cuoio.css`** colors it.
  Most layouts are pure CSS and need nothing else.
- **the runtime `<script>`s** build the layouts that cannot be done in CSS — charts,
  diagrams, and the ones that rearrange their own content, like `kpi`. These run in
  the browser, during the render.

So a Lattice deck is a Marp deck, plus a stylesheet Marp has to be handed, plus the
three scripts the deck carries itself. **Miss any of them and the deck still renders** — as
plain Marp, or with the palette but no type, or with a layout flattened to a list.
None of those prints an error. That is the whole difficulty of this page.

### What your deck must carry

A Lattice deck is a Marp deck first. Six things make it one:

| In the deck | Why |
|---|---|
| `marp: true` in the front matter | Without it marp-cli treats the file as plain Markdown |
| `theme: cuoio` — a palette your renderer registered | An unregistered name falls back to plain Marp, silently |
| `---` alone on a line between slides | This is the slide separator; front matter ends with one too |
| `<!-- _class: NAME -->` at the top of each slide | Picks the layout. One per slide |
| the three runtime `<script>` tags, at the **bottom** | Marp emits raw HTML in document order — at the top they land inside slide 1 and print as text |
| `class: dark` for dark mode, **not** `color-mode:` | `class:` is Marp's own key. Lattice's richer registers are read by the full export pipeline, not by Marp |

And one thing on the renderer's side: **`html: true`**. marp-core escapes raw HTML by
default, which turns the deck's `<script>` tags into visible text and leaves every
chart and diagram unbuilt. Pass `--html` on the CLI, or set it in a config file.

The three tags, in this order — the runtime reads the dagre global synchronously
on its first draw, so it has to come last:

```html
<!-- markdownlint-disable MD033 -->
<script src="mermaid-v11.min.js"></script>
<script src="lattice-dagre.min.js"></script>
<script src="lattice-runtime.min.js"></script>
```

`examples/lattice-example-starter.md` carries all six. Copying it is the cheapest way
to get them right.

### Route 1: the Marp kit (nothing to install)

The `marp/` folder published beside this kit is a copy-and-go bundle — the engine
CSS, the palettes, the fonts and a config. Copy the folder, put your deck inside it
next to `Sample-Deck.md`, then:

```sh
npx @marp-team/marp-cli@^4.3.1 your-deck.md \
  --config-file marp.config.cjs --allow-local-files -o your-deck.pdf
```

**Put the deck inside the folder, not the folder beside the deck.** The config
registers the stylesheets by path relative to itself; a deck outside the folder
renders unstyled **with no error**, which is the single most common way this goes
wrong.

marp-cli renders the PDF through a Chrome or Chromium you already have. If it cannot
find one, point it at yours with `CHROME_PATH=/path/to/chrome`.

### Route 2: render the deck where it already is

Route 1 asks you to move the deck. When you cannot — the deck lives in a repository,
or you are an agent handed a path — hand marp-cli the stylesheets directly with
`--theme-set` and leave the deck alone.

First fetch the assets once. One command gets all of them, the typefaces included —
which matters, because there are dozens of font files and no practical way to name
them one at a time:

```sh
curl -fsSL https://github.com/Laticent/lattice/archive/refs/heads/dist-kits.tar.gz \
  | tar -xz --strip-components=1 lattice-dist-kits/marp
```

That leaves a `marp/` directory holding the stylesheets, the palettes, `fonts/` and the
three runtime scripts. Now point marp-cli at it and leave the deck where it is:

```sh
# Both of these resolve against the OUTPUT file, so they go beside it —
# the typefaces, and the runtime scripts the deck names at its bottom.
cp -r marp/fonts path/to/
cp marp/mermaid-v11.min.js \
   marp/lattice-dagre.min.js \
   marp/lattice-runtime.min.js \
   path/to/

npx @marp-team/marp-cli@^4.3.1 path/to/your-deck.md \
  --html --allow-local-files --pdf -o path/to/your-deck.pdf \
  --theme-set marp/lattice.min.css marp/cuoio.min.css
```

#### Three rules about where those files may live

Each was checked by rendering the same 10-slide deck both ways and looking at the
result. Each wrong answer produces a deck, not an error.

| Asset | May it be a URL? | Where it must be |
|---|---|---|
| The stylesheets (`--theme-set`) | **No** | A local path. marp-cli resolves themeSet entries as paths only; a URL renders the deck in **default Marp styling** and says nothing |
| `fonts/` | No | Beside the **output** file, not beside the stylesheet. marp-cli inlines theme CSS into the page, so `url(fonts/…)` resolves against the output document. Get this wrong and the palette and layout are right while the type falls back to a system serif |
| The three runtime `<script src>` | **Yes** | Beside the **output** file, like the fonts and for the same reason, or a CDN URL. Both were verified rendering the same layout identically |

#### Skipping the download for the scripts

The scripts are the one asset that may be a URL, so a deck can carry them directly and
you download nothing but the two stylesheets:

```html
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/mermaid-v11.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/lattice-dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/lattice-runtime.min.js"></script>
```

Two costs to know before you take that trade. The render now needs network access, so
it fails where the kit route would not; and **`@dist-kits` is a moving branch**, which
is what you want for fixes and not what you want for a deck that must render the same
way next year. Pin a tag instead of the branch when that matters.

There is a second URL for these files, and it is **not** interchangeable. To grab one
file on its own — a different palette, say — fetch it from the repository directly:

```sh
curl -fsSLO https://raw.githubusercontent.com/Laticent/lattice/dist-kits/marp/cuoio-dark.min.css
```

**That host is for downloading and never for a `<script src>`.** It serves JavaScript
as `text/plain` with `nosniff`, so the browser refuses to run it, the layout comes up
flat, and nothing anywhere says why. Use the CDN above in a tag; use this one in a
`curl`.

### In the browser, with nothing at all

Paste the deck into the Lattice Studio at <https://lattice.style/studio> and export
from there. Useful when you have no Node, or you want to try a different palette
before committing to one.

### From a clone of the repository

If you have the source checked out, the engine renders PDF, PPTX, PNG and HTML:

```sh
node dist/lattice-emulator.js your-deck.md your-deck.pdf
```

The output format is chosen by the extension — `.pdf`, `.pptx`, `.png`, `.zip`, `.html`.
Needs Node 22.12 or newer and a Chromium that Puppeteer can find. This route needs no
`--theme-set` and no `<script>` tags: the engine owns both ends, and it strips the
deck's runtime scripts before export, so a deck carrying them renders the same here.

### What about `npm install`?

Not yet. The package is not published to the npm registry, so an `npm install`
line would fail on your first attempt. Use one of the routes above until it is.

### If the slides come out wrong

Every failure on this page is silent, so work back from what you see:

| What you see | What is missing |
|---|---|
| Plain Marp slides — no palette, no layout | The stylesheets never registered. Check they are local paths, not URLs |
| Right colors and layout, wrong typeface | `fonts/` is not beside the **output** file |
| One layout flattened to a list or a bare fence | The runtime scripts did not run: missing, in the wrong order, at the top of the file, or `--html` was not passed |
| `<script src=…>` printed on slide 1 as text | `--html` was not passed, so marp-core escaped it |
| A blank final page after a diagram | An old runtime. Mermaid appends a tooltip to `document.body`, past the last slide, and Chrome spills one more sheet. The shipped runtime pins it; re-fetch yours |

### Before you render, check the deck

```sh
node review/check.mjs your-deck.md   # from the kit root
```

It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot
be talked into approving a deck the way a model reviewing its own draft can.

