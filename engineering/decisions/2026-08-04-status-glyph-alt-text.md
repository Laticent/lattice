---
status: shipped
summary: >
  The decorative status glyph (✓/✗/◆/!/–) that `::before` injects on
  `.chart-status` is now hidden from assistive tech with CSS `content` ALT TEXT
  (`content: "\2713\00a0" / ""`), not with `speak`. #1320 offered three options —
  an `aria-hidden` wrapper, a background image, or accepting the announcement —
  and alt text beats all three: it is CSS-only like the background-image option
  but keeps the glyph sized with the type, and it needs no transform change.
  Measured over the real accessibility tree on a real rendered export: 4
  announced glyph nodes before, 0 after, with the painted glyph byte-for-byte the
  same width. The `speak: never` sanction in the `css:values` gate is retired
  with it.
---

# Status glyphs leave the accessibility tree via `content` alt text

**Issue:** [#1320](https://github.com/SlideWright/lattice/issues/1320) ·
**Sites:** `lib/base/base.print-textures.css`, `themes/a11y-base.css`

## What was wrong

Two rule blocks inject a decorative status glyph before the status word:

```css
section.print .chart-status[data-s="on-track"]::before { content: "\2713\00a0"; }
section.print .chart-status::before { font-weight: 700; speak: never; }
```

The glyph is a *redundant visual channel*. The element already spells out
`on-track`; the ✓ restates it in **shape**, so the meaning survives grayscale
print and survives a reader who cannot separate the status colors. That part is
deliberate and correct.

The `speak: never` was trying to keep that redundancy from becoming noise for a
screen-reader user, who has the word already. Both halves of it were broken.

1. **`never` is not in the grammar Chromium implements.** Chromium *does*
   implement `speak`, with the CSS 2.1 aural vocabulary (`normal | none |
   spell-out`). `never` is the CSS Speech Level 1 spelling, so the declaration was
   dropped at parse time like any other bad value.
2. **The spelling it *does* parse would not have helped.** `speak` has no effect
   on the accessibility tree in any current engine.

So the tempting one-word fix — `never` → `none` — turns the `css:values` gate
green and changes **nothing** for the user it was meant to serve. That is the
trap worth naming, and it is why this note exists.

## What we did instead

CSS `content` accepts **alternative text** after a slash. The string before the
slash is painted; the string after it is what the accessibility tree gets. An
empty alt string means "expose nothing":

```css
section.print .chart-status[data-s="on-track"]::before { content: "\2713\00a0" / ""; }
section.print .chart-status::before { font-weight: 700; }
```

This is a fourth option the issue did not list, and it dominates the three that
were:

| Option | Announced? | Glyph scales with type? | Transform change? |
|---|---|---|---|
| `aria-hidden` wrapper | no | yes | **yes** |
| `background-image` | no | **no** — sized in px, not type | no |
| Accept the announcement | **yes** | yes | no |
| **`content` alt text** | **no** | **yes** | **no** |

## How it was verified

Not by reading the CSS — the whole point of #1320 is that the CSS *looked*
right. Measured against the **real accessibility tree** (Chrome DevTools Protocol
`Accessibility.getFullAXTree`) on a **real deck rendered through the real export
path**, on both surfaces that carry these rules (`color-mode: print`, and the
`a11y-achromatopsia` theme, which imports `a11y-base`).

One methodological trap is worth recording, because it produces a confident false
pass: **a name-only probe reports success wrongly.** Chromium exposes generated
content as its *own* `StaticText` node rather than folding it into the parent's
accessible name, so `page.accessibility.snapshot()` filtered by name shows a clean
`"on-track"` and hides the problem entirely. The full tree shows the truth.

Same deck, same export path, only the alt text differing:

```
before   StaticText:"! "  StaticText:"at-risk"   …4 glyph nodes announced
after    StaticText:"at-risk"                    …0 glyph nodes announced
```

The painted glyph is unchanged — the `.chart-status` box measures the same
72.8px in both renders, so the visual redundancy channel is fully intact.

## Each glyph is declared TWICE, and that is the load-bearing part

```css
section .chart-status[data-s="on-track"]::before {
  content: "\2713\00a0";            /* every engine, back to CSS 2.1 */
  content: "\2713\00a0" / "";       /* engines that parse alt text */
}
```

The first cut shipped only the second line, and an adversarial pass killed it.
`content: <string> / <alt>` is much younger than a bare `content: <string>` —
Chromium ~77, WebKit only in Safari 17.4 — and an engine that does not parse the
alt form **does not ignore the alt**. The value is outside the property's
grammar, so the *whole declaration* is invalid and dropped, and no pseudo-element
is generated at all. Demonstrated in this repo's Chromium by making the alt tail
unparsable, which is the same condition an older engine is in:

```
content: 'OK' / <unparsable>                    →  computed: none    ← glyph gone
content: 'OK'; content: 'OK' / <unparsable>     →  computed: "OK"    ← glyph survives
```

Shipping the alt form alone would therefore have **deleted the grayscale-safe
shape channel** on any engine without alt-text support — on the two stylesheets
whose entire job is serving readers who cannot rely on color, and in the exported
HTML and Marp-kit bundles a human opens in whatever browser they have. That is a
strictly worse outcome than the announcement it fixes: #1320 is "a screen reader
says one extra word"; this would have been "the shape channel is gone."

The pair is the cross-engine idiom `tools/check-css-values.js` already sanctions
as shape 1. An old engine keeps the plain glyph — painted and announced, the
behavior that shipped for years and was acceptable. A current one takes the alt
and stops announcing it. The cost in Chromium is zero.

Worth stating plainly, because it is the shape of the near-miss: **the
`css:values` gate is structurally blind here.** Its oracle is Chromium, which is
the one engine that *does* support the alt form, so it would have certified the
regression indefinitely.

## Consequence for the gate

`speak: never` was the only `SANCTIONED` entry in `tools/check-css-values.js`
flagged **KNOWN DEFECT (shape 4)** rather than a legitimate cross-engine pattern.
The gate fails on a *stale* sanction, so removing the CSS required removing the
entry in the same change. Shape 4 now has no occupants, and the header says so.

## What this does not claim

Verified against **Chromium's** accessibility tree only. No screen reader (NVDA,
JAWS, VoiceOver) was driven — none is reachable from this sandbox. The assertion
is precisely "the glyph no longer reaches the accessibility tree Chromium
exposes," which is the tree assistive tech reads from, not a recording of a
screen reader speaking.

**No non-Chromium engine was run at all.** An earlier draft of this note claimed
`content` alt text is "well-supported across engines" — unverified, and it was
the single load-bearing assumption of the change. It has been removed rather than
softened. What replaces it is not a broader test but a *design that does not need
one*: the plain-`content` declaration above each alt one means the worst case in
an untested engine is the behavior that shipped before this change, not a blank
pill. The alt half remains verified in Chromium only; the fallback half is
verified by construction.

Two things follow for anyone extending this. The alt is `""` on all five glyphs,
which is right today because every emission site in
`lib/components/chart/_chart-family/chart-family.js` renders the status WORD
alongside the glyph (the wordless case uses a different class,
`.chart-status-empty`, with no glyph). That is now an unstated invariant: a
future site that renders `.chart-status` with a glyph and no text would ship an
unlabeled status, and nothing gates it. And the `css:values` gate cannot help
with any of this — its oracle is Chromium.
