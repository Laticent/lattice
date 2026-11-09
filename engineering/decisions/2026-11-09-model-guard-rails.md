---
status: shipped
summary: Providers retire model ids with little notice, and the Studio's defaults, preferred families and voice ranking were spread across six files, so a retirement needed a code change and nobody noticed until an author hit it. Every model id the Studio names now lives in one committed file, docs/src/lib/models.config.json, which the app bundles and a nightly workflow checks against each provider's live list, opening one rolling issue when an id is gone. Moving an id into the file's `retired` list is the hotfix, and a stored selection naming it reads "Model retired" at once.
---

# Model guard rails: one model config, a nightly check, and a retired list that stops a selection

Swimlane: `2026-11-07-studio-model-spine.md` and `2026-11-08-studio-ai-routes-ux.md`. Owner decisions on
PR #3079 (2026-11-08), recorded in `followups.d/3079-p1-model-guard-rails.md` until this note replaced it.

## 1. The problem

On 2026-11-08 `qwen/qwq` was in the chat picker's Value lens and no longer on OpenRouter. The first run
of this check found two more: `zyphra/zonos-v0.1-transformer` and `zyphra/zonos-v0.1-hybrid` in the voice
picker's Value lens. Nothing had noticed any of the three. The ids sat in six places:
`provider-registry.js` (`CURATED`), `or-catalog.js` (`OR_FEATURED`, `OR_VALUE`), `tts-catalog.js`
(`TTS_FEATURED`, `TTS_VALUE`), `tts-cost.js` (`TTS_QUALITY_RANK`, `TTS_QUALITY_FLOOR`), `voice-model.js`
(`DEFAULT_OR_TTS_MODEL`, `GEMINI_TTS_DEFAULT_MODEL`), `architect-model.js` (`DEFAULT_OR_MODEL`) and
`image-look.ts` (`DEFAULT_IMAGE_MODEL`).

## 2. What shipped

1. **One config file**, `docs/src/lib/models.config.json`: `defaults` (chat, image and voice, per
   route), `pinned` (the tour voice the clips were recorded in), `families` (the curated family patterns,
   as strings; `{gemini3up}` stands for any Gemini version from 3 up), `openrouter` (the picker lenses and
   the voice ranking) and `retired` (per route). `docs/src/lib/models-config.js` reads it with a JSON
   import (Vite and Node both understand it), compiles the patterns and exports `MODELS`. Every constant
   above is now a reference to `MODELS`; the names stay, so no caller changed. One exception:
   `image-look.ts` keeps its literal, because it is on the Studio's boot path (`studio-store.ts`)
   and the config is not, and `models-config.test.ts` holds the two equal. No runtime fetch: a fix is
   a one-line PR and the normal deploy, as the owner chose.
2. **The retired list stops a selection.** A retired entry matches the way the picker lenses do
   (`retiredCovers`): the id itself, or an id that continues it after `-`, `:` or `.`. That matters
   because a lens entry is a prefix, so what a selection stored is a full id: retiring `qwen/qwq`
   covers the `qwen/qwq-32b` and `qwen/qwq-32b:free` a user actually picked. `isRetired` in
   `lib/model-retired.js` (chat and the image reader) and the voice model's `resolveVoice` both ask
   the config, so a stored selection naming a retired id reads "Model retired" on the next load,
   before any request, and nothing is substituted. `validateModelsConfig` refuses an id that is both
   live and retired, in either direction of the prefix match, so a hotfix cannot move half of an id.
3. **A nightly check**, `.github/workflows/model-guard-nightly.yml` running `tools/check-model-ids.mjs`.
   Each configured id is checked against the list it belongs to: an `exact` id (a default, a pinned id, a
   ranked voice) must be listed, a `prefix` (a picker lens entry) needs one listed id that starts with
   it, and a `pattern` (a curated family) needs one listed id it matches. Lists: OpenRouter chat and
   speech (public), Gemini, Anthropic and OpenAI (one repo secret each: `GEMINI_API_KEY`,
   `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). A list whose secret is unset is SKIPPED and reported as
   skipped, never as a pass. A billing or quota answer (`classifyProviderError` says `billing`) PASSES
   that list's connection without checking its ids, because the keys may run without funds (owner,
   2026-11-08). Listing spends nothing, and the check never reads our own OpenRouter key (HARD RULE #24).
   A gone id, a list that answered with anything else, or a 200 whose body is not JSON opens or
   appends ONE rolling issue titled `[model-guard] …`. A later green night closes it only if it
   checked at least one id AND no list answered "out of funds" that night (`billing=0`): a billing
   night did not measure that list, so a gone id on it would read as recovered. An unset secret is
   the same every night and cannot hide a recovery. It joins the nightly
   alarm family in `test/unit/tools/nightly-alarm-contract.test.js` as an absolute check that may close.
4. **A dry run that proves it can fail.** A dispatch with `retire: <id>` adds that id as a missing
   OpenRouter default; the run reports it GONE, writes the issue body to the job summary and files
   nothing.

## 3. Chat's dead-model behavior

The followup's third item (chat stops instead of swapping to the latest-Sonnet alias) shipped in PR #3079:
`isDeadModelError` and its alias heal are gone, and a model-gone answer heals only to a newer version of
the same family on the same route, else reads retired (`2026-11-08-studio-ai-routes-ux.md`
§Implementation, item 4). This note adds the config's retired list as a second way to reach that state,
and the e2e that pins it for chat (`model-spine.spec.ts`, "a chat model the config retires stops chat").

## 4. What is not in the config, on purpose

- **On-device engines** (Kokoro through `kokoro-js`, WebLLM, the browser's built-in model) are pinned by
  their package, not by a provider list, so no provider can retire them. `share-export.ts` and
  `read-aloud.ts` still name `hexgrad/kokoro-82m` as the on-device model.
- **Migration constants** (`OLD_DEFAULT_IMAGE_MODEL` in `model-selection.js`) name a value that was once
  stored, which must keep matching old data whatever the config says.
- **Capability facts** (`PCM_ONLY_MODELS` in `voice-model.js`) describe how a model answers, not which
  model to pick.
- **The tour voice** stays a literal in `tours/lines.ts`, which must stay import-free because the
  recorder reads it from Node. `models-config.test.ts` holds it equal to `pinned.tourVoice`, which the
  nightly checks.

## 5. Evidence

- An independent checker reviewed the first cut and found five defects, all fixed in this commit: the
  config reached the Studio's boot path through `image-look.ts`; voice did not read the retired list;
  `qwen/qwq` was inert, because selections stored full ids; the stand-down could close on a night
  that never measured the failing list; and a non-JSON 200 crashed the checker.
- `tools/check-model-ids.mjs` run live on 2026-11-09 from the session sandbox: OpenRouter chat (462 ids),
  OpenRouter speech (38), Gemini (61) and OpenAI (96) all answered, and all 44 checked ids were live
  after the three retirements in §1. Anthropic was skipped (no key in the sandbox).
- The same run with `--retire openrouter-guard/not-a-model` reports `GONE openrouter:
  openrouter-guard/not-a-model` and exits 1.
- `test/unit/tools/check-model-ids.test.js` runs the checker on recorded lists: all live, a dry run, a
  gone default, a family with no member, a billing pass, a key refusal, a skipped list.
- `docs/src/lib/models-config.test.ts`: the file is valid, every consumer is the config (identity, not a
  copy), the inline RegExps' picks are unchanged, and a retired id stops a selection.
- The workflow cannot be dispatched before it is on `main` (GitHub dispatches only workflows on the
  default branch), so its first dispatch run is owed after merge: run it once with `retire` set and once
  without.
