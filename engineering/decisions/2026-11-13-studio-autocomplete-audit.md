---
status: shipped
summary: An audit of autocomplete in the Studio's editors, driven in the real Studio, and the fixes that shipped with it. Ctrl-Space worked in the page but opened nothing in 17 of 37 spots tested, and on macOS the OS takes it before the browser sees it (measured on a macOS 26 runner with the stock shortcut on; Option-Esc reached the page every time). The Studio's deck editor runs its own completer, which lacks 7 sources the Playground editor already has (directive names, Mermaid keywords, slot skeletons, map regions, focus values, nested backdrop axes). The CSS editors pass an empty `override`, which switches off CodeMirror's built-in CSS completion and offers no `var(--token)`. The plan was five slices; §7 records what shipped, the evidence, and what was deliberately not built.
---

# Studio autocomplete: what completes, what does not, and the plan

**Date:** 2026-11-13 · **Status:** shipped (slices 1–4 and the slice 5 width pass; §7) · **Scope:** every CodeMirror editor in the Studio (the deck source
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
   `?` shortcut sheet does not list completion. Measured on a real macOS 26 runner (§7.2): with the stock input-source
   shortcut on, a real Ctrl-Space reached the page 0 times in 4 and switched the input source each time.

**"Features that should complete, don't."** The Studio's deck editor (`editor-complete.ts`, `makeStudioCompletion`)
was written separately from the Playground's completer (`playground/complete.js`, `latticeAutocomplete`). Both read the
same kernel (`slide-context.js`), but each one wires up a different set of sources. The Studio is missing seven sources
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
| Nested `backdrop:` map axes (today the Studio offers the top-level front-matter keys there instead) | `backdropAxisSource` |

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
(`Fabricate.tsx`), Component CSS and skeleton (`LayoutStudio.tsx`) and the Craft lab (`docs/src/components/craft/CraftLab.tsx`). Only the
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

- Add Option-Esc on macOS, the native Mac text-completion key, so a Mac author has a key that works without changing
  a system setting. Ctrl-Space stays on every platform. List both in the `?` shortcut sheet (§6).
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

1. **One completer, shared by the Studio and the Playground** (slice 1), not a copy of the seven missing sources.
2. **Tab accepts a completion while the menu is open.** With no menu open, Tab keeps moving focus.
3. **Ctrl-Space on a blank body line opens a short "insert" list.** It never opens while the author types prose.
4. **The trigger keys are each platform's usual ones**, from this table:

| Platform | Usual key | What else uses it |
|---|---|---|
| Windows | Ctrl-Space (VS Code, Visual Studio, JetBrains) | Some Chinese and Japanese IMEs toggle on Ctrl-Space |
| Linux | Ctrl-Space (VS Code, JetBrains, Eclipse) | fcitx switches input method on Ctrl-Space by default |
| macOS | Ctrl-Space in code editors; Option-Esc in native Mac text fields | macOS "Select the previous input source" is Ctrl-Space by default |

So: Ctrl-Space on every platform, plus Option-Esc on macOS, the key Mac text fields already use for completion.
CodeMirror's own Alt-\` and Alt-i stay bound. All of them go in the `?` shortcut sheet.

## 7. What shipped, and the evidence

One PR, one commit per slice. Every new or changed test was seen red (the product broken or the fix reverted, then
restored), green 10 times in a row alone, and green under load (`--workers=4 --repeat-each=5`), on Chromium, Firefox and
real WebKit at iPhone size. The browser spec, `docs/e2e/editor-completion-keys.spec.ts`, runs on every Playwright
project the Studio has: desktop, mobile, webkit-tablet, webkit-phone and gecko.

### 7.1 The slices

| Slice | What landed | Where |
|---|---|---|
| 1 | Both editors build their source list from one module; the map completer loads only on a map slide; the front-matter key source no longer fires on an indented line (it offered deck keys inside `backdrop:`) | `docs/src/playground/context-sources.js`, `editor-complete.ts` `studioCompletionSources`, `complete.js` `playgroundCompletionSources` |
| 2 | Ctrl-Space everywhere, Option-Esc on macOS (Option-\` and Option-i kept), Tab accepts while the menu is open, "No suggestions here" when an asked-for menu is empty, a picked key opens its values, set keys are not offered again, an Editor section in the `?` list | `docs/src/playground/completion-keys.js`, `strip-actions/shortcuts.tsx` |
| 3 | Directive values (`<!-- _paginate: `), the note-channel and pane keys after `<!-- `, TeX commands inside math, a flowchart's names, arrows and span words (closes `followups.d/2385`), the Ctrl-Space insert list on a blank line, `sample:` art inside an image reference, fence languages from the plugin registry (drops `chart`, which the engine renders as plain code) | `context-sources.js`, `tex-commands.js`, `grammar-vocab.js` `loadFenceLanguages` / `COMMENT_KEYS`, `lib/authoring/lint-core.js` `flowchartCompletions`, `makeAssetCompletion`, `sync-playground-assets.mjs` (`samples/index.json`) |
| 4 | CodeField keeps CodeMirror's CSS completion (the old `override` replaced it with nothing) and completes token names inside `var(`: the palette contract by role and the type scale, whose list moved from the ownership gate to `lib/core/type-tokens.js` so the gate and the editor read one list | `CodeField.tsx`, `css-token-complete.ts`, `lib/core/type-tokens.js` |
| found | A Ctrl-Space in the first moments after the Studio opens, before the component catalog lands, said "No suggestions here" on a line that offers 80 components seconds later. It now says "Loading suggestions…" until the catalog arrives | `completion-keys.js` `completionLoading`, set by `StudioShell.tsx` |
| found | CodeField dropped letters typed quickly: it wrote the parent's late echo of its own text over the newest letters (Firefox at full speed: 4 runs in 5 on `main`). It now recognizes its echoes | `CodeField.tsx` `emittedRef`; `engineering/gotchas/studio-playground.md` |

### 7.2 What the independent review changed

A `checker` agent bug-hunted the diff before the merge ask. Its findings and what was done:

| Finding | Done |
|---|---|
| The flowchart arrow regex backtracked exponentially (also CodeQL) | Replaced by one pass over the row's words (`lastArrowEnd`); a 100,000-character hostile row is a unit test |
| TeX opened on a bare `\` while typing, and inside shell fences and prose with dollar amounts: `\` then Enter wrote `\frac{}{}` | A bare `\` opens nothing until a letter or Ctrl-Space; no fence but `math` is math, and inline code is removed before dollars are counted |
| The fence walk ignored fence character and length | `fenceAround` follows CommonMark: same character, at least as long, no info string, indent under four |
| The CodeField echo guard could take a later Reset that repeats an earlier typed text for an echo | Emissions expire after 1.5 s (`reconcileValue`, unit-tested with that exact sequence); the list clears when the view rebuilds |
| Escape right after Ctrl-Space, while an answer was loading, showed "No suggestions here" | Escape withdraws the ask (`closeAndForget`); a jsdom test drives the order with a source it controls |
| Tab inside CodeMirror's first 75 ms moved focus out with the menu up | A shown menu keeps the Tab (`acceptWithTab`) |
| An untracked timer could outlive the view | Tracked and cleared on destroy |
| The hint missed an answer that filters to nothing | Not reproduced: in @codemirror/autocomplete 6.20 such an ask settles to no state, and the note shows (unit test) |
| CodeField's markdown field now runs lang-markdown's own completion (HTML tags) | Kept: a component skeleton is Markdown with HTML, and the tag menu closes on `<!` |

### 7.3 macOS and Safari, measured

A one-off probe ran on GitHub's `macos-26` runner (dispatched on this branch only, then removed): headed Chromium on the
built Studio, keys posted through the OS (CGEvent at the HID tap, and System Events), and per key whether the page saw a
keydown, whether the menu opened, and the keyboard input source before and after. The runner image ships the
input-source shortcuts OFF (symbolic hotkeys 60 and 61, `enabled = 0`); the probe turned them back on, as a new Mac
ships them, for its second pass.

| Key, through the OS | Shortcut off (runner image) | Shortcut on (a new Mac) |
|---|---|---|
| Ctrl-Space | reached the page, menu opened | **never reached the page** (0 of 4); the input source switched each time |
| Option-Esc | reached the page, menu opened | reached the page and opened the menu, 4 of 4 |

The first keys of each pass were dropped whatever they were (the plain-letter controls included), so only the later
rows, where both keys ran back to back under the same conditions, are read. Runs: Actions runs 43380691273 (first try,
no focus), 43384956399 (shortcut off) and 43387275107 (shortcut on), probe source at commit `65d40c7f`.

**Real Safari.** A second one-off probe drove the Studio in Safari through WebDriver, the harness the repo's iOS
Simulator suites use (`docs/scripts/ios-safari/run.mjs`), on the same branch-only basis. Three runs (Actions
43425946776, 43431987884, 43447718738); the third typed on the iPad the way `undo-probe.js` does, through WebKit's
`insertText` command, and latched the 1.6 s note:

| Step | Safari 27.2 on macOS (runs 1, 2) | Mobile Safari 26.5, iPad Simulator (run 3) |
|---|---|---|
| a bare `_class:` position opens nothing by itself | pass | pass |
| Ctrl-Space opens the component menu; Escape closes it | pass | pass |
| Option-Esc opens the component menu | pass | pass |
| Ctrl-Space where nothing completes shows the note | pass | pass |
| typing a key opens its menu | pass | pass |
| Tab accepts it and opens the values | pass | pass |
| a click (Mac) or tap (iPad) on a menu row picks it | pass | not delivered: neither an element click nor a touch pointer action reached the row as a press |

The iPad tap is this harness's reach, not a reading of the editor: the document never changed. A touch tap on a menu
row in Playwright's WebKit fires `touchstart`, `touchend`, then the `mousedown` CodeMirror picks on, and picks the row.
A person tapping a row on a real iPad is the one check left. (Runs 1 and 2 typed on the iPad with WebDriver key actions
and send-keys, which never reached the editor as text; run 3 replaced them.)

### 7.4 Start-up cost

The first full build put the Studio, Playground and home routes over budget (+985 / +807 / +784 bytes of gzipped
start-up JavaScript, home 0.2 KB past its ceiling): the plugin fence registry and the flowchart grammar, imported for
completion, pulled their dependencies into a new shared chunk that every page loads. Both now load on first use: fence
languages through one shared source, and the flowchart words through the lint core (`flowchartCompletions`), which both
editors already load on demand. With the TeX list also deferred, the growth is +147 / +32 / +6 bytes, declared in
`docs/route-budget.d/3174-studio-autocomplete.md`.

### 7.5 Not built, on purpose

- **A color swatch beside a color token.** Component CSS is palette-blind (HARD RULE #3): a token has no one value to
  show until a theme supplies it, and the Theme CSS field already shows the value on the line that declares it.
- **A rendered thumbnail in the component details panel.** It costs a render per highlighted row, and the panel's
  one-line description already names what the component is for; the insert palette is where components are seen.
- **Recently-used ranking.** Kernel order and catalog usage (`modifierUsage`) already rank the menus; a per-person
  history would need storage the Studio does not otherwise keep for the editor.
