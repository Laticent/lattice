---
name: speaker-notes
description: "Use when writing a slide's notes (@note, @say, @alt, @handout) or review comments, or when reviewing a deck against the notes rubric."
kind: make
studio: true
---

# Skill — Write a slide's four notes, and review comments

> A slide carries four notes, each named for where it shows up. Write each for its
> own reader, and keep a reviewer's remarks out of all four.

**Read this when** you are asked to add speaker notes, narration, alt text, a handout
note or review feedback to a deck, or to *review* a deck. **You'll produce** `@name{…}`
comments in the `.md` source (and, for reviews, Studio comments that travel in the
`.lattice` file). §5 covers the flip side: the rubric for reviewing a deck.

---

## The 10/10 bar

Each note is a comment whose whole body is `@name{…}`. The name is where the words end up:

| Write | Shows up in | For |
|---|---|---|
| `<!-- @note{…} -->` | speaker notes: Present mode, the PPTX notes field, the PDF note annotation, `--notes` | you, while you present |
| `<!-- @say{…} -->` | the voice and the captions: TTS, read-along, the `.vtt` sidecar | someone listening |
| `<!-- @alt{…} -->` | alt text: screen readers, PPTX alt text, `aria-describedby` | someone who cannot see the slide |
| `<!-- @handout{…} -->` | the handout and the player's Read view; a `Handout:` paragraph after the speaker note in PPTX and PDF | someone reading the deck alone, later |
| `<!-- a plain comment -->` | **nowhere** | you, in the source, like a code comment |
| a review comment | the Studio's Comments tab, kept in the `.lattice` file | a collaborator |

The governing principle: **"The slide is for them. The note is for you."** Only `@note`
is private. `@say`, `@alt` and `@handout` are written for the audience and ship with the
deck, so never put a private remark in one. A reviewer's "reorder this" is a review comment,
never any of the four.

**The grammar, in full.** The names are lowercase. The body runs from `{` to its matching
`}` and may span lines and paragraphs; indentation is dropped. A literal brace that does
not balance is written `\{` or `\}`, and `-->` is written `--\>`, because it would end the
comment. Several notes of one name on a slide join in order. Anything else (`@Say{…}`,
an unclosed brace, text after the `}`) is not a note and reaches nothing; `lint:deck`
names it (`note-malformed`). The grammar is one module, `lib/core/note-grammar.mjs`.

```markdown
<!-- @note{
  Open cold. Hold two seconds before the first word.
  The chart shows the split; this note carries the why.
} -->
```

**Why a plain comment goes nowhere.** Until 2026-11-20 any plain comment was the speaker
note, so a private TODO shipped inside the PPTX a client received. Every note is named
now, so a comment you did not name reaches no export surface. It still travels inside an
export that carries the deck's source (the HTML player, `--embed-source`, `--reopenable`,
the Studio's Markdown share) unless you pass `--strip-notes`. The old forms (`say:`,
`describe:`, `reader:`, `note:`, the front-matter `say:` map, a record's `note=`) are
removed; `lint:deck` names each with its replacement, and `lattice migrate notes deck.md`
rewrites a deck. Record: `engineering/decisions/2026-11-20-four-notes.md`.

---

## 1. `@note` — speaker notes

What you *say*, not what's on the slide. It reaches a hidden PDF annotation
(`--notes-icon` reveals it), a hidden HTML `aside`, the plaintext sidecar (`--notes`), the
**PPTX presenter-notes field** and the Present-mode teleprompter.

**What makes a great note:**

