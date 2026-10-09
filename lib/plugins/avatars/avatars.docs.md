# avatars

Drawn stand-in portraits, written in inline code like an icon:

```markdown
Our sponsor `!{Ada Okafor}` clears blockers above the program.

- Ada Okafor
  - `!{Ada Okafor, hair=coily, skin=6, glasses=round}`
  - `Executive Sponsor`
```

The first line draws a head-and-shoulders avatar the size of the words around it. The second
makes it a team-profile portrait. Design: `engineering/decisions/2026-10-09-inline-avatars.md`.

This is a **plugin** (`engineering/decisions/2026-09-27-plugin-system.md`). It is on by default.
Its drawings load only for a deck that writes an avatar, so a deck without one pays nothing.

## The name picks the face

The person's name comes first, and it is the only thing an avatar needs. **Every trait you do not
write is chosen by the name**, so `!{Ada Okafor}` is the same face on every render, on every
surface, and in every copy of the deck. Case and spacing do not matter: `!{ada  okafor}` is the
same face. Nothing is random.

Write only the traits you care about, and the name fills in the rest:

```markdown
`!{Ada Okafor}`                                  the name alone: a whole face
`!{Ada Okafor, hair=coily, skin=6}`              those two pinned, the rest from the name
`!{Ada Okafor, glasses=round, c3, lg, rounded}`  a trait, then the tile's color, size and shape
```

To keep a face you like when you later rename someone, copy its traits: the rendered avatar
carries them in `data-traits` (the Studio's inspector shows it), written as the notation.

## Traits — `key=value`

A trait is always written by name, because its values overlap: `round` is a face, an eye and a
pair of glasses.

| trait | values |
|---|---|
| `skin` | `1` (lightest) … `8` (deepest) |
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

**Skin, hair, eyes and clothes keep their colors in every theme**, the way a photograph does. A
person's skin does not change when the deck switches palette.

## `gender=` — a preset, not a lock

`gender=woman`, `gender=man` or `gender=neutral` (the default) changes which hair, beard and brows
the name picks from. It never limits what you can write: `!{Sam Lee, gender=man, hair=long}` has
long hair, and `!{Ada Okafor, beard=full}` has a beard. Every trait you write wins over the
preset.

## The tile — bare words

| word | what it does | default |
|---|---|---|
| `c1` … `c12` | the tile's color, the same cycle sparks and charts use | picked by the name from `c1`–`c8` |
| `sm` `md` `lg` `xl` | the size: 1.1, 1.45, 2.4 and 4 times the text; `sm` and `md` sit inside a line of text, `lg` and `xl` stand beside it | `md` |
| `circle` `rounded` `square` | the tile's shape | `circle` |
| `framed` `bare` | a pale tile behind the person, or the bust alone | `framed` |
| `border=c1` … `border=c12` | a ring in that color's ink | no ring |
| `label="…"` | what a screen reader says, when the name is not right | the name |

The tile is a pale tint of its color over white, in light and dark mode alike, so the clothes
never sink into a dark ground.

## The deck and the slide: `avatar:` and `avatar-*`

```yaml
avatar: rounded bare
```

The `avatar:` register styles every avatar on the deck, one word per axis (shape, frame). A slide
overrides it with its own class (`<!-- _class: avatar-square -->`), on that axis only, and an
avatar's own word wins over both.

## In a team-profile roster

Write the avatar where the photo goes. It becomes the portrait, takes the roster's own size and
shape, and mixes freely with real photos and monograms:

```markdown
<!-- _class: team-profile -->

## The account team

- Ada Okafor
  - `!{Ada Okafor, hair=coily, skin=6}`
  - `Executive Sponsor`
- Marcus Vale
  - ![](marcus.jpg)
  - `Chief Financial Officer`
- Hana Suzuki
  - `Field Reliability Engineer`
```

Ada gets an avatar, Marcus his photo and Hana a monogram. The name is beside the face, so the
portrait is hidden from screen readers there, as a photo's is. With the plugin off, an avatar line
becomes a monogram, never the person's role.

## Accessibility

An inline avatar is an image with a name (`role="img"`, `aria-label` the person's name or your
`label=`), so a reader hears the name where the face stands. Inside a team-profile portrait it is
hidden, because the name is right beside it.

## What stays literal

A span that opens with `!{` and does not read stays code, and nothing is guessed: a value a trait
does not have (`skin=9`, `hair=mohawk`), a word that is not a tile word, or no name. `lint:deck`
warns with the reason and the values the trait does take. `\!{Ada}` shows the notation itself.

## Where it renders

The engine draws avatars at parse time, as it draws icons, so the CLI's PDF and HTML exports, the
Studio and the player agree. In the Studio the drawings arrive as their own script
(`lattice-plugin-avatars.js`) before the first render of a deck that writes an avatar; until they
arrive an avatar stays code as written. On a raw Marp render (an Export-to-Marp bundle), the
runtime fetches the same script from beside itself and draws.

## Anti-patterns

- **An avatar for a real person who has a photo.** An avatar is a stand-in for the photo you do
  not have yet, or for a fictional persona. Use the photo when there is one.
- **Traits as a caricature.** The traits describe a face; they are not a way to make a point about
  someone. Write the few that make the person recognizable and let the name do the rest.
- **A row of avatars with no names.** The face is not the label: write the name beside it.
