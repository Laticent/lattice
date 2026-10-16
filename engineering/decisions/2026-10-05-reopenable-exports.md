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

- ~~**CLI exports** do not embed.~~ Done in §8: `--reopenable`.
- ~~**Drag a file onto the Studio** to import it.~~ Done in §9.
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

## 8. The CLI half: `--reopenable` (2026-10-06)

The same deck was re-openable or not depending on which tool exported it. `lattice deck.md
out.pdf --reopenable` (and `out.pptx`) now carries the same `.lattice`.

**One kernel.** The write half moved out of the Studio into `lib/core/reopenable.js`: the part
names, the manifest (`buildLatticeManifest`), the `.lattice` zip (`buildLatticeZip`), the PDF
attach (`embedInPdfBytes`) and the PPTX repack (`embedInPptxBytes`). The Studio's
`lattice-file.ts` and `embedded-source.ts` are now Blob adapters over it, and the CLI calls it
directly (HARD RULE #1). It is a CommonJS leaf that takes pdf-lib and JSZip as arguments: the
Studio bundles its own copies from `docs/node_modules`, and a `require` inside a `lib/` file
would have shipped the root copy beside them. The READ half (extract, caps) stays in the Studio,
the only reader.

**What the CLI puts in it.**

- *Source:* the file as read (BOM and CRLF normalized, as every CLI read is), before the Mermaid
  pre-render and before `--size` / `--print` rewrite its front matter for the run. The recipient
  edits the deck, not this export's settings. `--strip-notes` / `--strip-say` scrub it with the
  same measured cut `--embed-source` uses (`attachableSource`, shared by both flags).
- *Comments:* none, as in the Studio (§3.5).
- *Packages:* the installed theme and the installed components this render used, read from the
  package store as folders. The Studio's import gates them exactly as it gates a Studio
  `.lattice`.
- *Clock:* the manifest's `generatedAt` and every zip entry date come from the pinned PDF epoch
  (`SOURCE_DATE_EPOCH`, else 1970, clamped to 1980 because a zip date cannot be earlier). So
  an unchanged deck still re-renders to the same PDF bytes, the property
  `lib/core/pdf-timestamps.js` exists for. Tested: two renders seconds apart write identical
  files, and `SOURCE_DATE_EPOCH` sets the entry dates and `generatedAt`. (JSZip writes zip
  dates in UTC, so the time zone never entered.)
- *Known gap:* `-p` / `--palette` picks this render's theme without editing the deck. The
  payload carries the deck as written, so a deck with no `theme:` line re-opens in the default
  theme, not the one the PDF shows, even though an installed `-p` theme rides along as a
  package. Same for `--size` / `--print`, deliberately. Put the theme in the deck's front matter
  to make it travel. The CLI says so: when `-p` or `LATTICE_PALETTE` picked a theme the deck
  will not re-open in (its own `theme:`, else the default), `--reopenable` prints one warning
  naming both themes and the `theme:` line that fixes it. It stays silent when the two agree,
  and both arms are in `test/integration/export/reopenable.test.js`. A warning, not a rewrite of
  the payload: the `.lattice` is the deck as written, and editing its front matter behind the
  author's back would make the payload stop matching their file.

**Failure is loud.** `--embed-source` warns and writes the PDF without its attachment, because a
provenance note must not cost the deck. `--reopenable` exits 1 and writes nothing instead: the
author asked for a file someone can edit, and a plain one under that promise is found out by the
recipient, too late. On `.png`, `.zip` and `.html` the flag is named in a warning, never
dropped silently.

**PPTX write.** `lib/export/pptx-export.js` calls `pptx.write({ outputType: 'nodebuffer' })`
and writes the file itself, instead of `writeFile`, which is the same call followed by
`fs.writeFile`. A plain export's bytes do not change shape; the payload is added before the file
exists.

**Verified on** the real CLI (`test/integration/export/reopenable.test.js`: source byte for
byte, PDF and PPTX payloads identical, `--strip-notes` scrubs it, a pinned payload clock, an
installed component rides along, `--strip-notes --strip-say` scrub a PPTX payload, a warning
on `.png`) and in the real Studio
(`docs/e2e/deck-import-roundtrip.spec.ts`: the CLI renders a PDF and a PPTX, the built Studio
imports both through the deck switcher and stores the exact source).

## 9. Drop a file to import it (2026-10-07)

**The owner's pick** (one round, four options: whole shell, the deck switcher only, shell plus
editor, menu only): **the whole shell**, except the zones that already own a drop.

