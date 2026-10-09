---
status: shipped
summary: >
  Avatars join sparks and icons as a fourth thing an author writes in inline code: `!{Ada Okafor}` draws a
  head-and-shoulders stand-in portrait whose every unwritten trait is picked by a hash of the name, so it is the
  same face on every render, and `!{Ada Okafor, hair=coily, glasses=round, c3}` pins the traits that matter. Twelve
  traits, a `gender=` preset of defaults (never a lock), a tile in the deck's chart colors, and an `avatar:`
  register. In a team-profile roster an avatar is the portrait. It ships as a plugin (`lib/plugins/avatars/`), so
  a deck with none loads none. The tag is `!`, not the `@` first chosen, because journey's bare `@actor` span
  needs `@` to start a plain word.
---

# Avatars — a drawn face for everyone who has no photo

**Date:** 2026-10-09 · **Status:** shipped (v1); § 10 lists what is next.
**Follows:** `2026-09-29-inline-icons.md` (the model this copies, plugin and all),
`2026-09-28-segno-unified-inline-notation.md` (the notation), `2026-09-27-plugin-system.md` (the package)
**Related:** `2026-10-07-sample-images.md` (the eight hand-drawn sample portraits these sit beside)

## 1. What an avatar is, in one example

```markdown
Our sponsor `!{Ada Okafor}` clears blockers.

- Ada Okafor
  - `!{Ada Okafor, hair=coily, skin=6, glasses=round}`
  - `Executive Sponsor`
```

The first line draws a face the size of the words. The second is a team-profile portrait.

## 2. The problem

`team-profile` shipped with eight sample portraits (`lib/samples/portrait-*.svg`), each written by hand
as a ~600-byte SVG, with no generator. An author who wanted a ninth face, or a face that looked like
anyone in particular, had no way to make one. Anyone without a photo got a monogram, which is right for
a missing photo and wrong for a persona deck, a fictional case study or a template where faces are the
point.

## 3. Decisions

The owner settled four in one round (2026-10-09):

1. **A plugin, written in inline code like sparks and icons.** Not a component: an avatar goes wherever a
   word can, and a team-profile roster is one place among several.
2. **The tag character is `!`.** `@` was the first pick, and it collides: journey writes an actor as a
   bare `` `@sales` `` span (127 uses across the decks and docs), and Segno reads a tag character at the
   start of a span as opening a record, always (that is what keeps the grammar LL(1), meaning it decides
   with one character of lookahead). Keeping `@` meant a two-character lookahead in a published parser. The
   measured alternatives: 30 existing spans start with `!` and 4 with `&`, and none of either is read as
   notation, so they render exactly as before. `!` won because it echoes Markdown's `![…]` image syntax.
   This amends `2026-05-11-inline-code-directives.md`, which forbade `!` as a SIGIL because inline code
   starts with `!important`: a tag means something only directly before `{`, so that span is untouched.
3. **`gender=` is a preset of defaults, never a lock.** It changes which pools hair, beard and brows are
   drawn from. Every trait an author writes wins, so any combination is expressible.
4. **v1 is the core set.** Twelve traits and the team-profile integration. Earrings, head coverings,
   clothing style, age cues, freckles and expression are a second PR (§ 10).

## 4. The notation

`!{name, words…, key=value…}`, read by one Segno slot (`avatars.inline.js` `SPEC`):

- **The name is first and required.** Any script; quote it if it holds a comma.
- **Tile words are bare**, because none collides: `c1`…`c12`, `sm` `md` `lg` `xl`,
  `circle` `rounded` `square`, `framed` `bare`.
- **Traits are always `key=value`**, because their values overlap: `round` is a face, an eye shape and a
  pair of glasses. Segno's own diagnostics then name the trait and list its values on a typo.

