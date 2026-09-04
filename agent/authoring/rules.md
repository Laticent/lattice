# Rules that apply to every slide

These are the half a per-component file cannot tell you: how classes compose, how card
layouts nest, what a title slide is. Shared verbatim with the Studio chat.

> Where a rule says "below" or "listed with each layout", it means **the component file
> you open next** (`components/<name>.md`) — or `authoring/primer.md`, which carries
> every layout skeleton in one document.

- Author every slide as plain Markdown. Choose a layout with `<!-- _class: NAME -->` at the top of the slide; separate slides with a line containing only `---`.
- Use each layout’s skeleton below VERBATIM as the structure — match its heading levels and bullet nesting exactly. Do not invent a structure.
- A variant can change a layout’s authoring STRUCTURE, not just its look. When a variant below shows its OWN skeleton, match THAT skeleton for that variant — not the base one (e.g. `list-tabular` rows are `1. Name` + a nested description, but `list-tabular metric` is `1. Name \`value\`` with no description row).
- Card-style layouts (cards-grid, cards-stack, compare-prose, matrix-2x2, verdict-grid, decision, citation-card, pricing, q-and-a, cycle, policy-recommendation) and the panel-split layouts (split-panel, split-compare) take NESTED bullets — a top-level bullet is the card title, a nested bullet is its body. NEVER write inline `- **Title.** body` on these; the body would inherit the title’s bold. Indent a nested bullet to match its parent’s marker width: 2 spaces under a `-` parent, 3 under a `1.` parent. Any layout whose skeleton shows `1.` rows (premise, timeline-list, kpi, list-tabular, …) needs 3.
- Title slides: `<!-- _class: title silent -->`, then an `# H1`, then a backtick-wrapped `eyebrow` paragraph, then a single plain subtitle paragraph — that order exactly, nothing more. The eyebrow is matched as the paragraph IMMEDIATELY after the h1, so authoring the subtitle first silently renders the eyebrow as a second subtitle line instead. Closing slides follow the same order.
- Compose tokens on the class, space-separated: a layout’s own VARIANTS (listed with each layout, e.g. `list-steps timeline`) plus the cross-cutting BASE MODIFIERS — `dark`, `numbered`, `mirror`, `silent`, the `tint-*` / `mark-*` / `with-*` families, and the `tone-pass` / `tone-fail` / `tone-warn` / `tone-skip` state markers. Colors come from theme tokens — never author raw hex.
- Rich blocks are supported: ```mermaid (25 diagram types), ```functionplot (plotted functions), ```anima (motion scenes), and $$…$$ (KaTeX math). There is NO ```chart fence — the chart layouts (funnel, progress, quadrant, radar, piechart, …) are authored as nested Markdown lists like every other layout, chosen with `_class`.
- Keep it tight — slides are glance media, not documents. Respect each layout’s `Budget:` line (max elements + words per element). Universal limits on ANY slide regardless of layout: eyebrow ≤ 5 words, slide title ≤ 10, subtitle ≤ 12, a `> ` key-insight ≤ 18 (one memorable sentence), a status pill 1–2 words. When an element needs more, cut it or move the detail to speaker notes — never let a card become a paragraph.

---

Source: `docs/src/components/studio/ai/architect-knowledge.js` (`AUTHORING_RULES`).
