---
status: shipped
summary: >
  People asked for a deck they could edit, and the Studio seemed unable to import one: "Import
  deck…" was in the Lattice brand menu, away from "New deck", and read only `.md` and `.lattice`.
  It now sits in the deck switcher (and ⌘K), and one reader (`deck-import.ts`) opens `.lattice`,
  Markdown, the webpage export's envelope, and PDF / PowerPoint exported with the new opt-in
  "Re-openable in Lattice" switch, which embeds the deck's `.lattice` in the file. A PDF or PPTX
  without it is refused with the way forward, never scraped.
---

# Re-openable exports — one Import door, and the deck inside the PDF

## 1. The ask

> "today we have no ability to import an exported .lattice deck via the studio … one should
> also be able to import lattice markdown, a power point and pdf files generated via lattice …
> i have people asking me to share the deck"

## 2. What was actually there

Measured on `main` at `2b2c265`, not assumed:

| File | Studio import before | Carries the source? |
|---|---|---|
| `.lattice` | **Worked** (`StudioShell` `onImportFile` → `readLatticeFile`) | Yes: `deck.md` + manifest + packages |
| `.md` | **Worked**, same handler | It *is* the source |
| `.html` webpage | No | **Yes**: `lib/core/lattice-doc.js` envelope, with `parseEnvelope` already written, and no Studio caller |
| `.pdf` | No | **No**: the Info dict holds title, summary and engine keywords only (`deck-export.js` `pdfProps`) |
| `.pptx` | No | **No**: the same provenance fields |

So the first half of the ask was a **placement** defect. "Import deck…" lived in the brand
launcher (Lattice ▾) under a comment saying deck CRUD belonged in the switcher. "New deck" was in
the switcher, where people looked, and Import wasn't. The second half held a false assumption:
our PDF and PowerPoint exports had never carried the deck, so no amount of import code could
recover one.

## 3. Decisions (owner-confirmed, 2026-10-05)

1. **One door, beside New deck.** "Import deck…" moves to the deck switcher, directly under
   "New deck", and joins ⌘K. It leaves the launcher, so the two menus never offer the same
   action twice.
2. **One reader.** `docs/src/components/studio/deck-import.ts` `readDeckFile` sniffs the BYTES
   (zip / `%PDF-` / HTML / text, with a NUL check that refuses binaries) and returns the
   `.lattice` import shape for every format. `StudioShell` `openLatticeImport` is the single
   funnel after it. Line endings stay normalized in `openImportedDeck`, which every route
   reaches.
3. **The payload is a whole `.lattice`.** A re-openable PDF or PPTX carries the same zip that
   "Lattice project" downloads, built by the same function (`share-export.ts` `latticeBlob`), and
   is read back by `readLatticeFile`. No second format, no second reader, and every existing
   guard (size, inflate budget, manifest shape, package gates with `keepMine`) applies unchanged.
   - **PDF**: an embedded file `deck.lattice`, `/AFRelationship /Source`, via pdf-lib `attach`.
     It shows up in any viewer's attachments pane, so the recipient can see what they were sent.
   - **PPTX**: the part `lattice/deck.lattice`, a `Default` content type for `.lattice`, and a
     package relationship of our own type. OPC consumers ignore relationship types they do not
     know.
4. **Opt-in, remembered per deck, off by default.** The embedded source carries speaker notes and
   hidden slides. A board PDF sent outside must not hand those over by accident. The switch lives
   in the PDF options step and in a new PowerPoint options step. It is stored per deck in browser
   storage, because losing that value costs nothing worse than the safe default.
5. **Comments never ride in a PDF or PPTX payload.** `embeddableLattice` passes an empty comment
   list whatever the deck holds. Comments travel in the `.lattice` alone, which matches the
   existing rule that review notes enter a shared artifact only by a separate, explicit choice.
6. **Never scrape the render** (`2026-06-16-lattice-export-format.md` §3a). A PDF or PPTX with no
   payload is refused with a message naming the way forward. Rebuilding a deck from slide
   pictures is the separate, model-backed foreign-import door
   (`2026-06-14-presentation-import.md`), still unbuilt. Our own exports must never fall into it.

## 4. Where the embed happens: after the build, once

