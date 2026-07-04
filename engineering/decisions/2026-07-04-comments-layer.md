---
status: in-progress
summary: Comments (review feedback on a slide) are a web-app feature whose home is the .lattice zip's manifest; they are OFF by default in every other export and reach a shared PDF only when the author opts in at export time (a visible sticky note), via a broader export-options step. PPTX has no reachable comment channel (tooling wall). They are a distinct channel from speaker notes and accessibility descriptions, are openly-travelling (privacy is not enforceable in a file-based model), anchor to a stable slide id (not an ordinal), and are shaped so the Yjs collaboration layer can later sync them alongside the source.
companion:
  - ./2026-06-16-lattice-export-format.md
  - ./2026-06-14-yjs-collaboration-exploration.md
  - ./2026-07-03-author-reader-notes-deferred.md
---

# Comments — a review layer that travels in the `.lattice` file

**Date:** 2026-07-04 · **Status:** in-progress (app layer shipped; follow-ons noted above) · **Owner:** Sharmarke

> **Status: partially shipped.** The app-layer comment feature is built (per-deck store +
> the Studio Comments tab: add / resolve / delete). When this note and a shipped surface
> disagree, the shipped surface wins.

**Shipped (this build):** comments as **app state** — a per-deck `localStorage` store
(`slide-comments.ts`) and a per-slide **Comments** tab in the drawer (`SlideComments.tsx`):
add (⌘↵), resolve/reopen, delete. Anchored by slide **index** (see the anchor note below).
**Shipped (this PR — the export-options step + PDF sticky notes):** tapping **Share → PDF**
now opens a pre-export **Export options** panel (`ExportOptionsPanel.tsx`); comments are
**off by default** and, when the author opts in, each rides the PDF as a real **`/Text`
sticky-note annotation** on its slide (`pdf-sticky-notes.js`, applied in BOTH PDF lanes — the
off-thread worker and the main-thread fallback). The earlier "needs a `pdf-lib` pass" worry was
moot: a jsPDF `createAnnotation` overlays the note object on the image page directly. Scope is
author-chosen (All / Open only). **Shipped (this PR — comments travel in a `.lattice` file):**
the project format now exists (`lattice-file.ts`): **Share → Lattice project (.lattice)** writes a
zip carrying `deck.md` (the verbatim source — a lossless round-trip) + `manifest.json` holding the
deck's comments; opening a `.lattice` re-imports the deck AND restores its comments onto the new
deck (`importComments`). This is the comments' home off-device — they travel with the deck,
separately from the Markdown, exactly as this doc called for. **Deferred (documented follow-ons):**
the self-contained `.html` player + full theme/asset envelope (the flagship export-format artifacts,
`2026-06-16-lattice-export-format.md`); reorder-stable anchoring + real author identity (both land
with the collaboration layer); PPTX has no reachable comment channel (pptxgenjs exposes none).

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
2. **The comments' home is the `.lattice` zip** — specifically the **document
   manifest** (see [`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md)
   §3b), as their own block, **separate from the deck's Markdown source**. That is
   the one format that always carries them, editably.
3. **Every other export is a per-export choice, made at export time.** Comments are
   **off by default** (a clean PDF/PPTX is the default deliverable), but the export
   step offers a toggle to **include comments** — for PDF, as visible sticky-note
   annotations (the emulator already writes these). This sits in a broader
   **export-options** step where the author decides *what travels* before the file
   is written (comments, note visibility, present-mode facets, embedded source).
   See "How comments reach an export" below. (PPTX has no native comment channel
   the toolchain can reach — a tooling wall, not a scope choice; see below.)
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
| **Comment** *(this doc)* | the author / reviewer / collaborator | the **`.lattice` manifest** (app state), never the Markdown | the **`.lattice` file** + the app always; **PDF only if opted in at export** (sticky notes) |

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
can't keep. So comments **travel openly inside the `.lattice` file**, are **off by
default in every other export**, and reach a shared PDF only when the author
opts in at export time (below). "Don't send it to that audience" is achieved by
the default (clean export) plus an explicit include-comments choice — not by a
privacy flag.

## How comments reach an export — a choice at export time

Comments' home is the `.lattice` file (always, editable). Whether they appear in
any *other* export is **the author's decision, made per export**, not a fixed
property of the format:

- **The default is clean.** A plain PDF / PPTX / `.md` carries **no** comments —
  the audience deliverable stays free of review scaffolding.
- **PDF: an opt-in include.** The export step offers **"Include comments"**, which
  writes each comment as a **visible sticky-note annotation**. This is nearly free:
  the emulator already writes `Text` annotations via pdf-lib and already has a
  visible-vs-hidden toggle (`lattice-emulator.js` — the `--notes-icon` flag). A
  Review-PDF is the review loop people actually run (mark up in Acrobat/Preview,
  hand back) — Lattice meeting reviewers where they are, *when the author chooses to*.
- **PPTX: a tooling wall, not a scope choice.** The OOXML comment construct exists,
  but `pptxgenjs` (our writer, `lib/export/pptx-export.js`) has **no comment API** —
  only `addNotes` (one notes string). Native PPTX comments would need hand-written
  OOXML zip surgery; deferred until demand justifies it.

**This generalizes.** "Include comments" is one switch in a broader **export-options
step** — a small panel shown before the file is written where the author decides
*what travels*: comments, speaker-note visibility, embedded source, and the
present-mode facets. The CLI already has the primitives (`--notes`, `--notes-icon`,
`--present`, `--embed-source`); the Studio should surface them as pre-export
choices rather than fixed defaults. (Scoped as a follow-on; this doc only fixes
that comments belong in that panel, opt-in, off by default.)

## Where comments live — the manifest block

Extend the Lattice document manifest ([`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md)
§3b) with a top-level `comments` block, a sibling of `notes` / `config`. **This
shape is illustrative, not frozen** — the `.lattice` format has no code yet, and
its real constraints (byte-exact round-trip, `format` versioning, file-vs-inline
pointers) must pressure-test `comments` when it lands:

