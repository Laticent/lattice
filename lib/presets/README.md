# Deck presets — one folder each

A deck preset is a named bundle of registers a deck turns on with one line, `preset: <name>`. Each
preset is a folder here (decision S8, `engineering/decisions/2026-11-21-spectrum-keys.md`):

```
lib/presets/<name>/
  <name>.preset.json   label, desc, picker order, and the registers it sets (`values`)
  <name>.css           optional: the stylesheet for the `preset-<name>` class
```

`tools/build-packages-index.js` reads every `<name>.preset.json` into `presets.generated.js`, the table
`lib/core/front-matter-key.js` (`PRESETS`) and the Studio read. `tools/build-css.js` bundles every
`<name>.css` in name order, after the `typography:` sets and just before `base.sketch.css`. Adding the folder is the whole registration. No script writes a
preset's CSS.

## What the JSON may say

Exactly `name` (equal to the folder), `label`, `desc`, `group`, `order` (a unique integer: the picker
order) and `values`, a map from a preset key (`PRESET_KEYS` in `front-matter-key.js`) to the word a deck would
write. A key the deck writes itself always wins over the preset's value.

`group` puts the preset under one tab of the Studio's picker: `essentials` (the everyday looks) or
`signature` (the bolder named looks). The picker shows one group at a time, so a group may hold at most
five presets (decision D10 in `engineering/decisions/2026-11-20-deck-preset-study.md`); the generator
refuses a sixth. The groups and their labels live in `tools/build-packages-index.js` `PRESET_GROUPS`.

## What the stylesheet may say

A deck on any preset but `classic` stamps `preset-<name>` on every slide. The stylesheet styles that
class, and only with the **preset hooks**: custom properties no author key exposes, whose consumers read
them with today's value as the `var()` fallback (`lib/base/base.tokens.css` § PRESET HOOKS).

| Hook | What it sets |
|---|---|
| `--rule-w`, `--rule-style`, `--rule-mark` | the heading rule's weight, style and ink |
| `--rail-w` | the `card-spectrum:` stripe's thickness |
| `--radius-card` | a card's corner |
| `--heading-weight` | the weight of slide titles and the cover title (fallback `700`); a preset changes heading weight, never heading size |
| `--eyebrow-case`, `--eyebrow-tracking`, `--eyebrow-style`, `--eyebrow-weight` | the eyebrow's voice. Not fallback hooks: these are the type-set tokens `lib/base/base.typography.css` declares on `:root, section`, and a preset's value overrides its set's. `mode: sketch` still wins, because the preset sheets are bundled before `base.sketch.css` |

Every rule is a bare `section.preset-<name>` for the folder's own preset. Never a `--fs-*` size (HARD
RULE #4), a hex literal (#3), a margin (#20), `@layer` (#26) or `!important`.
`test/unit/core/preset-plumbing.test.js` holds every file to these rules.

## Specificity and order

`section.preset-<name>` is (0,1,1), the same as a register's class, and it is bundled after the
`typography:` sets, so a preset's value wins over its set's on source order. Prefer a register key over a
hook wherever one exists (Strategy House's thick card stripe is `card-spectrum: solid band`, not
`--rail-w`): a key the author writes overrides a preset's key, but nothing an author writes in front matter
overrides a hook. A deck's own `style:` block still wins over it, because theme and
deck sheets load after the engine bundle.
