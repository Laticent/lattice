# meta

How a deck is read. `meta` is the plugin that owns the **slide-metadata vocabulary**: the keys an
author sets in an HTML comment on a slide, and the type of each.

```markdown
<!-- _class: cards -->
<!-- _footer: Q3 review -->
```

It draws nothing. It is a **data provider**: the build reads its manifest and writes
`lib/plugins/meta.generated.mjs`, and every reader of those comments (the engine, the linter, the
notes extractor, the editor's completion, the packaged slide facts) gets its key list from there
through `lib/core/meta-keys.mjs`. Before this plugin existed, five modules kept their own copy of
the list.

| | |
|---|---|
| You write | `<!-- _key: value -->` for this slide, `<!-- key: value -->` from here on |
| Front matter | the deck-only keys (`theme`, `size`, `lang`, `marp`) |
| Always on | the host refuses to switch it off, in a deck's `plugins:` list or a host setting |
| Other plugins | every `contributes.registers` joins the vocabulary and is listed by `META_REGISTERS` |
| Kernel | `lib/core/meta-record.mjs` (scan, read, write) and `lib/core/meta-keys.mjs` (the vocabulary) |
| Design | `engineering/decisions/2026-10-17-meta-record.md` |
| Fixtures | `meta.fixtures.md` |

## Fields

Each field declares a `type` (`text`, `enum`, `classes`, `css`, `url`, `steps`, `words`) and the
flags the readers need: `scope: "deck"` (written once at the top of the deck), `bare` (may be
written with no value), `local` (one of Marp's local directives), `applied` (written on the slide
as `data-<key>`), `customProp: false` (no `--<key>` property), and `complete` (offered when an
author types `<!-- _`). The manifest is the list; this page does not repeat it.

## Markers

A marker is a bare comment that carries no value. `stress-slide` marks a generated specimen slide
that the splitter leaves whole. A marker is tooling's, never a speaker note.

## Not yet

This plugin ships the vocabulary and the shared reader. The typed record
(`<!-- {layout=content} -->`) and the hook that compiles it are later steps of the design note
(§9, steps 2 to 7); until they land, only `<!-- key: value -->` comments are read.
