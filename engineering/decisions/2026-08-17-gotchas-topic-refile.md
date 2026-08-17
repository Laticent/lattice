---
status: shipped
summary: >
  The gotchas split shipped ten topic files whose titles two of them did not
  honor — `ci.md` was six-sevenths Playground hydration entries and `marp.md`
  was 26/34 not-Marp — which breaks the one thing a symptom index does. All 145
  entries were re-filed by "what surprised you" into 14 topics, mechanically,
  with every entry body asserted byte-identical before and after.
---

# Re-filing the gotcha topics — an index is only as good as its group labels

## Symptom

`2026-08-17-context-index-tiering.md` split the 290 KB `gotchas.md` monolith into
an index plus ten topic files, and logged two known defects on the way out:
`gotchas/ci.md` held six Playground/Studio hydration entries under the title "CI
(GitHub Actions / code scanning)", and `gotchas/marp.md` was the largest file with
"several entries that look mis-filed." Both were off-path for that change and were
recorded rather than swept in.

They are worse than cosmetic. The index this repo now routes to is a **symptom
index grouped by topic**: the group heading is the only thing a reader scans before
committing to a file. A reader debugging a red CI check opens `ci.md` and finds
hydration flicker; a reader whose live preview lags opens `docs-site.md` and finds
nothing, because that entry is under "Marp / Marpit". The split made the index
cheap to read and left it pointing the wrong way.

The audit was worse than the log said. Of `marp.md`'s 34 entries, **8** were about
Marp or Marpit. The rest were the overflow-marker system, the Studio, fonts, PDF
export, Chromium, VS Code, and CSS.

**One qualifier on how bad this was, stated because it bounds the value of the
fix.** The generated index lists all 145 entry *headings*, not just the 14 group
headings — so a reader who skims or greps the whole index, which is what
`gotchas.md` and `CLAUDE.md` both tell them to do, finds a mis-filed entry anyway.
The cost of a lying group label falls on the reader who commits to a topic file on
its heading alone. That reader is real, and grouping is the only thing the group
headings are for, so the fix is worth making — but it is a navigation improvement,
not a recovery of lost content.

## What changed

All 145 entries were re-filed against one rule: **an entry belongs to the surface or
subsystem whose behavior surprised you** — where you were standing when you hit it,
not what the fix touched. Ten topics became fourteen.

| Topic | Entries (was → now) | Note |
|---|---|---|
| `studio-playground.md` | new → 25 | The docs-site app surfaces. Absorbs six hydration entries from `ci.md`, eleven from `docs-site.md`, three Studio entries from `marp.md`, two from `lattice-internals.md`, and three from `mermaid.md` — including the preview-`<iframe>` trap catalog. |
| `lattice-internals.md` | 32 → 21 | Sheds the exported-player and iOS-surface clusters. Gains the emulator, render-golden and manifest-slot entries from `marp.md`; the two input-kernel entries from `docs-site.md` (they address someone *building* a slide surface, and both point at `lib/core/present-transport.mjs`); and the mobile-WebKit token-relocation entry from `mermaid.md`. |
| `css.md` | 16 → 16 | Gains the two "a declaration silently does nothing" entries from `marp.md`; sheds the blurred-`box-shadow` PDF entry to `export.md` and the KaTeX/Mermaid extractor entry to `mermaid.md`. |
| `export.md` | new → 12 | PDF / PPTX / the HTML player. Two entries from `marp.md`, nine from `lattice-internals.md`, one from `css.md` — which puts both blurred-`box-shadow`-in-a-PDF-viewer entries, previously in two different files, side by side. |
| `browser-engine.md` | 4 → 10 | **Scope expanded**, not merely renamed: on `main` this file was four Chromium entries and contained the word "WebKit" nowhere. The five iOS/WebKit entries arriving from `lattice-internals.md` are what earn the new title; `Chromium blocks file:// URLs as mask-image sources` arrives from `marp.md`. |
| `vscode.md` | 8 → 9 | Gains the `logo:` directive entry. |
| `marp.md` | 34 → 8 | Now Marp and Marpit only. Nothing moved *in*. |
| `overflow.md` | new → 8 | The overflow-marker system and the Fit Spine — seven entries previously under "Marp", plus the fixed-slide-frame truncation entry. |
| `docs-site.md` | 19 → 6 | Now the Astro build and dev server, which is what its title said. |
| `mermaid.md` | 18 → 15 | Sheds four Playground entries that were not about Mermaid; gains the KaTeX extractor entry from `css.md`, whose visible symptom is a Mermaid diagram printing as raw stylesheet text. |
| `charts.md` | 4 → 5 | Gains the chart-export entry. |
| `fonts.md` | new → 5 | Font loading and fallback, across preview and export — four entries from `marp.md` plus the JetBrains Mono cap-centering entry. |
| `ci.md` | 7 → 2 | CodeQL, and the sandbox's `CHROME_PATH`. |
| `memory-profiling.md` | 3 → 3 | Unchanged. |

