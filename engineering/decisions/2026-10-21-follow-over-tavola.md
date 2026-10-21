---
status: proposed
summary: >
  Follow mirrors only slide, panel and view today. The owner wants it to cover Present, the Slide and
  Deck panels, Setup's open section and a ghost marker on the control in use, built as one scalable
  mechanism on Tavola that does not replicate Yjs. Proposed: a declared, schema-checked view of each
  member's attention, carried in Yjs awareness through a Yjs adapter that ships with Tavola, with a
  closed key list as the allowlist and the receiver deciding. A trio review of the proposal is folded
  in below.
---

# Follow, everywhere: one mechanism, built on Tavola

**Status:** proposed, 2026-10-21, for adversarial review before any code.
Builds on `2026-10-20-live-uniform-experience.md` (§4 tiers, §5 decision 4 "Follow goes wide", §6 safety model).

**Owner decisions so far (2026-10-21).**
1. Yes to all three follow-ups: Present, the Slide and Deck panels, and inputs and dropdowns and sliders.
2. The mechanism must scale and be enabled by Tavola, not a set of one-off fixes.
3. **Tavola must not replicate Yjs.** The owner suggested a bridge. This note takes that route.
4. A followed control shows a **ghost marker**, not the leader's value written into the follower's control.
5. Follow shows that the leader has **Setup** open and which section, never a value.
6. The work lands on the current branch, in #2830.

## 1. What the owner saw

