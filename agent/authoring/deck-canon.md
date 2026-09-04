# What a good deck looks like

> This is the Lattice Studio chat's own deck canon, sent with **every turn** it takes.
> Read it before writing slides. The component files tell you how to author a layout
> correctly; this tells you whether the deck is worth showing.

It ends with the traps the deck reviewer actually flags — each with its fix. Avoiding
them up front is cheaper than being told afterwards.

## The canon

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

## The short form

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
