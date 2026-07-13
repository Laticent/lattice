---
marp: true
theme: indaco
paginate: true
header: "SlideWright · speech symbols"
footer: "Speech Symbol Commons · read-aloud stress test"
lexicon:
  "⚡": lightning
  "🎯": ""
  "→": leads to
  Kubernetes: koober net eez
acronyms:
  ARR: annual recurring revenue
  TAM: total addressable market
---

# Speech Symbol Commons — read it aloud.

A stress test for read-aloud narration. Open it in Present, turn on the voice, and listen:
every arrow, operator, mark, and emoji below should speak the right thing — or nothing at all.

The `lexicon:` block in this deck's front matter teaches a few overrides — a glyph, an emoji, and
even a whole word — watch for those on the last slide.

---

## Arrows are transitions, not the word "arrow."

The roadmap flows Q1 → Q2 → Q3, and each phase reads "leads to" here — this deck overrides the
built-in "to" via `lexicon:`.

- Auto ⇒ clean ⇒ shipped, a straight implication.
- Trends move ↑ or ↓ across the quarter.
- A rollback ← simply reverts; a left arrow has no clean reading, so it says nothing.
- Modes swap red ↔ green under review.

---

## Math operators speak as words.

Throughput scaled 3 × 4 this sprint. Latency held ≈ 40 with a ± 5 band.

- Uptime ≥ 99 and errors ≤ 1, comfortably.
- The √2 aspect renders at 45°, with headroom toward ∞.
- Ambiguous marks stay literal on purpose: a formula like a + b = c or I/O is left to the voice,
  never guessed.

---

## Typographic marks and initialisms.

© 2026 SlideWright. Lattice™ and the Acme® engine ship today. The detail lives in ¶ 4.

- Reach the team at sales@acme for a walkthrough.
- R&D and the P&L stay whole words — the dictionary wins over a bare ampersand.
- We shipped the PDF and HTML exporters; the API is next.

---

## Emoji: dropped by default, or taught a word.

🚀 We shipped. 🎯 On target. ✨ Polished to a shine. A decorative emoji is silent — the voice
never says "rocket."

But ⚡ reads "lightning" here, because this deck taught it that word in `lexicon:`. An override
beats the built-in, even the built-in drop.

---

## Embedded and mixed tokens.

The glyph doesn't need spaces around it:

- red↔green collapse under deuteranopia.
- The 3×4 grid holds every card.
- Section §5 governs, and §1798.140(o) is the full citation, read with its subsection.
- Metrics shorthand: trailing 11 mo, up 42%, on $4.2M ARR against a €1.5B TAM.
- We run on Kubernetes, which this deck's lexicon teaches the voice to say correctly.

---

## Contractions and the numbers.

We'll ship it, and it's on track — a contraction reads as one word, not three.

- Don't wait: revenue grew forty-two percent year over year.
- Four point two million dollars in ARR, eighteen mos of runway.
- The strength of a short word never out-dwells a longer-spoken one.

---

## Teach or silence any word or symbol yourself.

Add a `lexicon:` map to the front matter — author beats the built-in commons:

- `"→": leads to` overrides the default "to" (this deck does it).
- `"🎯": ""` silences a glyph the commons would otherwise keep.
- `"⚡": lightning` teaches a decorative glyph a word.
- `Kubernetes: koober net eez` fixes how a whole word is pronounced.

Everything else — arrows, math, marks, emoji — just works, unspoken symbols and all.