- **Add spoken subtext**: pacing and delivery cues ("Open cold." "Land it, then
  stop talking.").
- **Push detail off the slide face** into the note: the "why" behind a number
  rides the note while the slide stays clean.
- **Deliver the argument**: the so-what, the turn, the close; mark claims as claims
  ("the data shows $4.2M; the takeaway I'd draw is…").

**What makes a bad note:** restating the slide (the note is the overflow home, not a
mirror); a reviewer's remark (that is a review comment, §4).

**`--strip-notes` removes every `@note` and every plain comment**, from every format, and
the exported player then shows no notes affordance at all: no button, no panel, and the
`n` key does nothing. It keeps what is meant to ship: `@say` (which has `--strip-say`),
`@alt` (the recipient's accessibility) and `@handout`.

**It ships the render of the SCRUBBED source**, so the exported slides are byte-identical
to the same deck written without those comments, and the shipped source carries no residue
that says which slides had one. The scrub is **structure-preserving**: a comment line is an
HTML block, so it separates what is above it from what is below. Delete it outright and
`Some text` / `<!-- @note{…} -->` / `---` turns into a setext heading. So the cut is decided
per line: a comment between two blank lines takes one of them with it, and a comment between
two lines of text is replaced by a blank line. The export renders both candidate cuts and
keeps the one that reproduces the deck you wrote; if neither does, it keeps your slides and
says so. `--strip-say` takes the same cut, and the two flags together scrub one composed
source.

**A note shown inside code is safe.** A deck that documents this syntax keeps its sample:
a comment inside a fenced block, an indented code block or an inline code span is visible
slide text, so neither the engine nor a strip touches it. The scan reads code the way
markdown-it does.

---

## 2. `@say` — what a slide says aloud

The slide's **read-as text**: the exact words it speaks in read-aloud, the HTML player's
read-along, the exported `.vtt` and TTS. It **replaces** the slide's generated narration
entirely, never in part. Several `@say` comments on one slide join into one line.

```markdown
<!-- @say{The pipeline holds until activation, then loses seventy percent before paid.} -->
```

**The narration precedence:** the slide's `@say` → the chart narrator → the projection of
the slide's own content. A speaker note is **not** in that chain: it reaches the presenter's
own surface and nothing else.

**With no `@say`** (the default), a component-aware projection and chart narrator write the
narration from what the slide actually says (a chart narrates a computed insight, such as a
funnel's conversion rate, that prose can't). A slide with nothing to project is silent;
a note is not a substitute.

A `@say` line is plain words. Markdown typed into it is read as the words it marks:
`**It costs more.**` shows and speaks as "It costs more." on every surface, through one
kernel, `plainSay` in `lib/core/read-along-build.js`. Emphasis you want HEARD belongs on the
slide, where the projection turns bold into a held beat.

**Display form vs spoken form.** A word carries both `$4.2M` (displayed) and "four
point two million dollars" (spoken); the on-screen caption shows the glyphs while the timed
track speaks the words. Teach the voice your own terms with a front-matter `terms:`
block, so the spoken form is right while the slide and its caption stay as written:

```yaml
terms:
  Derby: Darby                                # a plain value is what the voice says
  "Twinkima G": Twinkee mah Gee               # quote a key with a space or a symbol
  CRO: { expansion: chief revenue officer }   # what it stands for, said aloud
  EBITDA:
    expansion: earnings before interest, taxes, depreciation and amortization
    pronounce: ee bit dah                     # how to say it, when that differs
    definition: "A measure of operating profit."   # feeds glossary: auto
```

One entry covers the forms a deck writes: `CROs`, `CRO's`, `CRO-led`, `CRO/CFO`, and
`DERBY` in a title (a lower-case or Capitalized key matches its other cases; `CRO` stays
case-exact). `acronyms:` and `lexicon:` are older names for `terms:` and still work;
`lint:deck` offers to move them.

**The timing model** (the Cadenza engine — pure, deterministic, offline, no AI):
a prosody-grounded estimate (≈150 wpm, ~200 ms/syllable, pauses graded by boundary
depth, phrase-final lengthening) drives the highlight; when TTS plays, each
sentence's measured onset re-anchors its words. The highlight is biased ~40 ms ahead
of the voice (a lagging highlight is the error to avoid). `.vtt` is a sidecar
(`--captions`), never baked into the deck bytes; `--strip-say` removes every `@say`,
leaving the generated narration. `--strip-notes` is a separate channel and does not
touch `@say` at all.

**Opening and closing lines.** Narration can open with a greeting and end with a
closing that belong to no slide, set once in front matter:

```yaml
greeting: "{greeting}, and welcome to the Q3 review."  # {greeting} → Good morning / afternoon / evening
closing: "Thank you. Questions are welcome."
```

`{greeting}` follows the listener's own clock, so never write "good morning" into the
text. A line your first or last slide already says ("Welcome…", "Thank you") is skipped rather than said twice. Each line plays at most once per delivery, and they appear in the caption band
and the `.vtt` like any other line. The full rules are in
`lib/base/base.registers.docs.md` § `greeting:` / `closing:`.

**Great `@say` line:** written to be spoken and understood, with acronyms expanded and
numbers allowed to read as words. Write one only when the spoken line should differ from
the slide's own prose. The live caption band is a rehearsal mirror, not a teleprompter
crutch: it fades as the talk is mastered.

---

## 3. `@alt` and `@handout` — for readers who are not in the room

**`@alt`** is the slide's WCAG 1.1.1 text alternative: an objective equivalent of what the
slide *shows*, for someone who cannot see it. It lands in PPTX alt text and in an sr-only
paragraph the slide's `aria-describedby` points at; it is never spoken by the deck and never
reaches the notes field. Say what a sighted viewer takes from the slide (the shape of the
chart, the one number that matters), not what the presenter says over it. Several `@alt`
comments join into one line.

**`@handout`** is for someone reading the deck alone, later: the context the presenter would
have supplied in the room (a definition, a source, the caveat behind a number). It prints under
the slide in the HTML player's Read view and follows the speaker note in PPTX and PDF as a
paragraph labeled `Handout:`. `--strip-notes` keeps it.

Both are public. Write them as something the audience may read.

---

## 4. Review comments

**Definition.** A review comment is feedback left *on* a slide — "CFO will push back
on this number, double-check it", "reorder vs. slide 4", "is this stat current?" —
that is **not** delivery content. It is not one of the four notes.

**How it works (know these boundaries):**

- It is a **Studio (web app) feature**, authored in the per-slide **Comments** tab
  (add ⌘↵, resolve/reopen, delete) — **not** a Markdown/LFM construct and never
  spliced into the source.
- Its home is the **`.lattice` zip manifest**, a block separate from the deck
  markdown, anchored to a **stable slide id** (not an ordinal — review is *what
  causes* reorders, so an ordinal would reattach to the wrong slide).
- It is **off by default in every other export.** A plain PDF/PPTX/`.md` carries no
  comments. PDF gets them only when the author opts in at export (each becomes a
  visible `/Text` sticky-note annotation). PPTX has no reachable comment channel.
- There is **no "private" comment** — a file-based model can't enforce privacy; "don't
  send it to that audience" is achieved by the clean-by-default export, not a flag.

**Great review comment:** specific, actionable, anchored to the one slide it's
about, and framed as review context ("is this stat current?"), not delivery prose.
**Bad review comment:** vague ("fix this"); written as a speaker note (wrong
register: it would reach the teleprompter); or relied on to stay private.

---

## 5. Reviewing a deck — the evaluative rubric

The four notes above are what you *author*. This is the flip side: how to
**review** a deck — decide what's weak and what to flag (the content of the review
comments in §4). Lattice ships the rubric as code, so you don't review from taste
alone.

**Where it runs.** The review heuristics are the **advisory pass of `npm run
lint:deck`** (`reviewText` in `lib/authoring/review-core.js`) — on by default,
`--no-review` to skip. They are the sibling of the lint footgun checks: **lint
catches what renders *wrong*; review catches what renders fine but *communicates
poorly*.** Review findings are `suggestion` severity — they **never fail the
build**; they are guidance. The Studio Architect panel and the **scorecard** (five
categories — Structure · Clarity · Data · Pacing · Contract — plus a letter grade)
aggregate them. Crucial framing: the scorecard measures **the absence of detected
problems, not the presence of brilliance** — a clean scorecard is *necessary, not
sufficient* for 10/10. The last mile is still render-and-look.

**The rubric — each finding names a trap and its fix:**

| Finding | The trap | The fix |
|---|---|---|
| `label-title` | a heading that's a category (`"Overview"`, `"Results"`) | say what the slide *proves* — "Revenue grew 18%, led by APAC" |
| `title-incomplete` | a heading that isn't a full declarative sentence | finish the claim |
| `chart-no-takeaway` | a data slide with no "so what" headline | put the insight in the `## `, not just the chart |
| `metric-no-referent` | a hero number with nothing to compare it to | a number alone is a boast, not a claim — add the referent |
| `wall-of-text` | too dense to land | push the detail to speaker notes |
| `long-heading` | a takeaway that won't fit one tight line | cut it to one line |
| `possessive-stacking` | stacked possessives that stumble read aloud | rewrite for the speaking voice |
| `monotone-openings` | 3+ headings opening the same way | vary the cadence — it reads as a drone |
| `no-ask` | a deck that never states what it wants | name the one decision / ask |
| `agenda-missing` | a long deck with no roadmap | add an agenda so the room can follow |
| `duplicate-heading` | two slides making the same claim | merge or differentiate |
| `stub-slide` | a near-empty placeholder shipped as content | fill it or cut it |
| `image-no-alt` | an image carrying meaning with no alt text | add alt text (`@alt`, or the image's own) |

Plus a **pacing verdict** from slide count vs. talk length: under ~60s/slide reads
"fast", over ~120s "leisurely", in between "a comfortable boardroom pace." The
prose-density budgets (verbose eyebrow/subtitle/key-insight, density-crowd /
density-overflow) ride the same pass.

**Reviewing well = running that pass, then reading the deck as the audience:** is
every heading a claim, does each data slide say "so what", is there one clear ask,
does the cadence vary? What you flag becomes a review comment (§4) or a direct edit.

---

## The contract / skeleton (one slide, all four notes)

```markdown
<!-- {layout=funnel} -->

## Where the pipeline leaks.

- Visitors `12,000`
- Paid `620`

<!-- @note{Open on the drop from activation to paid. That's the whole story.} -->
<!-- @say{The pipeline holds until activation, then loses seventy percent before paid.} -->
<!-- @alt{Funnel chart: 12,000 visitors narrowing to 620 paid; the sharpest drop is activation to paid.} -->
<!-- @handout{Activation-to-paid is measured over 30 days; the cohort is in the appendix.} -->
```

```yaml
# front matter: how terms are spoken
terms:
  ARR: { expansion: annual recurring revenue }
```

*(Review comments are added in Studio, not here. They live in the `.lattice`
manifest, anchored to this slide.)*

Render with narration sidecars: `npx @laticent/lattice deck.md deck.pdf
--notes --captions`.

---

## Ship checklist

- [ ] Each note is `@name{…}`; `lint:deck` reports no `note-key-retired` or `note-malformed`.
- [ ] `@note` adds spoken subtext and never restates the slide.
- [ ] Nothing private sits in `@say`, `@alt` or `@handout`; a reviewer's remark is a **review comment**.
- [ ] `@say` lines read naturally aloud; acronyms expanded via `terms:`.
- [ ] Every slide that carries meaning visually has an `@alt`.
- [ ] `--notes` / `--captions` sidecars generated and spot-checked if narration ships.

---

## Common mistakes

1. **A note that mirrors the slide.** It's the overflow home for what you'd *say*.
2. **A private remark in `@say`, `@alt` or `@handout`.** All three ship; use `@note` or a
   review comment.
3. **Expecting a plain comment to be a speaker note.** It reaches nothing; write `@note{…}`.
4. **Expecting `@say` to expand acronyms** without a `terms:` entry.
5. **Assuming review comments are private** or that they ship by default (they're
   off by default).
6. **Anchoring a review to a slide number** in your head. The system anchors to a
   stable id precisely because order changes.

---

## Canonical sources

- `lib/core/note-grammar.mjs` — the one grammar for the four notes; `lib/authoring/notes-core.js` reads
  them from a render and scrubs them from a source.
- `engineering/decisions/2026-11-20-four-notes.md` — why four, why named for the destination, why a plain
  comment goes nowhere.
- `examples/speaker-notes.md` — the canonical speaker-notes deck.
- `examples/read-along-captions.md` — `@say` lines and the generated narration they replace.
- `examples/chart-narration.md`, `examples/pie-detail-notes.md` — notes/captions in
  charts.
- `engineering/decisions/2026-07-07-cadenza-caption-timeline.md` — the caption
  engine + timing model.
- `engineering/decisions/2026-07-12-narration-pace-model.md` — the prosody-grounded
  pacing/sync model.
- `engineering/decisions/2026-07-11-manifest-speech-contract.md` — narration
  precedence, projection, the acronym registry.
- `engineering/decisions/2026-07-04-comments-layer.md` — the review/comments layer
  (what it is, where it lives, how it exports).
- `lib/authoring/review-core.js` — the evaluative review heuristics (§5), run as the
  advisory pass of `npm run lint:deck`.
- `lib/authoring/scorecard.js` — the five-category deck scorecard the review findings
  aggregate into.
