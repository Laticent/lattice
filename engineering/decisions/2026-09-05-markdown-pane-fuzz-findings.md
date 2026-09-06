---
status: shipped
summary: >
  A randomized Playwright walk over the real Studio's MARKDOWN pane — twelve op families,
  five structural invariants after every op — found five defects that 1822 green studio unit
  tests had walked past. (An earlier draft blamed that on `Editor.tsx` degrading to a
  `<textarea>` in jsdom. It does not — measured — and §9 corrects it.) The worst is silent, durable corruption: a leading U+FEFF pasted with a deck
  defeated the `^---` front-matter anchor, so the front matter rendered AS the first slide
  with `theme:`/`size:`/`paginate:` ignored — and it persisted and survived a reload. The
  Studio's file-open door called the sanctioned normalizer and its PASTE door called nothing. Also:
  the rail read a `_class` comment anywhere on a line, so one stray character after the
  `-->` left it naming a component the engine ignores, and it took the FIRST directive on a
  slide where the engine applies the LAST, so merging two slides made the rail name the one
  that was absorbed; "Fix all issues" was gated on the unknown-component count while it runs
  a different repair, making it enabled-and-dead in one direction and disabled-over-a-
  fixable-finding in the other; and undo died on a Markdown→Compose→Markdown round trip,
  because the pane switch unmounts the editor. Three fixes were wrong first and the record
  says how: a transaction filter without `sequential: true` deleted the wrong range and
  emptied the document, a unit test had pinned first-wins from the implementation rather
  than the renderer, and two oracles passed in isolation and failed under concurrency on
  unwitnessed clicks. NOT fixed, and the biggest thing here: the Studio's slide list does
  not model `split: headings`, the default register — a deck divided on its outline renders
  as three slides and shows as ONE, with two of them unreachable.
---

# Markdown-pane fuzz sweep — what a random walk found that 1822 unit tests walked past

