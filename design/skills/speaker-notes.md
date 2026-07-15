# Skill — Create speaker notes, reviews, and captions

> Write the three channels that travel *alongside* a slide — what the presenter
> says (speaker note), what a reviewer flags (review comment), and what the slide
> narrates aloud (caption) — each in its own register, none bleeding into the
> others.

**Read this when** you are asked to add presenter notes, narration/read-along text,
or review feedback to a deck. **You'll produce** HTML-comment notes/captions in the
`.md` source (and, for reviews, Studio-authored comments that travel in the
`.lattice` file).

---

## The 10/10 bar

Three registers, kept strictly distinct — a reviewer's "reorder this" must **never**
surface in the presenter teleprompter, and a caption must never carry a private
remark:

| Channel | Audience | What it is | Where it lives |
|---|---|---|---|
| **Speaker note** | the presenter | what you *say* — the off-slide subtext | a plain HTML comment in the slide's markdown |
| **Caption** | listeners / read-along / TTS / `.vtt` | the exact words the slide *narrates* | `<!-- caption: … -->` or a front-matter `captions:` map |
| **Review comment** | the author / reviewer / collaborator | feedback *about* the slide, not delivery content | the `.lattice` manifest (Studio state) — never the markdown |

The governing principle: **"The slide is for them. The note is for you."** A 10/10
note adds the spoken subtext the slide can't show; a 10/10 caption reads naturally
aloud; a 10/10 review comment is specific and actionable and stays out of the
deliverable.

---

## 1. Speaker notes

**Definition.** Any HTML comment on a slide that is *not* a directive or a tooling
pragma is a speaker note. It is what you *say*, not what's on the slide.

**Author it** as a plain comment (the Studio writes them prefixed `note:`; the
engine reads any non-directive comment, so hand-authored notes round-trip):

```markdown
## The degradation story is the point.

<!-- Open cold. Hold two seconds before the first word — let the room settle.
     The chart shows the split; this note carries the why. -->
```

A slide may carry several note comments (concatenated in order). Notes reach: a
hidden PDF annotation (`--notes-icon` reveals it), a hidden HTML `aside`, a
plaintext sidecar (`--notes`), the **PPTX presenter-notes field**, and the
Present-mode teleprompter. `--strip-notes` removes them for a clean export.

**What makes a great note:**

- **Add spoken subtext** — pacing and delivery cues ("Open cold." "Land it, then
  stop talking.").
- **Push detail off the slide face** into the note — the "why" behind a number
  rides the note while the slide stays clean.
- **Deliver the argument** — the so-what, the turn, the close; mark claims as claims
  ("the data shows $4.2M; the takeaway I'd draw is…").

**What makes a bad note:** restating the slide (the note is the overflow home, not a
mirror); putting a private/reviewer remark in a note (that's a review comment — a
different register that must never hit the teleprompter).

---

## 2. Captions

**Definition.** A caption is a slide's **read-as text** — the exact words it
narrates for read-aloud, the HTML player's read-along, the exported `.vtt`, and TTS.
It is the **highest-precedence narration source** and it *replaces* the whole
slide's narration (unlike a note or description, which are additive).

**The narration precedence chain:**
`caption → front-matter captions map → speaker note → projection/chart narrator`.

**Three ways to author a caption:**

1. **Inline comment** (outranks the note on that slide):
   ```markdown
   <!-- caption: This spoken line outranks the speaker note below. -->
   ```
2. **Front-matter map, keyed by slide number** (for slides with no note):
   ```yaml
   captions:
     6: Your registry taught it ARR and NDR, so this slide speaks them in full.
   ```
3. **Implicit** — with no caption or map entry, the speaker note *is* the caption;
   with nothing at all, a component-aware projection / chart narrator generates one
   (a chart narrates a computed insight — e.g. funnel conversion % — prose can't).

**Display form vs spoken form.** A word carries both `$4.2M` (displayed) and "four
point two million dollars" (spoken); the caption shows the glyphs while the timed
track speaks the words. Expand your own acronyms with a front-matter `acronyms:`
block so the spoken form is right without cluttering the caption:

```yaml
acronyms:
  CRO: chief revenue officer
  ARR: { expansion: annual recurring revenue, definition: "Revenue that recurs." }
```

**The timing model** (the Cadenza engine — pure, deterministic, offline, no AI):
a prosody-grounded estimate (≈150 wpm, ~200 ms/syllable, pauses graded by boundary
depth, phrase-final lengthening) drives the highlight; when TTS plays, each
sentence's measured onset re-anchors its words. The highlight is biased ~40 ms ahead
of the voice (a lagging highlight is the error to avoid). `.vtt` is a sidecar
(`--captions`), never baked into the deck bytes; `--strip-captions` removes both the
inline comments and the map.

**Great caption:** written to be spoken and understood — acronyms expanded, numbers
allowed to read as words. Use an inline `caption:` override only when the spoken line
should differ from both the note and the on-slide prose. A live caption is a
rehearsal mirror, not a teleprompter crutch — it fades as the talk is mastered.

---

## 3. Review comments

**Definition.** A review comment is feedback left *on* a slide — "CFO will push back
on this number, double-check it", "reorder vs. slide 4", "is this stat current?" —
that is **not** delivery content. It is a distinct third register from notes and
captions.

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
register — it would reach the teleprompter); or relied on to stay private.

---

## The contract / skeleton (one slide, all three channels)

```markdown
<!-- _class: funnel -->

## Where the pipeline leaks.

- Visitors `12,000`
- Paid `620`

<!-- Open on the drop from activation to paid — that's the whole story. -->
<!-- caption: The pipeline holds until activation, then loses seventy percent before paid. -->
```

```yaml
# front matter, for note-free slides and acronym expansion
captions:
  1: Meridian Freight — the quarter beat plan, and we need a capacity call today.
acronyms:
  ARR: annual recurring revenue
```

*(Review comments are added in Studio, not here — they live in the `.lattice`
manifest, anchored to this slide.)*

Render with narration sidecars: `node lattice-emulator.js deck.md deck.pdf
--notes --captions`.

---

## Ship checklist

- [ ] Notes add spoken subtext, never restate the slide.
- [ ] Any private/reviewer remark is a **review comment** (Studio), not a note.
- [ ] Captions read naturally aloud; acronyms expanded via `acronyms:`.
- [ ] Caption precedence understood (a `caption:` replaces; a note is additive).
- [ ] Review comments are specific, actionable, and left off the default export.
- [ ] `--notes` / `--captions` sidecars generated and spot-checked if narration
      ships.

---

## Common mistakes

1. **A note that mirrors the slide** — it's the overflow home for what you'd *say*.
2. **A private remark in a note** — it will surface in the teleprompter; use a
   review comment.
3. **Two captions on one slide** — a caption replaces; last non-empty wins, so two
   contradict.
4. **Expecting a caption to auto-expand acronyms** without an `acronyms:` entry.
5. **Assuming review comments are private** or that they ship by default (they're
   off by default).
6. **Anchoring a review to a slide number** in your head — the system anchors to a
   stable id precisely because order changes.

---

## Canonical sources

- `lib/authoring/notes-core.js` — THE note/caption/describe boundary (single source
  of truth).
- `examples/speaker-notes.md` — the canonical speaker-notes deck.
- `examples/read-along-captions.md` — captions via all three authoring paths.
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
