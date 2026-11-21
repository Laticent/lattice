# meta

How a deck is read. `meta` is the plugin that owns the **slide-metadata vocabulary**: the fields an
author sets on a slide, and the type of each. A slide sets them in one **record** comment:

```markdown
<!-- {layout=cards, finish=ledger, footer="Q3 review"} -->
```

The older directive comments (`<!-- _class: cards -->`, `<!-- _footer: Q3 review -->`) are read too, until the cut
(design note §9 step 6).

It draws nothing. It is a **data provider**: the build reads its manifest and writes
`lib/plugins/meta.generated.mjs`, and every reader of those comments (the engine, the linter, the
notes extractor, the editor's completion, the packaged slide facts) gets its key list from there
through `lib/core/meta-keys.mjs`. Before this plugin existed, five modules kept their own copy of
the list.

| | |
|---|---|
| You write | `<!-- {field=value, …} -->` for this slide; add `carry` for "from here on" |
| Front matter | the deck-only keys (`theme`, `size`, `lang`, `marp`) |
| Always on | the host refuses to switch it off, in a deck's `plugins:` list or a host setting |
| Other plugins | every `contributes.registers` joins the vocabulary and is listed by `META_REGISTERS` |
| Kernel | `lib/core/meta-door.mjs` (read a record), `lib/core/meta-record.mjs` (scan), `lib/core/meta-edit.mjs` (the structured edit) and `lib/core/meta-keys.mjs` (the vocabulary) |
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

## Record fields

| Field | Takes | Writes |
|---|---|---|
| `layout`, `variant`, `universal`, `modifiers`, `class` | class words | the slide's class |
| `finish`, `headline`, `rule`, `eyebrow`, `spectrum`, `spectrum-edge`, `spectrum-card`, `spectrum-card-edge`, `spectrum-trim`, `lift`, `stamp`, `tone`, `corners` | the values its front-matter register takes | the word one slide would carry (`{headline=left}` is `head-left`; a default is its restore word, `{lift=off}` is `flat`). Derived from each register's resolver by `tools/lib/record-registers.js` |
| a plugin's register (`icon`, `spark`, …) | its axis words | `icon-bare`, `icon-etch`, …; `with-<key>` / `no-<key>` for a register with an on/off axis (`callout`) |
| every other field above, kebab-case (`focus-style`, `background-color`) | its type | the same `data-*` attribute its directive writes |
| `note`, `reader`, `say`, `describe` | text; a long one on `key: \|` lines | the note channels |
| `pane`, `panes` | a pane's component, a pane layout | the pane structure |

The linter reports what the engine drops from a record (`meta-record`); the editor completes fields after `<!-- {`
and values after `field=`; the Studio's drawer and note editors edit a record in place.

## Who writes the attributes (D11)

A provider declares typed fields; the host's apply step (`lattice_directives_apply`, `lib/engine/slides.js`) validates
and writes every `data-*` attribute. `checkProviderAttributeWriters` in `tools/check-ownership.js` holds the two likeliest
ways around it at zero: no file under `lib/` passes a computed `data-*` name to `attrSet` / `setAttribute` but the
allowlisted apply step, and no plugin writes a slide-metadata attribute by name. It is a tripwire, not a proof.
