---
status: shipped
summary: >
  DO NOT add screen-reader labels to `<ins>`/`<del>`. This note records a feature that was built,
  measured, and then REMOVED before merge, because the premise it rested on is false. The premise
  was "screen readers mostly do not announce these elements by default." Orca — installed here, on a
  real AT-SPI2 bus, with real Chromium publishing `content deletion` / `content insertion` roles —
  announces them by default with the EXACT words the labels added: `messages.py` defines
  CONTENT_DELETION_START = "deletion start" and `formatting.py` gives the role the default format
  `deletionStart + pause + displayedText + pause + deletionEnd`. So the labels produced "deletion
  start, deletion start, collects, deletion end, deletion end" — and worse, Orca suppresses its OWN
  announcement under the `onlySpeakDisplayedText` setting while literal DOM text survives it, so the
  feature overrode the preference of the one user who had explicitly asked for less of it. Two
  things do ship: the CSS pseudo-element trap found on the way (a `::before` on a padded inline
  paints a visible sliver), and a contrast-walker fix for screen-reader-only text, which turned out
  to be a PRE-EXISTING false positive affecting `.cell-sr-label` and `.lattice-description`.
---

# Don't label `<ins>`/`<del>` — the screen reader already does, and better

**Date:** 2026-08-26 · **Status:** feature removed before merge; the findings ship
**Trigger:** the owner's question — *"our goal is to leverage best practices and we want to use html
tags that is accessibility friendly so readers can read. it seems to me `<ins>`/`<del>` and figure
are right approach but i could be wrong. authors also author `<ins>`/`<del>` right?"*

## 1. The premise checks out — the diagnosis did not

**Authors do write them by hand.** `redline.docs.md` documents
`<del>old wording</del> <ins>new wording</ins>` as the component's contract, and Markdown has no
insertion syntax, so raw HTML is the only way to write one.

**`<figure>`/`<figcaption>` is already right.** `video.transform.js:105` emits a real one, and the
chart family is careful in a way worth not disturbing: `radar.transform.js:499` documents why a
decorative radar is `aria-hidden` while a small-multiples mini is `role="img"` with a name.

**The visual distinction is not color-alone** — underline vs line-through plus hue plus a tinted
band, so WCAG 1.4.1 holds without color perception, and holds unstyled on browser defaults too.

**`compare-code`'s column labels are already real DOM text.** No gap there.

What looked like the gap was announcement. Read out, a redline blockquote is *"shall provide two or
more at least one designated method"* — that is `pdftotext` on the shipped PDF, not a hypothesis. So
a boundary label seemed obviously right, and it was built: a transform putting a visually-hidden
`<span>` either side of every tracked change, 0 changed pixels, correct reading order.

## 2. What the evidence axis was actually hiding

The pre-merge card graded evidence `medium` because the core claim rested on a proxy — Chromium's
CDP accessibility tree — and no screen reader had been driven. Closing that gap is what found the
defect.

Installed Orca 46 with `at-spi2-core`, `speech-dispatcher` and `espeak-ng`, brought up Xvfb, a
session D-Bus and the AT-SPI registry, and launched real Chromium with `--force-renderer-accessibility`
onto that bus. The tree comes back with `content deletion` × 19 and `content insertion` × 25 — the
roles are live at the OS layer, not just inside Chromium. Orca attaches, logs
`SPEECH OUTPUT: 'Screen reader on.'`, and reads the page title.

Orca's keyboard layer will not drive SayAll headless, so the decisive evidence is its source:

```python
# orca/messages.py
CONTENT_DELETION_START  = C_("content", "deletion start")
CONTENT_DELETION_END    = C_("content", "deletion end")
CONTENT_INSERTION_START = C_("content", "insertion start")
CONTENT_INSERTION_END   = C_("content", "insertion end")

# orca/formatting.py — the DEFAULT format for the role
'ROLE_CONTENT_DELETION':  {'unfocused': 'deletionStart + pause + displayedText + pause + deletionEnd'},
'ROLE_CONTENT_INSERTION': {'unfocused': 'insertionStart + pause + displayedText + pause + insertionEnd'},
```

