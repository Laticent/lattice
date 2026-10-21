---
status: proposed
summary: >
  Follow mirrors only slide, panel and view today. The owner wants it to cover Present, the Slide and
  Deck panels, Setup's open section and a marker on the row someone is working in, as one scalable
  mechanism on Tavola that does not replicate Yjs. Proposed: Tavola owns the awareness gate through a
  Yjs adapter (one hardened implementation of the checks the Studio hand-writes today) and a core
  schema module with a closed key list. Every value is a place in a fixed list, never free text. A
  trio review found the first draft unsafe in five places and found three weaknesses in shipped code
  (an unbounded awareness parse, a forged clock that mutes a member for the session, and slide Follow
  moving a typist); this revision closes them and lists what the owner still decides.
---

# Follow, everywhere: one mechanism, built on Tavola

**Status:** built in #2830 (slices 1 to 5; see "As built" at the end), revision 2 (2026-10-21), after a red team, a Munger inversion and an independent
checker reviewed revision 1. Builds on `2026-10-20-live-uniform-experience.md` (§4 tiers, §5 decisions 4
and 5, §6 safety model).

**Owner decisions so far (2026-10-21).**
1. Yes to all three follow-ups: Present, the Slide and Deck panels, and inputs and dropdowns and sliders.
2. The mechanism must scale and be enabled by Tavola, not a set of one-off fixes.
3. **Tavola must not replicate Yjs.** The owner suggested a bridge; this note takes that route.
4. A followed control shows a **ghost marker**, not the leader's value written into the follower's control.
5. Follow shows that the leader has **Setup** open and which section, never a value.
6. The work lands on the current branch, in #2830.

## 1. What the owner saw

Following someone mostly works: the editor follows, Coach and Live open, the slide moves in the preview. What
does not follow: the text caret and where the person is, opening Present, Present's narration, captions, Guide
and slide steps, the Deck and Slide inspector panels, Setup, and what the person does in inputs, dropdowns and
sliders. The caret was a bug, fixed in 4fe9108 (a caret at the end of the deck crashed every viewer's remote
carets). The rest are gaps the owner now wants closed.

## 2. What the code does today

- **Deck truth already travels.** Every Deck and Slide inspector write lands in the deck text (`settingsWrite`,
  58 calls; `mutateSlideFromPanel`), and Live syncs that text. A follower already sees a leader's theme or size
  change. What does not travel is *where the leader is working*.
- **Local only:** which inspector panel is open (`activeSettings`, never reported), its section tab and search
  box, the list or grouped view, a solo Present's position (only `presenting: true` travels), and the state of a
  control in use.
