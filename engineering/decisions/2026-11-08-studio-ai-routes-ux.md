---
status: shipped
summary: Workspace › AI blurred three questions (how the Studio reaches models, which model does what, and who uses it), so the owner could not tell what was what. The redesign separates them into Connections (OpenRouter with two ways in, your own provider keys, this device), three selections (chat, image, voice) that each name their route and the features they feed, and fixed rules for when the Studio may change a selection (only a never-set one, or a retired version healed within its own family). Reviewed by the adversarial trio on 2026-11-08; its findings are folded in.
---

# Studio AI: routes, selections and the screens that show them

Builds on `2026-11-07-studio-model-spine.md`, whose engine stays: stored selections, resolved
without substitution, pinned per chat turn and per read. This note is about the **model the
author sees**, and the engine changes that model needs.
Mockups: the "Studio AI: models and connections" canvas,
https://claude.ai/artifact/FBJX8jCQKAXa381Xf5uufu (private to the owner).

## 1. Why the first spine UI was not enough

Owner review, 2026-11-08: "what you have done is not really deterministic to me. I can't tell
what's what." Read against the shipped screens (PR #3079, `2a27df50`):

1. **Saving a key changed the selection.** A saved key always took over chat, and took over voice
   when the current voice could not run (`architect-model.js` `saveProviderKey`). Connecting and
   choosing were one act. (The OpenRouter sign-in return selects nothing: `resumeOpenRouterAuth`.)
2. **OpenRouter looked like one more key**, in the same list as Gemini, Anthropic and OpenAI.
3. **Chat and voice chose differently**: "Cloud | On-device" plus provider pills for chat;
   "OpenRouter | Gemini | On-device" for voice.
4. **The route was hidden.** A card said "Gemini": a model or a route? Gemini 3.8 Flash can come
   through OpenRouter or the author's Gemini key, and nothing said which would answer or bill.
5. **Two more models hid outside the selections** (found by the trio): Library photo
   descriptions run on their own image-model setting (default the latest Claude Sonnet,
   `suggest-photo-description.ts`, `image-look.ts`), and narrated export bakes with its own
   narrator pick (`NarrationExportOptions.tsx`, `read-aloud.ts` `defaultBakeVoice`, OpenRouter or
   Kokoro only).

## 2. The model: connections, selections, uses

| Layer | Question | What it holds |
|---|---|---|
| **Connections** | How can the Studio reach models? | **OpenRouter**: the platform, one account for every model, connected by signing in **or** by pasting an OpenRouter key. **Your own keys**: Gemini, Anthropic, OpenAI. **This device**: free, private models. |
| **Selections** | Which model does what? | **Chat model**, **Image reader**, **Voice model**: each a route + model (voice: + voice). |
| **Uses** | Who reads each one? | Listed on its card (below). |

### Routes: six

| Route | Connected by | Chat | Image | Voice | Bills |
|---|---|---|---|---|---|
| **OpenRouter** | Sign in (one click) **or** paste an OpenRouter key | every chat model | every vision model | every voice model | that OpenRouter account |
| **Your Gemini key** | paste a key | Gemini | Gemini | Gemini TTS | that Google account |
| **Your Anthropic key** | paste a key | Claude | Claude | none | that Anthropic account |
| **Your OpenAI key** | paste a key | GPT | GPT | none (follow-up 3048) | that OpenAI account |
| **This device** (chat) | the browser's own, or a download | Browser built-in, WebLLM, Universal | none | none | free |
| **This device** (voice) | download (~80 MB) | none | none | Kokoro | free |

