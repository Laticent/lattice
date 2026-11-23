# closing

> Final slide. Dark canvas mirror of title.

**Function** anchor · **Form** bookend · **Substance** prose

**Tags** `summary` · `takeaway` · `board-deck`

Last slide of every deck. Restates the takeaway or call-to-action. Drops the page number and keeps the deck's header and footer, by the anchor-chrome rule (engineering/decisions/2026-11-08-anchor-chrome.md) — the dark canvas signals "we're done." Add `spectrum` (mirrors `title`'s) when the deck itself is built on a multi-step color story worth echoing on the way out. The deck's `cover: light` register repaints the front and back cover together on the deck's light canvas, in both color modes (`cover-light`; a slide opts out with `cover-inverse`). `light` alone sets a scheme and keeps the dark panel (lib/base/base.registers.docs.md § cover). Seven cover compositions (`cover-masthead`, `cover-ledger`, `cover-column`, `cover-label`, `cover-stage`, `cover-frame`, `cover-poster`) set how the heading block sits; the deck writes one with the same register's second word (`cover: light column`) so both covers match, and `cover-plain` keeps one slide centered. A `cover-stage` or `cover-poster` heading holds about 60 characters; a longer one grows down from the top of the frame and overflows at the foot.

## Agent contract

**By venue** no count budget. A bookend: one heading and a line or two, with no repeated element to count.

### Slots

| Slot | Write | Required | Description |
|---|---|---|---|
| `heading` | a `# ` heading or a `## ` heading | yes | Closing line — takeaway, thank-you, or call to action. Capped at `--measure-bookend-heading` (16em ≈ 33 characters), mirroring title; `text-wrap: balance` evens the lines. Override the token in front-matter `style:` — never hand-break with `<br>`. |
| `eyebrow` | a line of `inline code` | no | Optional category label. |
| `subtitle` | a paragraph | no | Optional supporting line. Capped at `--measure-bookend-lede` (26em ≈ 56 characters) — a reading measure, so a two-clause sign-off holds together instead of running the frame's ~90 characters. A trailing list's rows take the same measure. |

### Variant decision rule

- **default (no modifier).** A single-sentence takeaway or call-to-action closes the deck — the common case.
- **`qr`.** The audience should leave with a scannable link (docs URL, contact card) rather than just a text call-to-action.
- **`index`.** The closing is a reference/see-also list of multiple next steps or resources, not a single takeaway sentence.
- **`spectrum`.** `title` also carries `spectrum` — closes the bookend pair with the same generated gradient bar, echoing the deck's own multi-step color story one last time.
- **`cover-masthead`.** A heavy rule over the title, set left: the editorial cover. Usually set deck-wide with `cover: masthead`, so the front cover matches.
- **`cover-ledger`.** A small-caps title over a double rule: the annual-report cover. Usually set deck-wide with `cover: ledger`, so the front cover matches.
- **`cover-column`.** An accent column at the right edge, clear of the chrome bands; the title is set left and wraps short of it. Usually set deck-wide with `cover: column`, so the front cover matches.
- **`cover-label`.** A gallery wall label: the title in the slide-title size, low on the left, under a hairline, with a quiet caption. Usually set deck-wide with `cover: label`, so the front cover matches.
- **`cover-stage`.** The title at stage size, centered: the display role, for a keynote room. Usually set deck-wide with `cover: stage`, so the front cover matches.
- **`cover-frame`.** The title boxed in a keyline that follows the preset's rule weight and style. Usually set deck-wide with `cover: frame`, so the front cover matches.
- **`cover-poster`.** A giant title set left, heavy and tight: the poster cover. Usually set deck-wide with `cover: poster`, so the front cover matches.

### Common mistakes

- **Eyebrow written as bold or plain text instead of inline code.** The eyebrow match is `h2 + p:has(> code:only-child)` — wrap it in backticks immediately after the heading; without the code span it falls through to the general italic subtitle rule instead of the eyebrow lifted above the heading.
- **The subtitle paragraph is authored before the eyebrow paragraph instead of after it.** The eyebrow match is an immediate-next-ELEMENT-sibling selector (`h2 + p:has(> code:only-child)`) — keep the source order heading → eyebrow → subtitle.
- **In the `index` variant, the leading reference key isn't wrapped in inline code, e.g. `docs — the component catalog` instead of leading with a backtick-wrapped key.** The `index` variant's mono reference-key styling (`section.closing.index :is(ul,ol) li code`) only applies to an actual `<code>` element — wrap the leading key in backticks so it renders as a mono chip, not plain text.

