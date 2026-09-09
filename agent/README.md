# Lattice for AI

**Lattice turns plain Markdown into boardroom-quality slides.** One layout per slide,
chosen with `<!-- _class: NAME -->`; slides separated by a line containing only `---`.

This kit teaches any model to write them. No clone, no install, nothing vendor-specific.

## Start with where you are putting it

| I am setting up… | Open |
|---|---|
| A Claude Project | [`start/lattice-start-claude-project.md`](./start/lattice-start-claude-project.md) |
| An OpenAI Custom GPT | [`start/lattice-start-custom-gpt.md`](./start/lattice-start-custom-gpt.md) |
| A Gemini Gem | [`start/lattice-start-gemini-gem.md`](./start/lattice-start-gemini-gem.md) |
| NotebookLM (Gemini Notebook) | [`start/lattice-start-notebooklm.md`](./start/lattice-start-notebooklm.md) |
| GitHub Copilot or Microsoft 365 Copilot | [`start/lattice-start-copilot.md`](./start/lattice-start-copilot.md) |
| A coding agent (Claude Code, Cursor, Codex, Windsurf, Cline, Zed, Aider) | [`start/lattice-start-coding-agent.md`](./start/lattice-start-coding-agent.md) |
| A local model (Ollama, llama.cpp, LM Studio) | [`start/lattice-start-local-model.md`](./start/lattice-start-local-model.md) |
| A single chat, with no setup | [`start/lattice-start-one-off-chat.md`](./start/lattice-start-one-off-chat.md) |

Every one of those pages says the same two things: **the text to paste**, and **the files
to upload**. Nothing else is required to get a working setup.

## In a hurry

Paste [`paste/lattice-instructions-solo.md`](./paste/lattice-instructions-solo.md) (9,211 characters)
into any chat and ask for a deck. It is self-contained — 20 layouts with their real
skeletons, the rules that break a deck, and a worked example. Nothing to upload.

## What is in here

| Folder | What it is for |
|---|---|
| [`start/`](./start/) | One page per destination — what to paste, what to upload |
| [`paste/`](./paste/) | The instruction texts, at three sizes, each sized to a real platform cap |
| [`upload/`](./upload/) | Ten knowledge files, ready to drag into a knowledge uploader |
| [`repo/`](./repo/) | Drop-ins for a coding agent — `AGENTS.md`, `CLAUDE.md`, a Cursor rule, a skill |
| [`plugin/`](./plugin/) | The same skill as an installable Claude Code plugin |
| [`examples/`](./examples/) | Five complete, renderable decks |
| [`render/`](./render/) | How to turn a finished `.md` into a PDF |
| [`review/`](./review/) | A runnable checker — code, not a model |
| [`components/`](./components/) | The deep reference — all 69 layouts, one file each |
| [`authoring/`](./authoring/) | The canon, the rules, the modifiers, the full primer |
| [`skills/`](./skills/) | Creating a new theme, component, finish or lens from blank |
| [`reference/`](./reference/) | Machine catalogs, for building a tool |

The last four are the **library** — one topic per file, for a reader who can fetch a
path. `upload/` is the same knowledge rebundled for an uploader that takes ten files and
discards folders. Both exist because those two consumers cannot be served by one tree.

## What each path costs, if you are budgeting context

| Reading… | ~tokens |
|---|---|
| `paste/lattice-instructions-solo.md` — everything, self-contained | ~2.3k |
| the authoring path: canon → rules → picker | **~8.1k** once |
| …then one `components/<name>.md` per layout you use | + ~1.9k each |
| drafting a whole deck in one pass: canon → primer | ~22k |
| creating a theme, component, finish or lens | 3.0k–5.6k each |

The per-layout row is the one that matters: a nine-slide deck reads nine of those files,
so the fixed figure alone describes a one-slide deck and understates a real one by about 3x.

## Three things that will bite you

**`theme:` must name a palette your renderer has registered.** Marp resolves palettes by
name; an unregistered one falls back to plain Marp styling **with no error**. `cuoio`
works on every route here.

**A Marp-rendered deck needs the two runtime `<script>` tags at the bottom of the file.**
Without them, layouts that compose in the DOM render as plain lists — again, no error.
The starter deck in `examples/` carries them; copy it and you inherit them.

**Run the checker before you hand a deck over.** `node review/check.mjs your-deck.md`,
from this folder, is code rather than a model: no tokens, offline, a tenth of a second,
and it cannot be talked into approving a deck. A model reviewing its own draft will tell
you the draft is fine.

---

_Generated from the Lattice sources — do not hand-edit. Republished whenever an input_
_changes. ~token figures are bytes ÷ 4, a rough cross-model approximation; your tokenizer_
_will differ, and the ratios are what matter._