Every count above is this change measured against `main` at `91913c5`, and they are
a **record, not a live total** — #1704 landed a 146th entry in `css.md` in the same
window, which is the ordinary way these numbers drift and the reason neither the
index nor this tool carries a count it would have to keep true (#1547).

The largest topic file drops from 21.0k tokens (`marp.md`) to 17.2k
(`studio-playground.md`). The index itself grows **70 tokens**, 7,347 → 7,417,
measured with `o200k_base` over both files. Essentially all of that is the four new
group headings, which cost 67 tokens together; the 137 rewritten link URLs net out
to about +3, because a longer path costs almost nothing once tokenized. (A
byte-length estimate misleads badly here — the file grows 492 bytes, which at this
repo's prose ratio would read as ~125 tokens. URLs are not prose.) Nothing else
about the tiering changes — the index is still generated by `npm run gotchas:index`
and gated by `gotchas:index:check`.

## Why this is a pure move, and how that is known

The diff reads as fourteen whole-file rewrites, which is exactly the shape in which
a lost paragraph hides. So the move was mechanical, not manual:

1. Each topic file was parsed with **markdown-it line maps** (not a line scan) into
   a preamble and a list of `## ` entries, so a `## ` inside a fence cannot split an
   entry — the same reasoning that put a real parser in `build-gotchas-index.js`.
2. A plan file mapped every heading to its destination. The tool **refuses to run**
   if the plan names an entry that does not exist, lists one twice, omits one, or
   would orphan a file.
3. After writing, every file is re-parsed and the multiset of `(heading, body)`
   pairs is compared with the pre-move one. Any lost, gained, or altered entry
   fails the run.

The run reported `145 entries across 14 topics, every body byte-identical`. Every
preamble in the ten original files was the shared two-line boilerplate and nothing
else, checked against `git show HEAD:` — so no prose was dropped with the headers.

**Seven deliberate prose edits, in five entries**, applied after the move and
excluded from the byte-identical claim. Every one is a positional cross-reference —
"the entry above" and its cousins — which is the one class of content a pure move
silently falsifies, and the reason a second pass hunted them specifically. A checker
paired every entry with its predecessor in both trees and flagged the six whose
neighbor changed:

- The preview-`<iframe>` trap catalog said "each row points to its detailed entry
  below," true while its rows and their entries shared a file. It now names the
  files they spread across and tells the reader to grep the title.
- `fonts.md` and `lattice-internals.md` each pointed at an "entry above" that this
  change moved to another file. Both now name the entry and the file.
- **Two were already broken, by the split that preceded this change.**
  `vscode.md` pointed at "the offline-font entry above" and at "the `:where(:root)`
  entry above"; neither entry has been in `vscode.md` since #1690 moved them to
  what is now `fonts.md` and to `mermaid.md`. Windows created by that change, so
  fixed here rather than logged (HARD RULE #18).

Of the six flagged, one was a repair rather than a break: `overflow.md`'s "the same
OPEN question as the entry above" pointed, after the split, at a Studio tint entry;
grouping the overflow cluster put the entry it means — the one whose status line
reads "the token mismatch is OPEN" — back above it.

**That sweep was not sufficient, and the way it failed is worth recording.** It
matched the literal string `"the entry above"`, which finds the *entry* but not
necessarily every reference inside it. `lattice-internals.md`'s mobile-WebKit entry
contains two references to the same moved neighbor: one reads "the entry above" and
was repaired; the other reads "the foreignObject WebKit class above" and was left
pointing at nothing, in a file where the word `foreignObject` now appears exactly
once. An independent checker found it by reading rather than by pattern. The sweep
was then re-run over the wider phrase set (`above`, `below`, `previous`, `earlier`)
across every body; that one sentence is the only unresolved reference in the tree.
The general lesson: **a positional-reference sweep must be keyed on the positional
WORD, never on one phrasing of it** — and finding the right entry is not the same as
fixing every claim in it.

A second checker resolved every `§ "…"` entry reference in the tree against the
real heading set, in both trees. Eight are unresolved, identically before and after,
and all eight point at sections of *other documents* (a decision note, a commit
body, `development.md`) rather than at gotcha entries. One genuine dangling
reference did surface: the trap catalog's `§ "Mermaid HD in 4K"` is a paraphrase
that matches no heading. It is byte-identical to `main`, so it is not a regression —
but this change is what made "grep the title" the documented way to follow a `§`,
which turns a loose paraphrase into a broken link. It now reads
`§ "HD size inside 4K slides"`, and the catalog's preamble states the convention so
the next row added keeps it.

## What this does not fix

- **One pre-existing inaccuracy found and left.** `vscode.md:109` says the
  preview-gaps register is "130 lines above"; it is 82. The line numbers on both
  sides are byte-identical to `main` — this change neither caused it nor moved it —
  and a line-distance reference is a different defect class from the ones swept
  here. Logged rather than pulled in (HARD RULE #18, off-path).
- **Titles are still the only routing signal.** Nothing gates a future entry from
  landing in the wrong file; the generator checks that every entry has a row, not
  that the row is under a sensible heading. That is a judgment a machine cannot make
  from the text, and pretending otherwise would be a gate that cannot fail.
- **`studio-playground.md` is 25 entries**, the largest file here. It is the
  most-populated surface in the repo and the title is honest about it, but it is the
  next file to split if it grows. The seam is **the preview frame vs the app shell**:
  the first fifteen entries are all about what the preview renders and when, and the
  trap catalog binds them; the last ten are the Studio *application* — crash
  sentinel, error boundary, IndexedDB revival, bfcache, PWA auth, toast, icon
  clipping — and share almost no vocabulary with the first group. (An earlier draft
  of this note proposed an "app-state / UI-chrome" seam; that would cut the second
  group in half and leave both halves too small.)
- **`docs-site.md` and `studio-playground.md` are two files about the docs site**,
  and a reader with a docs-site symptom has to weigh "build and dev server (Astro +
  GitHub Pages)" against "docs-site app surfaces" to pick. The titles do carry the
  distinction, but this is the one place in the fourteen where the group heading
  alone takes a beat of thought.
- **Three entries were left where the rule says they do not belong.** None is a
  regression — all three sat in these files before this change — but "all 145 were
  re-filed" should not be read as "every survey result was acted on":
  `Mermaid diagrams render at HD size inside 4K slides in VS Code preview` and
  `Docs-site preview/export rendered 4K decks oversized + cropped` both stay in
  `lattice-internals.md`. By the rule they belong in `vscode.md` and
  `studio-playground.md` respectively — but they are one finding with one cause
  (`GEOM` globals + fixed-box FIT scale), the trap catalog cites them as a pair, and
  splitting them across two files costs more than the mis-filing does. The third,
  `A CodeMirror @media (pointer: coarse) block has no effect on a real touch device`,
  *was* moved on this reading — from `browser-engine.md`, where an earlier draft of
  this change had put it, to `studio-playground.md`, since its cause is `style-mod`
  key ordering in the Studio's editor theme and nothing about it is a browser quirk.
- **Two entries about a blurred `box-shadow` in a PDF viewer are now adjacent** in
  `export.md` and look like near-duplicates. They were merged into one place so that
  is *visible*; merging their text is a content edit, not a move, and is not in this
  change.
- **`mermaid.md` keeps "Playground: Mermaid (and all DOM transforms) stop rendering
  after the first edit."** It reads as a Playground entry, but the behavior is
  Mermaid's re-render contract, and a reader hunting it will search "mermaid".
  Judgment call, recorded so a later reader can disagree with it.
