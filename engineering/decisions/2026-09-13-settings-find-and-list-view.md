---
status: shipped
summary: >
  The Studio's two settings panels held ~60 controls behind six pill-tabs each, and a tab
  strip answers "which section am I in" while the question people actually ask is "where
  does this setting live". Two shared controls now answer it: a SEARCH that filters every
  control across all sections at once, and a VIEW toggle between the tabbed panel and one
  continuous list of every section. Both live in ONE module the deck and slide scopes
  import (ui/settings-view.tsx), a control hides itself with `useSettingsHit`, and the two
  questions a parent cannot answer for itself — "did any of my children match?", "did
  anything at all?" — are two `:has()` rules in tailwind.css rather than a second render
  pass. The refactor also collapsed each panel's two hand-kept orders (the tab strip and
  the bodies) into one `sectionDefs` list.
---

# Settings panels — find a control, or read them all

**Date:** 2026-09-13
**Status:** shipped

The ask: *"we need to add search filter button and a view type toggle buttons in the deck
and slide settings panel… search should hide these toggle buttons to allow for search
input to have all available space… toggle can be between list/group where list is
basically acts like continuous partitioned list of settings and group is what we currently
have. i want to simplify things for users and enhance ui/ux."*

---

## 1. The problem the tabs do not solve

`2026-08-18-settings-panel-coverage-and-ux.md` gave both scopes one tab vocabulary and one
row geometry, and that fixed what it set out to fix: the panels stopped using different
words for the same register. What it could not fix is that **a tab strip answers a question
nobody asked.** It tells you which section you are in. The question an author has is "where
do I turn the page number off", and the only way to answer it is to open tabs until the row
appears — six in the deck scope, up to seven in the slide scope, one at a time.

Two controls answer it directly, and they are the same two on both panels:

| Control | What it does |
|---|---|
| **Search** | Filters every control across ALL sections at once. |
| **View** | `Grouped` — the tabbed panel, unchanged, still the default. `List` — every section down one continuous scroll, each under its own sticky heading. |

Search is **not a third view**: it renders as the list, because a result that spans sections
has nowhere to sit inside a tab. So the tabs are hidden while a query is live — and so is the
view toggle, which is what the ask names: the field takes the whole toolbar row, which is the
width a 390px phone needs to type a phrase into it.

---

## 2. Where the mechanism lives