**The model.** `docs/src/components/studio/deck-drop.ts` puts one set of drag handlers on the
Studio root. A file drag over the shell shows a full-window sign, "Drop to open as a new deck",
and a drop hands the file to `importDeckFile`, the same function the menu's file chooser calls.
So a dropped file meets the same reader (`readDeckFile`: sniffs the bytes, caps the size), the
same funnel (`openLatticeImport`: package gates, `keepMine`) and the same refusals and toasts.
A drop always creates a new deck and never edits the open one.

**Where a drop is someone else's** (`OWN_DROP_ZONES`, matched with `closest()`):

- the Library panel and the motion drawing well, which already take files (`data-file-drop`);
- the code editor and the compose editor, where a drop is text placed at a caret;
- an open dialog, which is about something else;
- the whole shell while Present is up, so a drop cannot swap the deck the audience is watching
  (Present's backdrop sits outside its dialog, so `closest()` alone would not catch it).

An inner handler that already called `preventDefault` also wins, so a zone that forgets the
marker still keeps its drop.

**A refused drop stays in the Studio.** The browser's default for an unhandled file drop is to
navigate the tab to the file. So in a zone that did not take the drop, the shell refuses it: on
`dragover` with the no-drop cursor (dialogs, Present), and on `drop` when a zone accepted the drag
and then ignored the file. ProseMirror is that case: it cancels `dragover`, then leaves a drop
with no text in it alone. The `dragover` refusal skips editable elements, because the browser
lets those take a drop natively and CodeMirror depends on it. CodeMirror never cancels
`dragover` and reads a dropped file in its own `drop` handler. Measured: refusing there blocked
the code editor's file drop, and an e2e arm now pins that it still inserts a dropped `.md`.

**Refusals.** More than one file: "Drop one deck at a time", and nothing opens. A file that is not
a deck (a PNG): the reader's own "can't open that kind of file". A drag that carries no files (a
rail reorder, dragged text) is not touched at all.

**Two things measured, not assumed.**

- *A drop over the preview iframe reaches the shell.* The preview is the largest surface, and
  a drop event inside an iframe goes to the iframe's document. Measured with a native drag (CDP
  `Input.dispatchDragEvent`, which routes through Chromium's own hit testing): it imports. The
  reason holds in every engine: the preview frame sits inside StudioShell's slide-frame box,
  which is `pointer-events-none`, so hit testing never picks the iframe (measured: the computed
  value is `none` on the revealed frame, and the element at the preview's center is the shell's
  own pane).
- *A cancelled drag sends the page nothing.* With CDP `dragCancel`, Chromium delivered no
  `dragleave` at all, and the first build's sign stayed up over a Studio no one was dragging
  onto. The sign now also comes down after one second with no `dragover`. The browser fires one
  every 350 ms ± 200 ms while a drag is over the page, even when the pointer is still, so a live
  drag never trips it. The Library's own drop overlay uses a depth counter with no such timer,
  and is logged in `followups.d/` rather than changed here.

**Verified on** the built site (`docs/e2e/deck-drop-import.spec.ts`, Chromium, native drags): a
CLI `--reopenable` PDF dropped on the preview opens as a new deck byte for byte, and the deck
that was open is still stored unchanged; a `.lattice` dropped on the header opens; two files and
a PNG are refused and nothing opens; a drop on the code editor shows no sign and imports nothing,
and a `.md` dropped there is still inserted as text; a PDF dropped on the compose editor and one
dropped while presenting import nothing and leave the tab on the Studio (both arms fail with
their guard removed);
the sign fits at 1440, 820 and 390 px, in light and dark. Unit: `deck-drop.test.ts` (the verdict
against real DOM nesting). **WebKit's null `relatedTarget`.** The checker flagged that WebKit has reported a null
`relatedTarget` on `dragleave` between two children, which would blink the sign at every element
edge. A null one now hides the sign only when the pointer is at or past the window's edge; any
other end of a drag is the dead-man timer's. An e2e arm replays that leave and asserts the sign
stays; it fails with the old rule. That arm builds its drag in the page, so it is tagged for the
WebKit and Gecko CI projects as well as Chromium.

**UNVERIFIED:** a person's drag in the Safari and Firefox applications and from the iPad Files
app. The engines run the shell's logic in CI; the operating system's own drag is not driven
there.