The PDF has three writers (shared `pdf-compose`, the worker, the main-thread jsPDF fallback)
plus the sheet path. The PowerPoint has two lanes. `deck-export.js` `withEmbeddedSource` runs
once on the finished blob instead of being threaded through five lanes. The costs:

- **A second pdf-lib load/save of the finished PDF.** It runs only when the switch is on, so a
  plain export's bytes do not change. Measured in Node (median of 5, after one warm run, with a
  40 KB payload): **15 ms** on the real 10-slide `examples/studio-present.md` export (0.19 MB),
  and **64 ms** on a synthetic 60-page PDF with one 400 KB picture per page (24.6 MB). The
  exports themselves took 3 to 4 s, so a lane-by-lane embed would save less than 2%.
- **The PPTX repack** stores every part uncompressed, as pptxgenjs writes them, and adds no
  folder entry. A structural diff of a real export against its plain twin shows the same
  parts with the same bytes, except `[Content_Types].xml`, `_rels/.rels` and the new
  `lattice/deck.lattice`. (`docProps/core.xml` differs only in its timestamps.)
- **The main-thread PPTX lane** now calls `pptx.write({ outputType: 'blob' })` and our own
  `download`, instead of `writeFile`, so both lanes pass through the same step and save the same
  way. The blob is re-typed as a presentation, because `write` returns JSZip's default
  `application/zip` where `writeFile` used the presentation type.

## 5. Untrusted input

An imported PDF or PPTX is a file from anyone.

- The carrier is capped at 200 MB (`MAX_CARRIER_BYTES`) before it is parsed.
- PDF: the name-tree walk visits each node once and stops at depth 32, so a cyclic tree cannot
  hang the reader. A stream larger than `MAX_ZIP_BYTES` is refused unread. A `FlateDecode`
  stream is inflated by `DecompressionStream` under a running cap that stops at the chunk which
  crosses it (`inflateCapped`, with a bomb test). Any other filter is refused.
- PPTX: the part is read through `readBytesBudget`, the same capped inflate a workspace backup's
  nested zip uses.
- The payload then meets `readLatticeFile`'s own caps and the package gates.
- HTML: the webpage reader used to locate the envelope with one regex,
  `<script[^>]*\bid=…[^>]*>…</script>`. On a hostile page it backtracked catastrophically:
  repeated `<script id="lattice-doc" ` took 28.6 s at 50 KB, and the time grew with the cube of
  the size. This import is the first caller that feeds it a whole untrusted page, so
  `lib/core/lattice-doc.js` `readEnvelopePayload` is now a forward-only scan. Every repeating
  shape takes about 0.3 s at 50 MB, and `test/unit/core/lattice-doc.test.js` pins both its
  answers and its cost.
- Sniffing: `%PDF-` counts only at byte 0, or anywhere in the first 1 KB when the name ends in
  `.pdf`, so a Markdown deck that mentions `%PDF-1.7` stays a deck. A UTF-16 byte-order mark
  means text, which is decoded as UTF-16, not refused as binary.

## 6. Not done here (and why)

- **CLI exports** (`lattice export --pdf/--pptx`) do not embed. The Studio is where people share
  and re-open decks. The CLI is the build path. Recorded in `followups.d/`.
- **Drag a file onto the Studio** to import it: the user asked for the menu, and a drop target
  on the whole shell is its own UX question.
- **A webpage export carries the artifact copy** of the source, with a saved finish's class
  baked in. That is existing behavior of the player, unchanged here.

## 7. Verification

- Unit: `deck-import.test.ts` covers byte-exact round trips for `.lattice`, Markdown, webpage,
  PDF and PPTX; refusal of a PDF or PPTX that carries no payload; a refused binary; idempotent
  PPTX relationships; and the inflate bomb. `ExportOptionsPanel.test.tsx` covers default-off,
  per-deck memory and the PowerPoint step.
- Real Studio: `docs/e2e/deck-import-roundtrip.spec.ts` exports PDF, PPTX and `.lattice` from
  the built site, re-imports each through the deck switcher's real file chooser, and compares the
  stored source byte-for-byte. A plain PDF is refused.
- Export sign-off (QUALITY BAR, export-bytes change): the owner inspects dark and light demo
  exports before merge.