One module, `docs/src/components/ui/settings-view.tsx`, imported by both scopes (HARD RULE
#15). It carries the matcher, the query context, the section wrapper, the block wrapper and
the toolbar. `StudioShell.tsx` owns the shared VIEW state (persisted by `studio-store`'s
`settings-view` key, the same "furniture, not authored state" split `PickerView` already
made) and passes it into `SlideContextBody`; each panel owns its own QUERY, which dies with
it.

**A control hides itself.** `useSettingsHit(label, desc, find)` returns the
`data-setting-hit` props to spread, or `null`. `Field` (deck), `Row` (slide), `InspGroup`
and `SettingsBlock` all call it, so `if (!hit) return null` is the entire call-site
contract and a new row inherits search for free.

**`help` is deliberately not searched.** It is a paragraph of prose per row; folding it in
would match nearly every row on nearly every word. What covers the gap is `find` — the
synonym a row's own words do not spell, so `pagination` reaches a row called "Page numbers".

---

## 3. Why two rules of CSS, and why unlayered

Two questions fall out of per-control filtering that the control cannot answer and its
parent cannot either without a second render pass:

1. **"Did any of my children match?"** — a section with every row filtered away must go,
   heading and all.
2. **"Did anything at all?"** — the no-matches note shows only when the whole body is empty.

`:has()` answers both in the same paint, keyed on `data-settings-filtering`, which is set on
the panel body only while a query is live:

```css
[data-settings-filtering] [data-settings-section]:not(:has([data-setting-hit])) { display: none; }
[data-settings-filtering]:has([data-setting-hit]) [data-settings-empty]        { display: none; }
```

The alternative was a registration context — children report their verdict up, the parent
re-renders — which is a second pass per keystroke and a loop to get wrong. The attribute is
also what lets a nested wrapper reuse the same answer: the deck's `More` disclosure, the
logo sub-block's indent rule and the slide's two "Says something / Says nothing" halves all
carry `data-settings-section` and collapse by the same rule, because it is the same question.

**The rules are UNLAYERED.** `@layer base` is the natural home, but `styles/tailwind.css`
declares `utilities` after it, so any `flex`/`block` utility that ever lands on a section
wrapper would beat a layered `display: none` and the section would refuse to collapse. An
unlayered rule beats every layer regardless of specificity — the cascade that file is built
on — so the collapse cannot be undone by a utility someone adds later. (HARD RULE #26 is
about the ENGINE bundle; this is the docs site.)

---

## 4. The keyword contract, and the bug it was written after

A section can match **as a whole** — "motion" should show the Motion section entire, not the
three rows that happen to repeat the word — so `SettingsSection` takes `keywords`.

The first draft filled them generously: Chrome carried `header footer page number logo
masthead`. The result was measured on the real panel: searching **"page"** returned the
entire Chrome section — eleven rows — because the section matched, when the one row called
"Page numbers" was going to match on its own.

So the contract is narrow, and it is written into the prop's docstring: **keywords name what
the section is FOR, in words its rows do not already carry.** "furniture", "animation",
"white label". Listing a row's own word turns a precise search into the whole section.

---

## 5. What the refactor fixed on the way

Rendering all sections at once meant the bodies could no longer be `{tab === 'x' && …}`
conditionals, so each panel now builds one `sectionDefs` array: value, label, keywords, body.
The tab strip is derived from it (`sectionDefs.map(({ value, label }) => …)`).

That collapsed a real duplication in `SlideContext.tsx`: the tab strip read Look · Notes ·
Chrome · Marks · Accent · Motion · Comments and the bodies were written in a different
order, with each tab's render condition repeated in both places. Nothing had noticed,
because exactly one of them rendered at a time.

---

## 6. Verified

On the real Studio in a real browser (`.scratch/shoot-settings.js`, `.scratch/shoot-slide.js`
— throwaway drivers, not a harness), at 1440 / 820 / 390:

- grouped view unchanged; list view drops the tabs and renders every section with a sticky
  heading and a divider;
- search hides both toggles and spans the row; the no-matches note appears and disappears by
  the CSS rules above;
- slide scope: "tint" collapses to one chip group inside Marks and takes the "Says something"
  half with it; "caption" collapses the Notes section to one block.

Two floating-divider defects were found that way and fixed rather than filed (HARD RULE #18):
the slide panel's "Says nothing" rule and the caption/description separators both drew a line
with nothing above it once the preceding block filtered away. Both now drop while a query is
live — `SettingsBlock`'s `separated` prop is where that decision lives, once.

Four e2e tests in `inspector.spec.ts` carry the part jsdom cannot: **`display: none` from
an unlayered `:has()` rule is not something jsdom evaluates**, so the unit tier can only
prove a row was not RENDERED — never that a section which still holds hidden rows actually
collapses. Mutation-checked both ways: misspelling the attribute in the selector turns the
e2e assertion red, and the text pin in `settings-view.test.tsx` names the other side.

Green: 19 in `ui/settings-view.test.tsx`, 9 wiring tests split across the two panels, 2073
across the ui + studio suites, 3964 across the whole docs suite, 9345 repo unit tests, 12
e2e in `inspector.spec.ts`, plus `npm run lint` and `npm run build:check`.

---

## 7. One pre-existing failure found, not touched

`e2e/split.spec.ts:206` ("a component pick auto-expands a collapsed preview and really
renders") is **red on `main`**, not from this change. Verified by stashing the whole diff and
re-running it on the clean tree at `fa181c9`: identical failure, `#pg-split` keeps
`data-split-collapsed="b"` after the pick, so the preview never un-collapses and the
assertion on line 219 times out. It reproduces against the built preview as well as the dev
server.

Off the path of this change (the split's collapse state and the add-slide gallery; nothing
here touches either), so per HARD RULE #18 it is recorded rather than pulled into the diff.
No tracked issue covers it — #1530 is the Playground's pane desync, a different surface.
