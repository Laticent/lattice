---
status: proposed
summary: An audit of autocomplete in the Studio's editors, driven in the real Studio. Ctrl-Space works in the page on both platforms, but it opens nothing in 17 of 37 spots tested, and on macOS the OS takes Ctrl-Space before the browser sees it. The Studio's deck editor runs its own completer, which lacks 8 sources the Playground editor already has (directive names, Mermaid keywords, slot skeletons, map regions, focus/split/size values). The CSS editors pass an empty `override`, which switches off CodeMirror's built-in CSS completion and offers no `var(--token)`. The plan is five slices: one shared completer, a reliable trigger, closing the body gaps, token-aware CSS, then polish.
---

# Studio autocomplete: what completes, what does not, and the plan

**Date:** 2026-11-13 · **Status:** proposed · **Scope:** every CodeMirror editor in the Studio (the deck source
editor, `CodeField` in the theme, component, finish and manifest panes). The Playground editor is in scope only as the
source of code the Studio should share.

## 1. The answer

There are two problems, and they have different causes.

**"Ctrl-Space does nothing."** The binding is installed and works in the page. `Editor.tsx` puts `completionKeymap` in
its keymap, and in the real Studio Ctrl-Space opened the menu on Chromium with both a Linux and a macOS platform
(Alt-i and Alt-\` also opened it in macOS mode). It fails for two other reasons:

1. **Ctrl-Space opens nothing in most of the document.** Out of 37 spots probed, 17 had no completion source at all, so
   the key does nothing and shows nothing. That includes the slide body, a blank line, `<!-- _`, `<!-- _paginate: `,
   inside a mermaid fence, after `![](` with an empty Library, and `<!-- say: `. To an author this looks like a broken
   key, not a missing feature.
2. **On macOS, the OS takes Ctrl-Space first.** It is the default "Select the previous input source" shortcut, so the
   browser never sees the key. CodeMirror's Mac alternatives (Alt-\`, Alt-i) are not shown anywhere in the Studio: the
   `?` shortcut sheet does not list completion. (UNVERIFIED on a real Mac from this sandbox; this is the macOS default
   and the most likely cause on that platform.)

**"Features that should complete, don't."** The Studio's deck editor (`editor-complete.ts`, `makeStudioCompletion`)
was written separately from the Playground's completer (`playground/complete.js`, `latticeAutocomplete`). Both read the
same kernel (`slide-context.js`), but each one wires up a different set of sources. The Studio is missing eight sources
the Playground already ships, and the CSS editors have no completion at all.

## 2. How this was measured

All results come from the real Studio (`astro dev`, `/studio/`, Source mode, Craft posture) in Playwright Chromium at
1440×900. For each spot the probe typed the document up to the caret, pressed Escape, then pressed Ctrl-Space (or typed
one letter), and recorded whether `.cm-tooltip-autocomplete` opened and what it offered. A second run ran in macOS mode
(`navigator.platform = MacIntel`) to test Ctrl-Space, Alt-i and Alt-\`. The probe scripts are not committed; the
matrix below is the record.

## 3. What completes today (deck editor)

| Spot | Opens | What it offers |
|---|---|---|
| Front matter, empty key line | yes | 77 keys, with a description of each |
| Front matter `theme:` | yes | 18 palettes |
| `finish:` | yes | 10 finishes |
| `class:` (deck-wide) | yes | about 300 modifiers and finish classes |
| `paginate:`, `pace:`, `lang:`, and other fixed registers | yes | the register's values |
| Axis registers (`tag:`, `backdrop:`, `image-card:` …), second word | yes | the words still free on an unfilled axis |
| `<!-- _class: ` | yes (Ctrl-Space, or on the first letter) | 80 components, by bucket, with a description |
| `<!-- _class: cards ` | yes | only what `cards` accepts: its variants, modifiers, finishes |
| Slide record `<!-- {` and `layout=` | yes | 37 fields; component names for `layout` |
| ```` ``` ```` fence language | yes | 9 languages |
| Inline spark `` `~ ``, named kind `` `@ ``, pill after a comma, icon `` `^{da `` | yes | starters, kinds, the next open axis, icon names with a preview |
| `![alt](` with Library photos | yes | `asset:<name>` per photo |
| A list item on a `collage` slide | yes | a whole `![Alt](asset:name)` line per photo |
| Hover a front-matter key | yes | its description, values and default |

## 4. What does not complete

### 4.1 Deck editor — the Playground has the source, the Studio does not

| Spot | Playground source (`playground/complete.js`) |
|---|---|
| `<!-- _` → local directive names (`_paginate`, `_header`, `_focus` …) | `directiveNameAt` + `DIRECTIVE_OPTIONS` |
| Inside a ```` ```mermaid ```` fence | `mermaidSource` (`MERMAID_KEYWORDS`) |
| The empty body of a classed slide → the component's slot skeleton | `skeletonSource` |
| A `map` slide's body → region names | `dataSources` (`map-complete.js`) |
| `_focus:` / `_focusSteps:` axis and style | `focusAxisSource`, `focusStyleValuePosition` |
| `split:` and `size:` values | `splitValuePosition`, `sizeValuePosition` |
| Nested `backdrop:` map axes | `backdropAxisSource` |

### 4.2 Deck editor — nobody completes it yet

| Spot | What it should offer | Where the words live |
|---|---|---|
| A local directive's value (`<!-- _paginate: `, `_backgroundColor: `) | the same values as the front-matter key | `OFFERED_SETTINGS`, `registerValueLists` |
| A note channel (`<!-- say: `, `<!-- note`) | `say:`, `note:`, `reader:`, `describe:` as comment openers | `RECORD_FIELDS` already lists the channels |
| A flowchart slide (shape names after `->`, span words) | the grammar's own tables | `lib/core/flowchart-grammar.js` (`followups.d/2385-p2-flowchart-editor-autocomplete.md`) |
| Math (`$\al`, inside `$$` or a ```` ```math ```` fence) | KaTeX commands | a static list of KaTeX's supported functions |
| `![](` with an empty Library | `sample:` images and a hint that the Library is empty, instead of silence | `media-urls.ts` |
| A blank line in the body | nothing by default; on Ctrl-Space, a short "insert" list (heading, list, `_class:` directive, fence, record) | the insert palette's catalog |

### 4.3 Behavior gaps

- **Accepting a front-matter key does not open its value menu.** Picking `theme` writes `theme: ` and stops; the author
  has to type a letter before the palettes appear. The apply should call `startCompletion` when the key has a value
  list.
- **Keys already set are offered again.** With `theme: indaco` in the front matter, typing `them` offers `theme`.
- **Tab does not accept.** Only Enter does. Tab writes nothing (the Studio leaves Tab to focus movement), so a
  VS Code-trained hand gets no result.
- **A silent Ctrl-Space.** When no source applies, nothing tells the author that the key worked.
- **```` ```chart ```` may be a dead suggestion.** Both editors offer `chart` as a fence language, and no example deck
  or gallery deck uses one. Slice 1 checks whether the engine renders it; if it does not, the word comes out of
  `FENCE_LANGS`.

### 4.4 The other editors (`CodeField`)

`CodeField.tsx` installs `autocompletion({ override: [(ctx) => completionRef.current?.(ctx) ?? null] })`. An
`override` replaces the sources the language provides, so when a caller passes no `completion` prop, the field has no
completion at all, including CodeMirror's own CSS property and value completion. That covers the Theme CSS editor
(`Fabricate.tsx`), Component CSS and skeleton (`LayoutStudio.tsx`) and the Craft lab (`CraftLab.tsx`). Only the
manifest JSON editor passes a source (`manifestJsonCompletion`, schema-driven). This finding comes from reading the code
and CodeMirror's `override` contract; the CSS panes were not driven in a browser.

The bigger miss in the CSS editors is the token system. Every color and type size must go through `var(--token)`
(HARD RULES #3, #4, #11), and none of the editors offers a token name after `var(--`.

## 5. The plan

Five slices, in the order that unblocks the most. Each slice ships on its own with e2e coverage in the real Studio
(`engineering/development.md` §Studio e2e suite) and passes the HARD RULE #34 checks for each new test.

### Slice 1 — One completer, two editors

Move the source list out of `playground/complete.js` into a shared assembly that both editors call. The Studio adds its
own sources (inline spans, Library photos, saved finishes, register values) on top. This closes every row of §4.1 at
once, and it stops the drift: a source added for one editor reaches the other (HARD RULE #1). Extend the existing
`test/unit/components/autocomplete-parity.test.js` so it fails when a source exists in only one editor. Settle `chart` in `FENCE_LANGS` here.

### Slice 2 — A trigger that always works and always answers

- Add a second binding that macOS does not take, and list both in the `?` shortcut sheet. The recommendation is
  **Alt-Escape**, the native macOS text-completion key, so a Mac author has a key that works without changing a
  system setting. Ctrl-Space stays.
- When Ctrl-Space finds no source, show a small "No suggestions here" hint for about a second, so the key never looks
  broken.
- Tab accepts an open completion (only while the menu is open, so Tab still moves focus otherwise).
- Accepting a front-matter key with a value list opens the value menu.
- Filter out keys already set in the front matter.

### Slice 3 — Close the body gaps (§4.2)

In order of how often authors meet them: local-directive values, note-channel openers, the empty-Library image hint,
flowchart words (the existing followup), KaTeX commands, and the explicit-only "insert" list on a blank line. Each
reads its words from the table that owns them, never a copy (HARD RULE #7's spirit).

### Slice 4 — CSS that knows the tokens

Change `CodeField` to stop discarding the language's sources: pass the caller's source as an extra source rather than
an `override`, so CSS property and value completion returns. Add a token source for `var(--`: the token names from the
built token set, each with its role and, where it is a color, a swatch drawn the way `icon-preview.ts` draws icons.
Offer the `--fs-*` scale first after `font-size:`.

### Slice 5 — Polish

Ranking (recently used and catalog usage first, which `modifierUsage` already supports), the details panel showing a
small rendered thumbnail for a component, and a pass at all three widths (1440, 820, 390) with `tools/screenshot.js`
evidence, since the menu has to fit on a phone.

## 6. Decisions

Settled by the owner on 2026-11-13:

1. **One completer, shared by the Studio and the Playground** (slice 1), not a copy of the eight missing sources.
2. **Tab accepts a completion while the menu is open.** With no menu open, Tab keeps moving focus.
3. **Ctrl-Space on a blank body line opens a short "insert" list.** It never opens while the author types prose.

Still open: **the second trigger on macOS.** The usual keys, by platform:

| Platform | Usual key | What else uses it |
|---|---|---|
| Windows | Ctrl-Space (VS Code, Visual Studio, JetBrains) | Some Chinese and Japanese IMEs toggle on Ctrl-Space |
| Linux | Ctrl-Space (VS Code, JetBrains, Eclipse) | fcitx switches input method on Ctrl-Space by default |
| macOS | Ctrl-Space in code editors; Option-Esc in native Mac text fields | macOS "Select the previous input source" is Ctrl-Space by default |

The recommendation is Ctrl-Space on every platform, plus Option-Esc on macOS, the key Mac text fields already use
for completion. CodeMirror's own Alt-\` and Alt-i stay bound. All of them go in the `?` shortcut sheet.
