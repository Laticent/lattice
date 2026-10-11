---
title: Avatars cheat sheet
description: Every avatar trait, tile word and setting on one page — the grammar, the values each trait takes, and what stays as code.
---

The syntax on one page. [Avatars](/guides/inline/avatars/) explains each part with live examples.

## The grammar

```
`!{NAME, tile words…, trait=value…}`      only the name is required; the rest in any order
```

- **The name comes first.** Any script. Quote it if it holds a comma: `` `!{"Okafor, Ada"}` ``.
- **Traits are `key=value`.** Every trait you leave out is chosen by the name, the same way every time.
- **Tile words are bare.** No `key=`, except `border=` and `label=`.

## Traits

| Trait | Values |
|---|---|
| `skin` | `1` `2` `3` `4` `5` `6` `7` `8` (lightest to deepest) |
| `hair` | `none` `buzz` `short` `side` `curly` `coily` `bob` `long` `bun` `locs` |
| `hair-color` | `black` `darkbrown` `brown` `auburn` `red` `blonde` `platinum` `gray` `white` |
| `face` | `oval` `round` `long` `square` `heart` |
| `eyes` | `round` `almond` `narrow` `smile` |
| `eye-color` | `brown` `dark` `hazel` `green` `blue` `gray` |
| `brows` | `soft` `straight` `arched` `thick` |
| `nose` | `button` `straight` `wide` `long` |
| `mouth` | `smile` `grin` `neutral` `smirk` |
| `beard` | `none` `stubble` `mustache` `goatee` `full` |
| `glasses` | `none` `round` `square` |
| `top` | `navy` `slate` `charcoal` `olive` `teal` `plum` `brick` `taupe` `cream` |
| `gender` | `neutral` (default) `woman` `man`: changes the defaults for hair, beard and brows; never a lock |

## The tile

| Word | Values | Default |
|---|---|---|
| color | `c1` … `c12` | picked by the name from `c1`–`c8` |
| size | `sm` `md` `lg` `xl` | `md` |
| shape | `circle` `rounded` `square` | `circle` |
| frame | `framed` `bare` | `framed` |
| ring | `border=c1` … `border=c12` | none |
| spoken name | `label="…"` | the name |

Deck-wide: `avatar: rounded bare` in the front matter. One slide: `<!-- _class: avatar-square -->`.
An avatar's own word wins over both.

## Examples

```markdown
`!{Ada Okafor}`                                        the name alone: a whole face
`!{Ada Okafor, hair=coily, skin=6}`                    two traits pinned
`!{Ada Okafor, glasses=round, c3, lg, rounded}`        a trait, then the tile
`!{Sam Lee, gender=man, hair=long}`                    a preset, overridden
`!{Ada Okafor, border=c4, label="Our sponsor"}`        a ring and a spoken name
`\!{Ada Okafor}`                                       shown as code, not drawn
```

## What stays as code

| You wrote | Why it stays code |
|---|---|
| `` `!{Ada, skin=9}` `` | `skin` takes `1`–`8` |
| `` `!{Ada, hair=mohawk}` `` | not a hairstyle in the set |
| `` `!{Ada, coily}` `` | a trait must be written by name: `hair=coily` |
| `` `!{hair=long}` `` | no name |
| `` `!{ Ada}` `` | the name must follow the brace directly |
| `` `\!{Ada}` `` | the backslash keeps it as code on purpose |

`lint:deck` warns about every one of these except the last, and says why.

## In a team-profile roster

| You wrote on the portrait line | You get |
|---|---|
| `` - `!{Ada}` `` | the avatar as the portrait |
| `` - `!{Ada}` `Sponsor` `` | the avatar, and `Sponsor` as the role |
| an avatar inside a note | the note, with the avatar where you wrote it |
| a broken avatar | the code you typed, as a note |
| an avatar with the plugin off | a monogram |