- **What Yjs does in Live.** The document job (a CRDT) keeps the deck text identical when two people type at
  once. The awareness job (`y-protocols/awareness`) carries each person's small status: name, color, caret,
  slide, and today's `doing` (panel, view, presenting, asking). Awareness resends a person's whole status to the
  others on every local change (and every 15 s), and drops it after 30 s of silence. **Tavola knows neither.** It
  moves two sealed byte streams and decides who may send them (members only; edit role for the document; each
  member bound to one awareness client id by the host's roster). The Studio plugs Yjs into both streams
  (`live-controller.ts`: `awStream`, `sanitizeAwareness`, `cleanDoing`, `cleanRelPos`).
- **Tavola's boundary.** The core imports nothing outside `docs/src/lib/tavola/`, enforced by
  `checkTavolaBoundary` (`tools/check-ownership.js:9266-9293`), which sanctions one adapter and one bare name
  (`trystero/nostr`). Tavola's test files already import `yjs` (`session.test.ts:2`); the gate skips tests.
- **The controls funnel into a few wrappers.** `CatalogSelect` (33 call sites), `Field` (44), `Toggle` (8) and
  `TextRow` (9) carry nearly every setting; raw `<input>` and `<textarea>` bypass them (49 and 18 tags in
  `docs/src/components/studio` counting tests, 47 and 14 without; `grep -o '<input\b' -r . --include=*.tsx`).

## 3. Weaknesses the review found in code that already ships

These are in `main`, not in this proposal. They sit in the awareness path this change rewrites, so they are on
its path (HARD RULE #18) and slice 1 fixes them.

1. **An unbounded parse.** The gate passes a member's awareness message up to 4 MB with no rate limit
   (`session.ts:961`, `:1017`), and `sanitizeAwareness` parses every entry for the sender's client. One
   3.98 MB message (250,000 entries for the sender's own client id) took 727 ms and produced 36.5 MB of output
   (9 times the input, because it adds `peer` and `user` to each entry), plus 267 ms to apply. §6 rule 8 of the
   2026-10-20 note says received bytes are bounded before they are parsed.
2. **A forged clock mutes a member for the session.** Yjs ignores any update whose clock is below the last one
   it saw for a client. A member who claims a dropped member's client id on a re-knock can send that id at a huge
   clock; `forget` clears the states but not the clock record, so the real owner's later updates are ignored by
   every peer. A hostile host can do the same, because guests never check that roster client ids are unique.
   Reproduced on y-protocols.
3. **Slide Follow moves a typist.** Panel and view moves wait behind a "Go" toast while the follower types
   (`live-controller.ts:1677`); slide follow calls `goToSlide` with no typing check (`:1665-1667`), and the Slide
   panel reseeds its drafts on a slide change (`SlideContext.tsx:289`), so a follower's half-typed note is lost.
   Opening the Slide panel for followers (D2) would make this the common case.

## 4. The model: three kinds of state

| Kind | Rule | Examples |
|---|---|---|
| **Deck truth** | Already identical for everyone. Follow adds nothing. | Every inspector value, the deck text |
| **Attention** | **Where** a person is and what row they are in. Shown to others; applied only while following. A value is always a place from a fixed list, never text a person typed. | Panel and section open, Present open and position, the row in focus |
| **Private** | Never leaves the browser. | API keys, devices, unsent drafts and anything typed and not committed, standing instructions, Present's CC, Voice and Guide, any Setup value |

Almost everything the owner listed is **Attention**. A theme dropdown or a size slider is Deck truth and arrives
as the deck changing. What a follower lacks is the *place*: which panel, which row.

**Location, never value.** The first draft let a text key show "the leader's value". The Slide panel's note,
say and description fields are draft-then-commit (`SlideContext.tsx:289-319`); a followed value would broadcast
exactly what the Private tier keeps. So no key carries free text. The ghost reads "Amina is editing Notes",
built from a fixed list, never from her text.

## 5. The decision: Tavola owns the awareness gate, through a Yjs adapter

**Rejected: a new Tavola channel for presence values** (a second presence system next to awareness, the
duplication the owner ruled out). **Rejected: one post per feature** (today's pattern; it does not scale).

**The bridge.** Awareness stays the carrier. Tavola gains the piece it lacked: one hardened implementation of
the checks every awareness consumer needs, plus a declared, typed view of the state.

```
docs/src/lib/tavola/view.ts            core, no Yjs: schema combinators, ViewKeys, cleanView(), bounds
docs/src/lib/tavola/adapters/yjs.ts    the bridge: the ONLY production file that imports yjs / y-protocols / lib0
```

**Core (`view.ts`).** `defineViewKeys({ panel: oneOf([...]), section: oneOf([...]), focus: oneOf([...]),
present: obj({ idx: int(0, 10_000), page: int(0, 10_000), lens: id64, hash: hex8 }) })`.
- Every value is `oneOf`, an integer in a range, or a fixed-form id. **There is no free-text combinator.**
- Keys are held in a `Map` and tested with `Object.hasOwn`, so `constructor` and `__proto__` are not keys.
- `cleanView(raw, keys)` returns only declared keys whose value passes, at most 16 keys and 512 UTF-8 bytes
  serialized. A failing value is dropped, not repaired, and counted (see §10, "silent drops").

**Adapter (`adapters/yjs.ts`).** `yjsAwareness(awareness, { keys, fields, roster, share })` returns a Tavola
`Stream` and a typed `view`.
- **Bounds before the parse.** A per-sender byte cap for awareness (8 KB, not 4 MB); at most one entry per bound
  client per message; each entry's length is read with `readVarUint` and refused over 4 KB before `JSON.parse`;
  the rate limit is keyed on the transport `from`, not on a claimed client id.
- **Rate, done honestly.** At most 10 applied updates a second per sender, but the **latest** update is kept and
  applied on a trailing timer (never discarded), a removal (a `null` state) is never dropped, and the `cursor`
  field is exempt so a fast typist's caret never freezes. (Awareness resends only on a change or the 15 s
  renewal, so a dropped final update would leave a follower stale for up to 15 s.)
- **Identity is the adapter's, not the app's.** `peer` and `user` are written by the adapter from the roster row
  of the sender, and are never cleanable fields. The app passes per-field cleaners with the signature
  `(value, sender: Member) => clean | undefined` for `summon` (host only), `cursor`, `slide`, `slideHidden`,
  `editingAt` and `doing.asking`. A test diffs the adapter's output against today's `sanitizeAwareness` for the
  same inputs.
- **Clock safety.** The adapter deletes a client's clock record whenever its owner changes, refuses a clock jump
  above a bound, and a guest drops a roster in which two members share a client id. The host binds a client id
  to the token that first claimed it (a change in `session.ts`, slice 1).
- **Sending.** `view.set(key, value)` coalesces to at most 5 writes a second. The privacy switch is checked at
  **flush** time, not at enqueue, so a queued write cannot put a field back after the person turned it off.
- **Reading.** `view.of(peerId).get(key)` returns the latest validated value, or `undefined`.

**What stays app-side:** the per-field cleaners above, the share-switch wrapper, the roster lookups, `yCollab`
(the caret and selection, which y-codemirror owns), the slide, and the document.

**What Tavola's package must do:** a `./yjs` export in `docs/src/lib/tavola/package.json` with `yjs` and
`y-protocols` as optional peer dependencies; an entry in `tools/build-tavola-lib.js` that marks `yjs`,
`y-protocols/*` and `lib0/*` external (otherwise the published adapter bundles a second copy of Yjs, which Yjs
refuses); and `checkTavolaBoundary` changes from one adapter and one name to a map of file to allowed names
(`yjs`, `y-protocols/awareness`, `lib0/decoding`, `lib0/encoding` for the new file; `trystero/nostr` for the
old), with its unit test (`test/unit/cli/check-ownership.test.js:2112`). This is a gate allowlist change, not a
CI job, step or hook, so it needs a justification in the PR, not the owner's sign-off.

## 6. The keys, and the compatibility plan

| Key | Values | Replaces or adds |
|---|---|---|
| `panel` | `AppliedPanel`: coach, lenses, library, live, deck, slide | `doing.panel`, plus the two inspector panels (D2) |
| `section` | a fixed list per panel (the Deck tabs; the Slide `sectionDefs` ids) | new |
| `shown` | `ShownPanel`: adds `setup` | new; **never applied** (see rule 8) |
| `focus` | a fixed list of row ids from `followKeys.ts` | new |
| `present` | `{ idx, page, lens, hash }` | new (D1); the `hash` is the same fingerprint the room transport carries |
| `view`, `presenting`, `asking` | as `doing` today | `doing` |

**Mixed sessions.** An old tab's `cleanDoing` rejects the whole `doing` when `panel` is outside four values
(`live-controller.ts:339`), and reads only `doing`. So for one release new tabs **write `doing` in the old
four-value schema, derived from `view`, beside `view`**; new tabs read `view` only; an old tab following a new
leader keeps today's behavior, and a new tab following an old leader degrades to today's `doing` (the adapter
falls back to `doing` when `view` is absent). A test runs an old-sanitizer tab and a new tab in one session.
`asking` migrates with the rest.

## 7. Follow semantics this adds

1. **One typing gate.** Every applied key, including the section tab and **the slide** (closing weakness 3),
   goes through the single `myEditAt` / `typingInAField` check; a typist gets a "Go" toast, not a move.
2. **Absence means no information, never "close".** A missing key (never set, expired, withheld by the share
   switch, an old tab, dropped by the schema) changes nothing on the follower's screen. A backgrounded leader
   whose timers are slowed must not make a follower's panel blink.
3. **Follow survives a blip.** Follow is keyed on the person (roster name and rejoin), not the transport id,
   which changes whenever a browser rejoins (`types.ts:4`); today a leader's reconnect silently ends every follow.
4. **Present follow is a third provenance.** A Present opened by following is `follow`; **a room Present beats
   a follow**. A follow-opened Present gets `inertKeys` (it ignores the keyboard until clicked), starts muted,
   synthesizes nothing (a follower never pays for a non-host leader's narration), and has a restart window like
   `PRESENT_RESTART_MS`. CC, Voice and Guide stay each person's own. Narration reaches a follower only through the
   host's "Present to everyone", unchanged.
5. **Setup is shown, never opened.** `shown: setup` and its section draw a line in the Live panel ("Amina is in
   Setup · Voice"); Follow's setter accepts only `AppliedPanel`, so a leader can never open a follower's Setup
   (it shows the follower's own balance and the data-clearing rows).
6. **The ghost is a location, on the four wrappers.** While following, the row the leader is in wears a ring
   and "Amina". `CatalogSelect`, `Field`, `Toggle` and `TextRow` gain one optional `follow="<row id>"` prop
   (HARD RULE #15); raw inputs are out of the first pass. "Amina changed Theme" lines come from the one choke
   point, `settingsWrite(label, …)`, using a fixed list of labels.
7. **Phones.** The Slide and Deck inspector is a different tree on a tablet and a sheet on a phone
   (`StudioShell.tsx:7195`, `:7274`), and a `section` the follower's current slide lacks falls back to the first
   tab. Following a key the follower's layout cannot show shows a small label ("Amina is in Deck · Theme") and
   moves nothing, as Follow does today for a panel a width does not have.

## 8. Safety rules (proposed amendments to the 2026-10-20 note)

This note amends the 2026-10-20 note's **§4 tier 6** (settings: Setup's open section is now shown), **§5
decision 4** (the followable panels now include Slide and Deck), **§5 decision 5** (opening Present for yourself
is no longer wholly solo: a follower's Present opens at the leader's position) and **§6 rule 3** (the allowlist
now holds panel, section, focus and a solo Present position).

1. **The key list is the allowlist,** enforced by Tavola's adapter on receipt (§6 rule 3 moved into the library).
2. **A key names its tier in the PR that adds it** (§4's rule for new state), in a comment beside it.
3. **No key carries free text,** and a `follow=` prop names a row id from the fixed list. A build check inside
   `check-ownership.js` (not a new CI step) fails a `follow=` control that takes a file, password or
   device-picker input, and a row id whose name matches key, token, secret, password, prompt or draft. The
   name check is a backstop; rule 3's first clause is the defense.
4. **Receiver decides, one gate.** A value is applied only while following that member, through a named setter in
   the actions bag, never a DOM event (§6 rule 1), and only through §7 rule 1's typing gate.
5. **Text is data.** A followed id is mapped to the follower's own label; no peer string is shown or built into a
   label (§6 rule 9). A value that could reach a slide or a `<style>` goes through the deck text and its
   sanitizers (HARD RULE #22).
6. **The privacy switches govern `view`.** Each key names the share switch that governs it; `present` falls under
   both "slide" and "doing"; `applyShare` clears `view` as it clears `doing`; the check runs at flush time.
7. **Bounds apply before parse** (§6 rule 8), keyed on the sender (§5, adapter).
8. **Setup is shown, not applied** (§7 rule 5).
9. **A user's own OpenRouter key stays Private.** It is written only by the OAuth exchange and never sits in an
   input; the build check keeps it that way. (HARD RULE #24 protects our server key, a different thing.)

## 9. What each item the owner listed becomes

| Owner's item | Becomes | How |
|---|---|---|
| Cursor not synced | Fixed in 4fe9108 | Yjs awareness, unchanged |
| Their position not visible | "Following Amina · Deck, Theme" and the ring on their row | `panel`, `section`, `focus` |
| Present click not followed | Your Present opens where theirs is, keys inert, muted (D1) | `present` |
| Slide-to-slide in Present | Follows with their position and slide fingerprint | `present` |
| Narration, captions, Guide | Stay yours; narration via the host's Present to everyone only | Unchanged, by design |
| Deck and Slide panels (D2) | Open when theirs do, on the same section | `panel`, `section` |
| Inputs, dropdowns, sliders | A ring on the row they are in and "Amina changed Theme"; the value arrives as deck truth | `focus`, `settingsWrite` |
| Setup | Shown as open with its section; never a value, never opened for you | `shown` |

## 10. Slices (one commit each; the trio on the result)

1. **The hardened awareness gate:** `view.ts` and `adapters/yjs.ts` on the in-memory network, with the existing
   `sanitizeAwareness` behavior diffed and the three weaknesses of §3 fixed (bounds before parse, the clock, and
   the host binding a client id to its token), the package export, the boundary map and the library docs.
2. **`followKeys.ts`; migrate `doing`** with the compatibility write of §6; every existing Follow test stays
   green, and a mixed-version test is added. The one typing gate lands here (closing weakness 3).
3. **D2 and D1:** the Slide and Deck panels, then Present (the third provenance, inert keys, muted).
4. **The ghost and the change lines** on the four wrappers, the build check, the "Following · where" line.
5. **Docs:** amend the 2026-10-20 note's §4, §5 and §6, the Live panel's help, the changelog fragments, and a
   `docs/route-budget.d` declaration if the eager side grows (`followKeys.ts` and the hooks are eager;
   `view.ts` stays behind the lazy Live import).

**Silent drops.** A schema failure that drops a key must be visible to a maintainer: the adapter counts drops by
key and the Live panel's "Copy connection log" includes them. "Follow just does not do that" is the failure to
avoid.

**Verification** (HARD RULE #23): two real browsers for each row of §9 at 1440 and 820 px, and the phone cases
on a WebKit project with a touch profile, marked UNVERIFIED on a real phone; a test that replays forged
awareness (wrong sender, an unknown key, oversize, a flood, a forged clock, a prototype name); **measured bytes
a second while dragging a text selection** (the caret rate, not panel browsing, sets the traffic: about 485 B
per update today, about 650 B with a realistic view, about 1.4 KB at the old bounds, measured before Tavola's
framing and encryption); an old-and-new tab session.

## 11. What the owner still decides

1. **How much ghost.** The location-only ring on the four wrappers plus "changed" lines (this note), or defer the
   ring and ship D1, D2 and Setup first. The inversion argued most of the list fits a small closed key list and
   that only the ring needs a mechanism that reaches 100 controls.
2. **Mixed versions.** Write `doing` beside `view` for one release (this note) or bump `PROTOCOL_VERSION` so a
   stale tab shows "outdated" instead of half-working.
3. **When #2830 merges.** This work will take several commits and review rounds. The narration, toast and caret
   fixes in #2830 are green and merge-ready now.

## 12. What was not checked

- The raw `<input>` and `<textarea>` elements one by one; a few may need the hook rather than the prop.
- Measured bytes a second on two real browsers; the 485 and 650 byte figures were measured on the library
  alone, before Tavola's framing and encryption.
- Whether a background tab's slowed timers expire a leader's state on the 30 s awareness timeout (the design
  treats absence as no information, so the consequence is a stale marker, not a closed panel).
- The mobile sheet variant of the inspector; the ghost on a phone is untested.
- Tavola ships as its own package; whether the new `./yjs` export needs a version note is a release question.

## 13. As built (2026-10-21)

Built in #2830, one commit per slice. Where the build differs from the plan above, and why:

- **`inspector` is its own key, not a value of `panel`.** The left assistant panel (Coach, Views, Library, Live)
  and the right settings panel (Deck, Slide) are open at the same time in the Studio, so one `panel` value could
  not say both. `inspector` is `none | deck | slide`; `section` is the tab inside it.
- **A small bus carries a screen's part, so nothing is plumbed through the Studio's props.** `live/follow-bus.ts`
  (always loaded) has `useViewKey(key, value)` to say where a screen is and `useAppliedKey(key, handler)` to be
  moved. The Live session decides *when* (one typing gate for the slide, the panel, the settings panel, the
  section and Present); the screen decides *how*. A new thing to follow is one hook call in the component that
  owns it, plus a key in `follow-keys.ts`.
- **The ring is on the row wrappers (`Field` in the Studio shell and `Row` in the Slide panel), not on four
  separate widgets.** `CatalogSelect`, `Toggle` and `TextRow` all sit inside one of those two, so one ring and
  one focus report per row covers them without a prop on each. Rows are identified by the slug of the label
  written in the code, and only labels on `FOCUS_ROWS` take part; `follow-keys.test.ts` re-reads the source and
  fails when a row is added without joining the list (the build check of §10 as a unit test, not a CI step). Two
  rows with the same label inside one panel (the page `Size` and the logo `Size`) both ring; the limit is real and small.
- **`VIEW_MAX_BYTES` is 512, not 256**, because the eleven keys with their longest values come to about 430
  bytes (a test pins it under 470).
- **Present follow reuses the room Present's follower path** (`follow` on `PresentLive`, the hash lookup, the
  detach on the follower's own move). A Present opened by Follow is `inertKeys`, starts muted and never
  synthesizes; closing it keeps it closed until the leader's Present ends and another starts. A room Present
  and a Present the follower opened themselves both win over it.
- **Silent drops are counted.** The adapter reports each key whose value failed its list; the connection log
  prints them ("dropped view values: panel 1, section 1").
- **Not done:** raw `<input>` elements outside the two row wrappers have no ring (§11 item 1); the phone cases
  of §7.7 are covered by tests of the gate and are UNVERIFIED on a real phone.

## 14. What the adversarial trio found, and what changed (2026-10-21)

Red team, Munger inversion and an independent checker reviewed the build. Fixed in this PR, each with a test that
fails without the fix (except one guard, `forget` iterating `bound` rather than `owner`: with the clock record
already dropped on removal it only tidies a map, so no test can tell the two apart). A second checker then reviewed
the fixes and found four more, fixed in the same pass with tests: a section id both panels share (`look`) was treated
as already applied when the leader moved from Deck to Slide; a stale absence timestamp could reopen a Present the person
just closed; the "Undo is showing" test outlived the toast (so Go and Join prompts could stay silent); and the 3 s,
1.5 s and new-follow rules had no test that set them off. A third checker found that the replacement test, a 6 s
clock, was still wrong: the toast pauses on hover and in a hidden tab, so a prompt could replace an Undo still on
screen. `actionBusy` now asks the notify kernel (`actionLive(raise)`), which tracks the pill itself; `notify.test.ts`
pins that it is true while the pill shows and false once it closes or is replaced. The shell's wiring of that call
has no test of its own. The three `presentGoneAt = 0` resets are belt and braces (no path reaches them with a stale
value), and the Present tests set the controller's private fields directly rather than driving a real close.

- **A removal left a forged clock behind** (red team, reproduced): a hostile host or a re-knocking member could mute a
  client for the session by sending removals that stepped its clock. The adapter now drops the clock record when it
  applies a removal, `forget` clears it for every id a peer was ever bound to, and a first-seen clock above 5,000,000
  is refused.
- **The 20 s rebind followed an impostor** (red team, reproduced): another admitted member who took the leader's name
  and color was followed, and the 20 s bound was not enforced (and the grace branch also made a follower ignore the
  host's "Bring everyone"). **Rebind removed.** A follow now ends when the person followed leaves, with the notice
  "Amina left, so you stopped following." Surviving a reconnect needs the session to say that the same seat came
  back; that is a protocol change, filed in `followups.d/2830-p2-follow-same-seat-after-reconnect.md`.
- **Present's place leaked with "share my slide" off** (red team, reproduced): `present` now follows both switches.
- **A caret flood ran every peer's handlers 20,000 times** (red team, reproduced): caret-only updates are applied at
  most once per 33 ms per sender, latest kept.
- **A follow ended on an echo** (inversion): a screen's report counted as the person's own move even when it was a
  panel finishing its lazy load. A report now counts only within 700 ms of a press, tap or key, and every follow that
  ends other than by Stop says so.
- **The ring did not know which panel** (inversion): sixteen labels are in both the Deck and Slide panels. The
  leader's panel and slide travel with the ring, which is drawn only in the same panel (and on the same slide for a
  Slide row). A dropdown's menu no longer clears the leader's ring while it is open.
- **Present** (inversion, checker): ending a follow closes the Present it opened; a Present the person closed stays
  closed through a short absence of the leader (3 s) and when they close their own; a close that races a render no
  longer reopens.
- **A move the screen could not honor was re-applied on every awareness event** (checker): a move is applied once per
  value, and a new follow starts from nothing applied.
- **Typing gate** (red team): number and password fields count, and a host's "Bring everyone" waits for a field like
  every other move.
- **Reporting what nobody can see** (inversion): the section is reported only where its tabs are on screen (Advanced
  tier, grouped view) and the panel only while it is in view.
- **Traffic**: a bus change no longer flushes awareness at once; the adapter's 200 ms timer does.
- **The action slot** (inversion): Follow's Go and Join prompts wait while an Undo the person just earned holds the
  slot, and are raised once it is free. **Slide-panel edits** now name the row in focus ("changed Eyebrow") instead
  of "This slide", and a **lens id** up to 128 characters passes the `present` schema.
- **Claims**: the row list is 68, the widest view is about 430 bytes (a test pins it), and a test fails when a tab id
  is missing from `SECTIONS`.

**Known and left**: surviving a leader's reconnect (above), and `uniqueClients`, a second line of defense behind the
roster's first-match lookup, tested directly rather than through the session.