## When to use

- **Last slide of every deck.** Closes the bookend pair with title. Restates the takeaway, the call to action, or the next-steps line. The dark canvas tells the audience visually that the presentation is over.
- **Single takeaway line.** The h2 is the slide. Keep it to one editorial line that summarizes the whole deck or names the action the audience should take. The eyebrow can carry a sub-line or link.
- **Accent modifier for emphasis.** Pair with the universal `accent` modifier to recolor the focal heading. Useful when the closing line is a quote or a key decision the deck has been building toward.

## When NOT to use

- **Multi-line heading.** Keep the closing line to one editorial sentence. The layout is centered and large — two-line closings get cramped and lose impact.
- **Header or footer overrides.** Don't blank the footer with `_footer: ''` on the closing: it is the deck's standing note (a "Confidential", a copyright), and the last slide is often the one left on screen. Drop it on purpose with `no-footer`, or every band with `silent`.
- **Mid-deck closing.** If the audience needs a strong statement mid-deck, use `big-number` or `content` with the `dark` modifier. Reserving closing for the final slide preserves its bookend role.

## Authoring

```markdown
<!-- _class: closing -->

## Closing takeaway or call to action

`Optional eyebrow`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│                                         │
│                 CLOSING                 │
│                                         │
│             Take this away              │
│                                         │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `qr` — qr

Scan to take the deck with you.

```markdown
<!-- _class: closing qr -->

`closing qr`

## Leave a scannable takeaway behind.

The payload bullet renders as a QR code sized for the back row.

- https://laticent.io/components/closing
- Scan to open `caption`
```

### `index` — index

Ends on a reference list — see also, next steps.

```markdown
<!-- _class: closing silent index -->

## Where to go next.

`Next steps`

- `docs` — the component catalog and authoring contracts
- `gallery` — every layout rendered in light and dark
- `studio` — compose and preview a deck in the browser
```

### `spectrum` — spectrum

Mirrors title's generated gradient bar — the deck's color story, one last time.

```markdown
<!-- _class: closing silent spectrum -->

## The closing echoes the same six-step spectrum.

`Closing · spectrum`
```

### `cover-masthead` — cover-masthead

A heavy rule over the title, set left.

```markdown
<!-- _class: closing silent cover-masthead -->

## The back cover composes as a masthead.

`anchor · closing · cover-masthead`
```

### `cover-ledger` — cover-ledger

A small-caps title over a double rule.

```markdown
<!-- _class: closing silent cover-ledger -->

## The back cover composes as a ledger.

`anchor · closing · cover-ledger`
```

### `cover-column` — cover-column

An accent column at the right edge, the title set left.

```markdown
<!-- _class: closing silent cover-column -->

## The back cover composes as a column.

`anchor · closing · cover-column`
```

### `cover-label` — cover-label

A gallery wall label: a smaller title low on the left under a hairline.

```markdown
<!-- _class: closing silent cover-label -->

## The back cover composes as a label.

`anchor · closing · cover-label`
```

### `cover-stage` — cover-stage

A stage-size centered title.

```markdown
<!-- _class: closing silent cover-stage -->

## Thank you.

`anchor · closing · cover-stage`
```

### `cover-frame` — cover-frame

The title boxed in a keyline.

```markdown
<!-- _class: closing silent cover-frame -->

## The back cover composes as a frame.

`anchor · closing · cover-frame`
```

### `cover-poster` — cover-poster

A giant title set left.

```markdown
<!-- _class: closing silent cover-poster -->

## Make it yours.

`anchor · closing · cover-poster`
```

## Universal modifiers

Universal modifiers (`dark`, `compact`, `accent`, state markers, treatments) compose onto this component's class. Every one, by group, is in [the base modifier reference](../../../base/base.modifiers.docs.md), generated from `lib/base/base.manifest.json`.

## Related components

- [`title`](../../anchor/title/title.docs.md) — opens the deck — same dark-bookend chrome
- [`divider`](../../anchor/divider/divider.docs.md) — mid-deck section breaks — same dark canvas
- [`big-number`](../../statement/big-number/big-number.docs.md) — single emphatic statement mid-deck without the bookend signal

## Demo deck

See [closing.gallery.light.pdf](./closing.gallery.light.pdf) for rendered examples of every variant.
