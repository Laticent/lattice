---
status: shipped
summary: >
  Saved themes could be reopened for editing; saved components and finishes could
  not, though their records already carried everything an editor needs. Closing
  that gap surfaced a latent defect underneath it: neither the component nor the
  finish save passed the record's `id`, so `putAsset` fell back to `(kind, name)`
  dedupe and any rename FORKED the record instead of updating it — leaving every
  deck naming the old asset pointed at an orphan. The component save made this
  hard to see, because it already passed `historyLabel: 'Before edit'` and so read
  as an edit while behaving as a create. Both are now id-pinned. Fixing the UI
  also exposed a measured layout clip in the docked Library that predated this
  change and had never been visible to any oracle in the repo.
tags: [studio, library, assets, indexeddb, versioning, responsive]
---

# Reopening a saved asset (2026-08-31)

## What was actually missing

Three kinds live in the shared IndexedDB asset shelf and are versioned:
`theme`, `component`, `finish` (`VERSIONED_KINDS`, `library/asset-store.js:71`).
Only themes could be reopened. The gap was not in the data — the records already
carry the whole draft:

| Kind | What the record holds | What an editor needs it for |
|---|---|---|
| theme | `text` (the stylesheet), `essentials`, `overrides`, `rampStrategy` | the hand-edit record + the pickers |
| component | `text` (CSS), `skeleton`, `manifest` | all three panes of the Component faculty |
| finish | `recipe` (the five layers) | the whole faculty — its CSS is a projection |

`toStudioComponent`'s `toMeta` mapper had even been written *for* this, and says
so in its own docblock: the manifest "breaks the moment a component can be
REOPENED for editing." So the plumbing was done and only the door was missing.

## The defect under the missing feature

`putAsset` (`library/asset-store.js:187`) decides overwrite-vs-create on one
thing: whether the record carries an `id`.

```js
if (record.id) { write(record.id); return; }        // blind overwrite — rename-safe
// …otherwise resolve by (kind, name); match overwrites, no match creates
```

The theme save passed an id. **Neither the component save nor the finish save
did.** So for those two kinds, "editing" a saved record and changing its name
wrote a *second* asset and left the original in the shelf — with every deck
saying `_class: <old name>` or `finish: <old name>` still resolving to the
untouched original.

The component branch is the one worth remembering, because it looked correct:

```js
// before
saveStudioComponent({ name: compName, … }, { historyLabel: 'Before edit' })
```

It passed a history label naming the edit case, which is exactly what the theme
branch does, while passing no id — so it *read* as an edit and *behaved* as a
create. The finish save passed neither, so an edit also took no version snapshot
and there was nothing in "Earlier versions" to go back to.

