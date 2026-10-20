---
status: in-progress
summary: >
  An audit of what a pill or a check disc does to the text around it, measured on every text host of the component
  gallery. Three separate causes, not one. Flex and grid hosts split a label into stacked or spaced pieces (fixed here, for
  list items, with a transformer and a regression gate). A pill taller than the line box grows the host in about 1 host in 5,
  and a pill and a disc sit about 0.1em apart vertically. Those two are measured and not yet fixed.
---

# Inline objects and their surroundings: the audit (2026-10-20)

Status: the split defect is fixed for list items (§4). Line growth and alignment are measured and open (§5). Parents:
`2026-10-17-pills-plugin.md` (the pill), `2026-10-18-checks.md` (the check disc), `engineering/jank.md` (what the existing
sweep does and does not cover).

## 1. The question

An author can put a pill or a check in any markdown structure. It should draw without wrapping, pushing or disturbing what
is around it, and it should sit on the text's line like a word would. Its size decides how much it can disturb, and
nothing else should. The owner reported the opposite on real decks: text after a pill landing on a new line.

## 2. Method

`tools/audit-inline-objects.js`, on the gallery source (`test/integration/baseline-decks/gallery.md`, 120 slides, indaco,
Chromium, 1280 x 720 viewport on a 3840-wide layout). For each of 1,027 elements that hold a run of text, it swaps a word in
the middle of the run for a plain label (the control), a short pill, a longer pill, or a check disc, measures, and reverts.
Everything is compared with the control, so a line that wraps because the label is wide is not counted as the object's doing.

`check:jank` could not answer this. It measures an anchor drifting as content grows, and it never inserts an inline object.

## 3. What it found

| Per kind, 1,027 hosts | Pill | Long pill | Disc |
|---|---|---|---|
| More lines than the plain label | 28 (3%) | 90 (9%) | 12 (1%) |
| Host grew by more than 1 px | 202 (20%) | 268 (26%) | 43 (4%) |
| Another element moved by more than 1 px | 209 (20%) | 275 (27%) | 150 (15%) |
| Text pushed to another line | 74 (7%) | 150 (15%) | 56 (5%) |

Alignment, where the object shares a line with its neighbor text, in em of the host font (positive is below the cap-height
center): pill median 0.100 (5th to 95th percentile −0.001 to 0.116), disc median 0.007 (−0.141 to 0.017). Height against the
host font: pill median 1.15em (0.82 to 1.40), disc exactly 1.00em.

Three causes sit under those counts.

1. **Flex and grid hosts split the label.** A component that makes its list items `display:flex` or `grid` turns every child of
   the item into its own flex item, and wraps each run of text in an anonymous one. `- Pilot in the EU `{LIVE}` and collect
   feedback` in `list-steps` rendered as the title, a pill stretched to the full row width, and the rest of the title beneath
   it. A bold word or inline `code` did the same. Of 63 flex or grid hosts measured with a mid-text object, 19 pushed text
   onto another line. With a pill injected into every list item of the gallery source, 69 hosts split across 16 components.
   The decks we ship already carried it: `examples/image-set-export.md` rendered "Resolution. Full is fidelity-first… Step
   down to 1× or half…" scattered across columns.
2. **A pill taller than the line box grows the host.** In body-size text (14 to 16 px at 1280), 92 of 326 hosts grew by about
   0.40em with no new line, because the pill is 1.15em tall against a snug line box. A disc is exactly 1em and does not.
3. **The pill and the disc use different center lines.** The pill centers on the x-height (CSS `vertical-align:middle`), the disc
   on the cap height, so a pill beside a disc sits about 0.1em off. Each is consistent within its own kind.

## 4. Fix for cause 1 (this change)

`lib/core/inline-run.js` wraps a list item's leading inline run in one `<span class="lat-run">` when the run holds bare text
and an element. A flex host then sees one item for its label, as it did for plain text, so no layout rule changes. A
transformer (`lib/transformers/inline-run.js`) serves the components that declare `inlineRun` in their manifest, and the
engine path and the runtime share one decision function (HARD RULE #1).

What it leaves alone, because layouts read it as structure:

- A trailing `code` or pill, in every component (the pills docs' trailing-metadata convention, and what `agenda`, `checklist`,
  `pricing` and `list-tabular` lay out as columns).
- Slots a manifest adds in `inlineRun.slots` (`strong`, `em`, `.badge`, `.lat-spark`), at the end of the run, and any item that
  starts with one (the `**Title.** body` form).
- Plain text, and elements with no text between them.

The first version read only `li > X` selectors for slots and swallowed `agenda`'s trailing `code` columns, which the render
diff showed. Slots are therefore read from the layout as well as the selectors, and the diff is the check.

The independent checker then found, and this change fixes: an HTML comment holding a tag-shaped word (a speaker note that
mentions `<p>`) broke the string tokenizer, so comments are masked before scanning; a section carrying two served component
names was wrapped under both on the DOM path and one on the HTML path, so both now take the first in catalog order; and raw
HTML with uppercase tags, single-quoted `class` or a missing `</li>` is read the same as the DOM would read it.

A second review of those fixes found three more, fixed the same way: an unclosed inline element let the wrapper cross `</li>`
and close after `</section>`; the comment mask did not follow HTML's rules (`<!-->` and `<!--->` are complete, a `<!--` inside an
attribute value is not a comment, a `<script>` body is not markup); and a comment at the edge of a run landed inside the wrapper
on the string path and outside on the DOM path. A seeded differential fuzz (600 generated items, two slot sets) now pins the two
substrates to each other, and each repro is a test that fails on the previous code.

`list-tabular` is not served. Its grid columns follow the order of an item's children, so wrapping a mid-text `code` would move
the next one into a different column. A pill or bold word mid-label there still splits as it did.

A slot in the MIDDLE of a label joins the run (`kpi` rows such as `Revenue {On plan} vs target {Q3}` lose the sibling rule that
tints a second pill, because the first pill is no longer a sibling). Only the leading and trailing positions are protected.

Measured:

- Split flex or grid hosts on the pill-injected gallery: 69 before, 0 after (`test/integration/invariants/inline-objects-no-split.test.js`,
  which also proves the probe finds 63 without the transformer).
- Corpus render (2,257 decks): 12 decks change, each a deck that had an inline object in a flex or grid list item. Every
  changed slide was viewed before and after. Each moves from scattered or stretched to a flowing sentence; none lost a slot.
- A deck with no inline object in a label renders byte-identically.

## 5. Open

- **Cause 2, line growth.** The CSS-native answer to test: an `inline` pill painted with padding, border and background does
  not enlarge the line box. It paints over adjacent lines instead of pushing them. It conflicts with the `inline-block`
  the pill uses for `text-box` centering, so it needs a prototype and a PDF check before a decision.
- **Cause 3, one center line.** Pick one for every inline object.
- **Not list items.** `glossary` headings, `statute-stack` titles, `wifi`'s call to action and `journey`'s lane labels are flex
  hosts holding bare text, built by their own transforms. The gate does not inject objects there.
- **A trailing pill in a component without a slot** (`list-steps`, `cycle`, `matrix-2x2`) still stretches in a column flex
  item: a trailing pill is a slot everywhere, by the convention above, so these were left as they were.
- **A pill inside a badge label** (`verdict-grid`, `pricing`) renders as literal `{LIVE, c3}` text. Not caused by this change.
- Charts (SVG labels), WebKit and Firefox, other themes, and the export PDF are not measured.
