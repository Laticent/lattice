# Lattice — published kits

**This branch is generated. Do not edit it, and do not open a pull request from it.**

`dist-kits` is an orphan branch: it shares no history with `main` and is rebuilt
from scratch and force-pushed as a single commit by
`.github/workflows/publish-kits.yml`. Anything you commit here is erased on the
next publish. Edit the sources on `main` instead.

It exists so you can browse or fetch a file straight from the repo — no clone, no
`npm install`, no build. `main` carries source; generated artifacts publish here.

## What is in here

| Folder | What it is |
|---|---|
| [`marp/`](./marp) | The **copy-and-go Marp kit** — engine CSS, palettes, fonts, a `marp.config.cjs` and a sample deck. Copy the folder and you are working in VS Code or `marp-cli`. |
| [`agent/`](./agent) | **Lattice for AI** — everything needed to teach any model to write Lattice decks. **Start at [`agent/README.md`](./agent/README.md)**, which routes you by WHERE you are putting it: a Claude Project, a Custom GPT, a Gemini Gem, a coding agent, a local model, or one paste into any chat. Each of those pages names the text to paste and the files to upload. Includes three ready-made instruction texts sized to real platform caps, ten pre-bundled knowledge files, drop-ins for coding agents, a Claude Code plugin, five complete example decks, and a runnable deck checker (`agent/review/check.mjs`).|

Each folder has its own README with the details.

## Using the Marp kit in VS Code

**Open the `marp/` folder as your workspace root**, not this one.

`marp/.vscode/settings.json` registers the stylesheets by workspace-relative
path, so opening the wrong folder gives you **unstyled slides with no error** —
the failure is silent, which is why it is worth saying twice.

As a safety net, this branch root carries its own `.vscode/settings.json`
pointing at `./marp/…`, so opening the branch root works too. Only these two
levels do; a folder in between will not.

## Freshness

Republished on every push to `main` that changes an input, with a nightly
backstop. It tracks `main`, which may be ahead of the newest release.

## License

Same as Lattice — see [`LICENSE`](./marp/LICENSE) in the Marp kit, or the
repository root on `main`.
