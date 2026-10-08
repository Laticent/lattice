# The `.lattice` file — spec 1.0

<!-- spec-parts
schema: none: the manifest is stated in full in §3
reference: lib/core/reopenable.js docs/src/components/studio/lattice-file.ts
tests: spec/conformance/lattice-file/
-->

**Version:** 1.0 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-10-08 · **Owner:** @saden1 ·
**License:** [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/) (this document and its shared test cases)

A `.lattice` file is a deck as a project: its Markdown source, byte for byte, plus what the source
alone cannot carry. Today that is the review comments people left on its slides and the saved
themes, components and finishes the deck uses. Opening one restores exactly what was written, on a
machine that has never seen the author's library. This spec says what the file holds and what a
reader must check before it trusts any of it, so another tool can write a `.lattice` that Lattice
opens, or open one Lattice wrote.

The owner ruled on 2026-10-08 that the `.lattice` file is a public spec
(`engineering/decisions/2026-10-08-spec-audit.md` §8.1). Its shape therefore changes only with a
version of this spec.

## 1. The four parts

| Part | Where it lives |
|---|---|
| Document | this file |
| Schema | §3 below (the manifest is small enough to state in full) |
| Reference implementation | the writer, `buildLatticeZip` and `buildLatticeManifest` in `lib/core/reopenable.js`; the reader, `readLatticeFile` and `parseLatticeManifest` in `docs/src/components/studio/lattice-file.ts` |
| Shared test cases | [`spec/conformance/lattice-file/`](./conformance/lattice-file/README.md) |

## 2. The container

A `.lattice` file is a ZIP archive. Its media type is `application/vnd.lattice+zip`. It holds:

| Entry | Required | Holds |
|---|---|---|
| `deck.md` | yes | The deck's LFM source (see `spec/LFM-1.0.md`), UTF-8, exactly as written. |
| `manifest.json` | yes | The manifest (§3), UTF-8 JSON. |
| `packages/<type>/<name>/<file>` | no | The saved packages the deck uses (§4). |

A writer MUST store `deck.md` byte for byte: no normalized line endings, no added or removed
trailing newline. A reader returns those bytes as the deck. A writer SHOULD write the entries in the
order above and sort each package's files by name, so one deck written twice produces the same
bytes. A reader MUST ignore any other entry.

## 3. The manifest

```json
{
  "format": "lattice",
  "version": 1,
  "title": "Q3 board review",
  "engine": "lattice",
  "generatedAt": 1791489550723,
  "comments": [
    { "id": "c1", "slide": 2, "author": "Ada", "body": "Check this figure", "createdAt": 1791489550000, "resolved": false }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `format` | `"lattice"` | Required. A reader refuses a file whose manifest lacks it. |
| `version` | integer ≥ 1 | Required. The manifest's version; this spec is `1`. |
| `title` | string | The deck's title, for a library listing and export file names. |
| `engine` | `"lattice"` | The renderer the deck was written for. |
| `generatedAt` | number | When the file was written, in milliseconds since the Unix epoch; `0` when not stamped. |
| `comments` | array | The review comments, each anchored to a slide. |

A **comment** is `{ id, slide, author, body, createdAt, resolved }`: a string id unique within the
file, the 1-based number of the slide it is anchored to, a free-text author label (not an identity),
the comment text, when it was made (milliseconds since the epoch), and whether it is resolved.

A reader treats a field it does not know as absent, and keeps going.

## 4. Packages

A deck can use saved packages: a theme, a component, a finish, a motion scene. A writer copies each
one the deck uses into `packages/<type>/<name>/`, with the package's own files beneath it, so the
deck renders on a machine that does not have them. A theme package's CSS is a theme file under
`spec/THEME-1.0.md`.

The layout of a package's own files is the Lattice package format, which is an internal contract
(spec audit §8.1), not part of this spec. So a reader that does not understand packages MAY ignore
the `packages/` folder, and MUST still open the deck. A reader that does read them MUST run each one
through the same checks it runs on any package from outside, and MUST still open the deck when it
refuses one.

## 5. What a reader checks

A `.lattice` file is a file from anyone. Before it trusts any part of one, a reader MUST:

1. **Refuse an archive that is too large** before inflating it. The reference reader refuses an
   archive over 25 MiB, a total declared inflated size over 64 MiB, and more than 2,000 entries; it
   also stops reading at the chunk that crosses 64 MiB, so an entry that understates its size cannot
   inflate past the cap. A reader MAY choose other limits; it MUST have some.
2. **Refuse a file missing `deck.md` or `manifest.json`.**
3. **Refuse a manifest that does not parse, has no `"format": "lattice"`, or has a `version` that is
   not a whole number of at least 1.**
4. **Refuse a `version` newer than it reads,** with a message that says a newer reader is needed,
   rather than half-reading it.
5. **Clamp the title** to one line (collapse whitespace) and a sane length; the reference reader
   keeps 120 characters and uses `Untitled deck` when nothing is left.
6. **Treat each comment as untrusted** data: check its shape before storing or showing it, and never
   render its text as markup.

## 6. Conformance

A **writer** is conformant when every file it writes has the two required entries, a manifest that
§3 describes, and the deck's source byte for byte. A **reader** is conformant when it opens every
conformant file, returns the source byte for byte with the manifest's fields, and refuses every file
§5 says to refuse. The shared test cases describe archives entry by entry and say what a reader must
return or refuse.

## 7. Versioning

The manifest's `version` is the file's version.

- **A new version (2):** removing or renaming an entry or a field, changing what one means, or making
  an optional one required. A version-1 reader refuses the file (§5.4).
- **The same version:** adding an optional field or entry. A version-1 reader ignores it.

## 8. Non-goals

- **The re-openable export.** A PDF or PowerPoint can carry a whole `.lattice` inside it
  (`deck.lattice`, attached to the PDF; the `lattice/deck.lattice` part in a `.pptx`), so the person
  it was sent to can edit the deck. That placement is an internal contract (spec audit §8.1),
  recorded in `engineering/decisions/2026-10-05-reopenable-exports.md`; the payload it carries is a
  file under this spec.
- **Identity.** A comment's `author` is a label anyone can type.

## 9. Change log

| Version | Date | Change |
|---|---|---|
| 1 | 2026-10-08 | First version, written from the reference implementation (spec audit §8.1), which has written manifest version 1 since 2026-06-16 (`engineering/decisions/2026-06-16-lattice-export-format.md`). Waits on the owner's sign-off. |