**OpenRouter is one connection with two ways in** (owner, 2026-11-08, after the trio showed that
sign-in mints an ordinary OpenRouter key, identical in kind to a pasted one, and that a stored key
cannot say how it was obtained). The card says which way it was connected ("Signed in" or "Key
…ab12"). One slot, no migration guess, no duplicate rows. Sign-in is the path a new author is
offered first; pasting is there for the bring-your-own-key author.

### The three selections and what they feed

| Selection | Used by | Needs |
|---|---|---|
| **Chat model** | Chat, Refine, Theme, Finish, Drawing, Component (generate and refine), Coach fixes, chat compaction | Chat edits need tool use (an on-device model answers one-shot, without edits); a photo in the chat needs a model that reads images |
| **Image reader** | Library photo descriptions | A model that reads images |
| **Voice model** | Present, Read aloud, Narrated export | A model that speaks; the export bakes in exactly this voice |

The image reader (named so, and not "image model", which stays free for a future
image *generator*, which on OpenRouter, Gemini and OpenAI is a different kind of model and is not in
this design) stays its own selection (owner, 2026-11-08: "image models should be separate?
that would be the least astonishing"), shown openly as a card, so it can no longer bill a model
nobody sees. **Its default is "Same as chat model"**: the frontier models on every cloud route
(Claude, GPT, Gemini) read images in the same request that chats (owner, 2026-11-08), so most
authors never need a second pick, and the card still names exactly which model reads their photos:
`Same as chat · Claude Sonnet 5.5 · OpenRouter`. Change picks a separate one (a strong vision model
beside a cheap chat model). When "same as chat" cannot read images (an on-device chat model, or a
text-only model), the card reads **Chat model can't read images** with **Choose a model that reads
images**. "Reads images" comes from the model's catalog row; a direct-key model the catalog does not
list yet (a new release) reads **not known**: it is offered and tried, and only a provider's refusal
of the picture turns it into *can't read images*. Nothing is refused on a guess.
**Same as chat moves with chat, and says so**: when chat changes (a pick, a fill or a heal), the
notice names both ("Chat and the image reader now use Claude Sonnet 5.5 · OpenRouter"). That is the one
place two selections move together, by the author's own choice of "same as chat".
Slide alt text stays on the chat model: it is written from the slide's source text, not from a picture
(`generateDescription` in `architect.ts` builds its prompt from the markdown), so it needs no image reader. Narrated export loses
its own narrator picker and bakes in the voice model, with a Gemini path added.

**A feature its selection cannot serve says so on the card**, in one line under "Used by":
"Chat edits need a model with tool use" or "Photo descriptions need a model that reads images",
with a one-tap way to change. Nothing silently refuses.

### One way to name a model, everywhere

`<model> · <route>`, the same words in the cards, the chooser, the chat chip, Present's pill and
every notice. Route labels: `OpenRouter`, `Your Gemini key`, `Your Anthropic key`, `Your OpenAI
key`, `This device`. Voice adds the voice before the model: `Kore · Gemini 3.8 Flash Lite TTS ·
Your Gemini key`; where space is short (the Present pill, a phone chip) the model drops first, the
route last: `Kore · Your Gemini key`.

The same model through two routes is two entries (`Gemini 3.8 Flash · OpenRouter` and `Gemini 3.8
Flash · Your Gemini key`), because they bill different accounts. A free on-device copy and a paid
cloud copy of one model (Kokoro) are told apart by price: the device one reads "Free", the
OpenRouter one shows its price.

### Rules (the deterministic part)

1. **The author changes a selection; the Studio changes it in exactly two cases, and says so.**
   - **Fill a Not-set selection.** A selection is *Not set* until it is picked or filled, and once
     set it never returns to Not set. **Whenever a cloud connection exists (OpenRouter or a key) and
     a selection is Not set, the Studio fills it** from that connection, with its recommended model,
     and a notice names it. This is checked when a connection is added and once at startup, so the
     order of events cannot matter: an Anthropic key fills chat (and image, as same-as-chat) but not
     voice (Anthropic cannot speak); a later OpenRouter sign-in then fills voice, because voice is
     still Not set. When two connections could fill at once, OpenRouter wins, then Gemini,
     Anthropic, OpenAI (a fixed order). On-device models never fill, with **one exception the owner
     chose to keep voice free on desktop** (2026-11-08): on a desktop browser that can run Kokoro, a
     Not-set voice is filled with **Kokoro · This device**, before any cloud connection, and the
     notice says "Voice uses Kokoro · This device, free. It downloads about 80 MB on your first
     read." The first read shows captions and the download's progress, as `main` does today; later
     reads speak. Phones and browsers that cannot run Kokoro fill voice from a cloud connection. A
     selection that was ever set is never filled again, whatever its state (removed connection,
     rejected key, out of credit, retired).
   - **Heal a retired version within its family** (owner, 2026-11-08: "self heal… is about model
     versions healing: if Sonnet 5.0 is not available but 5.5 is, we use that. We never change
     model family or model provider"). When the selected model answers as retired, the Studio
     moves to the newest live version of the **same family on the same route** (Claude Sonnet 5.0 →
     5.5; Gemini 3.8 Flash Lite TTS → 3.9 Flash Lite TTS), stores it, and tells the author:
     "Claude Sonnet 5.0 was retired. Chat now uses Claude Sonnet 5.5 · OpenRouter." No newer
     version in the family: the selection reads **Model retired** and stops. It never moves to
     another family (Sonnet → Opus), another provider (Claude → GPT) or another route. This
     replaces today's chat self-heal to the latest-Sonnet alias, which could cross families.
     - **A family is defined, not inferred**: `familyOf(id)` in the route table maps an id to
       provider + line + tier (`anthropic · claude · sonnet`, `google · gemini · flash-lite-tts`) from
       an explicit, tested table, not from the pickers' curation patterns (which are preferences
       and may group a Flash with a Flash Lite). An id the table cannot place is never healed.
     - **A provider that reroutes silently** (OpenRouter can answer a retired id with another
       model): every reply carries the id that answered, and the spine already records it. Same
       family: treated as a heal (stored, announced). Another family: the reply is shown, the
       selection reads **Model retired**, and the notice says "OpenRouter answered with GPT 6.1
       Terra instead of Claude Sonnet 5.0"; the next turn does not run until the author picks.
2. **Chat, the image reader and voice are independent.** Any connected route that can serve each. The one
   link is the author's: *Image reader: same as chat* follows chat, and every notice says so.
3. **Nothing else falls back.** A selection that cannot run shows its state and one action:

   | State | Action |
   |---|---|
   | Ready | none |
   | Loading 42% | none (wait) |
   | Not set | Choose |
   | Needs its connection | Connect / Reconnect |
   | Key rejected | Replace key |
   | Out of credit | Add billing (the key and the connection work). Known only from a request that key made: a key row shows it with its time ("out of credit at 14:02") until a request succeeds |
   | Rate limited | none (wait; retried next time) |
   | Not in your region | Choose another |
   | Not downloaded | Download |
   | Not supported on this device | Choose another |
   | Model retired | Choose another |
   | Offline | none (retried when back) |

4. **Removing a connection leaves the selection in place** (*Needs its connection*). Rule 1 never
   fills it, so rotating a key cannot hand chat to another provider.
5. **Downloading is not choosing.** Downloading an on-device model makes it available; it does not
   select it (today `summon()` and `setTier('auto')` select: both change).
6. **Pickers curate.** A route's list opens on Recommended (the newest of each family: two to four
   models) with All and search one step away; the selected model always shows. OpenRouter keeps
   its Value and Free lenses beside Recommended and All. `OR_FEATURED` is pruned to match (no
   Gemini 2.5, no GPT-4o).

## 3. The screens

### Workspace › AI (desktop and tablet sheet; full screen on a phone)

1. **Models in use**: three cards, Chat, Image, Voice. Each: route glyph, `<model> · <route>`, its
   state with its action, **Change**, "Used by …", and any "needs" line.
2. **Connections**: "Where the Studio can reach models. Connecting adds models; it changes what is
   in use only when nothing was set."
   - **OpenRouter** card, first: "One account for every model." Not connected: **Sign in with
     OpenRouter** and "or paste an OpenRouter key". Connected: "Signed in" or "Key …ab12", the
     balance when the key has a limit (pay-as-you-go keys show usage only), Disconnect.
   - **Your own keys**: Gemini, Anthropic, OpenAI rows: what each serves (`Chat · Image · Voice`),
     state, Add / Replace (one atomic step) / Remove.
   - **This device**: Browser built-in, WebLLM, Universal, Kokoro: size, Download / Downloaded /
     Not supported here.
3. **Spend**: every selection's route that bills (chat, image, voice), not chat only.

### Change: one chooser for all three

Route (connected routes that can serve this selection; unconnected ones are not listed, "Connect
another…" scrolls to Connections), then model (Recommended first), then voice (voice only, with a
sample). Picking makes it the selection at once; there is no Save.

### The chat chip and Present's pill

- **Chip**: `Claude Sonnet 5.5 · OpenRouter`; the model truncates, the route does not. Its popover
  is the compact chooser (route tabs, Recommended), **lazy-loaded on first open** so the label is
  all the Studio's first load pays for.
- **Present's pill**: `Kore · Your Gemini key`, `Loading voice 42%`, or `Captions · <reason>` with
  the reason inline (a tooltip cannot be opened on a touch screen); tapping it opens the action.

### Not set and needs-a-connection outside the Workspace

- **Chip**: `Choose a chat model` (Not set) or `Claude Sonnet 5.5 · Needs OpenRouter`; tapping it
  opens the chooser, or Connections when nothing is connected.
- **Present's pill**: `Captions · no voice set` with Choose a voice.

### First run

The three cards read **Not set**. One primary action, **Sign in with OpenRouter**, with "or paste
an OpenRouter key"; then "Use your own key" (saying Anthropic and OpenAI keys cannot speak) and
"Use this device" (Browser built-in needs nothing; the others download). The notice after the first
connection names what it filled.

## 4. Engine changes

1. **A real *Not set*.** Selection records gain an unset state; today `DEFAULT_CHAT` /
   `DEFAULT_VOICE` stand in as `openrouter` with the curated default, and `migrateChat` /
   `migrateVoice` write that default record even when nothing was stored
   (`docs/src/lib/model-selection.js`). They stop doing so. The spine has not reached `main`, so
   the only upgrade source is `main`'s legacy keys, and migration reproduces what `main` ran:
   - a legacy model pick or provider, with its key stored → a *set* record on that provider (what
     the author was already using; no notice, nothing changes for them);
   - an OpenRouter key and no pick → *set* to OpenRouter with its default model (`main`'s
     behavior);
   - no key at all → *Not set*.
   **Voice** follows `main`'s ladder (`pickRung`), so a voice that spoke on `main` speaks the same
   way after the upgrade:
   - a stored voice model pick or rung → *set* to it;
   - no pick, on a desktop that can run Kokoro (`main`'s `preferOnDevice`), with or without a key
     and whether or not Kokoro is downloaded yet → *set* to **Kokoro · This device** (free, what
     `main` used: its first read starts the download);
   - no pick, on a phone or a browser that cannot run Kokoro, an OpenRouter key → *set* to
     OpenRouter's default voice (what `main` spoke there);
   - no pick, there, no key → *Not set* (captions on `main` too).
   "Can run Kokoro" is a synchronous check (pointer and platform, as `main`'s `kokoroSupported`),
   so the voice migration is synchronous like chat's; the download state is not needed for it, and
   the card never shows *Not set* and then flips.
   **A legacy pick whose key is gone** (a stored Gemini provider with no Gemini key) → *set* to that
   provider, reading *Needs its connection*: what the author chose, never silently another.
   A test covers each row against `main`'s keys.
2. **The image model joins the spine** as a stored selection whose default is *same as chat*,
   migrated from `settings.imageModel` (a stored pick other than the old default becomes an
   explicit image selection on OpenRouter). The request path exists: every cloud route already sends image parts in its chat request (OpenAI and Gemini as
   `image_url`, Anthropic converted to image blocks, `docs/src/components/studio/ai/direct-providers.js`),
   and "reads images" comes from the model's catalog row (`vision`). What changes: the image
   selection resolves its own backend and model, like chat, instead of borrowing the chat
   provider; `suggest-photo-description.ts` reads it; the price comes from the
   same catalog row the chat uses. **The real work** is that the architect model keeps one active
   provider today (`suggest-photo-description.ts` reads `activeProvider()`), so a request on a route
   other than chat's needs `complete()` to take the route explicitly (`complete({ route, model })`),
   with the backend chosen per call. Each direct backend already exists; what is new is choosing
   one per request instead of per session. Tested with chat on one route and image on another.
3. **Narrated export reads the voice selection** and gains a Gemini path; the export panel's own
   narrator picker goes.
4. **Rule 1 in code**: `saveProviderKey` stops selecting; the fill runs only for Not-set
   selections; `summon()` and `setTier('auto')` stop selecting.
5. **Version healing replaces the alias self-heal** (`isDeadModelError` → latest Sonnet): one
   healer shared by chat, image and voice, keyed on `familyOf` (rule 1), never on the curation
   patterns.
6. **One route table** in `docs/src/lib/provider-registry.js` (id, label, glyph, what it serves,
   how it connects, `familyOf`, state vocabulary) feeding the cards, chooser, chip, pill and notices,
   with a test over every route × state row and every healing case. The nightly check
   (`2026-11-09-model-guard-rails.md`) holds every configured id against each provider's live
   list. *(As built: it checks ids and family patterns, not `familyOf`; healing still places an
   id at run time and never heals one it cannot place.)*
7. **Spend** records voice and image spend against their routes; `spend.js`'s "Cloud AI
   (OpenRouter)" label becomes per route.
8. **Startup bytes.** The Studio is over its startup-JS soft target, so only the chip's label, the
   route table and the selection store load at startup; the chooser, the cards and Connections
   load with the Workspace sheet or on the chip's first open. The PR declares the measured delta in
   `docs/route-budget.d/` as #3079 already does.

OpenRouter stays one slot (`lattice-db-or-key`); the card records how it was connected from now on
(an older key reads "Key …ab12").

## 5. Alternatives considered

- **One global mode** (OpenRouter, or own keys, or this device, for everything): cannot express a
  Claude key for chat with a voice from OpenRouter (Anthropic has no voice).
- **Two OpenRouter routes** (sign-in and pasted key as peers): rejected after the trio; same key
  kind, same wallet, duplicate rows, and existing keys cannot be classified.
- **Fold the image model into chat**: fewer settings, but a cheap chat model would block photo
  descriptions, and the owner judged a separate, visible pick less astonishing.
- **A setup wizard**: hides the state afterwards, which is the problem being fixed.

## 6. Owner decisions, 2026-11-08

0. Keep the free desktop voice: a Not-set voice on a desktop that can run Kokoro is filled with
   Kokoro · This device (the one on-device fill), as `main` does today.

1. OpenRouter is one connection with two ways in (sign in, or paste a key).
2. Chat, image and voice routes are independent.
3. Connecting fills a selection only when it was never set.
4. The image model is its own visible selection.
5. Self-healing moves a retired version to the newest version of the same family on the same
   route, and tells the author; it never changes family, provider or route.
6. Design first, then rebuild the UI in PR #3079.

## 7. Review

Rescored 7.5/10, then 8/10 (round 3: fit 9, determinism 9, clarity 8, consistency 8, failure
handling 8, mockups 8, feasibility 7, maintainability 8). Round 3's remaining items are applied:
one name, Image reader, on every surface; and the free desktop voice put to the owner (kept).
Feasibility and maintainability cannot honestly rise further until it is built and tested.

Scored 7/10 by an independent grader after the first revision (fit to goals 9, determinism 7,
clarity 8, consistency 7, failure handling 7, mockups 7, feasibility 6, maintainability 7). This
revision closes its gaps: the fill and upgrade rules are exact; the image model defaults to same as
chat and its cost is stated against the existing image-part path; families are a tested table and
silent reroutes are handled; credit state is tied to a real request; Not set has a form on the chip
and the pill; and the phone and image chooser are drawn.


The adversarial trio (red team, Munger inversion, independent checker) reviewed the first draft of
this note on 2026-11-08. Folded in: the hidden image model and narrator picker; the collision
between "removed connection keeps the selection" and "fill what cannot run" (now: fill only Not
set); on-device auto-fill and download-selects; the missing chat-model callers; voice and image
spend; the free and paid Kokoro; the full state vocabulary; the two-OpenRouter-routes question
(re-asked, now one connection); and the mockups' naming, counts, 44 px targets, labels and
touch-only tooltip.

## Implementation (2026-11-08, PR #3079)

What shipped, by the plan above:

1. **Not set and the fill** (`docs/src/lib/model-selection.js`): `UNSET_CHAT` / `UNSET_VOICE`, the migration rows,
   `fillUnset` / `fillFromConnections` and `SELECTION_FILLED_EVENT`. `saveProviderKey`, the OpenRouter sign-in,
   `summon()` and a download no longer select. The shell announces a fill once.
2. **Image reader**: `readImageSelection` / `selectImage`, migrated from `settings.imageModel`. `architect-model.js`
   exposes `imageReader()`, `listModelsOn()` and `modelPriceOn()`; `complete({ route })` runs one call on another
   route. `suggest-photo-description.ts` prices, budget-gates (`cloudBudgetBlock(..., route)`) and sends on the
   reader's route, and books its spend as `image` on that route.
3. **Narrated export**: `defaultBakeVoice()` reads the voice selection (OpenRouter, a Gemini key, or Kokoro on this
   device); `NarrationExportOptions.tsx` names the narrator and has no picker of its own.
4. **Version healing**: `familyOf`, `healTarget` and `sameFamily` in `provider-registry.js` (an explicit tier table;
   an id it cannot place is never healed). One healer in `architect-model.js` `complete()` serves every cloud route:
   a model-gone answer is checked against the route's live list (a model still listed is not retired), healed to the
   newest NEWER version of its family, stored for every selection that named it (`healSelections`), and retried once;
   with nothing newer the selection reads `retired` (`markRetired`). The id that answered is read from OpenRouter's
   replies (`onAnsweredBy`), so a silent reroute to another family stops the selection. The Gemini voice heals the same
   way in `voice-model.js`. `isDeadModelError` and its alias heal are gone.
5. **Screens**: Workspace › AI is *Models in use* (three cards, each with "Used by") and *Connections* (OpenRouter
   "Signed in" or "Key …", your own keys with what each serves, this device). "Use for chat" is gone. Out of credit is
   recorded per route from a request (`noteOutOfCredit`) and shown with its time and an *Add billing* link. Spend
   lists chat and the image reader per route.

Voice spend is booked too: the voice model reports each cloud clip it makes (`onSynthesized`), and read-aloud
books it at the model's per-character price from OpenRouter's public catalog (`bookVoiceSpend`), marked as an
estimate. A key a sign-in just minted is not live at OpenRouter at once: on the owner's iPhone it answered 401
"User not found." for over a minute and was accepted 94 s after it was made (2026-11-09). So for
`OPENROUTER_ACTIVATION_MS` (3 min) after a sign-in (`lib/openrouter-key.js`, the mint time kept across a
reload), a 401 marks the key "activating", not rejected: Connections and the cards say OpenRouter is
activating the key, a chat says to send again shortly, and the Studio asks again every 15 s, clearing
the note the moment the key is accepted. A key still refused after the window is marked rejected; a
pasted key's 401 is a rejection at once. The note ends with the window even if nothing asks again, belongs to one
key (another tab's key, or a new one, does not inherit it), and survives Disconnect then Undo; the
re-check never runs faster than once a second and stops when the window closes, so a dropped
connection or a 5xx cannot turn it into a loop. The mint record (`lattice-db-or-minted`, "<ms>:<last four>") holds the
key's last four characters in clear: the same four Connections shows on screen, not a usable secret,
and the only piece of the key outside the sealed envelope. Key info now comes from OpenRouter's documented `/api/v1/key` (it was the undocumented `/api/v1/auth/key`), and every card
on a route whose key was refused says so (owner report, 2026-11-08).

The nightly live check of every route's list, and the one model config it reads, shipped in
`2026-11-09-model-guard-rails.md`.
