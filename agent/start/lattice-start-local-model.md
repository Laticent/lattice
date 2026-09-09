# Set up Lattice in a local model (Ollama, llama.cpp, LM Studio)

## What to paste

Put [`paste/lattice-instructions-solo.md`](../paste/lattice-instructions-solo.md) in the instructions box.

## What to upload

Nothing. This path is self-contained.

## Notes

Use `lattice-instructions-solo.md` as the system prompt. It is self-contained — 20
layouts with their real skeletons, the rules that break a deck, and a worked example —
and it needs no knowledge files.

**Raise the context window first.** Ollama defaults to 4,096 tokens below 24 GiB of
VRAM, and llama.cpp and LM Studio default to 4,096 too. Past the window, input is
dropped **with no error** — the model does not know, and neither do you. It simply gets
quietly worse.

```sh
ollama run <model> --think=false
>>> /set parameter num_ctx 8192
```

Or in a Modelfile: `PARAMETER num_ctx 8192`.

**What this path gives up, on purpose:** 41 of the 61 layouts, every modifier, the
chart family and the per-layout budgets. Those 20 layouts cover 91% of the slides in
our own realistic decks, and the "if nothing fits, use `content` or `list`" line covers
the rest. Expect a plainer deck than a frontier model produces — a plain valid deck
beats an ambitious broken one.

---

Render and check what it writes: [`render/lattice-render-a-deck.md`](../render/lattice-render-a-deck.md).
