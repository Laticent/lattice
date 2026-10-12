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
4. **v1 is the core set.** Twelve traits and the team-profile integration. Earrings, head coverings and
   clothing style followed as v2 (§ 11); age cues, freckles and expression are still open (§ 10).

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
| `avatars.vocab.generated.js` (2.7 KB) | trait names and options, presets, pools | always: the kernel requires it, so a span reads and lints the same everywhere |
| `avatars.data.generated.js` (26 KB) | the drawings and the colors | through `plugin-data.js`, only for a deck that writes `!{` |

The generator validates every node: one of six shape elements, geometry plus a short list of numeric and
keyword presentation attributes, and a PAINT that is a role (`$skin`, `$hair`, `$eye`, …) or `none`. No
literal color reaches a drawing; colors live only in the palettes, and the kernel is the one place that
resolves a role to one. Every option must have a drawing and every drawing an option.

## 7. The drawing and the tile

A 100-unit bust in the sample portraits' style, cropped to `14 14 72 72` so the face fills the tile. Layers
paint in a fixed order: back hair, clothing, mid hair (long hair over the shoulders), head covering (back),
face and ears, earrings, nose, beard, mouth, eyes, brows, front hair, head covering (front), glasses. Eyes have whites and a lid line: without them a dark iris
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

## 10. Still not drawn

Age cues, freckles, expression, and hair type as a trait separate from style. Each is a new key in
`traits.json` and a part set in `parts.json`; the generator's checks and the layer order already cover them.

## 11. v2: earrings, head coverings, clothing

Four traits, all **opt-in** so that no face drawn in v1 changes: `earrings` (`none` `stud` `hoop` `drop`),
`headwear` (`none` `hijab` `turban` `skullcap` `beanie` `kufi` `cap` `backcap`), `headwear-color` (the nine `top` colors) and `clothing` (`crew`
`vneck` `collar` `turtleneck` `hoodie` `blazer`). `earrings`, `headwear` and `clothing` each have a one-entry
pool (`none`, `none`, `crew`), so a name that writes none of them draws exactly what v1 drew. Measured: the
SVG of 1,200 default faces (400 names × 3 gender presets) is byte-identical before and after.

- **Two new layers.** A covering has a back layer (the hijab's drape, behind the face) and a front layer
  (the forehead band and the cheek panels of a hijab, a turban's wrap, a cap's dome and bill), drawn above
  front hair. `body` becomes `clothing.crew`; the neck and its chin shadow ship with every style.
- **Which hair a covering hides is data, not code**: `coverage` in `traits.json`, per covering and
  hairstyle. A hijab and a turban hide all hair. A skull cap, beanie, kufi and cap hide the front layer, and also the back layer for a
  bun, an afro and curls, whose volume would otherwise rise above the dome (seen on the contact sheet: curls
  puffed out above the cap until `curly` joined the rule). Long hair and locs keep their `mid` layer and still
  fall below a cap. A `backcap` is a fitted cap worn backwards, so it sits back on the crown and hides no front
  hair: only the back layer of a bun, an afro or curls (their volume rises above it). A first draw gave it a
  rear strap and the fringe-hiding rule of a forward cap; the owner pointed out that baseball caps are fitted
  and that a backwards one leaves the hairline showing, and both were wrong. The hair trait stays resolved and stamped on `data-traits`; only its drawing is skipped.
- **A covering is fitted to the face.** Every covering except the hijab is drawn once against an oval head,
  then stretched per face shape by `fit` in `traits.json`: across by `sx` about the centerline, and from the
  head's top to the brow line by `sy` about `anchor` (38). A round head (top y 30) gets a flatter dome
  (`sy` 0.86) and a long one (top y 26) a taller one (1.1). The kernel writes the `matrix(…)` as a
  `transform` attribute on each covering shape, so the data stays one drawing, not five. The owner saw the
  unfitted version and called it janky: the same dome floated off a round head and sat tight on a long one.
- **Earrings are keyed by face shape**, because the ears sit at a different x on each. The generator accepts
  one list for every face or one per face; the shipped drawings are per face, derived from each face's ear
  ellipses. A hijab covers the ears, so `hides-earrings` in `traits.json` skips the earring layer for it (the cheek
  panels alone left gold slivers at the cloth edge, found by the checker). Behind a bob the earring still
  shows at the hair's edge; that is left as drawn.
- **Two new paint roles**: `$cover` (the covering, resolved from `headwear-color` through the `top` palette,
  so no hex is duplicated) and `$metal` (one fixed gold for every earring).
- **Cost.** The drawings file grows from 13 KB to 26 KB raw, loaded only for a deck that writes `!{`; the
  always-loaded vocabulary grows from 2.3 KB to 2.7 KB raw.