**Symptom.** None. Nobody reported any of this; the pane had simply never been walked, and
Compose — the Studio's other authoring surface — had just been (`2026-09-02-compose-fuzz-
findings.md`).

**Method.** A randomized Playwright walk against the *real* built Studio (HARD RULE #23),
driving twelve op families in random order — type, paste (CRLF / a BOM'd deck / a
900-column line / a whole slide / a table / math / block HTML / `* * *`), cut, copy, undo,
redo, select-all-and-replace, front-matter edits, directive edits, deleting a `---` to merge
two slides, the lint gutter's Quick fix, rail picks, Markdown↔Compose round trips and wheel
scrolling — asserting five structural invariants after every single op. Six seeds x 60 ops
from a scratch harness. What is COMMITTED is smaller and should not be described as that
sweep: `docs/e2e/markdown-stress.spec.ts` carries a named oracle per defect plus ONE seed at
34 steps as a regression net.

**The five invariants, and the rule they were chosen by.** No two may be able to agree while
being jointly WRONG — that is finding 11 of the Compose note, where `aria-expanded` and the
`cs-collapsed` class both read the same decoration set and the pair certified itself. Each of
these reads a different producer:

1. the editor document equals the persisted source (CodeMirror's `EditorState` against the
   shell's React state → debounce → `localStorage`);
2. the class the ENGINE painted is one the current slide names (a regex in `docs/src` against
   markdown-it's parse, across the preview iframe) — **this is the one that fired**;
3. the rail holds at least one slide and its current index is inside it;
4. no page error;
5. the document is canonical — no CR, no leading BOM.

**Why the unit tier missed all of it.** Because none of its 1822 studio tests drove these
paths — not because it structurally could not. **An earlier draft of this paragraph said the
opposite, confidently and at length; §9 has the measurement that killed it.** Most of this is
reachable at the seam: the engine renders in Node, so the rail-vs-engine differential runs in
jsdom (this PR ships it — `lint.test.ts`'s table), and so do the history and BOM defects. What
genuinely is not reachable there is a real clipboard `paste` event, and invariant 2 *as an
in-page assertion against the preview iframe* — which is one realization of the invariant, not
the invariant. The Compose sweep's framing is the accurate one here too ("the unit test only
ever drove the in-Compose `slideOp` path"): the tests drove the wrong paths.

---

## 1. A pasted BOM corrupted the deck source, durably (data loss)

Pasting a deck that begins with U+FEFF — what Notepad, PowerShell `>` and Visual Studio put at
the head of a file — left the byte in the document. It defeats the `^---` front-matter anchor,
so the block is not front matter: it parses as a setext heading and renders as content.
Measured on the built Studio with the SAME deck pasted twice:

| | slide 1 renders | `paginate: true` |
|---|---|---|
| clean | `One / body` | pagination mark painted |
| BOM | `theme: indaco paginate: true` — the YAML, set as the slide | no mark; the directive was never read |

It then persisted and survived a reload, so this was durable corruption of the author's source
rather than a transient paint, and it would ride into every export.

**Root cause.** `docs/src/lib/normalize-source-text.ts` names this defect class (#1349/#1388),
and it is the one raw implementation the docs site is allowed to have —
`SANCTIONED_EOL_BOUNDARIES` carries it plus `ai/architect-edits.js`, and nothing else under
`docs/`. The Studio's FILE-OPEN door CALLS it (`StudioShell.tsx:1827`); its PASTE door — the
editor — called nothing, and `onChange={setSource}` handed whatever CodeMirror held straight to
the shell.

*(An earlier draft said the file-open door "is on that list" and cited `StudioShell.tsx:1730`.
Both were wrong: `StudioShell` is not a sanctioned boundary — it is a CALLER of the sanctioned
helper, which is the whole point of the list — and 1730 is `setView('compose')`. A checker
caught it. The design point survives the correction; the citation did not.)*

**Fix — THREE doors, and the first version only had one.** A CodeMirror `transactionFilter`
strips a leading BOM from the resulting document, which covers the paste. A checker pass then
showed that a filter sees TRANSACTIONS, not the document: `EditorState.create` runs no filter,
so a deck ALREADY STORED with a BOM opened with the byte in place. Chasing that turned up the
door that actually matters, and it is not in the editor at all — **the shell's `source` is
what the preview renders and every export ships**, and it comes from `loadSource`. Measured
without it: after opening a stored-BOM deck the editor showed clean text while the persisted
source still carried the byte, until the author happened to type something. So `loadSource`
delegates to `normalizeSourceText` — an ingest boundary in the policy's own sense — and the
editor canonicalizes its seed document so the author never sees a byte they cannot select.

**Two claims in the first draft of this note were wrong, and the corrections are the useful
part.** "It heals a deck already stored with a BOM on the first edit" described the filter,
not the document, and a deck opened from the store was not healed at all. And one ⌘Z does NOT
put a pasted BOM back: `undo` bypasses filters, but the strip rides in the SAME transaction as
the paste (`sequential: true`), so there is no state to return to in which the BOM exists
alone — the oracle asserts that, and is honest that the arm passes on a build without the
outward guard too, because the paste path was already closed by the merge.

**Only the BOM half, and that is measured rather than assumed.** CodeMirror folds CRLF *and* a
lone classic-Mac CR at this same door through `EditorState.lineSeparator`, so a `\r` cannot
reach the document. That is a claim about a DEPENDENCY, so it is pinned by its own oracle
rather than by a comment: if an upgrade ever stopped folding, a CR would reach the source and
the slide separator would stop matching, collapsing a deck to one slide.

**The fix was wrong first, in a way worth keeping.** The filter originally returned
`[tr, { changes: { from: 0, to: 1 } }]`. `resolveTransaction` resolves a following spec against
the doc as it was BEFORE the transaction unless the spec carries `sequential: true` — so it
deleted the first character of the OLD document and the two changes merged into nonsense. A
paste over a select-all left the document EMPTY. Nothing in a code review would have caught it;
driving the real surface did, on the first run.

## 2. The rail named a component the engine ignores

`lint.ts`'s `_class` regex was unanchored, so it matched a directive comment anywhere on any
line. The engine requires the comment to own its line. Measured against `lib/engine/index.js`
`render()`, one slide per row:

| source line | engine renders | `lint.ts` said |
|---|---|---|
| `<!-- _class: title -->` | `title` | `title` |
| `<!-- _class: title -->   ` (trailing spaces) | `title` | `title` |
| `<!-- _class: title -->.` | `content` | **`title`** |
| `<!-- _class: title --> trailing` | `content` | **`title`** |
| `text <!-- _class: title -->` | `content` | **`title`** |
| a `_class:` line inside a ``` fence | `content` | **`kpi`** |