Following someone mostly works: the editor follows, Coach and Live open, the slide moves in the preview. What does
not follow: the text caret and where the person is, opening Present, Present's narration, captions, Guide and
slide steps, the Deck and Slide inspector panels, Setup, and what the person does in inputs, dropdowns and sliders.
The caret was a bug, fixed in 4fe9108 (a caret at the end of the deck crashed every viewer's remote carets). The
rest are gaps the owner now wants closed, which amends §4 and §6 of the 2026-10-20 note.

## 2. What the code does today

- **Deck truth already travels.** Every Deck and Slide inspector write lands in the deck text (`settingsWrite`, 58
  calls; `mutateSlideFromPanel`), and Live syncs that text. A follower already sees a leader's theme or size change.
  What does not travel is *where the leader is working*.
- **Local only:** which inspector panel is open (`activeSettings`, never reported), its section tab and search box,
  the list or grouped view, a solo Present's position (only `presenting: true` travels), and the state of a control
  in use.
- **What Yjs is doing in Live.** Yjs has two jobs. The document job (a CRDT) keeps the deck text identical when two
  people type at once. The awareness job (`y-protocols/awareness`) carries each person's small status: name, color,
  caret, slide, and today's `doing` (panel, view, presenting). Awareness sends a person's whole status to the others,
  resends it on change, and drops it when the person goes quiet. **Tavola knows neither.** It moves two sealed byte
  streams, one for the document and one for awareness, and decides who may send them (members only; edit role for
  the document; each member bound to one awareness client id). The Studio plugs Yjs into both streams
  (`live-controller.ts`).
- **The Studio checks awareness with hand-written code** (`sanitizeAwareness`, `cleanDoing`, `cleanRelPos`): it
  rebuilds each field it knows and drops the rest. That is correct and does not scale: every new field is more
  bespoke code, and one wrong field turned off every viewer's carets (the 4fe9108 bug).
- **Tavola's boundary.** The core imports nothing outside `docs/src/lib/tavola/`, enforced by
  `checkTavolaBoundary` (`tools/check-ownership.js`), with one sanctioned exception: the Trystero adapter. The gate
  ignores a tag it does not know (`session.ts:1012-1021`).
- **The controls funnel into a few wrappers.** `CatalogSelect` (33 call sites), `Field` (44), `Toggle` (8) and
  `TextRow` (9) carry nearly every setting; about 49 raw `<input>` and 18 raw `<textarea>` bypass them. One prop on
  the wrappers and the `ui/*` primitives reaches most controls, not all.

## 3. The model: three kinds of state

| Kind | Rule | Examples |
|---|---|---|
| **Deck truth** | Already identical for everyone. Follow adds nothing. | Every inspector value, the deck text |
| **Attention** | Where a person is and what they are touching. Shown to others; applied only while following. | Panel and section open, Present open and position, the control in focus, a search box |
| **Private** | Never leaves the browser. | API keys, devices, unsent drafts, standing instructions, Present's CC, Voice and Guide, any Setup value |

Almost everything the owner listed is **Attention**, which is why one mechanism can serve it. A theme dropdown or a
size slider is Deck truth and already arrives as the deck changing; what a follower lacks is the attention: which
panel, which row.

## 4. The decision: a schema-checked view over awareness, as a Yjs adapter in Tavola

**Rejected: a new Tavola channel for presence values.** It would be a second presence system next to awareness,
which is the duplication the owner ruled out. **Rejected: one post type per feature**, which is today's pattern and
does not scale to inputs.

**The bridge.** Awareness stays the carrier. Tavola gains the piece it lacked: a declared, typed, bounded view of
the awareness state.

```
docs/src/lib/tavola/view.ts            core, no Yjs: schema combinators, ViewKeys type, cleanView(), bounds
docs/src/lib/tavola/adapters/yjs.ts    the bridge: the ONLY file that imports yjs / y-protocols
```

- **Core (`view.ts`, no Yjs).** `defineViewKeys({ panel: oneOf([...]), section: str(40), present: obj({ idx: int(0,
  10_000), page: int(0, 10_000), lens: id64 }), focus: str(80) })`. `cleanView(raw, keys)` returns only declared
  keys whose value passes its check, at most 32 keys and 1 KB serialized; anything else is dropped, never repaired.
- **Adapter (`adapters/yjs.ts`).** `yjsAwareness(awareness, { keys, fields, ownerOf })` returns a Tavola `Stream` and
  a typed `view`:
  - *Receive:* decode the awareness update, keep an entry only for a client id the host's roster binds to the
    sender (what `sanitizeAwareness` does today), rebuild each state from `fields` (per-field cleaners the app passes
    for `peer`, `user`, `summon`, `cursor`, `slide`) plus `view` through `cleanView`. At most 10 updates a second per
    client are applied; the rest are dropped (the next one carries the latest state anyway).
  - *Send:* `view.set(key, value)` coalesces to at most 5 updates a second and writes the `view` field with
    `setLocalStateField`.
  - *Read:* `view.of(peerId).get(key)` returns the latest validated value, or `undefined`.
- **No wire change.** Awareness is unchanged on the wire; `view` is one more field in each client's state. An old
  tab's sanitizer does not know `view`, so it drops it: an old tab simply does not see attention. No protocol-version
  bump.
- **Boundary gate.** `checkTavolaBoundary` gains one sanctioned file for the Yjs imports (`adapters/yjs.ts`, named
  `yjs`, `y-protocols/awareness` and `lib0`), with this justification, the way the Trystero adapter is sanctioned.
  The core stays Yjs-free.
- **What stays Yjs-native:** the text caret and selection (y-codemirror), the slide, and the document itself.
- **Migration.** `doing` (panel, view, presenting) moves from a hand-written field to declared keys in the same
  change, so attention has one source of truth. The existing Follow tests stay green throughout.

**App side.** `followKeys.ts` holds the one declaration. Each followable control carries a key:
- `useViewKey(key, value)` publishes mine; `useFollowedKey(key)` reads the followed person's.
- The four wrappers and the `ui/*` primitives gain one optional `follow="<key>"` prop (HARD RULE #15: extend the
  shared primitives); a control that bypasses them calls the hook.
- **Ghost marker.** While following, the followed control wears a ring and a small label with the leader's name,
  and for a text key the leader's value. The follower's own control and saved preferences are untouched. Touching a
  control does what any own action does today: it stops following.
- Local panel chrome (which section tab, the list or grouped view) shows as the leader's while following, in memory,
  and is never saved.

## 5. Safety rules this adds (proposed amendments to the 2026-10-20 note's §4 and §6)

1. **The key list is the allowlist.** A key not in `followKeys.ts` is dropped on receipt by Tavola's adapter (§6
   rule 3, enforced in the library instead of the controller).
