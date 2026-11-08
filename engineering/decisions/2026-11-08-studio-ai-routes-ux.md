---
status: proposed
summary: Workspace › AI blurred three questions (how the Studio reaches models, which model does what, and who uses it), so the owner could not tell what was what. The redesign separates them into Connections (OpenRouter sign-in, your own keys including your own OpenRouter key, and this device), two selections (chat model, voice model) that each name their route, and a plain list of the features each one feeds. Connecting never changes a working selection.
---

# Studio AI: routes, selections and the screens that show them

Builds on `2026-11-07-studio-model-spine.md`, whose engine stays: one stored chat selection and
one stored voice selection, resolved without substitution, pinned per turn and per read. This
note is about the **model the author sees**, and the few engine changes that model needs.
Mockups: the "Studio AI: models and connections" canvas, https://claude.ai/artifact/FBJX8jCQKAXa381Xf5uufu (private to the owner).

## 1. Why the first spine UI was not enough

Owner review, 2026-11-08: "what you have done is not really deterministic to me. I can't tell
what's what." Read against the shipped screens (PR #3079, `2a27df50`), four things caused it:

1. **Connecting changed the selection.** Saving a Gemini key switched chat AND voice to Gemini
   (owner decision 3 of the spine). Connecting and choosing were one act.
2. **OpenRouter looked like one more key.** Its row sat in the same list as Gemini, Anthropic
   and OpenAI, although it is the platform the Studio is built around.
3. **Chat and voice chose differently.** Chat: "Cloud | On-device", then provider pills, then a
   list. Voice: "OpenRouter | Gemini | On-device". Two shapes for one idea.
4. **The route was hidden.** A card said "Gemini": a model, or a route? Gemini 3.8 Flash can be
   reached through OpenRouter or through the author's Gemini key, and nothing said which one would
   answer, or which account it would bill.

## 2. The model: three layers, each answering one question

| Layer | Question | What it holds |
|---|---|---|
| **Connections** | How can the Studio reach models? | **OpenRouter** (signed in): the platform, one account and one wallet for every chat and voice model. **Your own keys**: your OpenRouter key, your Gemini key, your Anthropic key, your OpenAI key, each separate. **This device**: free and private models. |
| **Selections** | Which model does what? | Exactly two. **Chat model** = route + model. **Voice model** = route + model + voice. |
| **Uses** | Who reads them? | Chat model: Chat, Refine, Theme, Finish, Alt text, Charts. Voice model: Present, Read aloud, Narrated export. |

### Routes

A **route** is one connection the Studio can send a request through. There are seven, and every
model the Studio names is named with its route:

| Route | How it is connected | Chat | Voice | Bills |
|---|---|---|---|---|
| **OpenRouter** | Sign in (OAuth, one click) | every OpenRouter chat model | every OpenRouter voice model | the signed-in OpenRouter account |
| **Your OpenRouter key** | paste a key | every OpenRouter chat model | every OpenRouter voice model | that key's OpenRouter account |
| **Your Gemini key** | paste a key | Gemini models | Gemini TTS | that Google account |
| **Your Anthropic key** | paste a key | Claude models | none | that Anthropic account |
| **Your OpenAI key** | paste a key | GPT models | none (follow-up 3048) | that OpenAI account |
| **This device** (chat) | download once, or the browser's own | Browser built-in, WebLLM, Universal | none | free |
| **This device** (voice) | download once (~80 MB) | none | Kokoro | free |

**OpenRouter sign-in and your OpenRouter key are two routes**, not two ways into one (owner,
2026-11-08: "two distinct OpenRouter idioms… they are distinct"). Sign-in is the platform path a
new author takes; a pasted key is bring-your-own-key, listed with the other keys. They can both be
connected at once, each picks its own models, and each bills its own account.

### One way to name a model, everywhere

`<model> · <route>`, the same words in the Workspace cards, the chooser, the chat chip, Present's
voice pill and every notice:

- `Claude Sonnet 5.5 · OpenRouter`
- `Gemini 3.8 Flash · Your Gemini key`
- `Browser built-in · This device`
- `Kokoro, Heart · This device`

The same model through two routes is two entries, never merged: `Gemini 3.8 Flash · OpenRouter` and
`Gemini 3.8 Flash · Your Gemini key` answer the same way but bill different accounts.

### Rules (the deterministic part)

1. **A selection changes only when the author picks.** Connecting adds models; it never changes
   a working selection. **Exception (owner, 2026-11-08):** a selection that cannot run at all
   (nothing set, or its route is not connected) is filled by the first connection that can serve
   it, with that route's recommended model, and a notice says so: "Chat now uses Gemini 3.8 Flash
   · Your Gemini key, because nothing was set."