The first wrong row is how the walk reached it: a stray keystroke at the end of the directive
line. The rail went on calling the slide `title` while the preview beside it painted `content`,
and the same reading feeds the inline linter's vocabulary and the Coach's issue count.

**The first fix was a second bug, and this is the part worth keeping.** Anchoring the regex to
column 0 closed the four rows above and silently opened four more: markdown-it opens the
`html_block` INSIDE a container, so `- <!-- … -->`, `> <!-- … -->` and `1. <!-- … -->` all
render the class, as does a running global `<!-- class: kpi -->`. Re-verified against
`render()`: all four emit `kpi form`, and the anchored regex read every one of them as `text`.
A slide with no resolved class is skipped by every lint rule, so the loss would have been
silent and in the direction of less coverage than before.

**`lib/core/class-directive-scan.mjs` had already made that mistake, fixed it, and written the
reason down** — its docblock says exactly this, in the repo's own words. It is the kernel that
answers "which class governs this slide?" the way the renderer answers it, it was already in
the docs browser bundle, and `lint.ts` already imports a sibling from `lib/core/`. So the fix
is a delegation, not a regex: `usedComponents` and `slideClass` now ask it (HARD RULE #1, #15).
That also settles the indent question the first cut hedged on — a tab- or four-space-indented
directive is an indented code block, the kernel says so, and the rail now agrees with the
linter and the export rather than with the preview.

**One consequence to know:** the kernel resolves the class in force per chunk, so an
OVERRIDDEN directive is not reported. `usedComponents` dedupes on the winning directive's own
line, which keeps a running global counted once rather than once per slide it governs — the
count `issues` displays is a count of things an author has to go and fix.

## 3. `slideClass` took the first directive; the engine applies the last

A slide may carry two `_class` directives, and the engine applies the LAST — measured:
`<!-- _class: big-number -->` … `<!-- _class: stats -->` on one slide renders `stats form`.
`slideClass` returned the first.

This is not an exotic input. It is exactly what an author produces by **deleting a `---` to
merge two slides**, after which the rail named the slide that had just been absorbed. The walk
found it on that very op.

**A stale unit test had pinned the wrong answer.** `lint.test.ts` asserted
`slideClass('<!-- _class: kpi -->\n<!-- _class: quote -->') === 'kpi'`, titled "reads only the
FIRST class when a slide somehow carries two". `render()` on that exact source emits
`class="quote form"`. The test was written from the implementation rather than from the
renderer, so it did not merely miss the defect — it certified it. The replacement is a
DIFFERENTIAL table whose expected column is the engine's own output.

## 4. "Fix all issues" was gated on a count that is not its own

The shell gated the button on `unknownComponents(source, lintKnown).length` while the button
runs lint-core's `applyAllFixes`, which repairs a different set. Wrong in both directions, both
reproduced on the built Studio:

| deck | unknown | fixable | the button |
|---|---|---|---|
| `<!-- _class: zzznotacomponent -->` | 1 | 0 (no candidate is near enough for a suggestion) | **enabled, and pressing it did nothing, silently** |
| `- **Title.** body` on a `cards-grid` slide | 0 | 1 | **disabled — while the underline beside it offered that very Quick fix** |
| `<!-- _class: kpii -->` | 1 | 1 | enabled, and it works |

`withTokenSuggestion` in `lint-core.js` attaches a machine fix only when `nearestRegion` finds a
candidate inside a length-scaled edit distance, so an unknown component is autofixable
*sometimes*. A count of unknown components can therefore never answer "is there anything to
apply?".

**Fix.** The editor reports what its own lint pass found — `{ total, fixable }` — from the pass
it already runs, so there is no extra lint work; the shell gates on `fixable`. The predicate is
`autofixable`, which is the SAME flag `findingsToDiagnostics` uses to hang a Quick fix button on
a diagnostic, so the toolbar now offers precisely the batch of fixes the author can already see
underlined. `null` means the editor has not answered — it is unmounted, the kernel never loaded,
or the pass threw — and the old estimate stands rather than a made-up zero.

**Note what is NOT changed:** the displayed COUNT still reads `issues`. Making the count agree
with the linter too is a wider change (it drives the mobile badge and the Coach card, and the
editor is unmounted on the Compose pane), and it is a display question rather than a broken
control.

## 5. Undo died on a trip through Compose

The Studio mounts EITHER the markdown editor or Compose, never both, so switching panes destroys
the `EditorView` and CodeMirror's history goes with it. Type, switch to Compose, switch back,
press ⌘Z — nothing happens, and nothing says why. That is not a lost fold or a lost scroll
offset (the Compose note leaves the equivalent open, deliberately, for exactly that reason): it
is the author's only route back from a mistake, removed by a two-click detour taken for an
unrelated reason.

**Fix.** `Editor.tsx` carries the serialized `EditorState` — history field included — across the
unmount and restores it, GUARDED on the document coming back byte-identical to the one that
left. An edit made in Compose therefore discards the carry, which is the honest answer: those
edits are not in this history, so offering ⌘Z over them would undo the wrong thing. The carry is
consumed on use, so a deck switch never inherits the previous deck's undo stack. Keeping the
editor mounted instead was rejected: `responsive.spec.ts` asserts that Compose mounting leaves
`Deck source` unmounted, so the unmount is a contract, not an accident.

## 6. The fix for §5 leaked one deck's undo stack into another (found by the checker)

The worst thing in this change, and it was introduced BY this change — a HARD RULE #18 window,
caught before it shipped only because the checker pass ran.

The carry was guarded on `carried.doc === value`: byte-equality of the document, with no deck
identity. `newDeckSource()` is deterministic, so **every new deck starts from the same template
bytes** and the guard matched across decks. Reproduced end to end against the real component
and the real CodeMirror: type in deck A, undo, switch to Compose, create deck B, switch back —
deck A's history was restored into deck B, and one ⌘⇧Z inserted text that had never been typed
there, out through `onChange` and into the autosave as deck B's content.

The docblock claimed "a deck switch (a different `value`) never inherits the previous deck's
undo stack". The premise was false for the Studio's own new-deck template, which is the one
document this could be wrong about most easily.

**Fix.** The carry is keyed on the deck id as well as the document, held through a latest-ref
because the init effect is keyed on `[known]` and a deck switch that leaves the editor mounted
never re-runs it.

**Its oracle is at the PREDICATE, not end to end, and the reason first given for that was
wrong.** An e2e test was written and PASSED against the broken guard — twice. The first
started from the seeded tour deck, whose bytes never match a new deck's, so the leak could not
arise. The second used two new decks and still passed, and this note originally recorded the
reason as "redo does not fire on the shipped surface — measured, and not root-caused."

**That was wrong. So was the correction that replaced it.** The first replacement said redo is
`Ctrl+Y` and that `Ctrl+Shift+Z` therefore performs a second undo, because the
`linux: "Ctrl-Shift-z"` binding is "not active in a headless context". A checker refuted it and
the measurement is unambiguous — type, `Ctrl+Z`, `Ctrl+Shift+Z`:

```
typed                1932 chars, marker present
after Ctrl+Z         1924 chars, marker gone
after Ctrl+Shift+Z   1932 chars, marker BACK      ← a redo
```

on Chromium, WebKit and Firefox alike. `navigator.platform` reads `Linux x86_64` in headless
Chromium, so CodeMirror's linux branch IS active. **Redo works, by both chords.**

Two explanations were recorded, each stated as measured, each refuted in turn — and the second
was written INTO the section that exists to retract the first. That is the failure this note's
§9 is about, committed inside the retraction itself.

**The third explanation is the one that survives contact, and it is about FOCUS, not about
keys.** A sixth pass found it: after a Compose→Markdown switch, `document.activeElement` is the
`Markdown source` toggle BUTTON, not the editor — so a bare `Ctrl+Shift+Z` reaches nothing at
all. Measured on all three engines:

```
activeElement after toMarkdown   BUTTON.inline-flex …
doc has the marker, no focus     false      ← the chord went nowhere
doc has the marker, after focus  true       ← the carried redo stack replays fine
```

That reconciles both earlier measurements exactly. The standalone redo check typed first, so
focus was already in the editor and redo worked. A leak scenario ends on a click of the pane
toggle, so it is not focused — unless the test calls `focusEditor`, which the surviving carry
oracles do and an attempt that omitted it would not.

**One honest limit: this is the mechanism, not a proof about that particular run.** The deleted
attempt is unrecoverable (`git fsck --lost-found` has no dangling blob for it), so what can be
said is that a fully sufficient cause exists, is demonstrated on three engines, and is the same
unwitnessed-focus trap §7 documents for two other oracles. **What must not be carried forward
is either of the first two explanations.** The pin stays at the predicate — a unit test states
the rule directly — and the end-to-end oracle lands with the deck-history change.

So the pin here is `editor-carry.test.ts`, which fails on the document-only guard and states
the rule directly — worth keeping either way, because it cannot be confounded by a keybinding.
**An end-to-end oracle for this leak is follow-up work, not an impossibility**, and it lands
with the deck-history PR named at the end of this note.

## 7. Two oracles were green only on an idle machine

The fourth disguise of the Compose note's §10, and it recurred here on the first attempt.
Running the file once at two workers was green; running it while a second copy of the suite ran
alongside it failed two tests — `a Compose edit deliberately drops the carried history` and
`Fix all is offered exactly when something can be fixed` — and both passed again in isolation.

The mechanism is the one §12 named. Both reached their surface through a `.click()` with no
witness: `.click()` resolves once the click has been DISPATCHED, not once CodeMirror or
ProseMirror has taken focus, so under contention the `⌘A` on the next line went to the document
instead — where it selects the page, `Delete` does nothing, and the text that follows goes
nowhere. The test then failed several assertions later, blaming whatever it looked at first.

Fixed by making a witnessed focus the ONE way this file reaches either editor (`focusEditor`,
`caretIntoComposeSlide`), including at sites where the very next line would have caught it
anyway — uniformity is what makes the absence of a bare `.click()` mean something to the next
reader. Measured after: 6 consecutive clean runs at 4 workers on 4 cores (twice the CI worker
count), plus two suites run concurrently, against the reproducible failure before.

---

## 8. Three oracles of my own were weaker than they read

Also the checker. `a Compose edit deliberately drops the carried history` went straight to
Compose as its first action, so no markdown-pane edit existed and the carried history was
EMPTY — the two ⌘Z presses would have done nothing whether the guard worked or not. It now
makes an edit first, and asserts that edit survived. The BOM oracle never pressed ⌘Z, which is
where the leak was. And the walk's invariant 2 has three legitimate escapes, one of which
(`paintedClasses` catching an unreachable frame to `[]`) would have let all 34 steps pass
having compared nothing; the walk now counts its own evaluations and asserts the net was in
the water.

## 9. The reason this note first gave for the unit tier's blind spot was false

Worth its own section because it was the most-repeated sentence in the change — this note's
summary, its method section, the spec's header docblock — and because getting it wrong tells
the next session to stop trying.

**The claim.** `Editor.tsx` degrades to a `<textarea>` when CodeMirror cannot construct;
CodeMirror cannot construct in jsdom; therefore every jsdom test of the deck editor exercises
the fallback, and none of these defects is reachable from that tier.

**The measurement.** Rendering `Editor` under the docs vitest environment:

```
FALLBACK textarea?   false
.cm-content present? true
```

`docs/vitest.setup.ts` stubs `Range.getClientRects` and friends for exactly this reason — its
own comment says CodeMirror measures selection geometry and bare jsdom throws. The fallback is
real; it is not what that tier runs. Two further excuses went with it and did not survive
either: `userEvent.keyboard('{Control>}z')` drives CodeMirror's real keymap and history in
jsdom, and `lib/engine`'s `render()` runs in Node — so the rail-vs-engine differential is a
unit test, which is why `lint.test.ts` in this very change is one.

**What it cost.** The belief is what made the unit tier unavailable for the rest of the sweep.
The rule the Compose note wrote for itself applies here unchanged: *a claim about what a tier
can see is a claim, and it needs a measurement like any other* (#23). This one had never been
run.

**What is true.** Most of this is reachable at the seam. What is not is a real clipboard
`paste` event and invariant 2 as an in-page assertion against the preview iframe.

## Found, NOT fixed here (off the path of this change — HARD RULE #18)

- **A deck switch leaks the previous deck's whole document, and it is worse than §6.** Found
  while root-causing §6's redo question. The editor does not remount when you change decks (its
  init effect is keyed on `[known]`), so the whole-document swap from deck A's text to deck B's
  is just another entry in CodeMirror's history. Measured on the built Studio: type in the tour
  deck, create a new deck, press ⌘Z ONCE, and deck A's entire 1,933-character document is in
  front of you — and `onChange` carries it into deck B's saved source from there. One keystroke,
  no Compose detour, and it survives a reload. §6's carry is a second, narrower route to the
  same harm. **Entirely pre-existing**, and its fix is structural — a different editor per deck,
  with consequences across every Studio surface that mounts one — so it goes in its own PR
  rather than widening this one. That PR also carries the end-to-end oracle §6 says is follow-up
  work.

- **`Editor.tsx` still carries its own `CLASS_RE`, so §2's delegation removed one copy of the
  parse and not the other.** It drives the FALLBACK linter and the fallback `fixAll()`, and §4's
  new `report()` makes it authoritative for the Fix-all button whenever that fallback runs. It is
  dead in the shipped Studio — `useRealLint` is `!!lintVocab?.names` and `StudioShell` always
  passes `lintVocab` — so this is a latent duplicate rather than a live defect, which is why it
  is logged instead of fixed. It is still the thing HARD RULES #1 and #7 point at, and this
  change's own argument is "stop carrying another copy of the parse", so it should go with the
  fallback path it serves. Found by a checker.

- **The lint gutter's Quick fix is reachable only by HOVER, so a touch author cannot take it.**
  Found by running this file at a tablet viewport with `hasTouch` — the walk's `quickFix` op
  drives `.cm-lint-marker` with `hover()`, which a coarse pointer has no equivalent for, and the
  action popup never opens. The op now skips on a no-hover context rather than asserting a path
  a finger cannot take. The affordance itself is pre-existing (#562's inline validation), it is
  off this change's path, and fixing it means giving the marker a tap target — its own change.
  Everything else in the pane holds at 820px with touch: 9/9.

- **The Studio's slide list does not model `split: headings`, and that is the largest thing in
  this note.** `split: headings` is the DEFAULT register (`lib/core/resolve-split.js`): "a deck
  divides on its outline with no separators to forget". `lib/core/slide-boundaries.mjs` — which
  the rail, the editor↔preview sync and the supplied page number all read — models only `hr`
  tokens; its own docblock says so, and leaves the heading split to callers. No caller in
  `docs/src` does it. Measured:

  | deck | `render()` | Studio rail | Studio preview |
  |---|---|---|---|
  | `# One / a / # Two / b / # Three / c` | **3 sections** | **1 slide** | paints only `One a` |
  | the same with `split: rule` | 1 section | 1 slide | paints all three |

  So a deck authored in the documented house style shows one slide in the Studio and exports
  three, with two of them invisible and unreachable. It is pre-existing, it is not caused by this
  change, and fixing it means deciding which module owns the heading split source-side and
  threading the deck's `split:` register through a kernel shared with `bake-splits.js`,
  `section-source-split.js` and `slide-class-spans.js` — its own PR, with its own blast radius.
  The walk works around it rather than hiding it: invariant 2 asserts MEMBERSHIP (the painted
  class is one the slide names) rather than equality, and skips a chunk holding more than one
  heading, with the reason written at the assertion.

- **An indented `_class` directive: the preview honors it, an export does not.** `splitSlides`
  trims every chunk, and the live preview renders the trimmed chunk, so `    <!-- _class: kpi -->`
  paints as `kpi` in the Studio and renders as `content` through `render()`. Same root as the
  finding above — the preview's fast route sees a different document from the export — and it is
  the `PreviewFidelityOverlay`'s subject area rather than the rail's.

- **A leading `---` silently eats a slide.** `---\n\n<!-- _class: title -->\n\n# One\n\n---\n\n# Two`
  shows ONE slide, `Two`. The front-matter regex is non-greedy and closes on the first following
  `---`, so the author's first slide becomes front matter. The ENGINE agrees (`render()` also emits
  one section), so this is CommonMark/Marp semantics rather than a Studio defect — but a deck that
  silently loses its first slide to a leading separator is worth a deliberate answer, most likely a
  lint warning.

- **Deleting front matter's closing `---` swallows the next slide**, for the same reason and with
  the same engine agreement. Worth the same warning.

- **Two `_class` directives on ONE line produce broken markup from the engine.**
  `<!-- _class: title --><!-- _footer: x -->` renders `class="title --&gt;&lt;!-- _footer: x"`. The
  rail now says `text` for that line, which is at least not a false claim; the engine's own answer
  is the defect, and it is in `lib/`, not here.

- **The empty-deck dead end.** Select-all + Delete leaves a rail with zero slides and a preview
  with an empty section, and only typing recovers. Already recorded in the Compose note's
  not-fixed list; reproduced identically from this pane, which confirms it is the shell's shape
  for "empty" rather than anything either editor does.
