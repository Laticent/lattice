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
  - a word inside a shape that can only hold a character or two → use `:tag` or `:chip` for a word; keep `:circle` and `:diamond` for a digit or a mark
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

### The quickest route: the Marp kit (nothing to install)

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
Needs Node 22.12 or newer and a Chromium that Puppeteer can find.

### What about `npm install`?

Not yet. The package is not published to the npm registry, so an `npm install`
line would fail on your first attempt. Use one of the three routes above until it is.

### Before you render, check the deck

```sh
node review/check.mjs your-deck.md   # from the kit root
```

It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot
be talked into approving a deck the way a model reviewing its own draft can.

