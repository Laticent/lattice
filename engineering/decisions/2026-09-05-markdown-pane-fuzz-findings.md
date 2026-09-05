---
status: shipped
summary: >
  A randomized Playwright walk over the real Studio's MARKDOWN pane — twelve op families,
  five structural invariants after every op — found five defects the unit tier could not
  see, for one structural reason: `Editor.tsx` degrades to a plain `<textarea>` when
  CodeMirror cannot construct, and CodeMirror cannot construct in jsdom, so every jsdom
  test of "the editor" exercises the FALLBACK. 1825 studio unit tests were green over all
  five. The worst is silent, durable corruption: a leading U+FEFF pasted with a deck
  defeated the `^---` front-matter anchor, so the front matter rendered AS the first slide
  with `theme:`/`size:`/`paginate:` ignored — and it persisted and survived a reload. The
  Studio's file-open door was a listed EOL/BOM boundary and its PASTE door was not. Also:
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

# Markdown-pane fuzz sweep — what a random walk found that the unit tier could not

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

**Why the unit tier missed all of it, and it is one sentence.** `Editor.tsx` ends with
`if (failed) return <textarea …>` — a deliberate degradation for surfaces where CodeMirror
cannot construct, which includes jsdom. So every jsdom test that appears to exercise the deck
editor exercises a textarea with no linter, no history, no transaction filters and no
`EditorView`. Four of the five defects below live in exactly those four things. This is the
same class of blind spot as the Compose sweep's ("the unit test only ever drove the in-Compose
`slideOp` path"), one level more total: there, the unit tests tested the wrong path; here they
test a different component.

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

**Root cause.** `docs/src/lib/normalize-source-text.ts` names this defect class (#1349/#1388)
and `SANCTIONED_EOL_BOUNDARIES` lists the doors that guard against it. The Studio's FILE-OPEN
door is on that list (`StudioShell.tsx:1730`). Its PASTE door — the editor — is not a boundary
at all, and `onChange={setSource}` hands whatever CodeMirror holds straight to the shell.

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

**Its oracle is NOT end to end, and that is the second lesson of this section.** An e2e test
was written for it and PASSED against the broken guard — twice, for two different reasons.
The first started from the seeded tour deck, whose bytes never match a new deck's, so the leak
could not arise. The second used two new decks and still passed: replaying the leak needs a
REDO, and redo after an undo on a freshly created deck did not fire on the shipped surface —
measured, and not root-caused. A test that cannot fail is worse than no test, so it was
deleted and the pin moved to the predicate (`editor-carry.test.ts`), which does fail on the
document-only guard. Same call the Compose note's §8 made about a security property, for the
same reason.

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

## Found, NOT fixed here (off the path of this change — HARD RULE #18)

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
