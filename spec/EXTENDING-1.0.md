# How the Lattice specs version and extend

<!-- spec-parts
schema: none: this document states rules, not a file shape
reference: docs/src/lib/ltt/validate.ts lib/core/reopenable.js
tests: docs/src/lib/ltt/conformance/ spec/conformance/lattice-file/
-->

**Version:** 1.0 · **Status:** Draft, for the owner's sign-off · **Date:** 2026-11-27 · **Owner:** @saden1 ·
**License:** CC-BY-4.0

Every Lattice spec follows the seven rules on this page. Each spec cites this page and does not repeat it. A spec may
add a rule of its own; it may not weaken one of these. Design record:
`engineering/decisions/2026-11-27-specs-1-0.md`.

The specs this page governs: [LFM](./LFM-1.0.md) (what a deck means), [the Diagnostic Protocol](./diagnostics.md)
(what a finding looks like) and [LTT](./LTT-1.0.md) (when each word of a narration is spoken).
<!-- PENDING owner D6: THEME-1.0.md (what a theme supplies) and LATTICE-FILE-1.0.md (how a project is packed). -->

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Each spec has a closed core

A spec's **core** is the part every reader of that spec implements. The core changes only in a new major version
(§7). Anything a reader may skip is not core: it is a profile (§2) or a registry entry (§3).

## 2. Profiles are parts a reader opts into

A **profile** is a named, separately versioned part of a spec that a reader MAY implement. A reader states the core
and the profiles it implements, each with its version: "LFM 1.0 Core, Diagnostics 1.0". A profile MUST NOT change
what the core means; it only adds.

LFM 1.0 defines these profiles:

| Profile | What it adds | Who needs it |
|---|---|---|
| Core | the slide model, the `@meta` record, the four notes, the card grammar, state markers, fences as a rule | every reader |
| Presentation | the front-matter registers and the component and modifier vocabulary | a renderer that draws slides |
| Notation | the inline notation: pills, sparks, icons | a renderer that draws them |
| Lens | reader lenses: which slides an audience sees | a tool that projects a deck for an audience |
| Timing | how `@say` is voiced and timed, and the delivery keys; specified by LTT | a narrator or a video export |

A search indexer that implements LFM Core alone reads every slide, every record and every note correctly. It has
nothing to do with charts, themes or timing.

## 3. Vocabulary lives in registries

A **registry** is a JSON file, generated from the reference implementation and published with the spec, that lists
names a spec's grammar accepts: components, modifiers, record fields, registers and their words, fences, rule IDs,
theme tokens. A spec cites its registries and never copies their lists into its prose.

Every registry carries a `version`, and every entry carries:

| Field | Meaning |
|---|---|
| `since` | the registry version that added the entry |
| `deprecated` | absent, or the registry version that retired it |
| `replacement` | for a retired entry, the entry that replaces it, if one does |

Adding an entry is a registry minor version. Retiring one (`deprecated`) is a registry minor too: the entry stays
listed and a reader still knows it. Removing an entry from the list is a registry major. A spec's own version moves
only when its core or a profile's rules change, never because a registry grew.

## 4. Names outside the spec carry a prefix

A name with no prefix (`finish`, `@note`, `unknown-key`) is reserved for the spec and its registries. Anyone else
who adds a front-matter key, a record field, a note or a rule ID gives it a prefix that names its owner:

| Kind | Example |
|---|---|
| front-matter key | `acme.tally: 3` |
| `@meta` record field | `@meta{layout=cards, acme.tally=3}` |
| note | `@acme.recap{…}` |
| rule ID | `acme/tally-missing` |

The prefix is the name of the plugin that owns the name: `acme.tally` belongs to the plugin `acme`. A spec's own
registries never use a prefix.

The separator is `.` because `:` already separates a name from its value in front matter and in a record's block
lines. A prefixed name is otherwise an ordinary name: a letter, then letters, digits and hyphens, on each side of
the dot.

<!-- Not yet true of the reference implementation (Segno desk, 2026-11-27): Segno's name rule refuses a dot
(`isName`, docs/src/lib/segno/notation.ts:98, and schema.ts's fast bind), and only `@meta{` opens a record or a
note door (`isRecordOpener`, lib/core/meta-door.mjs:79). The LFM 1.0 PR does not ratify §4 until both accept it;
the Segno desk owns the first, the meta step E session the second. -->

### 4.1 A prefixed value is untrusted, and only a sanitizer lets it reach a rendered document

A prefixed value is text an author or a third party wrote, and a renderer MUST treat it as untrusted:

1. **Only its owner reads it.** A renderer hands a prefixed key's value to the plugin that owns the prefix and to no
   other code. With no such plugin loaded, the renderer ignores the value (§5).
2. **A renderer never reflects it raw.** A renderer MUST NOT write a prefixed value into the rendered document
   itself: not as markup, not inside a `<style>` element or a `style` attribute, not inside a script, not as a class
   or an element name. If a host puts one in an ordinary attribute value (a `data-` attribute, say), it MUST escape
   it for that attribute.
3. **The host sanitizes what a plugin returns, and the plugin cannot opt out.** A plugin MUST escape author text it
   writes into markup. Whatever markup or stylesheet text the plugin returns then passes through the host's markup
   sanitizer and its stylesheet sanitizer before it reaches the document. A document has two channels, markup and
   stylesheet, and each has its own sanitizer: a `</style>` inside stylesheet text ends the element and the rest
   parses as markup, so sanitizing the markup alone is not enough.
4. **Keeping it is not rendering it.** A writer keeps a prefixed value byte for byte in the source (§5). The
   sanitizer guards the rendered document, never the source.

*Informative.* In the reference implementation the two sanitizers are `sanitizeSlideHtml`
(`docs/src/lib/sanitize-slide-html.js`) and `sanitizeStyleText` (`lib/core/sanitize-style-text.mjs`). The rule that
every path into a rendered document goes through them is the project's HARD RULE #22, with its threat model in
`engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md` §5 and §9.

## 5. A reader ignores what it does not know

When a renderer meets a key, record field, register word, note name or fence it does not know, it MUST render the
document as if that thing were absent. It MUST NOT show it: an unknown note stays private, exactly as a plain comment
does.

A tool that writes a document back (an editor, an export, a migration) MUST keep every unknown key, field, note and
fence as it found it.

A linter SHOULD report an unknown name with no prefix (`unknown-key`, a warning), because that is how a misspelled key
(`finsh: halo`) is caught. It SHOULD NOT report a name with a prefix that a loaded plugin owns.

## 6. A document MAY state its version

A deck MAY state the LFM version it was written for in its front matter: `lfm: 1.0`. A file in a JSON format states
its version in the field that format defines (`version` in LTT and in a `.lattice` manifest). A deck that states no
version is read as LFM 1.0.

A reader MUST read a document of any minor version of a major version it implements, applying rule 5 to whatever it
does not know. A reader MUST refuse a document of a major version it does not implement, with a message that says a
newer reader is needed, rather than render it wrong.

## 7. What each version may change

| Version | May change |
|---|---|
| Patch (1.0.1) | wording that does not change what a conforming reader does |
| Minor (1.1) | add an optional construct, a profile or a rule to a profile |
| Major (2.0) | change the core, remove a construct, or make an optional construct required |

Every construct a minor version adds to LFM still needs its row in the degradation table: what a reader that knows
nothing of Lattice shows (LFM §5).

## 8. Change log

| Version | Date | Change |
|---|---|---|
| 1.0 (draft) | 2026-11-27 | First version, from the specs-1-0 decision. LTT's version rule, generalized to every spec. |