`speech_generator.py:385` emits `CONTENT_DELETION_START` for the role, gated only by
`onlySpeakDisplayedText` — a non-default setting whose whole purpose is suppressing exactly this
chatter.

So the labels did this:

```
what Orca says with them:   "deletion start"  "deletion start"  collects  "deletion end"  "deletion end"
what Orca says without them:                  "deletion start"  collects  "deletion end"
```

## 3. Why this is a removal and not a tuning

Duplication alone would be a nuisance. Two things make it a defect:

- **The premise was never true.** The feature existed to fill a gap that the one screen reader
  reachable from here does not have. Nothing was measured before building; the justification was
  documented element behavior, which the pre-merge card correctly flagged as a proxy.
- **It overrides a user preference, permanently.** A reader who sets `onlySpeakDisplayedText` has
  explicitly asked not to hear this. Orca honors that for its own announcement. Literal DOM text
  cannot be honored — it is indistinguishable from the clause. The feature is least welcome for the
  user who most clearly opted out, and they have no recourse.

NVDA, JAWS and VoiceOver were not reachable and are NOT claimed either way. That is the point: an
always-on, unsuppressable workaround is the wrong default to carry for an unverified gap, especially
with a measured regression against it.

**The elements are the right answer on their own.** `<ins>` and `<del>` carry the semantics, expose
the roles, and leave the announcement under the reader's control. A reader that ignores them is that
reader's bug, and duplicating text in every deck on every surface is not the place to fix it.

## 4. What ships from the work

- **A CSS trap worth never rediscovering** (`engineering/gotchas/css.md`). A `::before`/`::after` on
  an inline element that has horizontal padding and a painted background makes the inline box open on
  the previous line; that empty first fragment still paints the wash, leaving a visible ~2.7px colored
  sliver and stealing the continuation line's inset. 28,135 changed pixels on the redline gallery, and
  every hiding technique produces it identically — absolute, fixed, zero-size, float, and
  `content: '' / 'alt'`, which renders nothing at all. `box-decoration-break: clone` cuts it to 651px
  and is itself an 87,857px redesign of the wash. The cause is the fragment, not the hiding.
- **A contrast-walker fix that was never about this feature.** `tools/check-slide-contrast.js` skipped
  only `display:none` and `visibility:hidden`, so the house screen-reader-only idiom — a 1×1 box with
  `overflow:hidden` and a zero-area clip — was scored as ink that never gets drawn. That is a
  PRE-EXISTING false positive on `.cell-sr-label` (matrix-grid) and `.lattice-description` (the
  player), in the same class as the SVG `<desc>`/`<style>` exclusion the file already carries.
- **The redline manifest fix**, below.

## 5. A real defect the reading order surfaced

`redline`'s own manifest description carried `<ins>/<del>` unescaped, so the engine parsed them as
live elements. The gallery cover rendered *"verbatim language with inline / tracking the amendment"* —
the words "ins" and "del" eaten, and the remainder of the sentence underlined AND struck through, i.e.
displayed as a live tracked change on the summary line of the component about tracked changes. Every
other component backticks a tag it mentions; redline was the outlier. Fixed at the manifest, which
regenerates the docs, the gallery and the VS Code snippet. CI's golden-diff confirms it is the only
slide in the corpus whose pixels move.

It had been invisible in review for as long as nobody read the slide aloud. **Printing a rendered
slide's accessibility tree in reading order is a cheap check that finds a class of content bug the
eye does not** — two empty tracked-change elements announcing boundaries around nothing.

## 6. The lessons

**An accessibility feature needs an accessibility measurement, not a plausible mechanism.** Every
gate was green, the reading order was correct, the pixel cost was zero, and the feature was still
wrong — because none of those things asks whether a screen reader was already doing the job.

**"The recommended pattern" is a claim about a typical instance, not yours.** The visually-hidden
`::before`/`::after` technique is correct and widely cited for unstyled prose. On a padded, washed
inline chip it is a defect generator.

**A confidence card that names a proxy is naming the thing to go check.** The card graded evidence
`medium` on exactly this axis. Going and closing it — rather than arguing the level up — is what
turned a shipped regression into a decision note.
