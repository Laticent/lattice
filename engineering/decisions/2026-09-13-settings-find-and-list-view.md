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

Green, at the head this note ships with: **36** in `ui/settings-view.test.tsx`, the wiring
tests split across the two panels, **2096** across the ui + studio suites, **9416** repo unit
tests, **26** e2e across four specs, plus `npm run lint` and `npm run build:check`. (§6 first
recorded 19 / 2073 / 9345 / 12 — the counts at the first pass, before §8's compaction and
§8.1's fixes added to them.)

**A SECOND ENGINE, for the one mechanism that needs one.** Everything above is Chromium, and
almost all of this change is engine-neutral React. One piece is not: the section collapse is
an unlayered `:not(:has())` rule, and "two engines resolve the same selector differently" is
exactly the class `webkit-tablet` exists for. WebKit is reachable from the sandbox but not
preinstalled (`npx playwright install-deps webkit && npx playwright install webkit`), so
`inspector.spec.ts` was run against real WebKit at 1440x900 through a throwaway config:
**12/12 passed**, the four search/list specs among them. The collapse, the no-matches note,
the restore-on-close and the list view all behave identically.

No `@webkit-*` tag was added. Those projects are deliberately narrow, one per known
divergence class (see the config's note), and a passing probe is not a divergence — tagging
this spec would put 12 tests on every CI run to defend a result that came back clean. The
probe is recorded here instead, re-runnable from these two commands.

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

Result: **297px on the phone, 231px in the docked desktop panel** (from 414 and 352).

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

**The banner title needed a second phrasing, not a second font size.** The toolbar and
close control take ~110px of that row, so a narrow panel leaves the line ~110px and one
sentence truncates to "Set it once — a…", which is worse than absent; shortening the copy
only moves the width it breaks at, because the docked panel goes to 260px.

**What this section first shipped was wrong, and §8.1 is the correction.** It hid the title
below a 320px container and relied on an `sr-only` copy to carry it — which, at the 296px
default docked width, meant the banner had no words at all. The row now carries the sentence
where it fits and an abbreviation where it does not, both drawn. The `sr-only` node survives
for a different job: it is the panel's `aria-live` region, and it announces a deck↔slide
switch at every width. Read §8.1 before trusting anything in this bullet.

### What it cost the tests

Sections past the first two are menu items, not `role="tab"`, so every spec that clicked a
tab by name had to learn both routes. One helper per tier does it — `goTab` (SlideContext),
`clickSection` (studio.controls), `openSection` (e2e fixture) — each taking whichever route
exists, so call sites stay written as a section NAME and none of them has to change if the
shortcut count ever does.


### §8.1 — what the second independent check found

The compaction and the six fixes before it self-reviewed; a checker over both found
**seven** confirmed defects. Three are worth keeping in the record because they are about
how the first attempt went wrong, not just what it got wrong.

**The banner had no words at the default docked width, and the tests were weakened to
match.** The title was hidden below a 320px *container* — and `SET_DEFAULT` is 296, minus
28px of padding, so every docked desktop and tablet width was under it. The scope icon had
just moved to a `compact`-gated switch and both badges were gone, so the docked banner
rendered as icons over a tint, with a background color as the only cue between deck and
slide. Two tells were in the diff and neither was read as one: `toBeVisible()` became
`toBeAttached()` in two e2e specs, and a unit test gained a comment saying to address the
line "by TEXT rather than by visibility". A probe printing `sr-only (announced, not drawn)`
was read as the fix working, when it meant the deliverable was invisible.
Now: two phrasings that swap on the container — the sentence where it fits, an abbreviation
where it does not — the long form announced at every width, and the icon back on desktop,
where the switch that took it does not render. Words at every width, verified at 390 / 820
/ 1440 / 2560 in both scopes.

**The `<details>` fix did not hold, through a second door.** The controlled version ignored
`onToggle` while a query was live, which *swallowed* the toggle: no state change, no
re-render, `open` still `true` from React's side while the DOM said `false` — the same
desync the first cut had. Collapse it mid-search, type again, and the new hit rendered
inside a shut disclosure with no "no matches" note, because there *was* a hit. The test
covered collapse-then-search and open-search-close, never toggle-*during*-search. Under a
query there is now no `<details>` at all: the children render inline, so there is no toggle
to swallow.

**The section strip re-introduced the exact ARIA violation `PillTabs` exists to avoid** —
`role="tablist"` with `role="tab"` children, no roving tabindex, no arrow keys, and the
chevron *inside* the tablist as a non-tab child (an `aria-required-children` axe
violation). Borrowed `PillTabs`'s keyboard implementation and moved the chevron out.

Three smaller ones: a scope labeled `"Hide header footer page number"` — a concatenation of
its children's labels — so typing one row's name returned all three; the `SettingsBlock`
guard test matched `'<Row '` with a trailing space, missing a multi-line `<Row`, and could
spin forever on a self-closing block; and `onViewChange` stayed a required prop nothing
read. The search toolbar had also ended up *inside* the `aria-live` region, so opening
search and the first keystroke mutated a polite region — the announcement is its own node
now.

**The before/after figures are re-derived, not asserted.** Checking the pre-compaction files
out over the running dev server and re-measuring: phone **414px**, docked desktop **352px**
(§8 first said 351 — a rounding slip). After: **297px** and **231px**.

---

## 9. Round two — three ✕ in one row

§8 gave the find toolbar the banner's row. What it did not notice is that the row already
had a ✕ on it, and `PanelSearch` draws one of its own.

Measured on a real 390x844 phone, deck scope, query "page":

| Control | x | Size | Job |
|---|---|---|---|
| `Clear search` | 305 | 24x24 | Empty the field, stay open |
| `Close search` | 348 | 28x28 | Empty the field, close it, restore the toggles |

Two sizes of the same glyph, 19px apart, on a 293px row. The **docked desktop panel was
worse**: at 1440 the same query drew `Clear search` at 196, `Close search` at 239 and the
panel's own `Collapse settings` at 273 — three identical marks inside 100px of a 296px
panel.

**This was a composition bug, not a stray button.** Both jobs are real, and the phone is
where the difference bites: clear-and-stay keeps the keyboard up for the next word, and
closing dismisses it. What is not real is needing both **drawn at once** — with text in the
field the next thing you want is it gone, and with the field empty there is nothing to
clear. So the fix went into the shared field rather than beside it: `PanelSearch` takes an
`onClose` alongside `onClear` and draws ONE trailing button whose job, and whose accessible
name, follow the field's state. Escape is unchanged and still leaves from either state.

The panel's own collapse is now `PanelLeftClose` — the idiom the preview pane two panes over
already uses for the same act. It is a different job from dismissing a search, and it should
not have looked like one.

**One more thing this exposed.** With the field open at 390px, the banner sentence rendered
as `Set it …` in the 60px it had left. That is §8.1's defect — a row whose words are a stub —
arriving through a different door: the field, not a container query. The sentence now steps
aside entirely while the field is open. Nothing moved behind `sr-only`, which is the trap
§8.1 fell into: the scope stays DRAWN by the field's own placeholder ("Search deck
settings…"), by the Slide/Deck segment above it on mobile, and by the scope icon in the row
on desktop.

---

## 10. Round two — recall, without importing a ranker

`settingsMatch` was a boolean substring test: every whitespace term had to appear literally.
The component picker next door has a genuinely good search kernel we were not using
(`lib/component-search.ts` + `lib/intent-search.ts`, imported by four surfaces already), and
HARD RULE #15 says reuse rather than reinvent.

**The fork, and it matters: we took the recall and refused the ranking.** The picker RANKS —
it answers "which of 69 components did you mean" with an ordered list, and a wrong guess
costs a scroll. A settings filter has no order to be wrong about: a row is drawn or it is
not, so a ranker's tail is not a worse answer further down, it is six unrelated rows sitting
beside the right one with nothing saying which is which. Precision-first is CORRECT here, and
the substring rule stays exactly as it was — first test, and the reason `pag` still finds
Page numbers on the third keystroke.

What a boolean substring test has no answer for is recall, so three arms were added, all
OR'd, none of which can hide a row the old rule showed:

| Arm | Fixes |
|---|---|
| **Morphology** (Porter2, the picker's stemmer) | "numbers" → "Hide page number", "captions" → Caption, "aligned" → Headline alignment. Substring already covered a query SHORTER than the label; never this direction. |
| **Vocabulary** (a 19-entry table) | "font" → Type scale, "pagination" → the slide's page-number row, "margin" → Claim, "a11y" → the screen-reader description. |
| **Typo** (anchored, one edit, plus transposition) | "numbre" and "nubmer" → Page numbers, "capiton" → Caption, "algnment" → Headline alignment. |

The kernel is `docs/src/lib/settings-search.ts` — pure and DOM-free, the shape
`component-search.ts` takes. `settings-view.tsx` re-exports `settingsMatch` from it.

### What was NOT borrowed, and why each would have been a regression

**`contentWords`, intent-search's tokenizer.** Three reasons, all of them checked by CALLING
it — a first draft of this section gave a fourth that is simply false, and the independent
check caught it. It claimed the stop list eats the only word telling *Says something* from
*Says nothing*. It does not: `contentWords('Says nothing')` returns `["says","nothing"]`, and
none of `says` / `something` / `nothing` is in `STOP`. What is true:

- it **does** drop `no` and `all`, among 112 others — `'No comments on this slide yet'`
  tokenizes to `["comments","yet"]` and `'All 7 slides follow'` to `["slides","follow"]`. A
  settings filter has to keep those; they are what an author types;
- it does not fold diacritics, and it is worse than not folding: the `[a-z0-9]` class DROPS
  accented letters, so `'Résumé finish'` becomes `["sum","finish"]`. `settingsMatch` has
  folded NFD since it shipped;
- `tools/intent-bakeoff/fit-search.ts` imports it, so every weight in that bake-off was tuned
  against its exact output; widening it to suit this module would invalidate those numbers
  silently.

So this module has its own tokenizer, and the pieces it shares are the ones with no policy in
them — `stem`, `americanize` and `withinDistance`, the last two newly exported from
`intent-search.ts` and otherwise untouched.

**A global vocabulary for the typo repair.** intent-search only repairs a term that matched
NOTHING in its index — that is what stops "mark" becoming "dark". A control here decides
alone, with no registry of what the other sixty rows say; that registry is the second render
pass §3's `:has()` rules exist to avoid, and a best-effort one filled as rows render would
make a row's visibility depend on what was drawn before it. The repair is **anchored on the
first two characters** instead: a real typo is almost never in the first two keystrokes.
"mark"→"dark", "tint"→"hint" and "accent"→"ascent" are all refused by the anchor alone.

### Three things the measurement changed

Every number below is from the LIVE panel — 63 rows read off the running Studio, both
scopes — compared against the substring-only rule, over a 295-word vocabulary built from the
corpus's own words plus the synonym keys.

- **One edit, not the picker's two-at-seven-characters.** At two edits, "comment" reached the
  row about frame CONTENT and "connect" reached both: two edits on a seven-letter word is
  most of the word, and an anchor cannot save a pair that genuinely shares a prefix. Dropping
  to one edit put 7 queries back to their exact pre-change result sets and cost none of the
  typos above.
- **A transposition arm, because Levenshtein scores a swap as two edits.** The single
  commonest way a fast typist misses is therefore the one a one-edit budget refuses:
  "numbre" returned nothing. Trying each adjacent swap and then requiring an exact hit buys
  that class without buying a second free edit — and leaves `withinDistance` in
  `intent-search.ts` untouched, which the bake-off depends on.
- **`americanize` on BOTH sides of the stemmer.** Its rules are anchored to the end of the
  word, so `colour` folds and `colours` does not — the `s` is in the way. Stemming first and
  folding after lands the plural on the same stem as the singular. Before that, "colours"
  only reached the Theme row through the typo repair, one deletion from "colors", which is a
  rescue that evaporates the moment the row's wording moves. Folding BEFORE the stemmer still
  earns its place: `organisation` has to become `organization` before Porter2 sees it.

**Net precision.** 248 of 295 vocabulary words return exactly what they returned before; 47
widen, by a median of 2 rows out of 63; **nothing narrows** — the arms are strictly additive
by construction. The widest is "hidden" at 0 → 7, which is the synonym doing its job. The
worst false positive inside the sweep is "alone" → 8, because Porter2 stems *alone* and
*along* alike; that is a stemmer property, not a policy of ours, and "alone" is not a settings
query.

**And the sweep has a blind spot worth naming, because the independent check walked into
it.** A vocabulary built FROM the corpus cannot contain a word that is not in the corpus —
which is exactly where a false positive lives. The one found that way: `americanize`'s
`/our$/ → or` rule turned **"four" into "for"**, and "for" appears in half the panel's
descriptions, so `four` matched the slide's Canvas row. The fold is now skipped for words
under five characters (`four`, `hour`, `tour`, `pour`, `sour` are the whole collision class,
and nothing the fold exists for is shorter than `colour`). `americanize` itself is
intent-search's and stays untouched — the picker's bake-off is tuned against it.

**`MAX_TERMS` is not answer-neutral either**, and this section's first version said it was.
Terms are ANDed, so ignoring the tail past the cap can only ever show MORE: a 13-term query
whose first twelve all match now returns the row. The direction is the safe one — it can
widen, never hide — but the claim was wrong, and the test that "pinned" the non-effect passed
only because all forty of its junk terms fell inside the cap.

**`find=` props stay.** They carry the synonym ONE row needs; the shared table carries what
is not worth writing on twenty. The slide panel had zero `find=` props, which is why every
query above lands hardest there.

### A pre-existing keyword bug, found by the same measurement

Searching **"color"** on the deck panel returned ELEVEN rows — the whole Accent section —
because its `keywords` listed `color`, a word its own Brand bar row already carries. That is
precisely the contract §4 was written after, in the same shape ("page" returning all of
Chrome). It predates this change and sits on its path, so it is fixed here rather than filed
(HARD RULE #18): the keyword is gone and "color" now returns the two rows that are about
color. "white label" and "accent" still open the section whole.

---

## 11. Round two — as many pills as fit, measured

§8 froze the strip at two shortcuts and gave a reason that still stands *for the route it
was rejecting*: hiding the overflow with a **container query** puts the ACTIVE section behind
a CSS rule JS cannot see. Pick section six, drag the panel narrow, and the strip reads
`Look · Chrome · More` with nothing on screen saying where you are.

**That argument kills the CSS route, not the feature.** A JS measure knows both things at
once — what fits, AND which pill must survive — and only one of them is expressible in CSS.

So `SettingsSectionTabs` renders a hidden copy of the whole strip (`aria-hidden`, `inert`,
`visibility: hidden`, `w-max`, absolutely positioned so it is laid out but costs the row
nothing), and a `ResizeObserver` measures the row against it. The fitting policy is a pure
exported function, `visibleSectionTabs(tabs, activeIndex, fit)`:

- the longest LEADING run of pills that fits beside the chevron;
- **plus the active pill, always**, appended after that run when it is not in it;
- with the active pill's width **reserved before the run is chosen**, not squeezed in after —
  pinning afterwards is how a pinned strip overflows, since the pill you pin is rarely the
  width of the one you dropped;
- and when the measurement is unavailable, the shape §8 shipped: two, with no pin. An
  unmeasured strip must never be wider than a measured one.

The observer watches BOTH the row and the ghost. The ghost is the interesting one: it is the
only thing whose width changes when a label changes or when the web font lands after first
paint, and neither of those touches the row. That is also why there is no dependency key to
keep in sync.

### What it actually draws

Measured on the running Studio, deck scope, with **Speech** — the last of six — active:

| Surface | Strip row | Pills drawn |
|---|---|---|
| Phone, 390x844 | 362px | `Look · Chrome · General · Speech · More` |
| Tablet drawer, 820x1180 | 218px | `Look · Speech · More` |
| Docked desktop, 1440x900 | 231px | `Look · Speech · More` |
| Docked desktop, 2560 | 236px | `Look · Speech · More` |

The phone gains two pills it never had. The docked panel keeps two — and the difference is
that one of them is now the section you are in. Dragging the divider live, the count walks
2 → 3 → 4 and back, on one line the whole way, with `Speech` never leaving the screen.

Note what the last two rows say about the lever: the dock is a fixed-width panel, so the
VIEWPORT barely moves the strip (231px at 1440, 236px at 2560). The panel DRAG is what moves
it, which is why the e2e drags rather than resizes.

### Carried over, deliberately unchanged

- the chevron holds the **whole** list, not the leftovers, and is drawn at every width, so
  the strip does not sprout a new control under a drag;
- its **accessible** name is fixed (`… — all sections`), because a name that moved with the
  active section would move under every locator addressing it;
- the roving-tabindex / arrow-key tablist implementation borrowed from `PillTabs`, and the
  chevron OUTSIDE the tablist — an independent check caught that `aria-required-children`
  violation once already, and it is not being re-introduced;
- `openSection` in the e2e fixture still takes whichever route exists, so no spec cares how
  many pills there are.

### Where each half is tested, and why

jsdom reports every width as 0 and has no `ResizeObserver`, so it can prove the POLICY and
nothing about the measurement. The split is therefore:

- **unit** — `visibleSectionTabs` against real measured pill widths: it grows with the row,
  never exceeds it, always contains the active pill, reserves rather than squeezes, and
  falls back to two-without-a-pin when it cannot measure.
- **e2e** — the real strip under a real drag: one visual line and zero overflow at every
  width, more pills when wider and fewer when narrower, and the active pill still `visible`
  and `aria-selected` after each drag. Both go red against a strip frozen at two, which is
  the only thing that proves they are testing the mechanism rather than describing it.

**One thing the mutation run corrected in this note's own reasoning.** A first draft of the
fit loop's comment said the cost is "not monotone in `n`, so scan them all". It is monotone:
passing the active index drops its reservation and picks the same pill up inside the run, so
`total(activeIndex)` and `total(activeIndex + 1)` are equal and everything either side
climbs. The tell was a mutation that added `else break` and stayed green. The scan is still
exhaustive — six or seven runs — but the comment now says why that is a choice rather than a
requirement.

### The shared search field, and one helper de-duplicated

`useIsomorphicLayoutEffect` (`useLayoutEffect` on the client, `useEffect` under Astro's
server render) was private to `use-resizable-split.ts`. The measure has to be a LAYOUT effect
— a strip that paints wide and snaps narrow is both a visible jump and a locator Playwright
can catch one tick before it vanishes — so rather than write a second copy it moved to
`ui/use-isomorphic-layout-effect.ts` and both import it.

---

## 12. What the independent check found — one regression, and six sentences that were not true

Maker-checker over §9–§11's diff. It confirmed ten findings. Two changed the code, one is
recorded as a limitation, and the rest were prose — which is the part worth writing down.

### The regression: the measuring ghost made the panel scroll sideways

**The strip's hidden measuring copy handed the whole settings panel a 259px horizontal scroll
region.** The ghost is `absolute` and `w-max`, so it is 500–600px wide inside a 231px row —
and a `visibility: hidden` box still contributes SCROLLABLE OVERFLOW. The panel body is
`overflow-y-auto`, and CSS Overflow 3 computes the *other* axis to `auto` when one axis is not
`visible`. So one two-finger swipe over the panel scrolled every control off-screen and left a
blank tan column.

| Surface | Panel `scrollWidth` − `clientWidth`, before |
|---|---|
| Deck, 1440 docked | +259 |
| Slide, 1440 docked | +336 |
| Deck sheet, 390 phone | +128 |

The first fix was `overflow-x-clip` on the strip row. **Clipping the row turned out to be
the wrong box entirely, and it took two more checks to establish that** — §13. What ships is
a zero-size `overflow: clip` wrapper around the ghost alone. After: the panel body's
`scrollWidth` equals its `clientWidth` at 390 / 820 / 1440 in both scopes, and a 400px
sideways wheel over the panel moves it 0px.

**And the first cut of that fix broke something else.** A bare `clip` has an
`overflow-clip-margin` of 0, the first pill sits flush against the row's content edge
(measured gap: 0px), and the app focus ring is `outline: 2px` at `outline-offset: 2px` — so
it paints 4px OUTSIDE the box and was sheared off. A keyboard and low-vision regression
inside the fix for a scroll regression. `[overflow-clip-margin:6px]` looked like the answer
and was not, twice over — §13.

*One correction to the check that found this.* It reported the scroll region as
+273/+342/+130, measured on a different box from the one a swipe actually moves — the first
of those is the ROW's own `scrollWidth − clientWidth` (504 − 231 at the docked deck panel).
The PANEL BODY, which is the box that scrolls, gains +259 deck and +336 slide at 1440,
+272/+349 in the 820 drawer, and +128/+205 on a 390 phone.

**Both gates that should have caught it were structurally blind.** §11's own e2e measured
`row.querySelectorAll('button')`, and the ghost's children are `<span>`s — so the assertion
claiming "zero overflow at every width" could not see the thing that overflowed.
`npm run check:overflow` passed too; it measures the page and the header, not this scroller.
The e2e now asks the SCROLLER instead of the buttons, and a second test drives a real
sideways wheel. Both fail on the un-clipped row.

**The wheel arm has its own lesson, and it is the sharpest one here.** A first version of it
passed against the broken code, and it was deleted with a comment blaming Playwright:
"the synthesized wheel does not reach this nested scroller". That is false. The second
independent check dispatched the same wheel and moved the panel 262px. The arm was missing
`page.mouse.move` — the cursor sat at Playwright's default (0, 0), outside the panel, so the
wheel went nowhere. A working test was thrown away, and a wrong root cause was written into
a durable comment, *in the commit whose whole subject was correcting false claims*. The arm
is back, with the move, and it fails on the old code.

### The other code change, and one recorded limitation

- **A stale `fit` priced an unmeasured pill at zero.** `fit.pills[i] ?? 0` — and the slide
  panel's section list is per-slide (`Marks` appears only when the slide has any), so clicking
  between slides changes the tab count live. A 7th tab against a 6-tab fit laid out 320px of
  pills in a 231px row. A fit whose pill count disagrees with the tab count is now treated as
  no measurement at all.
- **`four` matched the Canvas row**, via `americanize`'s `/our$/` rule. Fixed with a
  five-character floor on the fold; see §10.

### Six sentences that were not true

Each of these was written as a measured claim and was wrong. None was a defect on its own;
together they are the reason to distrust the rest, which is the wrong property for a change
whose whole argument lives in its comments.

| Claimed | Actually |
|---|---|
| `contentWords`' stop list eats *Says something* / *Says nothing* | It returns `["says","nothing"]`; none of those three words is in `STOP` (§10 now gives the reasons that do hold) |
| Clearing the field leaves the caret in it, so a phone keyboard stays up | Focus moved to the BUTTON, which had by then become "Close search". **Fixed in the code**, not the comment: `PanelSearch` refocuses its input on clear |
| Deleting `MAX_TERMS` changes no answer | A 13-term query whose first twelve match returns the row with the cap and not without it |
| The unit fixture's pill widths were "taken off the REAL strip" | Every number was wrong, `General` by 10px, the chevron in the wrong direction. Re-measured after `document.fonts.ready` |
| `-my-0.5` keeps the field at 40px | The box is 39.59px empty and 42px with a trailing button. The line is height-NEUTRAL versus the old `size-6` (both contribute a 24px margin box), which is what it is actually for |
| The synonym table "has no two keys that stem alike" | `narrate` and `narration` both stem to `narrat`. Harmless — same expansion — but by coincidence, not design |

Two smaller ones went with them: `role="tablist"` could render with no `role="tab"` child at
the zero-pill floor (unreachable at any supported width, fixed anyway), and the banner's
"the scope stays drawn" note credited the field's placeholder, which disappears at the first
keystroke — what actually carries it is the activity rail's own Slide / Deck labels.

**The lesson is narrow and worth keeping: a claim about behavior is worth exactly what it cost
to check.** The claims that survived — the fit arithmetic, monotonicity, no observer loop, the
caches, "nothing narrows", the keyword fix, `use-resizable-split` being behaviorally identical
— were the ones derived from running something. The six above were derived from reading the
code and sounding right.

---

## 13. What the THIRD check found — the fix for the fix did nothing

§12 closed with a lesson about claims that cost nothing to check. A third independent pass
over the same diff found the very next one.

### `overflow-clip-margin` needs BOTH axes, and the shipped row clipped one

The row went out as `overflow-x-clip [overflow-clip-margin:6px]`, with a comment explaining
that leaving `overflow-y: visible` was the conservative half of the fix. **Chromium applies
`overflow-clip-margin` only to an element that clips on both axes**, so the declaration did
nothing at all: the row rendered identically with `0px` and with `6px`, and the focus ring on
the first pill stayed sheared — the regression §12 said it had closed.

Measured on the running Studio, against the same clip topology at a wider margin, on the
focused first pill (`:focus-visible`, real keyboard focus, noise floor 0):

| Row's overflow | Pixels of paint cut, 390 | 1440 |
|---|---|---|
| `clip` / `visible`, margin 6px — **as shipped** | 149 | 149 |
| `clip` / `visible`, margin 0px | 149 | 149 |
| `clip` / `clip`, margin 0px | 552 | 486 |
| `clip` / `clip`, margin 4px | 2 | 2 |
| `clip` / `clip`, margin 6px | 0 | 0 |

The first two rows being equal is the finding: the margin was inert. **The conclusion drawn
from this table — "so clip both axes" — was itself wrong, and §14 is why.** The table stands;
what it cannot see is a second engine.

**And the margin has a ceiling, which nothing had measured.** A clip margin is part of the
ancestor's scrollable overflow, so raising it "for safety" brings the scroll region back:
in the deck scope `16px` returns +2px, `24px` +10px, `48px` +34px. The slide scope's row is
4px narrower and holds out one step longer (`16px` → 0, `24px` → +8, `48px` → +32) — the
three numbers are one scope's, and an earlier draft of this section presented them as the
panel's. (That draft also said "13px narrower". Measured, the deck/slide gap is 4px at every
width in both engines; 13 is the deck row at 1440 minus the deck row at 820 — the width axis
mistaken for the scope axis.)

### Two more of my corrections were wrong

- **§12 "corrected" the second check by saying the ring was never sheared at 390.** It was.
  That correction reasoned from a pixel diff against the *un-clipped* state, which at 390 also
  carries a 128px scroll region — the layout shift swamped the ring. Comparing states that
  share a clip topology, 390 shears exactly as 1440 does. The original check was right and I
  overruled it with a worse measurement.
- **"This needs a narrower container than the UI offers today"**, on the zero-pill floor, was
  reasoned from the 260px dock minimum and never looked at the tablet drawer. The 820px
  drawer gives the slide panel a **214px** row; pick `Comments` there and the strip really is
  the chevron alone, wearing "Comments" — measured, not derived.

---

## 14. What the FOURTH check found — the fix worked in one engine

Three rounds had all been measured in Chromium, because that is the browser this sandbox
renders with and the only one the e2e suite drives. The fourth check installed WebKit and
asked the question none of the first three had.

### WebKit does not implement `overflow-clip-margin` at all

`CSS.supports('overflow-clip-margin', '6px')` is **`false`** in WebKit 26. So on Safari and
iOS, a row written `overflow: clip` with a `6px` margin is simply a bare clip, and the first
pill's focus ring is sliced flat — the exact round-two regression, shipped to every Apple
user. Measured on the same page, same control (the ghost taken out of flow, the row
un-clipped), same focused pill:

| Engine | `clip` + `clip-margin: 6px` on the row |
|---|---|
| Chromium 141 | 0px of paint cut |
| WebKit 26 | **374px of paint cut** |

This is a regression the PR *created*: `main`'s row is `flex flex-wrap gap-1.5`
(`pill-tabs.tsx`, no `className` from the call site), with no ghost and no clip, so HARD
RULE #18 applies with no exit — the surface worked before the change and did not after.

**The new e2e pin could not have caught it, and the reason is worth keeping.** The pin
asserted `overflowClipMargin === '6px'`; in WebKit that property reads `undefined`, so the arm
would have *failed* there — but the spec is untagged and runs on the Chromium `desktop`
project only. The one browser where the UI was broken is the one the test never visits.

### The fix: clip the ghost, not the row

The mistake was three rounds deep, not one: **the clip was on the wrong box the whole time.**
The row is full of focusable, painted children sitting flush against its edge; the ghost is a
hidden measuring copy that paints nothing. Put the clip on a zero-size box around the ghost
alone and there is nothing left to shear, so no clip margin is needed and no engine's support
for one matters.

```
<div class="absolute left-0 top-0 size-0 overflow-clip">   ← paints nothing, clips everything
  <div class="w-max" style="visibility:hidden"> … </div>   ← keeps its intrinsic width
```

`w-max` survives the zero-width parent because intrinsic sizing ignores the parent's width,
and the intrinsic widths are the only thing the fit reads. Five candidates were measured
across both engines before this one was taken:

| Candidate | Ring cut, Chromium | WebKit | Panel scroll | Row height |
|---|---|---|---|---|
| `clip` + `clip-margin: 6px` on the row (shipped) | 0 | **374** | 0 | +0 |
| clip + `padding: 6px` + `margin: -6px` on the row | 118 | 40 | 0 | **+12** |
| clip + `padding: 6px`, uncompensated | 3798 | 3632 | 0 | **+12** |
| no clip, ghost `position: fixed` | 0 | 0 | 0 | +0 |
| **no clip, ghost in a `size-0` clip box** | **0** | **0** | **0** | **+0** |

The last two both work — though the `position: fixed` row's Chromium `0` is an identity, not
an independent measurement: the control that table diffs against is itself "ghost `fixed`,
row un-clipped". Its other three columns are real, and a later round re-derived the three
non-trivial rows exactly. `position: fixed` was rejected for a failure mode it would have
taken another round to find: a `transform`, `filter` or `contain` on any ancestor makes a fixed
descendant resolve against *that* ancestor instead of the viewport, and the mobile settings
sheet animates in on a transform — so the overflow would come back for the length of the
animation. No ancestor captures it today (checked at 390 / 820 / 1440 in both scopes, both
engines), which is exactly the kind of "true right now" the last three rounds kept punishing.
The `size-0` wrapper depends on nothing but intrinsic sizing.

Verified after the change, both engines, 390 / 820 / 1440 × deck and slide: focus ring
pixel-identical to no clip at all, panel and document `scrollWidth == clientWidth` **on the
section the panel opens with**, row height unchanged, ghost widths intact. The unqualified
form of that sentence was false — §15.

### Five more claims that were not true

| Claimed | Actually |
|---|---|
| "restores the ring" (§13, the component comment, the card) | In Chromium. WebKit has no `overflow-clip-margin`, so the ring stayed sheared on Safari and iOS |
| The gotcha's advice to prove wheel delivery "by scrolling the axis that IS supposed to move" | It does not work at the viewport and section the spec runs (deck / Look / 1440x900, range 0), which is why the shipped arm uses a `wheel` listener. The claim as written — "0 at every width and scope" — is false: slide / Notes gives 180px at the same viewport (§15) |
| "this suite keeps no pixel baseline for the Studio" | It keeps three (`visual.spec.ts-snapshots/studio-{desktop,tablet,mobile}-linux.png`). None opens the Inspector, so the substance holds; the sentence did not |
| Two `**Fixed:**` changelog bullets, for the sideways scroll and the sheared ring | Neither ever shipped — both were created inside this PR. Removed: HARD RULE #10 records user-visible changes, and a release note claiming to fix a bug no release had is noise |
| "504px wide inside a 231px row" | One scope, one engine. Deck 504 (WebKit) / 507 (Chromium); slide 579 / 585. Rows run 214–362 |

**Four rounds, four findings, and each one was a claim measured on too narrow a surface** —
one axis, one state, one scope, one engine. The pattern is not carelessness about measuring;
every wrong claim here had a measurement behind it. It is that the measurement's *scope* was
assumed rather than chosen, and the assumption never appeared in the sentence the claim was
written as.


---

## 15. What the FIFTH check found — the code held, three claims about it did not

The first clean-ish round. `1dbd890`'s change was re-derived independently and stood up: the
focus ring's diff box lands at exactly `[-4, -4, +4, +4]` from the pill in all twelve
engine × width × scope combinations, §14's candidate table reproduces to the pixel on its
three non-trivial rows, the ResizeObserver still re-fits through the new offsetParent chain,
`Accessibility.getFullAXTree` finds zero ghost-only labels among 644 nodes, and each of four
mutations fails exactly the arm it should. What did not stand up were three sentences.

### The panel CAN scroll sideways — pick General

**"The settings panel cannot be scrolled sideways at all" was the name of a test and the
substance of four sentences, and it is false.** With the General section selected the panel
body has a horizontal scroll region, and a real wheel moves it:

| Viewport | Engine | `scrollWidth − clientWidth` |
|---|---|---|
| 1440x900 | Chromium 141 | 15 |
| 1440x900 | WebKit 26 | 13 |
| 820x1180 | Chromium 141 | 28 |
| 820x1180 | WebKit 26 | 26 |

Every other section reads 0, which is why nothing caught it: the panel opens on **Look**, and
so does the e2e's `beforeEach`.

**It is not the strip.** Attributed by elimination: with the ghost's clip box set
`display: none` the panel still reads 15; with that box set `overflow: visible` it reads 262.
The 15px is the **Language row's select trigger** — `min-content` 258px inside a 231px content
box, which the row's `min-w-0` cannot pull below because the trigger's own `min-width` is
`auto`. `SETTING_CONTROL_COL`, `LanguageSelect.tsx`, the panel-body classes and `SET_MIN` are
byte-identical to `main`.

**Left as #2203, not fixed here**, and the boundary is HARD RULE #18's on-path test.
This change neither caused it nor worsened it; the cause is a different component; and the
one-line fix that clears it — `max-w-full` on `SETTING_CONTROL_COL`, measured to take the
trigger 260 → 231 and the overflow to 0 — lands on a constant every settings row in both
panels renders through. That is a change about the row system, not about the section strip,
and #17 says it gets its own branch. What this PR owes is that its own sentences stop
claiming the panel never scrolls: the test is renamed to what it pins, and the comments say
where the remaining 15px comes from.

### Two more over-scoped measurements

- **"The panel's vertical scroll range is 0 at every width and scope"** — in three places,
  and used in `gotchas/css.md` to steer the next reader away from the obvious wheel-delivery
  probe. It is 0 for deck / Look at 1440x900, the surface the spec runs. It is **180px** for
  slide / Notes at the same viewport, 241 for Marks, 86 for Accent, and 58 for deck / Look at
  1280x720 — the range moves with viewport *height*, an axis the sentence never named. The
  `wheel`-listener probe is still the right one because it is portable; it is not the only
  one that works.
- **"The slide scope's row is 13px narrower"** — it is **4px**, at 390, 820 and 1440, in both
  engines. 13 is the deck row at 1440 minus the deck row at 820: the width axis mistaken for
  the scope axis. The conclusion it supported (the slide scope holds out one step longer on
  the clip-margin ceiling) re-derives correctly.

### The shape of all five rounds

Five rounds, and the through-line is not carelessness about measuring — every wrong claim in
this PR had a real measurement behind it. It is that the measurement's **scope** was assumed
rather than chosen, and the assumption never made it into the sentence: one axis (round
three), one state, one section (this round), one scope (the 13px), one engine (round four).
The fix is not "measure more"; it is to write the scope into the claim, so that a sentence
which has only been tested on deck / Look / Chromium / 1440 says so.
