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
34 steps as a regression net — and ELEVEN op families, not twelve. The Quick-fix op was
retired from the committed walk after measuring that it applied a fix zero times across seven
seeds (the walk types into the middle of a line, and a `_class` directive off column 0 produces
no finding), and the path it was meant to cover got a deterministic oracle of its own instead.

**The five invariants, and the rule they were chosen by.** No two may be able to agree while
being jointly WRONG — that is finding 11 of the Compose note, where `aria-expanded` and the
`cs-collapsed` class both read the same decoration set and the pair certified itself. Each of
these reads a different producer:

1. the editor document equals the persisted source (CodeMirror's `EditorState` against the
   shell's React state → debounce → `localStorage`);
2. the class the ENGINE painted is one the current slide names (a source-side scan in `docs/src` against
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
rather than by a comment, and mutation 12 in §8b shows the oracle can fail.

**What that oracle would catch is narrower than this note first said**, and the correction is
worth more than the original claim. It said a CR reaching the source would make "the slide
separator stop matching, collapsing a deck to one slide". It would not. `splitSlides` runs
through `lib/core/slide-boundaries.mjs`, whose `separatorRanges` folds `\r\n|\r|\n` itself —
deliberately, with a comment saying so — and it strips a leading BOM for its own offsets.
Checked directly:

```
separatorRanges('# One\r\r---\r\r# Two\r')  →  [{index:7,length:4}]
separatorRanges('# One\n\n---\n\n# Two\n')  →  [{index:7,length:4}]
```

The rail would show two slides either way. What actually breaks is that the document and the
persisted source stop being canonical — invariant 5, and the class
`docs/src/lib/normalize-source-text.ts` exists to keep out, where the mis-split happens
downstream in readers that anchor on `\r?\n`. Two of this note's own paragraphs asserted a
downstream consequence that the module in question had already handled; checking took one
`node -e`.

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

Also the checker. `a Compose edit deliberately drops the carried history` had no witness that
the Compose edit ever reached the source, so a run where the typing went nowhere would have
asserted `toContain('COMPOSEMARK')` against a document that never had it and failed for the
wrong reason — or, with the assertion inverted, passed for none. It now witnesses the edit on
the way back and only then presses ⌘Z twice. The BOM oracle never pressed ⌘Z, which is where
the leak was. And the walk's invariant 2 has three legitimate escapes, one of which
(`paintedClasses` catching an unreachable frame to `[]`) would have let all 34 steps pass
having compared nothing; the walk now counts its own evaluations and asserts the net was in
the water.

**An earlier revision of this section said something else about the first oracle, and it was
wrong about the shipped test.** It claimed the oracle "went straight to Compose as its first
action, so the carried history was EMPTY" and "now makes an edit first". It still goes straight
to Compose, and it does not make a markdown-pane edit first — but the history is not empty and
the oracle is not hollow, which a ninth mutation settles rather than an argument: drop the
document half of `carryApplies` (`state.doc === value`), rebuild, and the oracle fails 3/3 with
`a stale history must not be replayed over a Compose edit`, the received document being the
pre-Compose deck with `COMPOSEMARK` wiped. That is the defect it exists to catch, so it catches
it. The lesson is the one this note keeps re-learning: an argument about whether an oracle is
hollow is settled by mutating the code under it, and a paragraph asserting a fix that was never
made is worse than no paragraph.

## 8b. Every oracle is now mutation-proved, and three of them were not

The brief called the mutation check "the single highest-value hour", and the first pass
mutation-checked the SIX oracles that pin a fix this change made. That left three pinning
behavior the change did not touch — the CRLF/CR fold, the reload round trip, and the Quick fix —
untested as oracles: each could have been asserting something that is true no matter what the
code does. Two of them turned out fine and one had already been silently rewritten, but none of
that was known until the code under them was broken on purpose.

Twelve mutations across the ELEVEN oracles — the rail-names oracle carries two rows, because
two independent defects meet in it. (The first eight are the original pass. The count colliding
with the sweep's twelve op families above is a coincidence, not a correspondence.)

| # | mutation | oracle | it failed with |
|---|---|---|---|
| 1 | BOM `transactionFilter` removed | `@smoke a pasted BOM never reaches the deck source` | document differs |
| 2 | `loadSource` normalization removed | `a deck already STORED with a BOM opens canonical` | the BOM survives |
| 3 | `CLASS_RE` unanchored + fence-blind | `@smoke the rail names the component…` | `Expected "text", Received "kpi"` |
| 4 | " | the 34-step walk | `the engine painted a component the slide does not name` |
| 5 | `slideClass` back to first-wins | `@smoke the rail names the component…` | `Expected "quote", Received "big-number"` |
| 6 | editor-state carry removed | `@smoke undo still works after a trip through Compose` | `⌘Z did nothing` |
| 7 | carry guard loses its DECK KEY | `editor-carry.test.ts` | the predicate admits a foreign deck |
| 8 | Fix-all gated on `unknownComponents` | `Fix all is offered exactly when…` | `a fixable finding must offer Fix all` |
| 9 | carry guard loses its DOCUMENT check (`state.doc === value`) | `a Compose edit deliberately drops the carried history` | `a stale history must not be replayed over a Compose edit` — the pre-Compose deck came back and wiped `COMPOSEMARK` |
| 10 | `onFix` computes its repair and drops the dispatch | `the inline Quick fix applies the repair its underline promised` | `the Quick fix did not repair the directive` (`kpii` still there) |
| 11 | `loadSource` trims one trailing `\n` | `the deck source survives a reload byte for byte` | one character short, byte for byte |
| 12 | `EditorState.lineSeparator.of('\n')` pinned, so a lone CR stops being a line break | `CodeMirror folds CRLF and a lone CR at the same door` | `CRLF reached the document` |

Rows 9 and 12 are the two worth keeping. **Row 9** settles an argument this note had with itself
in prose (see §8) with the only thing that can settle it. **Row 12** is the answer to "how do you
mutation-check an oracle over someone else's code?" — the CRLF fold is CodeMirror's, not ours, so
there is no fix of ours to revert; what IS ours is the configuration that leaves the fold on, and
pinning `lineSeparator` turns it off. The oracle catches that, which is exactly the CodeMirror-
upgrade regression it exists for.

Each mutation was applied alone, the site rebuilt, the oracle run, and the file restored — and
the four oracles involved were re-run green afterward, because a mutation left in place is a far
worse outcome than one never run.

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

## 10. Clearing the undo stack in place is a trap — why the fix rebuilds the view

Cited by `Editor.tsx` and by `markdown-stress.spec.ts`, and **for a while cited by both while not
existing**: a checker grepped for it and found §8b, §9, §11 and no §10. A measured claim whose
record is a section nobody wrote is the failure #23 names, so here is the record.

**The smaller-looking fix does not work.** Instead of rebuilding the `EditorView` on a deck
switch, keep the view and empty its history: `history()` in a `Compartment`, reconfigured to `[]`
and back. That is the documented way — a plain `reconfigure(history())` preserves the field value
— but it needs TWO dispatches, and two synchronous `dispatch` calls do not reliably apply in
sequence. One made while the view is mid-update is queued and built against the state as it stood
before the earlier one landed, so the re-add can carry the old configuration, old stack included,
straight back.

Measured on the built Studio at two workers: `undoDepth` read **1** immediately after emptying
the stack, and one ⌘Z produced the previous deck's document. Failure rate **~1 in 10** full-file
runs and **0 in isolation**, which is what made it survive two rounds of "fixes" — each was
declared green on a single passing run. A `queueMicrotask` between the dispatches made it worse
(4 failures in 15).

**Provenance, stated plainly:** those numbers come from the development session that produced
#2064, not from a committed harness — there is no artifact in the tree to re-run. What IS
re-runnable is the conclusion's replacement: the rebuild, which §11b's mutations 13 and 14 pin.
Anyone re-opening the Compartment approach should expect to re-derive the numbers themselves
rather than cite these.

## 11. One editor per deck (the deck-history change)

Supersedes the first entry under "Found, NOT fixed here": that entry recorded the deck-switch
leak as pre-existing, structural and deferred. This is the deferred change.

**The fix is one line of dependency array, and everything else here is the blast radius.** The
init effect was keyed on `[known]`; it is now keyed on `[known, carryKey]`, so changing decks
REBUILDS the view instead of swapping the document inside a live one. A whole-document swap
inside a live view is just another history entry, which is why one ⌘Z pulled deck A's entire
1,933-character document into deck B and `onChange` carried it into B's saved source.

**Three defects came out of that rebuild, and none was in the fix itself.** They are all the
same shape — a channel that belonged to the COMPONENT rather than to the view, left holding the
old view's answer after a rebuild:

1. **The carry stamped the wrong deck id.** The teardown read `carryKeyRef.current`, which by
   teardown time is the deck being switched TO. Key half satisfied by construction, document
   half satisfied because two fresh decks hold byte-identical template bytes — so deck A's
   history restored into deck B and one redo put A's text into B's saved source, surviving a
   reload. Fixed by taking the key from the effect's own closure and deleting the ref. Found by
   a checker; pinned by `an undo history does not cross decks WITHOUT a Compose detour`, which
   the other two deck oracles cannot see (the tour deck's bytes never match a template, and a
   Compose detour makes the two ids agree again).
2. **`Refine` was stranded after a deck switch** — offered over a deck with nothing selected,
   and answering "Select some text in the editor to refine first" when pressed. Exactly the dead
   control #2064 §4 had just removed from the toolbar, walking back in through this fix.
3. **Then the fix for (2) INVERTED it** — `Refine` hidden while a selection existed, after a
   Compose round trip restored one through the carry. The two legs are asserted together
   (`a deck switch withdraws…` and `coming back from Compose restores…`) because a fix for
   either silently becomes the other.

**The selection channel is re-stated on every build; the cursor-slide channel only on a
REBUILD**, and the split matters: `builtForRef` records `{key, known}` rather than a boolean,
because StrictMode's repeat mount would otherwise read as a rebuild and reset the caret.

**The end-to-end oracle #2064 §6 deferred is here, and so is the reason it was deferred.** Two
earlier attempts passed against the broken guard. The account of why has now been wrong three
times — "redo does not fire here", then "redo is `Ctrl+Y`, so `Ctrl+Shift+Z` is a second undo",
both refuted by a checker. Measured on the built Studio across Chromium, WebKit and Firefox:
`Ctrl+Shift+Z` redoes on all three. What makes a chord go nowhere is FOCUS — after a
Compose→Markdown switch `activeElement` is the `Markdown source` toggle button. Every deck
oracle here witnesses focus first, which is why they can be trusted where the earlier attempts
could not.

### 11b. Eight more mutations — and two of the new oracles were VACUOUS

Same discipline as §8b, and it earned its keep twice: of the SEVEN oracles the deck-history
change adds, two could not tell the fixed code from the broken code — and the second was found
by an independent checker after this section had already been written as though it were complete.

| # | mutation | oracle it killed |
|---|---|---|
| 13 | the init effect keyed back to `[known]` | `@smoke a new deck does not inherit the previous deck's undo history` |
| 14 | " | `an undo history does not cross decks WITHOUT a Compose detour` |
| 15 | the post-build selection re-statement removed | `coming back from Compose restores the control its selection gates` |
| 16 | the teardown's selection withdrawal removed | `leaving the markdown pane withdraws the control its selection was gating` |
| 17 | the carry stamps a component-level live ref (`carryKeyRef`, the shape this diff deletes) instead of the effect's closure | `an undo history does not cross decks WITHOUT a Compose detour` |
| 18 | `carryApplies` loses its deck key | that one **and** `the carried history does not cross decks either` |
| 19 | BOTH selection channels removed together | `a deck switch withdraws a control that pointed at the deck you left` |
| 20 | the cursor-slide re-statement removed | `the caret still drives the rail after a deck switch` |

**The checker also found the FIRST vacuous oracle of this batch, and it was a different shape
from row 18's.** `an undo history does not cross decks WITHOUT a Compose detour` ends by asserting
that the leak "did not reach the autosave either — the durable half of the harm". That assertion
could not fail, for two independent reasons:

- `expect.poll(…).not.toContain(x)` is satisfied by its FIRST sample, which lands ~0ms after the
  keypress — before the 400ms autosave debounce has written anything. It asserted that a write
  which had not happened yet had not happened.
- `persistedDeck` reads whichever `lattice-studio-src-*` key `Object.keys` yields first, and that
  test has two decks. The fixture's own docblock warns that it is "sound while a test edits only
  the active deck; a deck-switching test would need the deck id" — these were its first
  deck-switching callers. Measured, it read the OTHER deck's row on 3 of 6 runs.

Probed on a build with mutation 18 applied, four runs, comparing the old assertion against the
repaired one on the same page:

```
docLeaked=true   oldAssertionPassed=true   newAssertionPassed=false   (x4)
```

The repair is `persistedActiveDeck` (resolve the deck id through `lattice-studio-active`) plus
`persistedAfterAutosave`, which polls until the store AGREES with the document rather than
sleeping — a fixed wait is barred here by `checkE2ESleeps`, and polling the real signal is the
better answer anyway: on a leaking build the leaked text is in the document, so waiting for the
store to match it is waiting for the leak to be written, and the assertion then fails on what was
really stored.

**Row 20 did not exist until a checker asked for it, and the code it covers had NO oracle at
all.** The third channel this change adds — re-stating `lastSlideRef` on a rebuild — could be
deleted with the entire repo staying green: 2010 studio unit tests, all sixteen oracles in this
file. Unproven code reads exactly like proven code from a test report, and §11b as first written
presented seven mutations as a complete census while leaving that channel out of it.

**Writing its oracle took three attempts, and the two failures are the useful part** — both
passed against the deleted code, which is the same vacuity this section is about:

1. The first created a new deck and typed a document into it. Writing the document re-derives the
   slide index through the ordinary edit path, which hides the stale ref.
2. The second switched to an existing deck without editing (right) but drove the caret to slide 1
   and then the last slide (wrong). The defect is `idx === lastSlideRef` swallowing a real move,
   so the ONLY caret position that exposes it is the index the ref is stuck on — here, 1.
3. The third parks the caret in slide 2 of the boot deck (`revealSlide` sets the ref to 1
   directly), switches to `Q3 Board Review` without typing, and moves the caret into slide 2.
   `loadDeck` resets the shell's `activeSlide` but never calls `revealSlide`, so nothing but the
   code under test clears the ref. Deleted, the rail stays on slide 1 while the caret sits in
   slide 2 — 3/3.

**Row 18 is the one that mattered on the first pass, because it did not kill its oracle at first.**
`the carried history does not cross decks either` — the oracle whose entire subject is that
guard — passed against a build with the guard deleted. It pressed redo TWICE. Probed on that
build:

```
deckA after undo    len 82   activeElement DIV
deckB mounted       len 82   activeElement BUTTON   (same bytes as deckA)
after redo #1       len 91   the leaked text is IN the document
after redo #2       len 82   …and back out again
```

`Ctrl+Shift+Z` redoes while there is something to redo; with the redo stack EMPTY the same chord
falls through to the base `Mod-z` binding and UNDOES. So the second press put back exactly what
the first replayed, and the final assertion read a clean document. One press, and the oracle
fails against the broken guard as it always should have.

**That also settles the §6 keybinding argument properly, and neither earlier account was right.**
The `Mod-Shift-z` → `Mod-z` fallthrough IS real — the second refuted explanation had hold of a
real mechanism and drew the wrong conclusion from it (it fires on an EMPTY redo stack, not
always). And the focus half is real too: the probe shows `activeElement` is `BUTTON` the moment
the markdown pane comes back. Two independent traps, either of which is enough to make a redo
oracle pass for nothing, which is why every oracle here witnesses focus AND presses once.

### 11c. The desktop tier on this branch, and a comparison that was wrong the first time

The deck-history change alters WHEN the editor is rebuilt, so the tier that exercises Studio
mounting is the one worth running rather than caveating. Full `--project=desktop` on the branch:
**3 failed, 6 skipped, 432 passed** of 441.

| failing test | is it ours? | how that was established |
|---|---|---|
| `studio-reserved-slots:122` | no | fails on current `main` — 2 failed / 31 passed running its two specs there |
| `studio-reserved-slots:144` | no | same run |
| `studio-instant-shell:539` | no | flaky on BOTH, and `main` flakes MORE — see below |

**The third one is the useful part, because the first comparison said the opposite.** Running the
whole `studio-instant-shell.spec.ts` file three times per tree gave `main` 0 failures in 180
test-runs and the branch 3 (`:455` once, `:539` twice), which reads as a regression this change
introduced — and `:539` fails on a shell-vs-app geometry check (`shell 0 vs app 16`, tolerance 2)
that an extra mount/unmount cycle could plausibly perturb.

**That comparison was unsound: it compared unequal exposure.** A whole-file run at
`--repeat-each=3` runs ~30 tests three times, so `:539` itself ran only a handful of times per
tree — the "180" was the file's total, not that test's. Re-run FOCUSED, twelve repeats of that
one test on each tree:

```
main    2 failed / 10 passed   (12 runs)
branch  1 failed / 11 passed   (12 runs)
```

**The conclusion that survives is "unstable on both trees, this change is not implicated". The
comparative does not, and an earlier version of this paragraph made it anyway** — it read "`main`
flakes more", which is a one-run difference at n=12 and therefore exactly the error the paragraph
above it exists to correct, committed two paragraphs later. An independent checker re-measured
the same test at the same exposure on the same machine, swapping only `Editor.tsx`, and got
**2 failed / 10 passed on BOTH** trees.

Two further rows in the table above are one sample of a flaky set rather than a determinate
result, and should be read that way: the checker's own full-tier run reproduced the headline
(3 failed / 6 skipped / 432 passed of 441) but its third failure was
`studio-instant-shell:455`, not `:539`; and `studio-reserved-slots:144` passed for them on a
main-`Editor.tsx` run, then at 6 repeats each came out 8/18 failing on the branch and 6/18 on
main — flaky on both, difference inside noise. "Not ours" holds for all three; the evidence for
the individual rows is weaker than the table's shape implies.

The lesson is the one this note keeps paying for: a number that looks like a signal has to be
measured at the same exposure on both sides before it is one — and then it has to be big enough
to BE one.

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
  work. **FIXED in the deck-history change — see §11**, which supersedes this entry.

- **`Editor.tsx` still carries its own `CLASS_RE`, so §2's delegation removed one copy of the
  parse and not the other.** It drives the FALLBACK linter and the fallback `fixAll()`, and §4's
  new `report()` makes it authoritative for the Fix-all button whenever that fallback runs. It is
  dead in the shipped Studio — `useRealLint` is `!!lintVocab?.names` and `StudioShell` always
  passes `lintVocab` — so this is a latent duplicate rather than a live defect, which is why it
  is logged instead of fixed. It is still the thing HARD RULES #1 and #7 point at, and this
  change's own argument is "stop carrying another copy of the parse", so it should go with the
  fallback path it serves. Found by a checker.

- **The lint gutter's Quick fix is reachable only by HOVER, so a touch author cannot take it.**
  The mechanism is in `@codemirror/lint`: the gutter marker gets `elt.onmouseover` and nothing
  else — no click, no pointer, no touch handler — and the tooltip opens `hoverTime` (300ms)
  after the mouse arrives. A coarse pointer has no equivalent, so the action popup never opens.
  The affordance is pre-existing (#562's inline validation), it is off this change's path, and
  fixing it means giving the marker a tap target — its own change.
  **The measurement here does NOT cover it, and saying so is the point (#23).** This spec's
  Quick-fix oracle passes 10/10 at 820px under `hasTouch`, but Playwright's `hasTouch` adds a
  touch surface to a context that still has a mouse, and `hover()` dispatches real mouse
  events — so that green says the oracle works on a hybrid device, not that a finger can take
  the fix. A touch-ONLY surface is unreached from here: **UNVERIFIED**. (An earlier revision
  had the walk's `quickFix` op skip on a no-hover context; that op is gone entirely — the
  spec header says why — so the skip went with it.)

- **The desktop Playwright tier is not green on `main`, and the six failures are not this
  change's.** Running the full `--project=desktop` tier on this branch returned **6 failed, 6
  skipped, 396 passed** out of 408. Every one of the six is in the instant-shell / first-paint /
  reserved-slot family, and every one reproduces on this branch's BASE (`81b964e`) with the
  change absent:

  | run | tree | scope | failed |
  |---|---|---|---|
  | full tier | branch | 408 | 6 |
  | the 4 affected specs | base | 55 | 3 — `playground-paint:73`, `studio-instant-shell:539`, `studio-reserved-slots:122` |
  | the same, again | base | 55 | 3 — `playground-first-paint:629`, `playground-paint:73`, `studio-reserved-slots:144` |
  | the same | branch | 55 | 4 — `playground-first-paint:760` ×2, `playground-paint:73`, `studio-reserved-slots:144` |
  | `-g "pre-paint boot view matches"`, 1 worker | base | 9 | 1 — `:760` "a pristine draft" |

  Two things follow. The union of the base's own failures across those runs is **all six**, so
  none is introduced here. And the set SHIFTS run to run on both trees — two base runs of the
  same 55 tests failed two different threes — which is the signature of state leaking between
  parameterized cases, not of a deterministic break. The one that looked most like mine
  (`:760`, a shell-vs-app parity test, and this change does alter one control's presence)
  fails on `expect(__seededView).toBe('read')` receiving `'edit'` — persisted view seeding,
  nothing to do with the toolbar — and it fails on the base in isolation at one worker.

  Not fixed here: it is pre-existing, off this change's path, and it lives in the instant-shell
  seeding code this PR does not touch (#18's off-path rule). Recorded rather than ignored
  because the tier is nightly, so nothing on a PR gate reports it — `studio-e2e-nightly.yml`
  files against `main`, which is where it belongs.

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