This was not reachable before, which is why it never bit: with no reopen path,
no save ever carried a stale name to rename away from. Adding the door is what
made the bug live, so it is fixed in the same change rather than filed (HARD
RULE #18).

**Proved by mutation, not by reading.** `library-reopen.spec.ts` seeds a record
through the app's own Save, reopens it, renames it, saves, and counts the cards.
Removing the two `id` spreads and rebuilding turns exactly the two no-fork tests
red and leaves the two reopen tests green — so those tests measure the id pinning
and nothing else.

## Three shapes that are NOT symmetric, and must not be flattened

1. **A finish rename is one field; a component rename is three.** `compFindings`
   gates Save on `skeletonInvokes(compSkeleton, compName)` *and* on every
   `gateCss` selector still scoped to the old name. So renaming a component means
   the name, the skeleton's `<!-- _class: -->` and every CSS selector, or Save
   stays disabled. That is correct — a component whose CSS still says
   `section.callout` would leak onto other slides — but it means a one-click
   component rename belongs in the **Library**, where all three can be rewritten
   together, and is why this change does not claim to have delivered rename.

2. **`FinishStudio.name` holds the LABEL, not the slug**, and THERE ARE TWO
   SLUGGERS. `safeFinishSlug` is the preview's; `safeSaveSlug` is the store's, and
   only the second namespaces the ten reserved names (`Ledger` → `ledger-custom`).
   Every comparison against a stored name must use `safeSaveSlug` — the seed
   predicate and the collision guard both used the other one and both were wrong on
   exactly those ten names. Seeding the field with `record.name` instead of the
   label would separately re-title the finish on the next save, so the predicate has
   to be `safeSaveSlug(label) === record.name ? label : record.name`.

3. **A finish's CSS is regenerated from its recipe on every save**
   (`finish-library.ts:80`), so the recipe is the model and there is nothing else
   to restore. A theme's hand-edited bytes ARE the record, which is why its seed
   effect is the complicated one.

## What the independent checker found, and it was most of the value

Maker-checker (HARD RULE #25) ran over the first draft of this change and returned
six findings, four of them confirmed against the real Studio rather than by
reading. FOUR were defects the change itself had introduced, which is the case
the ladder exists for:

| Finding | What it actually was |
|---|---|
| **The finish faculty had no name-collision guard** | The theme and component faculties refuse a rename onto another record's name; the finish one did not — and the id pin is what made that reachable. Measured: two live `navy` records, one slug. Worse than untidy: the shell resolves the active finish by name and takes the newest, while `finishExtraCss` concatenates BOTH `section.finish.finish-navy` rules with the older one last, so the Inspector shows one recipe and the preview renders the other. The changelog fragment claimed collisions were refused; it was wrong. |
| **A fresh AI generate after a reopen would overwrite the reopened record** | The component branch replaces the name outright on a bare generate and nothing cleared `compEditingId`, so an unrelated generated component saved over the record you had opened. Before the id pin the same save created a second record — a hazard the pin introduced and had to close. Theme and finish avoid it only by accident, because both keep an existing name. **Demonstrated, not just reasoned** — see below. |
| **The Edit button re-introduced the clip this change set out to fix** | See below. |
| **`@[31rem]` could never fire** | `PANEL_MAX = 420`; the query asked for 496px. Right outcome, unreachable branch, and a comment describing a two-column docked state that cannot occur. |
| **A finish whose label does not slugify back to its name is renamed by reopen + save** | `{ name: 'corporate-blue', label: 'Corporate Blue v2' }` — a shape the zip import passes through verbatim — reopened and saved as `corporate-blue-v2`. Every deck saying `finish: finish-corporate-blue` stops resolving, silently, with the author having renamed nothing. |
| **Reopening a zip-imported component is a dead Edit** | The import drops `function`/`form`/`substance` from the manifest, so `validateManifest` fails and Save is disabled with FOUR findings (`description` is dropped too). **Not fixed here** — see "Deliberately not in this change". |

The fifth is the one worth generalizing from: the seed effect's docblock had
argued carefully for seeding the label rather than the slug, and was right about
the direction it considered and silent about the opposite one. A comment that
reasons about one direction of a round trip is evidence about that direction
only.

### Mocking the model, so the second finding stopped being an argument

The generate-after-reopen fix shipped first as one line and a paragraph of
reasoning, because no model is reachable from this sandbox and HARD RULE #24
bars our `OPEN_ROUTER_KEY` from any per-PR test path. A pre-merge card graded on
that honestly: `medium`, axis `evidence`.

**#24's own text is what closed it.** The rule keys on our key's NAME, not on the
endpoint, and it says so explicitly: a Playwright spec that MOCKS the endpoint
(`page.route`) or drives the Studio on a test key is fine. Both apply —
`library-reopen-generate.spec.ts` seeds `lattice-db-or-key` with a throwaway
string (the app's `ready()` is nothing more than a truthiness check on it) and
fulfills every `openrouter.ai` request locally, so no request leaves the browser
and no budget is spent.

Two details a future author will otherwise rediscover:

- **Turn dedup off** (`lattice-db-dedup = 'off'`). It fires its own embeddings
  request before the generate, which the spec has no reason to model.
- **The mocked draft must be gate-clean, and `tags` is the trap.**
  `validateManifest` requires a **3–5 item** array; a one-item list leaves Save
  disabled on `manifest:tags` and the spec never reaches its assertion. Most
  other fields self-heal through `snapEnum` defaults, which makes this the one
  that bites.

Mutation-proved, and the mutation is the finding: delete
`if (!refine) setCompEditingId(null)`, rebuild, and the `.quarter-callout` card
is **gone** from the Library after the generate is saved — overwritten by
`pricing-trio` on its id, exactly as the checker predicted. That is the
difference between a claim and an artifact.

## The clip the change had to fix on the way

The docked Library's card grid was `grid-cols-1 sm:grid-cols-2` — a **viewport**
breakpoint — while the docked panel is a ~270px column that is nearly always on a
≥640px screen. It therefore took two columns of 125px, and a four-control action
row overflowed its own box by **~110px**: Share and Delete rendered, reported
themselves visible, and sat behind the card's edge.

Measured at 1440 in the docked panel, before: row 216px inside a 105px box, on
all three kinds.

**The first fix was half of one, and the checker measured the other half.** The
docked panel is not a fixed column — it is DRAGGABLE between `LIB_MIN = 240` and
`PANEL_MAX = 420`. Two consequences the first draft missed:

- Two 236px cards plus a 12px gap need 484px, and the panel tops out at 420. So
  there is no width at which the docked answer is two columns, and the container
  query asking `@[31rem]` (496px) was a branch that could never be true. It is
  now simply `grid-cols-1` when docked, which is the honest statement.
- At the 240px **minimum**, the four-control row still overflowed by **31px**
  (185px box, 216px row) — and hiding the new Edit control took it to 0 on all
  three kinds. The fourth control is what tipped it, so it is this change's to
  fix. The Share label now collapses to its icon below `@[18rem]` — MEASURED, not
  borrowed from the Import button's `@[20rem]`: the binding case is the 240px minimum
  (a 185px card against a 216px row), and the panel's default resolves to a ~297px
  container where a labelled row still fits. A 20rem threshold cleared the minimum and
  also hid the label at the width the panel actually sits at. The same
  threshold and the same idiom the Import button above it already uses.

After: **0px overflow at 1440 / 820 / 390 AND at both ends of the drag range**,
on all three kinds.

Two things about it are worth recording:

- **It predated this change.** The theme card has carried four controls since
  #1850 and clipped exactly this way. Adding Edit to components and finishes
  spread the same clip to two more kinds, which is what turned a pre-existing
  nick into this change's business rather than a note.
- **Nothing in the repo could see it.** Every overflow oracle here reads the
  *header's* `scrollWidth` (`check:overflow`, `studio-header-fit.spec.ts`), and
  this is a card inside a panel; jsdom has no layout, so the unit tier cannot
  measure a box at all. `library-card-fit.spec.ts` measures the row against its
  own card in a real browser, which is the only oracle that exists for this shape
  (HARD RULE #23). It is the same failure mode as the deck pill in #1417: the
  element engineered to absorb the pressure is the one that breaks silently.
- **A spec that says "at every width" has to visit the width that varies.** The
  first version of that spec iterated 1440 / 820 / 390 — VIEWPORT sizes — and
  passed while the invariant it names was false, because the docked panel's own
  width is set by a drag handle no viewport size can reach. It now drags the
  panel to both stops and asserts the two ends actually differ, so a silent
  no-op drag cannot let it pass at the default width forever. Both arms are
  mutation-proved: restoring the Share label reproduces 31px at a 185px card on
  the drag arm, and leaves the viewport arm green.

Every other responsive control in that panel already switched on `docked` + a
container query (the Import label at `@[20rem]`, the status breakdown at
`@[18rem]`), and `LibraryFrame` has made the docked column an inline-size
container all along. The card grid was the one that never got the memo.

## Deliberately not in this change

- **Rename with a deck rewrite.** `asset-rename.ts` is a complete, tested, pure
  kernel — `renameAssetInSource` / `renameAssetAcrossDecks`, twelve tests,
  including one pinning that `finish-override:` is keyed on LAYER names
  (backdrop/wash/mark/edge) and must NOT be moved by a rename. It still has **zero
  production callers.** Wiring it needs a driver over `studio-store.ts`'s
  localStorage deck index and a confirmation surface that shows the author how
  many decks a rename will rewrite *before* it runs — plus, per shape 1 above, the
  component's own CSS and skeleton. That is its own change.
- **Motion scenes.** `scene` is excluded from `VERSIONED_KINDS` and has no Library
  card at all (#1678). Giving one kind Edit before it has a card would ship half a
  set of actions.
- **A usable Edit on a zip-imported or workspace-restored component.** Confirmed
  by the checker and left standing, deliberately. `Library`'s import writes
  `meta: { bucket }` and `workspace-backup` writes no meta at all, so both drop
  `function` / `form` / `substance`; the reopen path seeds `compMeta` from that
  record and `validateManifest` then fails Save with four findings. The
  underlying loss is PRE-EXISTING and off the path of this change (HARD RULE
  #18's on-path/off-path rule), and the two available fixes are both worse than
  the gap: back-filling from `STARTER_META` would invent a classification and
  persist it as if the author had chosen it, and suppressing the gate for
  imported records would let an under-specified component into the catalog. The
  findings panel already names the three fields to fill in, so the round trip
  completes — it just is not one click. Fixing it properly means the IMPORT
  carrying the manifest, which is where the bytes are lost.

## What the adversarial trio added, and the direction it forced

The trio (HARD RULE #25) ran over `0af6c96` after the checker's fixes. Three more
confirmed defects, all in code this branch introduced, all measured:

- **Saving two assets in one sitting destroyed the first.** Both faculties pinned
  the record they had just saved and nothing cleared it, so the faculty became a
  permanent editor of its first save and naming a second asset renamed the first
  out of existence. This is the one that should have held the PR: silent data loss
  on the most ordinary flow either faculty has, and strictly worse than the fork it
  replaced, which at least left both records standing. The id now comes only from a
  reopen.
- **The ten reserved finish names bypassed the collision guard**, and the same
  mix-up made the seed a regression for them. See shape 2 above.
- **No spec anywhere covered the collision guard** — for any kind. That is how the
  reserved-name hole reached review, and `library-save-identity.spec.ts` is the
  answer.

### The rename question, reopened by the human — and my own argument corrected

The inversion's lead objection is that this branch ships the mechanism for an
irreversible cross-deck rename and defers the only thing that makes it safe. That
is right, and it is why rename stays out (see "Deliberately not in this change").

**But the argument I made for preferring aliases over a deck rewrite was wrong on
its main example, and the correction matters.** I claimed a deck rewrite cannot
reach decks already exported to PDF or to the `.html` player, so those "stay broken
forever". They are not broken at all: both bake the asset's CSS *and* its class
tokens into the artifact at export time (`share-export.ts` → `buildDeckRender` /
`buildSelfContainedDoc`), so a later rename never reaches them and never needs to.
The same holds for a `.md` handoff's finish CSS.

What a rename actually breaks is **decks in the same workspace**, and a deck
rewrite does reach those. The honest case for aliases is narrower and still good:

| | deck rewrite | record-side alias |
|---|---|---|
| decks in this workspace | fixed, by mutating them | fixed, without touching them |
| a deck shared BEFORE the rename, re-imported after | still broken | resolves |
| a `.zip` asset bundle re-imported after a rename | duplicates or overwrites | resolves under the precedence rule |
| frozen artifacts (PDF, player, `.md`) | not affected | not affected |

**The fork worth a human decision is components.** A finish alias is a comma-joined
selector list in one generator (`finish-generate.ts`, one `sel` variable feeding
three emission points). A theme alias is not a CSS edit at all — `ThemeStore.byName`
is a plain Map, so an alias is a second registration. But a component's selectors
are the *author's own bytes*, and `gate.js`'s `partScoped` requires every selector
part to contain `.<name>` — so `.velvet, .navy { … }` fails the gate as an
unscoped-selector error. A component alias therefore needs either a CSS rewrite at
rename time (which is a rename, not an alias) or a widening of a scope gate that
exists to stop a component leaking onto other slides. That is not a mechanical
choice.

Scope, measured: roughly nine resolution sites in the shell, a four-layer thread
per kind (input type → record build → mapper → view type; miss one and the alias
round-trips to nothing), four uniqueness guards, and the `partScoped` decision. It
is its own change, and its own decision record.

### The red team's finding, which is the best argument in this record for the ladder

The red team ran last, over `ecc793f` — a head that had already been through a checker
twice and an inversion. It found a HIGH-severity defect **created by the previous
round's fix**:

> After one save, Save is permanently disabled. You cannot save the same component or
> finish twice.

Two changes, each correct in isolation, deadlocked. Not pinning the id on a fresh save
(so a second asset cannot rename the first out of existence) means the next save carries
no id — and the collision guard then matches *the record the first save just created* and
refuses it. The escapes were both bad and one was measured: renaming forks the record,
and leaving the faculty to reopen from the Library **discards the unsaved edit**.

The lesson is not "add another guard". It is that **the defect lived in the seam, not in
either unit** — and that my own code comment asserted the contract the pair had broken
("same name overwrites, new name creates"), which is precisely the kind of claim a
reviewer reads and believes. `compLastSavedId` restores it by excluding the one record the
faculty itself wrote.

Two more, both real:

- **The tooltip explaining a disabled Save could never open.** `TooltipTrigger asChild`
  put the trigger on the button, and shadcn's `disabled:pointer-events-none` means a
  disabled button fires no `pointerenter` and takes no focus. All three messages were
  dead — including the imported-manifest explanation this change added *as* the mitigation
  for its own acknowledged dead end. The trigger is now a wrapping span.
- **The ARMED delete row overflowed by 21–23px at the panel minimum**, on all three kinds.
  Every measurement in this record until then was of the IDLE row, and arming is the state
  you must reach to delete anything.

That last one produced the sharpest small lesson in the change. The first fix — `min-w-0`
on the primary action — made the row-level oracle read 0 **by collapsing the primary
button from 70px to 28px with its own label clipped.** The row fit; the button was
destroyed. A width oracle that asks only "does the row fit" cannot tell a fix from a
squash, which is why `library-card-fit.spec.ts`'s armed arm asserts TWO numbers: the row's
overflow *and* the primary's own. The shipped fix takes the width from Share, which steps
aside while a delete is armed.

**What the red team CLEARED is worth as much as what it found**, and none of it was
assumed — each was driven against the built site:

- **HARD RULE #22, stylesheet channel: held.** A hostile `.zip` component whose CSS
  carried `</style><img src=x onerror=…>` was imported, reopened, and rendered in the real
  faculty preview. `sanitizeStyleText` escaped the terminator; no markup escaped, no script
  ran. The reopen path adds no new #22 sink.
- **An attacker-chosen record `id` in a bundle: held.** `unpackBundle` rebuilds
  `{name,bucket,css,skeleton}` and drops the rest, so an imported bundle cannot clobber a
  victim's asset by id.
- **A hostile finish recipe: held.** `sanitizeGlyph` stripped the quote/semicolon/brace
  payload aimed at `mark.glyph`, the one unclamped field.
- **`VERSION_CAP` exhaustion: held** — 20, enforced per `assetId` inside the same
  transaction, and no-op saves manufacture no versions.

### Round four, and the point at which the loop stops

A narrow checker over the red team's three fixes found two more, and the second is the
sharpest lesson in this record because it is a fix that was **worse than the defect it
cured**.

**Hiding Share while a delete is armed created a one-click destructive path.** With Share
unmounted, the confirm expanded onto the coordinates Share had occupied one frame earlier —
so a mis-click on Delete followed by a click where Share had just been *deleted the asset*,
along with its version history. Measured: the element at Share's former centre was the
confirm, and one click removed the record. Trading a 23px clip for a destructive
mis-click is not a trade, and the shape of the error is general: **freeing space by removing
a control moves a destructive target under a safe one's coordinates.**

The fix is to stop the confirm growing instead of making room for it: below `18rem` it keeps
the idle button's box and drops only its word. Nothing reflows, so nothing can be displaced.
`library-card-fit.spec.ts` now asserts that as geometry — every sibling keeps its exact
box across the idle→armed swap — rather than asserting "Share is still rendered", which a
re-render elsewhere would satisfy while reintroducing the hazard.

**And the collision guard was over-scoped from the start.** Two dead ends came out of it in
consecutive rounds — first "you cannot save the same asset twice", then, after a
`lastSavedId` patch, "you cannot rename back to a name you used earlier in this session" —
and both had one root: *the guard fired on saves that cannot produce the state it guards
against.* `putAsset` writes a duplicate only on the id path; without an id it resolves
`(kind, name)` onto the record already holding that name and updates it. So the guard now
applies only when a reopened record is pinned. That deleted a state variable and both dead
ends together, and it is smaller than what it replaced — the sign that the earlier versions
were patching symptoms.

**Superseded in round 6 — read on before acting on that sentence.** Pinning is not the
condition; it turned out to permit a silent overwrite on the unpinned path, and the rule is
now ownership. This paragraph is left as the record of what round 4 concluded, which is the
point of a round narrative, but it is not the current rule.

**Four rounds, ten confirmed defects, nine of them introduced by this change.** Round 4 also
found the theme faculty still pinning after a fresh save (pre-existing, and fixed here since
it sits in the same function as the note condemning it) and confirmed the disabled-Save
tooltip reaches a pointer only — keyboard and screen-reader users still get no explanation,
which the changelog now says rather than implying it was solved.

The discovery rate did not fall across the four rounds (6, 3, 3, 2). HARD RULE #25 caps
refine loops at about three for exactly this reason, and the honest reading is not "one more
round would finish it" but that **this subsystem — the interaction of id-pinning, name
guards and save semantics — has a defect density that four rounds have not exhausted.** That
belongs in the merge decision as a property of the change, not as a queue of items to keep
fixing quietly. The loop stops here; what is left goes to the human.

---

## Round 5 — the fix for round 4 shipped a deadlock, and the card missed it

The loop did not stop there. Two things happened after the paragraph above was written,
and the second is the reason this section exists.

**First, the sampling was replaced with enumeration.** Nine of the ten defects lived in one
small cross-product — whether a save carries an `id`, how its name relates to what is on the
shelf, which kind it is — and each round had sampled that space by inspection, found a real
defect, and shipped a fix that created the next round's. That space is finite, so
`asset-save-states.test.ts` enumerates it: seven reachable store states, driven against the
real store on `fake-indexeddb`. Seven rows failed on first run. `putAsset` then took the
`(kind, name)` invariant inside its own write transaction, where a faculty's stale React
snapshot cannot bypass it.

**Second, an independent checker read that commit — the only one on the branch no
adversarial round had seen — and found the branch was shipping a dead Save button.**

Scoping the collision guard to reopened records (round 4's fix) was correct, and it was
applied to the component and finish faculties. The theme faculty's copy was left unscoped,
and in the same commit the theme's id pin became conditional. Either change alone is fine.
Together: a fresh theme save leaves `editingId` empty while the record it just wrote now
holds the name, so the unscoped guard is truthy forever and Save is disabled — permanently,
for that theme — with a tooltip naming the record the author had just created. The escapes
were a rename (which forks) or leaving the faculty (which discards the unsaved draft). It is
the round-3 deadlock, re-created on a different tab by the fix for the round-3 deadlock.

Two `fabricate.spec.ts` tests that pass on `main` went red. **Neither is in the smoke tier,
which is the tier CI runs on a pull request** — so the branch was green on every gate while
breaking a test the repo already owned. That is the more durable finding: the regression was
caught by a test that existed and was not run, not by one nobody had written.

### What changed as a result

- **The rule is one function.** `library/save-guard.ts` holds `findNameClash`, and all
  three faculties call it. The bug was possible because a rule with two halves — the id
  comparison, and the condition under which the guard applies — existed in three copies,
  and a fix updated two. (Round 5 stated that condition as "only when pinned";
  round 6 replaced it with ownership, and `save-guard.test.ts` now enumerates a
  three-axis space, not nine cells. Reverting the scope today reddens the
  unpinned-refusal rows.)
- **The id-pinned save reads the `kind` index, not the whole shelf.** The checker measured
  the uniqueness check at ~50–100 ms and ~24 MB per save with three 8 MB reference docs
  present, on a path that previously read one record by key. The index is both cheaper and
  the precise question.
- **The refusal message is an exported constant with a test.** Two faculties branch on the
  message text to decide whether to show the store's reason or the storage-failure
  fallback; it was a bare literal in three files, so rewording it would have silently
  reverted the fix with the suite still green.
- **The two `fabricate` tests that caught it are now in the smoke tier — which does NOT
  make them a gate, and the first version of this note implied it did.** They were the only
  coverage anywhere for saving one theme twice, and `test:e2e:smoke` is `--grep @smoke`,
  which that file carried no tag for; tagged, they now run. But `studio-smoke` is
  deliberately absent from `ci`'s `needs` (`ci.yml:646-653`) — "a red here reports but does
  NOT block merge" — so the symptom as originally written, "both went red and CI stayed
  green", would recur verbatim on the required checks. **The gate that actually caught the
  regression is `docs-build`'s vitest step, which already existed and which nothing local
  can run.** The tags are still worth having (a reported red is how a human notices), but
  they are reporting, not gating, and calling them "a cost every future PR pays" overstated
  what they buy.
- **The enumeration's own docblock was overstated.** It declared a four-value `id` axis, but
  the store cannot distinguish "another live record's id" from "its own" — it sees only
  whether the id and the name each match something live. It now states the seven states it
  actually covers, says plainly that `kind` is inert for all but the `scene` row, and lists
  the two gaps (exact-match names, cross-kind ids) as unreachable-by-construction rather
  than implying they were covered. One assertion could not fail for the property in its
  name and now checks the id directly.

### What this says about the pre-merge card

The card graded the change `high` with the floor on `unknowns`, and named one thing that
would raise it: enumerate the faculty save/pin lifecycle the way the store's was. **The
defect the checker found is precisely what that gap was hiding** — so the raise-path was
right, and shipping without spending it would have shipped the deadlock.

The card was also wrong in a way worth recording. It graded `independent eyes` at the top of
the scale on the strength of four rounds, when the newest and most load-bearing commit had
had none, and the summary of those rounds ("the trio ran four times over") described
something that did not happen: across four rounds all three lenses ran, but no single round
ran the full trio. HARD RULE #25 requires the trio on *what will actually ship*, and a count
of agents that reviewed earlier commits does not satisfy it. **The check that catches this
is asking, per axis, which commit the evidence came from.**

---

## Round 6 — the fix for round 5 shipped the opposite defect, and the full suite caught it

`b944fb5` fixed the theme deadlock by scoping the guard to reopened records, matched the
other two faculties, pushed green on lint, typecheck, `build:check`, the library unit tier
and 30 real-surface e2e tests. **The full studio unit suite then failed one test** —
`studio.theme-depth.test.tsx`, "refuses to save one theme onto ANOTHER saved theme's name",
which predates this branch.

It is not a stale test. With nothing pinned, `putAsset` resolves `(kind, name)` and updates
whoever holds the name — so a fresh save under an existing theme's name overwrites that
theme with the current draft. Recoverable through history, and completely silent.

### One flag, two requirements, four attempts

The guard was being asked to serve two things that no single flag can hold:

  (a) re-saving the record you just saved must work — refusing it is a deadlock, because
      the escapes are a rename (forks) or leaving the faculty (discards the draft);
  (b) typing a DIFFERENT record's name must be refused — allowing it silently updates a
      record the author never opened.

| Attempt | (a) | (b) |
|---|---|---|
| guard every save | deadlock | ✓ |
| guard every save, remember one `lastSavedId` | ✓ | breaks renaming BACK |
| guard only while pinned (`b944fb5`) | ✓ | silent overwrite |
| guard unless this session OWNS the clashing record | ✓ | ✓ |

The discriminator is ownership: does this session already own the record holding that name,
by having reopened it or by having written it here? It must be a SET — a single "last saved"
id is what made attempt 2 refuse a rename back to a name used earlier in the same session.

**Ownership deliberately does not pin.** The save stays unpinned, so typing a genuinely new
name still creates a record rather than renaming the one just made — which is what killed the
version that pinned after every save. Owning relaxes the guard; pinning changes the write.

### What this round is actually evidence of

Three copies made the arithmetic worse than it looks: the fix for attempt 1 landed attempt 3
in two faculties and left the third on attempt 1, so one tab deadlocked while the other two
were quietly overwriting. Both defects were live simultaneously, in one function, and each
review round saw only the one its scenario touched.

Two gaps are worth recording over the fix itself:

- **No local hook can run the docs suite at all** — and the first version of this note got
  that wrong, which an independent checker caught. It said pre-push runs `affected-tests`
  rather than the full suite. Both halves are false: `affected-tests` is a PRE-COMMIT job
  (`lefthook.yml:10-21`), and pre-push does run `npm test` as an explicit "safety net: full
  unit suite" (`:103-165`). The real reason is narrower and more useful: **`npm test` is
  `node --test 'test/unit/**/*.test.js'`, which never enters the docs workspace**, and
  `tools/affected-tests.js:70` lists `docs/` under `isSkippable`. The docs vitest suite is
  reachable only through CI's `docs-build` step. Acting on the wrong diagnosis would have
  made pre-push "run the full suite" — it already does, and `b944fb5` would still have got
  out. Precisely: no HOOK runs it. A developer can and does (`cd docs && npx vitest run`),
  and `lefthook.yml` already carries a docs-scoped pre-push job behind a `docs/` path
  guard, so the pattern for adding one exists — that is a hook-contract change and so a
  human's call, not an agent's.
- **Neither the library unit tier nor 30 e2e tests could see it.** The e2e specs exercise the
  faculties this branch changed; the assertion that caught it lives in a suite about the theme
  faculty's depth, written long before. **A regression net is only as good as the scope you
  run it at**, and the scope that mattered here was the one nobody had a reason to run.
