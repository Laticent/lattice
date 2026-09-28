---
status: shipped
summary: The author's spoken line for a slide is `say:`, not `caption:` — "caption" now means only visible text, and the old keys are retired with a lint error rather than aliased
---

# `say:`, not `caption:` — one word per meaning

**Date:** 2026-09-28 · **Status:** SHIPPED · **Owner direction:** "caption could mean so many
things and I worry we overload it"; chose `say:` from a scored shortlist, and a clean break with a
lint error because Lattice is not yet GA.

## The problem: one word, four meanings

Before this change, "caption" named four different things:

| # | What it is | Where it lived | Who gets it |
|---|---|---|---|
| 1 | The line the author writes for a slide to speak | `<!-- caption: … -->`, front-matter `captions:` | a listener |
| 2 | The line the engine generates when the author wrote none | `prose-projection.mjs`, the `narrateX` chart narrators | a listener |
| 3 | The words shown on screen while the deck speaks | the player's caption band, the `.vtt` sidecar (`--captions`) | a viewer |
| 4 | The label under a figure | `.chart-caption`, `<figcaption>` on image, video and QR slides | a viewer and a screen reader |

Meanings 1 and 2 are both spoken, yet only one carried the name, so "the caption" could mean the
override or the whole narration. Meanings 3 and 4 are both visible text, which is what the word means
everywhere else (TV captions, HTML `<figcaption>` and `<caption>`, print). The engine had already
settled on **narration** for 1 and 2 internally (the narration precedence chain, `narrateGantt`,
`narrateRadar`), so only the author-facing key was out of step.

This is the second time the overload cost a rename: in #918 (2026-07-11) the component field
`caption` became `summary` because "the read-as caption channel took that word"
(`design/editorial.md`).

## The decision

- **`say:`** is the author's spoken line: `<!-- say: … -->` on a slide, and a front-matter `say:` map
  keyed by slide number. The strip flag is `--strip-say`.
- **Narration** stays the name of the concept (everything a deck speaks), in code and in docs that
  explain the precedence chain: `say: comment → front-matter say: map → generated narration`.
- **Caption** means only visible text: the on-screen band, the `.vtt` sidecar (`--captions` keeps its
  name), and a figure or chart caption.

## The candidates, scored

Five axes, 1–5 each: **meaning** (read cold, does it mean "the words this slide speaks aloud"?),
**web** (no clash with an HTML, CSS or JS name), **Lattice** (not already a key or concept in the
repo, measured by grepping `lib`, `docs/src`, `design` and `engineering`), **typing** (short, hard to
misspell), **both forms** (reads well inline and as a front-matter map). A 1 on web or Lattice is a
veto.

| Word | Meaning | Web | Lattice | Typing | Both | Total | Why |
|---|---|---|---|---|---|---|---|
| **`say`** | 4 | 5 | 5 | 5 | 4 | **23** | Picked. Short, plain, no key uses it. |
| `voiceover` | 5 | 5 | 5 | 3 | 4 | 22 | The industry term, but long, split as `voice-over`, and suggests a recorded human. |
| `narration` | 5 | 5 | 5 | 2 | 3 | 20 | Matches the internal word; hard to type. |
| `spoken` | 4 | 5 | 4 | 4 | 3 | 20 | An adjective; `spoken:` reads oddly as a map. |
| `talk` | 2 | 5 | 5 | 5 | 3 | 20 | "A talk" is the whole presentation. |
| `speech` | 4 | 3 | 4 | 4 | 4 | 19 | Near the Web Speech API and the CSS Speech module. |
| `speak` | 4 | 1 | 4 | 5 | 4 | veto | A real CSS property; `lib/` already carries a comment about `speak: never`. |
| `voice` | 3 | 5 | 1 | 5 | 3 | veto | Already picks the TTS voice (`voice: 'af_heart'` in `narrate-kokoro.mjs`). |
| `script` | 3 | 1 | 4 | 4 | 4 | veto | `<script>` — the tag HARD RULE #22's sanitizers exist to stop. |
| `narrative` | 2 | 5 | 3 | 2 | 3 | 15 | Means the deck's storyline, and the docs use it that way. |
| `audio` | 2 | 1 | 3 | 5 | 3 | veto | `<audio>`, and it names the sound, not the words. |
| `caption` | 2 | 2 | 1 | 4 | 4 | veto | The problem this note solves. |

