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
conditionals, so each panel now builds one list — `deckSections` / `sectionDefs` — of
value, label, keywords and body, and derives its pill strip from it
(`.map(({ value, label }) => …)`).

That collapsed a real duplication in `SlideContext.tsx`: the tab strip read Look · Notes ·
Chrome · Marks · Accent · Motion · Comments while the bodies were written in a different
order. Nothing had noticed, because exactly one of them rendered at a time.

**Two corrections to what this section first claimed**, both from the independent check:

- It said the tab strip was derived in *both* panels. It was not — `StudioShell.tsx` kept
  `DECK_TABS`, a second hand-kept copy of the same six labels in the same order, and still
  passed it to `PillTabs` while mapping `deckSections` right below. The shared `DeckTab`
  union catches a value typo; nothing caught a label or order drift, and a seventh
  `deckSections` entry would have rendered a section unreachable in grouped view. The list
  is gone and the strip is derived.
- It said *"each tab's render condition repeated in both places"*. One did — `comments`.
  The other six were bare `activeTab === 'x'` checks. The duplication was the ORDER, not
  the conditions.

---

## 6. Verified

On the real Studio in a real browser, at 1440 / 820 / 390. The drivers were ad-hoc
puppeteer scripts under `.scratch/` (gitignored, and deleted after the run) rather than
`tools/screenshot.js`, because this needed to CLICK — open a scope, type a query, toggle a
view — and that tool takes a URL and a selector to wait for, not a script:

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

---

## 8. The compaction pass — giving the height back

Shipping §1–§6 made a real problem visible: the find toolbar landed on a row of its own,
right-aligned, with an empty left half. Measured on a real 390×844 phone, deck scope, the
first control sat **414px down — 49% of the screen was chrome** before a single setting.

| Band | Height |
|---|---|
| Sheet header (`‹ Deck │ Settings`) | 111px |
| Slide/Deck scope segment | 49px |
| Scope banner | 72px |
| The find toolbar's own row | 40px |
| Section pills, **wrapping to two rows** | 74px |
| Per-section intro prose | 30px |

Five changes, and the useful thing is that they are not independent — three of them are
what make the fourth fit.

1. **The banner's icon moved to the Slide/Deck switch.** Those are the same two icons the
   desktop activity bar already used for these scopes (`FileSliders`, `SlidersHorizontal`),
   so the switch had icons at one breakpoint and bare text at another. On mobile the banner
   icon was also the second sliders glyph within 50px of the sheet header's.
2. **The `Deck-wide` badge went.** Next to a title reading "Configure the whole deck" it is
   the same fact twice. (The slide scope's `Override` badge was not the same case — it said
   something its title did not — but the line replacing it now does, so it went too.)
3. **The title and its sentence merged.** Keeping the sentence's content: it carries the
   slide count and the consequence.
4. **The find toolbar moved onto that line**, which is only possible because 1–3 vacated
   it. This is the 40px row with the empty half.
5. **The section strip became two shortcut pills plus a chevron holding the full list.**

Result: **297px on the phone, 231px in the docked desktop panel** (from 414 and 351).

### Why two shortcuts, fixed, and not three

Six pills need 425px. The phone strip is 362px and the **docked desktop panel is 231px**, so
the strip wrapped at every width — 74px of a panel that had none to spare.

Three pills fit the phone and not the docked panel, and the obvious fix — hide the third
under a container query — is wrong in a way worth recording: it puts the **active** section
behind a CSS rule JS cannot see. Pick the third section, drag the panel narrow, and the
strip shows two pills and a chevron with nothing on screen saying where you are. So the
count is what the narrowest supported panel (`SET_MIN`, 260px) can afford, at every width,
and the strip's shape stops changing under a drag.

**The chevron carries the WHOLE list, not the leftovers.** That is what makes a dropped
shortcut safe, and it answers "where did General go" with "where all of them are". When the
active section is not a shortcut the chevron wears its NAME instead of "More" — its
*accessible* name stays fixed, because a name that moved with the active section would move
under every locator addressing it.

### Two things this moved that were not obvious

**The search field's state had to go up.** One field now serves whichever scope is open, and
it lives in the banner, which the shell owns — so `slideQuery` sits beside `deckQuery` in
`StudioShell` and `SlideContextBody` takes `query` as a prop. Still one pair per scope: a
query carried across a scope switch hides most of a panel whose rows it was never about.
Pinned in `studio.controls.test.tsx`.

**The banner title is `sr-only` below a 320px panel, not shortened and not `hidden`.** The
toolbar and close control take ~110px of that row, so a narrow panel leaves the line ~110px
and it truncates to "Set it once — a…", which is worse than absent; shortening the copy only
moves the width it breaks at, because the docked panel goes to 260px. Visually hidden keeps
it in the accessibility tree, which matters more than usual: that element is the panel's
`aria-live` region, so it is what announces a deck↔slide switch.

### What it cost the tests

Sections past the first two are menu items, not `role="tab"`, so every spec that clicked a
tab by name had to learn both routes. One helper per tier does it — `goTab` (SlideContext),
`clickSection` (studio.controls), `openSection` (e2e fixture) — each taking whichever route
exists, so call sites stay written as a section NAME and none of them has to change if the
shortcut count ever does.
