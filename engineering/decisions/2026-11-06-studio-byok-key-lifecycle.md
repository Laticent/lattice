---
status: in-progress
summary: The Studio's bring-your-own-key (BYOK) OpenRouter key had three silent failure points — a failed OAuth return said nothing, a revoked key was never noticed, and nothing proved a shared deck's preview could not read the key. This note records how each is now handled, section by section as it lands (#610).
---

# Studio BYOK — the key's lifecycle, end to end

The Studio runs on the author's own OpenRouter key (BYOK, "bring your own key"). The
key arrives through an OAuth sign-in (PKCE: the page stores a one-time *verifier*,
OpenRouter returns a one-time *code*, and the two are exchanged for a key), lives in
`localStorage` under `lattice-db-or-key`, and is spent by every AI surface. This note
covers what happens at each stage when something goes wrong.

## 1. Sign-in: a failed return says so

**Before.** `resumePendingAuth` (`docs/src/components/studio/architect.ts`) returned
`false` when the code-for-key exchange failed. The Studio read `false` as "nothing to
resume", so the author clicked Connect, signed in at OpenRouter, came back, and saw
nothing. The PKCE verifier stayed in storage, so every later load still looked like a
pending sign-in, and that verifier could never succeed again.

**Now.** `resumePendingAuth` returns `{ status: 'none' | 'connected' }` or
`{ status: 'failed', note }`:

- A non-2xx from `POST /api/v1/auth/keys`: the adapter's `resumeOpenRouterAuth`
  (`ai/architect-model.js`) clears the verifier and rethrows; `resumePendingAuth` scrubs
  `?code=` from the URL so a reload cannot replay the dead exchange, and returns
  `failed` with the HTTP status in the note.
- A return with `?error=` and no code (the author cancelled, or OpenRouter refused):
  the verifier is cleared and the result is `failed`.
- `StudioShell` shows `failed` as an action notice with **Try again**, which starts a
  fresh sign-in.

An existing key is never touched by a failed exchange: only the verifier is cleared.

Pinned by `architect.test.ts` › "resumePendingAuth — a failed OAuth return says so"
and `docs/e2e/openrouter-oauth-return.spec.ts` (mocked endpoint, HARD RULE #24).

## 2. A revoked key is noticed

**Before.** Nothing read a 401 as "this key is dead". An author who revoked the key on
openrouter.ai, or whose key expired, kept seeing "OpenRouter — active" in Workspace; every
cloud request failed, and nothing offered the fix.

**Now.** The OpenRouter backend in `ai/architect-model.js` taps the status of every call it
makes with the stored key — `/auth/key`, `/credits` and `/chat/completions`. A **401**, and
only a 401, sets `lattice-db-or-key-invalid`, and the transition fires `db-model-changed`
once so live surfaces re-read. `availability().openRouterKeyInvalid` carries it to
`useArchitectStatus`, and the Workspace AI tab replaces the connected row with
"OpenRouter — key rejected · Reconnect".

Three choices worth recording:

- **The key stays.** Deleting it would drop the author to "not connected", which hides
  what happened. The row says the key was rejected; the requests themselves still name
  the 401 (`describeModelError`, `model-error.ts`).
- **Only 401.** A 402 is an empty wallet, a 429 is a rate limit, and OpenRouter uses 403
  for moderation as well as auth. None of those mean the key is dead.
- **Every write of the key clears the mark** (`setKey` in the backend), so a reconnect, a
  disconnect, or the Disconnect Undo's `restore` always starts clean.

The Studio's `useArchitectStatus` already fetches `/auth/key` when the Workspace opens, so
a revoked key is caught there before any paid request is attempted.

Pinned by `ai/architect-model.key-invalid.test.ts` (the mark, its one-time announcement,
that 402/429/500 do not set it, and that a disconnect clears it) and
`WorkspaceSheet.test.tsx` › "a rejected key".

## 3. One module reads the key

**Before.** Four app modules named `lattice-db-or-key` and read it themselves: the model
adapter (`ai/architect-model.js`), the Studio read-aloud (`read-aloud.ts`), and the inline
scripts of the `/libraries/suono` and `/libraries/cadenza` pages. Answering "what can read
the author's key?" meant a repo-wide grep and trust that nobody had spelled it differently.

**Now.** `docs/src/lib/openrouter-key.js` is the only file under `docs/src` that names the
key. It exports `readOpenRouterKey`, `writeOpenRouterKey` (which also clears the rejected
mark from §2), `openRouterKeyRejected`, `markOpenRouterKeyRejected` and
`isOpenRouterKeyEvent` (for another tab's `storage` event). The four callers import it.

`docs/src/lib/openrouter-key.test.ts` runs `git grep --untracked` over `docs/src` and fails
if any non-test file other than this module names the key. Tests may seed it by name; the
test harnesses under `tools/` and `docs/e2e/` that inject a key into a headless browser are
outside `docs/src` and are not app code.

Measured: on `main`, `git grep -l lattice-db-or-key -- docs/src` lists 4 non-test files;
on this branch it lists 1.

Not a reader: `workspace-backup.ts` packs storage into a zip, and
`workspace-backup.test.ts` › "never packs the OpenRouter key, even if present" already pins
that the key stays out of a backup.