An attempt is `!{` followed by anything but a space, `}` or `\`. Before this plugin no deck wrote `!{`,
so the gate can be looser than the icon's (which must step around TeX's `^{2}`).

## 5. The name picks the face

Every trait not written is drawn from its pool by FNV-1a of `trait + NUL + name`, finished with murmur3's
fmix32, the name lower-cased,
trimmed, space-collapsed and NFC-normalized. So the face is stable across renders, surfaces and
copies, and independent per trait: pinning `hair=` does not reshuffle the eyes. **The finalizer is
load-bearing.** Bare FNV-1a's low bits depend only on its input's low bits, and every key ends in the same
name, so every 8-entry pool landed on the same index: the tile color equaled the skin tone for 2000 of 2000
names, and skin fixed the top and the nose. With fmix32 every pairing occurs. Pools are weighted by
repetition (`traits.json` `pools`), and the deeper skin tones (5–8) draw hair color from a pool without
blonde or red, so a default is never a rare pairing. A written value always wins.

The resolved traits are stamped on the render as `data-traits`, written as the notation, so an author can
pin a face before renaming someone.

## 6. The data

Two sources in `lib/plugins/_avatars-source/`, one generator (`tools/build-avatars-data.js`), two outputs:

| file | holds | loaded |
|---|---|---|
| `avatars.vocab.generated.js` (2 KB) | trait names and options, presets, pools | always: the kernel requires it, so a span reads and lints the same everywhere |
| `avatars.data.generated.js` (13 KB) | the drawings and the colors | through `plugin-data.js`, only for a deck that writes `!{` |

The generator validates every node: one of six shape elements, geometry plus a short list of numeric and
keyword presentation attributes, and a PAINT that is a role (`$skin`, `$hair`, `$eye`, …) or `none`. No
literal color reaches a drawing; colors live only in the palettes, and the kernel is the one place that
resolves a role to one. Every option must have a drawing and every drawing an option.

## 7. The drawing and the tile

A 100-unit bust in the sample portraits' style, cropped to `14 14 72 72` so the face fills the tile. Layers
paint in a fixed order: back hair, body, mid hair (long hair over the shoulders), face and ears, nose,
beard, mouth, eyes, brows, front hair, glasses. Eyes have whites and a lid line: without them a dark iris
vanished on skin tones 7 and 8 (caught on the rendered contact sheet).

**The face is identity; the tile is the deck's.** Skin, hair, eyes and clothes are fixed colors, like a
photograph's, and do not follow the theme. The tile is a pale tint of a chart color slot over white in both
modes: a dark tile in dark mode sank navy and charcoal clothes into the ground. The ring (`border=cN`) is
the slot's `--cat-N-mark`, the graphical token team-profile's monogram ring uses.

The SVG root sets `stroke: none`. `stroke` inherits, and a team-profile figure passed one down: every shape
of the face rendered traced in the theme's ink. A node's own `stroke` attribute still wins.

## 8. Accessibility

An inline avatar is `role="img"` with the name (or `label=`) as its accessible name. In a team-profile
portrait the name is beside it, so the transform drops the role and name and sets `aria-hidden`, as a
photo's empty `alt` does.

## 9. team-profile

`team-profile.transform.js` takes a drawn avatar as the portrait, the same way it takes an `<img>`, but
only when it stands ALONE on its line or beside the one role. An avatar anywhere else (a note that
mentions someone, two faces on one line, a second portrait) makes the line a note, avatars and all, so
nothing the author wrote is dropped. A drawn avatar counts as a face for the roster's "nobody has a photo"
test, so monograms beside it stay quiet.

A `!{…}` the plugin did NOT draw is sorted three ways, through the plugin's services (`reads`, `pending`)
so the component never imports the plugin:

| case | what the author sees |
|---|---|
| the plugin is off (the engine marks the span) | a monogram: a missing portrait, never `!{Ada}` printed as the role |
| valid, drawings not here yet | a monogram on the engine path; on the runtime path the roster WAITS |
| broken (`hair=nope`) | the span stays literal as a note, so `lint:deck`'s "renders as code" is true |

**The runtime path waits** because its transform pass runs before its data fetch lands: rebuilding then
would make the person a monogram for good, since the rebuilt roster has no `!{…}` left to draw and the
idempotence guard refuses a second rebuild. The fetch re-runs the pass when it lands, and when it fails
it marks the failure (`plugin-data.js` `markDataFailed`) first, so the roster stops waiting.

The portrait's attributes are rewritten QUOTE-AWARE. A `[^>]*` match broke on the runtime path, where
the section is re-serialized and a serializer may leave a raw `>` inside an attribute value: a name of
`A>B <img src=x onerror=…>` came out as a live `<img>` (the HARD RULE #22 shape). The checker found this,
the trait correlation in § 5 and the dropped notes above; each is pinned in
`test/unit/plugins/avatars.test.js` against the input that reproduced it.

## 10. Not in v1

Earrings, head coverings (hijab, turban, cap), clothing style, age cues, freckles, expression and hair
type as a trait separate from style. Each is a new key in `traits.json` and a part set in `parts.json`;
the generator's checks and the layer order already cover them. Head coverings need a layer above front
hair and a rule for which hairstyles they hide.