2. **Chat and voice are independent.** Any connected route for either; a Claude key for chat with
   an OpenRouter voice is a normal setup (owner, 2026-11-08).
3. **Nothing falls back.** A selection that cannot run says why, in one vocabulary, and stops:
   `Ready` · `Loading 42%` · `Needs its connection` · `Not downloaded` · `Model retired` ·
   `Out of credit`. Each has one action next to it (Connect, Download, Choose another, Add billing).
4. **Removing a connection leaves the selection in place** and reads `Needs its connection`, with
   Reconnect beside it.
5. **Pickers curate.** A route's list opens on Recommended (the newest of each family, two to four
   models) with All and search one step away. The selected model is always shown.

## 3. The screens

### Workspace › AI (desktop sheet, tablet, phone: one layout that stacks)

Top to bottom:

1. **Models in use**: two cards, Chat model and Voice model. Each: route glyph, `<model> · <route>`
   on two lines, a status, **Change**, and a quiet line "Used by Chat, Refine, Theme, Finish, Alt
   text, Charts" (voice: "Used by Present, Read aloud, Narrated export").
2. **Connections**, with one sentence: "Where the Studio can reach models. Connecting adds models;
   it never changes what is in use."
   - **OpenRouter**: its own card, first. Signed out: "One account for every chat and voice
     model", **Sign in with OpenRouter**. Signed in: the account, its balance, Sign out.
   - **Your own keys**: four rows (OpenRouter key, Gemini, Anthropic, OpenAI). Each says what it
     serves (`Chat · Voice`, or `Chat`), its state (`No key`, `Key …ab12 · in use for chat`,
     `Rejected`, `Out of credit`) and Add / Replace / Remove.
   - **This device**: Browser built-in, WebLLM, Universal (chat) and Kokoro (voice), each with its
     size and Download / Downloaded.
3. **Spend**: for the chat model's route only, as today.

### Change (the chooser), the same for chat and voice

One sheet, three steps on one screen, read top to bottom:

1. **Route**: the connected routes as radio rows (`OpenRouter · 300+ models`, `Your Gemini key ·
   12 models`, `This device · 3 models`), plus "Connect another…" that scrolls to Connections.
   Unconnected routes are not listed.
2. **Model**: the chosen route's list, Recommended first, All and search below.
3. **Voice** (voice only): the model's named voices, with a sample button.

Picking a model makes it the selection at once; the card above updates in place. There is no
Save.

### The chat chip and Present's pill

- **Chip**: `Claude Sonnet 5.5 · OpenRouter` (truncates the model, never the route). Its popover is
  the same chooser, compact: route tabs for connected routes, Recommended list, "All models and
  connections…" opening Workspace › AI.
- **Present's voice pill**: `Heart · This device`, `Loading voice 42%`, or `Captions` with the
  reason as its tooltip.

### First run (nothing connected)

The two cards read "Not set" with one primary action, **Sign in with OpenRouter**, and two quiet
alternatives: "Use your own key" and "Use this device". Whatever is connected first fills both
selections where it can (rule 1's exception), and the notice names what was chosen.

## 4. What changes in the engine

The spine stays. Three changes:

1. **Two OpenRouter routes.** Today one slot (`lattice-db-or-key`) holds the OpenRouter key however
   it was obtained. Sign-in and pasted key need their own slots and route ids (`openrouter` and
   `openrouter-key`), and the selection records name the route. Open question for the owner: a key
   stored before this change cannot say how it was obtained. Proposed: it becomes **Your
   OpenRouter key** (the conservative label: the author can sign in to add the platform route).
2. **Connect never switches a working selection** (rule 1). `saveProviderKey` and the OAuth
   return stop calling `selectChat` / the stranded-voice select, except to fill a selection that
   cannot run.
3. **One route vocabulary** in `lib/provider-registry.js`: id, label (`Your Gemini key`), glyph,
   what it serves, how it connects. The cards, the chooser, the chip, the pill and the notices all
   read it, so the words cannot drift.

## 5. Alternatives considered

- **One global mode** (OpenRouter, or own keys, or this device, for everything). Simpler, but it
  cannot express "chat on my Claude key, voice through OpenRouter", and Anthropic has no voice, so
  a Claude-key author would have no voice at all. Rejected by the owner's answer to question 2.
- **A setup wizard.** Clear the first time, but it hides the state afterwards, which is the
  problem being fixed.
- **Provider-first lists** (pick Gemini, then see its models, whatever the route). Shorter, but it
  merges two routes for the same model and hides which account pays.

## 6. Owner decisions, 2026-11-08

1. OpenRouter sign-in and a pasted OpenRouter key are distinct routes.
2. Chat and voice routes are independent.
3. Connecting fills a selection only when it cannot run.
4. Design first, then rebuild the UI in PR #3079.