`transcript`, `read`, `line(s)`, `tell` and `words` scored 14–18 and are not repeated here; each
either names the wrong thing or already has a meaning in the repo.

## Lowercase only — the one risk the new word brought

"Say" is an ordinary English word, which is its strength and its one hazard. A presenter can
reasonably open a PRIVATE note with it — `<!-- Say: thank the ops team -->` — and the `say:`
channel is PUBLIC: it reaches the `.vtt`, the read-along and the audio baked into a shared deck.
`caption:` never carried that risk, because nobody writes "Caption:" to themselves. Matching the
key case-insensitively, as `caption:` was, would have published those notes.

So the key is **lowercase only** (`CAPTION_MATCHER = /^say\s*:/` in `lib/authoring/notes-core.js`,
mirrored by `isCaptionBody` in the Studio). `Say:` and `SAY:` stay speaker notes, the safe side of
the mistake, and `lint:deck` reports `say-key-case` as a **warning** — never an error, because a note
that starts "Say:" is a perfectly good note. A lowercase `say:` note-to-self is still possible; the
lowercase form reads as a directive, like `describe:` and `_class:`, which is the convention the docs
teach. `describe:` stays case-insensitive: it has no such collision.

## Retired, not aliased

Lattice is not GA, so the old keys are removed rather than kept as aliases for a release. A silent
removal would be a trap, though: the engine does not know `caption:` any more, so an old comment is
read as a **speaker note**, and the slide speaks its generated narration instead. Three things make
the break loud:

- **`lint:deck`** reports `caption-key-retired` as an **error** for an inline `<!-- caption: … -->`
  and for a top-level `captions:` key (`findRetiredCaptionKeys` in `lib/authoring/lint-core.js`).
  Fenced and inline code are skipped, so a doc that quotes the old syntax is not flagged.
- **The render** prints the same finding as a warning, from the same detector (HARD RULE #7), on the
  channel the retired Form opt-outs use.
- **`--strip-captions`** exits with an error that names `--strip-say`, instead of the generic
  "unknown option". A script passing it asked for a privacy strip, so it must not silently get none.

**`--strip-say` still scrubs the retired keys.** The engine no longer speaks them, but `--strip-captions`
removed them from every shipped copy, and an author who moves a script to `--strip-say` must not start
shipping an old deck's public lines. So `--strip-say` removes a stale `<!-- caption: … -->` (any case)
and a stale top-level `captions:` map from the embedded source, and drops both keys from the player
envelope's `config`. The independent checker measured the leak before this was added: a stale
`captions:` map rode verbatim into the player envelope and the PDF's embedded source under
`--strip-say --strip-notes`. Scrubbing more under a privacy flag is the safe direction.

**A capitalized `Caption:` is a warning, not an error.** The engine matched the old key in any case, so
`Caption:` was spoken too. But it is also how a presenter opens a real private note ("Caption: fix the
chart typo"), and an error would leave no way out but rewording. Lowercase `caption:`, the form the docs
taught, is the error.

## What did not change

- **Internal identifiers** still say caption for the spoken line: `CAPTION_MATCHER`,
  `captionFromHtml`, `extractSlideCaptions`, `stripCaptionsFromSource`, `resolve-captions.mjs`,
  `slide-caption.ts`, `isCaptionBody`, the `CommentKind` value `'caption'`. None of them is typed by
  an author. Renaming them is a code-only follow-up, logged in `followups.d/2477-p3-internal-caption-names.md`.
- **`--captions`**, the `.vtt` sidecar, the player's caption band and every figure caption keep the
  word, because they are visible text.
- **Historical records** (`changelog.d/` fragments already written, earlier decision notes) describe
  what shipped under the name it had then.
