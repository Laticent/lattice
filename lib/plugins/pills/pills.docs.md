# pills

Shaped, colored labels written in inline code:

```markdown
1. Settlement engine
   - Shipped and load-tested `{STABLE, c2}`
2. Ledger migration
   - Cutover paused for review `{PARTIAL, c4}`
```

A label comes first, then shape, color and size words in any order: `{BETA, tag, c4}`. Each word can also
be written by name, `{BETA, shape=tag, color=c4}`. Design: `engineering/decisions/2026-10-17-pills-plugin.md`;
the notation is Segno's (`engineering/decisions/2026-09-28-segno-unified-inline-notation.md`).

This is an **embedded plugin**: part of how Lattice draws a slide, so it loads on every render and has no off
switch. No `plugins:` entry, host narrowing or `disabled` setting turns it off. The other classes of plugin
(essential, external) and what each can do are in `lib/plugins/README.md`.

## The author's contract

The full contract (shapes, the twelve color slots, sizes, quoting, what stays literal, the backslash escape and the
`inline-code: literal` switch) is the section **Inline pills — `{LABEL}`** in `lib/base/base.docs.md`. It moves into
this file in a later commit of the same change; until then that section is the source and this file points at it.

| You write | You get |
|---|---|
| `` `{LIVE}` `` | A capsule in the accent color |
| `` `{BETA, tag, c4}` `` | A sharp tag in categorical slot 4 |
| `` `{3, circle}` `` | A circular badge (one character, or a number up to two digits) |
| `` `{DECIDE, diamond}` `` | A diamond; `chevron-right` and `chevron-left` point |
| `` `{ok, icon=check}` `` | A pill with a drawn icon, when the icons plugin knows the name |
| `` `\{LIVE}` `` | The literal text `{LIVE}`, backslash removed |

Shapes: `pill` (the default), `chip`, `tag`, `tag-bordered`, `circle`, `chevron-right`, `chevron-left`, `diamond`.
Colors: `c1` to `c12`, ordinal slots and not color names. Sizes: `sm`, `md`, `lg`, though a pill sizes itself from
the text around it. The spellings `{x}`, `{-}`, `{/}` and `{ }` are reserved for the state marks and render as
literal text; `lint:deck` points at the bare `[x]` form.

## For components

A component never draws its own pill. It either has the author write one or translates its own content into one
through this plugin, and passes in only what it knows: `--lat-pill-edge`, `--lat-pill-bg`, `--lat-pill-ink` (color)
and `--lat-pill-scale` (size). The rules and the gate that holds them are in the design note, § 4.3 and § 4.4.

## Icons

A pill's `icon=` calls the icons plugin. Icons is an essential plugin, so a host can switch it off, and then a pill
shows its label alone. Pills list icons as `optional`, never `requires`: an embedded plugin may require only other
embedded plugins.
