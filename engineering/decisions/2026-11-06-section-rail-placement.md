---
status: shipped
summary: >
  When the section rail draws and on which slides. By default only on content slides inside a section, and only in a
  deck with 3+ sections and 15+ slides; `progress-rail: on` lowers that to 2 sections, any length. Never on a sovereign
  Frame. Each divider instead composes its own marker ("2 / 4" plus the marks), an agenda whose item count matches the
  section count gains a legend, and a topic slide's empty eyebrow names its section. Every divider advances the section
  number, numbered or not. Lint suggests `empty-section` for a divider straight after a divider.
---

# The section rail: when it draws, and on which slides

**Date:** 2026-11-06 · **Decided by:** the owner, on PR #3056 ("sometimes it is just noise and no one can tell what it
is"), after an independent visual-communication review · **Code:** `lib/forms/tile/progress/progress.transform.js`,
`lib/core/resolve-progress-rail.js`, `lib/transformers/topic-track.js`, `lib/core/section-index.js`,
`lib/authoring/review-core.js` (`empty-section`) · **Docs:** `lib/base/base.registers.docs.md` § The section rail

## What was wrong

The section rail is a row of marks, one per `divider`, with the current section lit. It carries no label: an earlier
version printed the section name beside it and was removed because it collided with the footer text
(`2026-07-27-footer-band-allocation.md`). Before this change, the rail:

- drew a single lit pill on a deck with one section, which reads as a stray dash;
- never appeared on the divider that names a section, so a reader met the marks unlabeled, pages later;
- lit its current mark in `--accent`, which merges into `--border` on four shipped palettes, and in a different
  visual language from the topic track's lit topic;
- sat so close to the page number that `• ━ • • 8` read as five stops.

## The principle

The page number already answers "how far". A rail earns its space only by answering "which part", and an unlabeled
row of marks can do that only once the reader has seen the same shape labeled. Established practice pairs the marks
with names somewhere: consulting decks repeat the agenda with the current item lit, Beamer's navigation bar sits beside
section titles, reports print running heads. A cue that blinks in and out mid-section reads as noise; a gap on a slide
that is plainly a different kind of surface (a full bleed, which drops the page number too) does not.

## The policy

| Slide | What it shows | Why |
|---|---|---|
| Title, and slides before the first divider | Nothing | Nothing to locate yet; lighting nothing would look broken. |
| Agenda whose item count equals the deck's section count | Each item ends with the rail as it will look in that section | The legend, met before the first divider. A mismatched count draws nothing: the items are something else. |
| Divider (plain, light, numbered) | Its own marker: `2 / 4` and the marks, larger, this section lit. **Superseded 2026-11-08:** it now sits where the footer rail sits (bottom-right, bottom-center or the right edge), not above the name; see `2026-11-08-anchor-chrome.md` | Where the marks are taught, beside the section name. Frame content, not chrome, and a real row of the divider's block: the top band holds the deck's `header:` text, and a zero-tall row painted above its place drew over that header on a tall block with no fit gate noticing. A full divider now reports its overflow instead. |
| Topic | Its own track; an empty eyebrow becomes `02 · <divider heading>` (figures, no language; only where the rail would draw) | One scale per slide; the eyebrow ties the topic's track to the deck's sections. |
| Content slide inside a section | The footer rail | The rail's one job. |
| Full-bleed sovereign layouts, closing | Nothing | They drop the page number too. |

Deck-level floors (`railWanted`):

- **3 or more sections, 15 or more slides**, by default. Two sections is "first half / second half", which the page
  number already says; a short deck is held in the head.
- **`progress-rail: on`** lowers the floors to 2 sections and any length. One section is never drawn, forced or not.
- **Past 8 sections** the rail and the marker draw as a bar (`bar-auto`) unless the deck names `dots`: dots stop being
  countable at footer size.
- The divider marker and the agenda legend draw exactly when the deck's rail does, so a legend never teaches a mark the
  deck does not show.

The lit mark is in the heading's ink (`--text-heading`, `--text-display` on a dark divider), the topic track's tone cue,
so the two scales read as one idea.

## Options considered for the divider

| Option | Verdict |
|---|---|
| **The divider composes its own marker** | Chosen. Teaches the rail where the section is named; keeps the sovereign-Frame invariant absolute. |
| Exempt the rail from the invariant | Rejected. `frame-identity-agrees.test.js` relies on "a sovereign Frame carries no chrome Cell" to catch mis-stamped slides; a carve-out weakens it, and a footer-sized cue on a quiet slide is the wrong register. |
| An eyebrow in words only (`Section 2 of 4`) | Rejected. Does not teach what the footer marks are. |
| An agenda recap on every divider | Deferred. Clearest wayfinding, but heavy; it competes with the divider's one statement. A possible `divider recap` variant later. |

The first cut of PR #3056 drew the chrome rail on dividers, and the frame-identity invariant failed on
`examples/form.md` and `examples/split-relationship.md`. That is what prompted this note.

## Two things this changed that are easy to miss

- **The section number counts every divider.** `section-index.js` used to count only `divider numbered` slides, so a
  deck mixing plain and numbered dividers printed `01` on its third section while the rail lit the third mark and the
  topic eyebrow said `Section 3`. One section number now: every divider advances it, a numbered one shows it.
- **`progress-rail: on|off` stamps the register's own tokens** (`progress-rail-on` / `progress-rail-off`), never the
  switch's `with-progress` / `no-progress`. Sharing a token let a deck's `progress-rail-on`, arriving before a deck-wide
  `class: no-progress` in the VS Code preview, evict it as if it were the slide's own word
  (`bundle-settings-live.test.js` caught it).

## What we did not do

- No printed section name in the footer band (the 2026-07-27 collision).
- No rail and topic track on the same slide.
- No exemption from the sovereign-Frame invariant.
- `divider light` still starts a section, by the owner's call; `empty-section` flags the case where it follows a
  divider directly and leaves the first section empty (a warning since 2026-11-08).