2. **A key names its tier in the PR that adds it** (§4's rule for new state), in a comment beside it.
3. **A key can never name a secret.** A build check fails a key or a `follow=` control whose name matches key,
   token, secret, password, prompt or draft; file, password and range-of-device inputs cannot take the prop. The
   OpenRouter key is written only by the OAuth exchange and never sits in an input (HARD RULE #24); the check keeps
   it that way.
4. **Receiver decides.** A value is applied only while following that member, through a named setter in the actions
   bag, never a DOM event (§6 rule 1). A typist is not moved (the 2026-10-06 rule); the move waits behind a "Go"
   toast, as Follow does today.
5. **Text is data.** A followed string is shown as React text. A value that could reach a slide or a `<style>` goes
   through the deck text and its sanitizers instead (HARD RULE #22).
6. **Present follow carries a position, not a voice.** A solo Present reports `{ idx, page, lens }`; a follower's
   Present opens there, and CC, Voice and Guide stay each person's own. Narration reaches a follower only through
   the host's "Present to everyone" (§7.3 of the 2026-10-20 note), unchanged.
7. **Setup is shown, never read.** Follow shows that the leader is in Setup and which section; no Setup value is a
   key.

## 6. What each item the owner listed becomes

| Owner's item | Becomes | How |
|---|---|---|
| Cursor not synced | Fixed in 4fe9108 | Yjs awareness, unchanged |
| Their position not visible | "Following Amina · Deck > Theme", and the ring on their control | `panel`, `section`, `focus` keys |
| Present click not followed | Your Present opens where theirs is (D1) | `present` key |
| Slide-to-slide in Present | Follows with their position | `present` key |
| Narration, captions, Guide | Stay yours; narration via the host's Present to everyone only | Unchanged, by design |
| Deck and Slide panels (D2) | Open when theirs do, on the same section | `panel`, `section` keys |
| Inputs, dropdowns, sliders | Ghost ring on the same row; the deck result already arrives as deck truth | `focus` key plus deck truth |
| Setup | Shown as open, with its section; no value | `panel: setup`, `section` |

## 7. Slices (one commit each; the trio on the result, because this adds a checked path into every viewer)

1. **`view.ts` and `adapters/yjs.ts`,** tested on the in-memory network: sender binding, shape, bounds, receive rate,
   coalescing, snapshot, expiry, an old tab dropping `view`. Library README and catalog page updated. The boundary
   gate sanction.
2. **`followKeys.ts` and the hooks;** migrate `doing` onto declared keys with every existing Follow test green.
3. **D2 and D1:** Slide and Deck panels, then Present open and position.
4. **Ghost on the controls:** the prop on the wrappers and primitives, the build check, the "Following · where" line.
5. **Docs:** amend the 2026-10-20 note's §4 and §6, the Live panel's help text, the changelog fragments.

Verification (HARD RULE #23): two real browsers for each row of §6, at 1440, 820 and 390 px, with screenshots; a
test that replays forged awareness updates (wrong sender, unknown key, oversize, a flood); the measured bytes a
second while someone browses panels quickly.

## 8. Risks the review should attack

- A status is resent whole on every change; is the 1 KB and 5 a second cap enough, and can it be exceeded?
- The migration of `doing` is the riskiest step: two sources of truth for a moment.
- An old tab and a new tab in one session: what does each see?
- Awareness expires a quiet client after about 30 s; does a followed key go stale or flicker?
- A `focus` key names a control; can a key name leak something private through its text?
- Present follow when the followed person is not the host: the host's "Present to everyone" and a follower's own
  Present both exist; which wins?
- Following someone while typing, and a typist whose keys fire Present's shortcuts (the 2026-10-06 hazard).
- The adapter is the only file allowed to import Yjs; does the bridge still let Tavola's tests run without Yjs?

## 9. What was not checked

- Each of the 49 raw `<input>` elements; a few may need the hook rather than the prop.
- Tavola ships as its own package; whether the new public API needs a version note is a release question.
- The mobile sheet variant of the inspector; ghost rings on a phone are untested.