```jsonc
{
  "format": "1.0",
  "source": "<base64 LFM>",       // the deck — the source of truth, unchanged
  "notes":  true,
  "comments": [                   // NEW — review layer, never in `source`
    {
      "id": "c1",
      "anchor": { "slideId": "s_ab12" }, // a STABLE per-slide id, NOT an ordinal (see below)
      "author": { "id": "u_local", "name": "Sharmarke" }, // see identity caveat
      "body": "Double-check this number before the board.",
      "createdAt": "…",
      "resolved": false
      // "range": { … }           // text/region anchoring — a later refinement
      // "thread": [ … ]          // replies — deferred until the collaboration layer
    }
  ]
}
```

- **Anchor to a stable slide id, never a slide number.** Review is *what causes*
  reorders and inserts; a numeric `{ "slide": 3 }` silently reattaches the comment
  to the wrong slide the moment a slide moves. The MVP anchor must be a stable
  per-slide id (the same relative-position problem the Yjs layer solves), not an
  ordinal. Text-range anchoring is the later refinement.
- **Author identity is a real prerequisite, not a nicety.** The whole *collaborator*
  value ("who flagged this?") rests on a trustworthy author field, and Lattice has
  **no identity system** yet (the Yjs doc's identity is a random name + color). In a
  single-author file a free-text name is harmless; for multi-party review it is the
  load-bearing field, so identity must land *with* collaboration, not after.
- **Anchored, not inline.** A comment references a slide (never spliced into the
  Markdown), so the source stays clean and byte-exact round-trips (the format's
  golden-test requirement, §3c).
- **Reuse the *pattern*, not the container.** The zip + `manifest.json` approach is
  already proven — `docs/src/components/studio/workspace-backup.ts` (the
  whole-workspace `lattice-workspace.zip`,
  [`2026-07-02-workspace-backup.md`](./2026-07-02-workspace-backup.md)) and
  `asset-bundle.ts` (the shared manifest envelope). Those assemble *different*
  containers than the per-deck `.lattice` (which is unbuilt); comments extend the
  `.lattice` manifest, reusing the JSZip + envelope machinery, not those files' zips.

## The collaboration path (why the shape matters now)

The Yjs model ([`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md))
syncs the deck's Markdown as **one shared `Y.Text`** and derives everything else.
Comments are exactly the kind of thing that is *not* the source: they become a
separate synced structure — plausibly a `Y.Array` of comment objects (a design
projection, not stated in the Yjs doc) — that rides the same session. Designing
comments as an **anchored, id'd list in the manifest today** means:

- the offline `.lattice` file and the live Yjs document hold the *same* comment
  shape — the manifest is just the serialized snapshot;
- threads / resolve / presence layer on later without reshaping the data;
- no rework when collaboration lands — the app already reads/writes the list.

(WebRTC transport for that sync is the sibling exploration,
[`2026-06-15-webrtc-av-collaboration.md`](./2026-06-15-webrtc-av-collaboration.md).)

## Non-goals / do-not

- **Comments are off by default in PDF/PPTX/`.md`** — never *automatically* baked
  in; PDF carries them only when the author opts in at export time. PPTX has no
  reachable comment channel yet (tooling wall). `.lattice` + the app are the always-on home.
- **No "private" comment** — unenforceable in a file-based model; comments are
  open within the file they travel in.
- **No round-trip review importer** — Lattice does not ingest a reviewer's
  edits/comments made in PowerPoint or Acrobat back into the source.
- **Comments never touch the Markdown `source`** — they are manifest/app state,
  anchored by reference. This keeps the source the single, clean source of truth.

## Open questions (for when this is built)

1. **Stable slide-id source** — the anchor needs a stable per-slide id that
   survives reorder/insert (an ordinal does not). Where does it come from — a new
   id stamped into the slide, or the Yjs relative-position model? Text-range
   anchoring is the later refinement on top.
2. **Author identity** — the collaborator value needs a trustworthy author field,
   and there is no identity system yet. Identity must land *with* collaboration.
3. **The export-options step** — "Include comments" is one switch in a broader
   pre-export panel (comments, note visibility, embedded source, present facets).
   That panel is its own follow-on design; this doc only fixes that comments belong
   in it, opt-in, off by default.
4. **Sequencing** — comments need the `.lattice` container to exist first (itself
   `proposed`, no code); the PDF opt-in reuses the emulator annotation path and can
   come independently. So: export-format work → then comments home; the Review-PDF
   include can land alongside the annotation infra already present.
5. **The accessibility description channel** is a separate decision to make (it is
   *exported by default*, unlike comments) — do not fold it in here.

## Related decisions

- [`2026-06-16-lattice-export-format.md`](./2026-06-16-lattice-export-format.md) — the `.lattice` zip + document manifest that carries comments.
- [`2026-06-14-yjs-collaboration-exploration.md`](./2026-06-14-yjs-collaboration-exploration.md) — the collaboration layer comments become live in.
- [`2026-06-15-webrtc-av-collaboration.md`](./2026-06-15-webrtc-av-collaboration.md) — sibling: the P2P transport for that sync.
- [`2026-07-02-workspace-backup.md`](./2026-07-02-workspace-backup.md) — the existing zip + `manifest.json` machinery to reuse.
- [`2026-07-03-author-reader-notes-deferred.md`](./2026-07-03-author-reader-notes-deferred.md) — the notes analysis this decision came out of (the "private note is really a comment" finding).
- [`2026-07-03-semantic-html-accessibility.md`](./2026-07-03-semantic-html-accessibility.md) — the a11y groundwork for the separate description/alt-text channel.
- [`2026-07-03-slide-context-editor.md`](./2026-07-03-slide-context-editor.md) — the per-slide Studio drawer where a comment UI would live.
- Shipped: `#741` — speaker notes now reach PPTX (contrast: notes *do* travel to PPTX; comments do *not*). `lib/export/pptx-export.js`, `lib/authoring/notes-core.js`.
