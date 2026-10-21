---
kind: plugin
name: Avatars
order: 6
promise: Type a name; get the same friendly portrait, every time.
intro: Write `!{Ada Okafor}` and Lattice draws a head-and-shoulders portrait. The name alone picks every trait, so it's the same face on every render and every copy of the deck. Pin the few traits you care about, and drop it onto a team slide where the photo would go.
useWhen: A team, persona or customer slide needs faces before anyone has sent headshots — or for people who are fictional by design.
syntax: '`!{Ada Okafor}`'
facts:
  - { k: You write, v: '`!{name}` in inline code' }
  - { k: Draws with, v: Lattice's own drawings }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: By default; free until a deck uses one }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/avatars/avatars.docs.md
    note: All sixteen traits and their values, sizes, shapes and the team-slide rules.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/avatars/avatars.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/avatars.md
    note: Avatars inline, on a team slide, and with every trait pinned.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-09-inline-avatars.md
    note: The design note — including what avatars are deliberately not for.
examples:
  - key: team
    label: A team slide
    caption: On a team slide, an avatar takes the photo's place. A person with no photo or avatar gets their initials.
    sample: |
      <!-- _class: team-profile -->

      ## The account team

      - Ada Okafor
        - `!{Ada Okafor, hair=coily, skin=6}`
        - `Executive Sponsor`
      - Amina Yusuf
        - `!{Amina Yusuf, headwear=hijab, headwear-color=plum}`
        - `Program Director`
      - Rohan Mehta
        - `!{Rohan Mehta, headwear=turban, headwear-color=olive}`
        - `Solutions Architect`
      - Hana Suzuki
        - `Field Reliability Engineer`
  - key: inline
    label: In a sentence
    caption: An avatar goes wherever inline code goes, at the size of the text.
    sample: |
      ## Who owns what this quarter.

      Our sponsor `!{Ada Okafor}` Ada clears blockers, and `!{Marcus Vale}` Marcus runs the weekly review.
  - key: traits
    label: Pin a trait
    caption: The name picks every trait you don't write. Pin one and the rest stay put.
    sample: |
      ## Pin a trait; keep the rest.

      - `!{Ada Okafor, lg}` the name alone
      - `!{Ada Okafor, glasses=round, c3, lg, rounded}` glasses, a teal tile, rounded corners
      - `!{Ada Okafor, earrings=hoop, clothing=blazer, lg}` dressed for the board
---

## The problem

A pitch deck, an account plan or a research readout often needs a team or persona slide before anyone has supplied a headshot. The usual stand-ins don't work:

- **Gray silhouettes** look unfinished.
- **Stock photos** look fake, don't match each other, and suggest a real person who isn't there.
- **Initials alone** are fine for a few people, and flat for a whole roster.

What you want is a friendly, consistent portrait that's clearly a stand-in — and that stays the same every time the deck is rendered.

## The idea

- **The name picks the face.** `` `!{Ada Okafor}` `` turns the name into a set of traits — skin, hair, eyes, glasses and so on — the same way every time. So Ada looks the same in today's PDF, next month's export and a colleague's copy.
- **Pin what matters.** Write a trait and it wins: `` `!{Ada Okafor, hair=coily, glasses=round}` ``. Everything you don't write is still chosen by the name, so pinning one trait doesn't reshuffle the rest.
- **Sixteen traits.** Skin, hair, hair color, face, eyes, eye color, brows, nose, mouth, beard, glasses, earrings, clothing style and its color, and opt-in head coverings, such as a hijab or a turban, with their color.
- **People keep their colors.** Skin, hair and clothes stay the same in every theme, the way a photo does. Only the tile behind takes the deck's palette.
- **It mixes with real photos.** On a team slide, one person can have a photo, the next an avatar, and the third their initials.

## How to use it

Avatars are on in every deck. Write one in inline code:

```markdown
Our sponsor `!{Ada Okafor}` clears blockers.
```

Pin traits with `key=value`, then style the tile with words:

```markdown
`!{Ada Okafor, hair=coily, skin=6}`
`!{Ada Okafor, glasses=round, c3, lg, rounded}`
`!{Amina Yusuf, headwear=hijab, headwear-color=plum}`
```

| Word | Does |
| --- | --- |
| `c1` … `c12` | The tile's color, from the deck's chart palette |
| `sm`, `md`, `lg`, `xl` | Size, relative to the text |
| `circle`, `rounded`, `square` | The tile's shape |
| `framed`, `bare` | A tile behind the portrait, or none |
| `label="…"` | What a screen reader says (the name, by default) |

On a team slide, put the avatar on the line where a photo would go:

```markdown
<!-- _class: team-profile -->

## The account team

- Ada Okafor
  - `!{Ada Okafor, hair=coily, skin=6}`
  - `Executive Sponsor`
```

If you rename someone later and want to keep their face, the Studio's inspector shows the full trait set an avatar was drawn with, ready to copy.

## Where else it fits

Generated faces suit any material that needs people who are placeholders or fictional: user personas in research and product decks, team pages in a pitch before the headshots arrive, characters in training scenarios and case studies, and account maps in sales plans. The drawings are made in the deck itself, so they work offline and never call an outside service.

## How Lattice uses it

No slide type requires the plugin. The `team-profile` slide is designed to use it: an avatar alone on the photo line becomes that person's portrait, at the roster's size and shape. Screen readers hear the person's name once, not twice — the portrait is hidden from them when the name sits beside it.

## What it doesn't do

- **It isn't for real people who have a photo.** Use the photo. Avatars are stand-ins, not likenesses of anyone.
- **It doesn't guess.** A value that doesn't exist, like `skin=9`, leaves the span as code, and the deck linter lists the valid values.
- **A fixed set of parts.** Sixteen traits, a handful of values each. No photo import, no custom drawings.
- **PowerPoint gets a picture.** The PowerPoint export is an image per slide.
