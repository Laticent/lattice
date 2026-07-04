---
status: proposed
summary: Comments (review feedback on a slide) are a web-app feature that travels with the deck in the .lattice zip's manifest — never baked into PDF/PPTX. They are a distinct channel from speaker notes and accessibility descriptions, are openly-travelling (privacy is not enforceable in a file-based model), and are shaped so the Yjs collaboration layer can later sync them alongside the source.
companion:
  - ./2026-06-16-lattice-export-format.md
  - ./2026-06-14-yjs-collaboration-exploration.md
  - ./2026-07-03-author-reader-notes-deferred.md
---

# Comments — a review layer that travels in the `.lattice` file

**Date:** 2026-07-04 · **Status:** proposed (design-decision; no code yet) · **Owner:** Sharmarke

> **Not canonical / no shipped behavior yet.** This fixes the *shape* of the
> capability. When this note and a shipped surface disagree, the shipped surface wins.

---

## The question

Do **comments** — review feedback left *on* a slide (e.g. *"CFO will push back on
this number — double-check it"*) — have real value, should they travel with the
deck as their own layer, and how do they reach PDF and PPTX?

This came out of the notes analysis in
[`2026-07-03-author-reader-notes-deferred.md`](./2026-07-03-author-reader-notes-deferred.md):
that analysis killed the idea of splitting a slide's *speaker note* into
speaker / author / reader kinds, and surfaced that the real "private working
note" need is what other tools call a **comment** — a separate object, not a
second kind of note. This doc decides what a comment *is* in Lattice.

## The decision (short version)

1. **Comments are a web-app (Studio) feature.** They are authored, shown, and
   resolved in the app — not a Markdown/LFM construct and not something a
   presenter reads aloud.
2. **Comments travel with the deck in the `.lattice` zip** — specifically in the
   **document manifest** (see [`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md)
   §3b), as their own block, **separate from the deck's Markdown source**. A
   `.lattice` file carries the deck *and* its comments; a `.md`, PDF, or PPTX does not.
3. **Comments are NOT baked into PDF or PPTX.** Those are audience artifacts.
   (See "Why not PDF/PPTX" below — it is a deliberate scope choice, and for PPTX
   it is also a tooling wall.)
4. **They are shaped so collaboration can sync them later.** When the Yjs model
   in [`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md)
   ships, the comment set becomes a synced CRDT structure alongside the shared
   source; the `.lattice` manifest is the offline / portable serialization of the
   same data.

## Why comments have value — and the limit

**Value:** decks circulate for review before they are presented. A comment lets
an author (and, later, a collaborator) attach review context to a specific slide
that is *not* delivery content — "reorder vs. slide 4", "is this stat current?",
"the board saw this last quarter". That is genuinely useful and has no home today.

**The limit — Lattice is one-way.** The engine goes Markdown → artifact and has
**no reverse import** (a `.pptx` a reviewer marks up in PowerPoint cannot flow
back into the source). So Lattice does **not** own a round-trip review
*conversation* — that lives in the recipient's tool. What Lattice owns is the
comment layer *inside the app and inside the `.lattice` file*: author-and-collaborator
review context that travels with the deck's editable form. We scope to that and
do not pretend to be a review server. (The live, multi-party version is the Yjs
layer, not an export round-trip.)

## Three travelling channels — keep them distinct

Comments are a **third register**, not a flavor of notes. Conflating them
corrupts the others (a reviewer's "reorder this" must never surface in the
presenter teleprompter or in a screen-reader's description).

| Channel | Audience | Where it lives | Travels to… |
|---|---|---|---|
| **Speaker note** | the presenter | a slide's HTML comment (LFM); `lib/authoring/notes-core.js` is the boundary | PDF annotation, **PPTX notes** (shipped, #741), Present teleprompter, HTML sidecar |
| **Accessibility description / alt-text** | the reader / assistive tech | *(proposed, separate — not this doc)* | exported into PPTX `descr`, tagged-PDF `/Alt`, HTML `aria` |
| **Comment** *(this doc)* | the author / reviewer / collaborator | the **`.lattice` manifest** (app state), never the Markdown | the **`.lattice` file** and the app only |

The accessibility description channel is a **separate, still-open decision** (it
is *exported* on purpose, which comments are not); it is noted here only to keep
the three registers from being confused. See
[`2026-07-03-semantic-html-accessibility.md`](./2026-07-03-semantic-html-accessibility.md)
for the a11y groundwork.

## Privacy: comments are open, because Lattice can't enforce private

There is **no "private comment"** here, on purpose. Lattice is file-based and
single-user with no server or identity boundary
(`docs/src/components/studio/studio-store.ts` — localStorage; every "share" path
serializes the deck). Anything that ships in a file the recipient holds is, by
definition, readable. Promising "private" would be a guarantee the architecture
can't keep. So comments **travel openly inside the `.lattice` file** and are
simply **absent from every other export** (PDF/PPTX/`.md`). "Don't send it to
that audience" is achieved by choosing the export format, not by a privacy flag.

## Why not PDF / PPTX

- **Decision:** PDF/PPTX are the *audience* deliverables; review scaffolding does
  not belong in the thing you present or hand out. Comments ride the `.lattice`
  file, which is the *author-continuity* format.
- **PPTX is also a tooling wall:** the OOXML comment construct exists, but
  `pptxgenjs` (our writer, `lib/export/pptx-export.js`) has **no comment API** —
  only `addNotes` (one notes string). Native PPTX comments would need hand-written
  OOXML zip surgery. Not worth it against a deliberate scope choice.
- **PDF *could* be cheap** (the emulator already writes `Text` sticky-note
  annotations via pdf-lib — a visible authored comment would reuse that path). We
  are **not** doing it: it would re-introduce review scaffolding into an audience
  artifact. Recorded here so the option is a known, rejected one, not a gap.

## Where comments live — the manifest block

Extend the Lattice document manifest ([`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md)
§3b) with a top-level `comments` block, a sibling of `notes` / `config`:

```jsonc
{
  "format": "1.0",
  "source": "<base64 LFM>",     // the deck — the source of truth, unchanged
  "notes":  true,
  "comments": [                 // NEW — review layer, never in `source`
    {
      "id": "c1",
      "anchor": { "slide": 3 }, // slide-scoped to start; a text/region range is a later refinement
      "author": "Sharmarke",
      "body": "Double-check this number before the board.",
      "createdAt": "…",
      "resolved": false
      // "thread": [ … ]        // replies — deferred until the collaboration layer
    }
  ]
}
```

- **Anchored, not inline.** A comment references a slide (later, a text range) —
  it is never spliced into the Markdown, so the source stays clean and
  byte-exact round-trips (the format's golden-test requirement, §3c).
- **Reuse the plumbing.** The zip + `manifest.json` machinery already exists —
  `docs/src/components/studio/workspace-backup.ts` (the `lattice-workspace.zip`
  backup, [`2026-07-02-workspace-backup.md`](./2026-07-02-workspace-backup.md))
  and `asset-bundle.ts` (the shared manifest envelope). Don't reinvent the
  container; extend the manifest.

## The collaboration path (why the shape matters now)

The Yjs model ([`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md))
syncs the deck's Markdown as **one shared `Y.Text`** and derives everything else.
Comments are exactly the kind of thing that is *not* the source: they become a
separate synced structure (a `Y.Array` of comment objects) that rides the same
session. Designing comments as an **anchored, id'd list in the manifest today**
means:

- the offline `.lattice` file and the live Yjs document hold the *same* comment
  shape — the manifest is just the serialized snapshot;
- threads / resolve / presence layer on later without reshaping the data;
- no rework when collaboration lands — the app already reads/writes the list.

(WebRTC transport for that sync is the sibling exploration,
[`2026-06-15-webrtc-av-collaboration.md`](./2026-06-15-webrtc-av-collaboration.md).)

## Non-goals / do-not

- **No comments in PDF/PPTX/`.md`** — `.lattice` (and the app) only.
- **No "private" comment** — unenforceable in a file-based model; comments are
  open within the file they travel in.
- **No round-trip review importer** — Lattice does not ingest a reviewer's
  edits/comments made in PowerPoint or Acrobat back into the source.
- **Comments never touch the Markdown `source`** — they are manifest/app state,
  anchored by reference. This keeps the source the single, clean source of truth.

## Open questions (for when this is built)

1. **Anchoring granularity** — slide-scoped is the MVP; a text/region range needs
   a stable position model (and interacts with the Yjs relative-position API).
2. **Sequencing vs. the `.lattice` format** — comments need the `.lattice`
   container to exist first (that format is itself still `proposed`, no code). So
   this is gated on the export-format work, then the collaboration work.
3. **The accessibility description channel** is a separate decision to make (it is
   *exported*, unlike comments) — do not fold it in here.

## Related decisions

- [`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md) — the `.lattice` zip + document manifest that carries comments.
- [`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md) — the collaboration layer comments become live in.
- [`2026-06-15-webrtc-av-collaboration.md`](./2026-06-15-webrtc-av-collaboration.md) — sibling: the P2P transport for that sync.
- [`2026-07-02-workspace-backup.md`](./2026-07-02-workspace-backup.md) — the existing zip + `manifest.json` machinery to reuse.
- [`2026-07-03-author-reader-notes-deferred.md`](./2026-07-03-author-reader-notes-deferred.md) — the notes analysis this decision came out of (the "private note is really a comment" finding).
- [`2026-07-03-semantic-html-accessibility.md`](./2026-07-03-semantic-html-accessibility.md) — the a11y groundwork for the separate description/alt-text channel.
- [`2026-07-03-slide-context-editor.md`](./2026-07-03-slide-context-editor.md) — the per-slide Studio drawer where a comment UI would live.
- Shipped: `#741` — speaker notes now reach PPTX (contrast: notes *do* travel to PPTX; comments do *not*). `lib/export/pptx-export.js`, `lib/authoring/notes-core.js`.
