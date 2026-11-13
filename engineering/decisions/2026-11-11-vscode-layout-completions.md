---
status: shipped
summary: >
  A small VS Code extension (kit/vscode, shipped in the Marp kit as lattice-layouts.vsix) completes layout names inside
  `<!-- _class: ` and nowhere else. In a real VS Code 1.146.0 it opened 0 menus in 150 words of prose and opens on the directive.
---

# Layout names complete inside `<!-- _class: `, and prose opens no menu

**Date:** 2026-11-11 · **Decided by:** the owner asked for pop-ups "for certain things" (PR #3122); this session built it
from `followups.d/3122-p3-vscode-layout-completion-extension.md` · **Code:** `kit/vscode/extension.js`,
`kit/vscode/vsix.js`, `tools/build-marp-kit.js` · **Held by:** `test/unit/tools/kit-vscode-extension.test.js`,
`node tools/build-marp-kit.js --check`.

## The problem

The kit's snippets (`tools/build-snippets.js`) list every layout on **Ctrl+Space**. They cannot pop up on their own
without also popping up in prose: with Markdown quick suggestions on, PR #3122 measured the menu opening on 21 of 30
words (prefix `lattice-kpi`), 284 of 400 (`/kpi`) and 108 of 150 (`::kpi`). VS Code skips a prefix's leading symbols and
matches loosely across the name, so no snippet prefix keeps prose quiet. A snippet does not know where the cursor is.

## What we do

A completion provider does know. `kit/vscode/extension.js` registers one for Markdown with two trigger characters, space
and colon, and answers only when the line up to the cursor matches `<!--\s*_?class\s*:\s*(?:[\w-]+\s+)*([\w-]*)$`: inside
a `_class:` or `class:` directive, at any word of the class list. Everywhere else it returns nothing. A trigger character
opens the menu even with quick suggestions off, which is VS Code's default for Markdown, so `<!-- _class: ` opens the menu
for everyone, and nothing else does.

Each item is a layout name with its manifest's one-line `description` and its bucket. The list is generated, not typed:
`kit/vscode/vsix.js` reads the component manifests when the kit is built.

**Packaging without a packager.** A `.vsix` is a zip of `extension.vsixmanifest`, `[Content_Types].xml` and the extension
under `extension/`. `vsix.js` writes it itself: synchronous (the kit build is), byte-for-byte deterministic (fixed
timestamps and order, so the kit's `--check` holds), with `zlib.crc32` (Node 22.2+; the floor is 22.13) and no new
dependency. Real VS Code installs it with `code --install-extension`.

**Where it lives.** `kit/`, not `lib/`: `lib/` ships in the npm package, and the extension loads `vscode`, which npm
cannot install (`test/unit/cli/shipped-imports-resolvable.test.js` caught it). The kit carries the `.vsix`
(`dist/marp-kit/lattice-layouts.vsix`, mirrored to `dist-kits:marp/`). The Export-to-Marp bundle is built in the browser
too, so it links to the kit's copy instead of packing one.

**What it does not do.** No marketplace listing: publishing is externally visible, so it is the owner's call. The
snippets stay, because they insert a whole skeleton, which the name completion does not.

## Evidence

A real VS Code 1.146.0 under xvfb, with Marp for VS Code 3.6.1 (Open VSX) and the extension installed from the built
`.vsix`, fresh profile per run, the kit folder as the workspace. A Playwright script attached over CDP typed 150 words of
the kit's sample-deck prose one keystroke at a time and read the suggest widget after every keystroke, then typed
`<!-- _class: `, `kp`, Enter, a space.

| Run | Menus in 150 prose words | Menu on `<!-- _class: ` | Result of `kp` + Enter |
|---|---|---|---|
| Default settings, extension | **0** | yes, every layout (`actors`, `agenda`, …) | `<!-- _class: kpi` |
| Default settings, no extension | 0 | no | `kp` stays as typed |
| Quick suggestions on, extension | 18 and 25 (two runs) | yes | `<!-- _class: kpi` |
| Quick suggestions on, no extension | 28 | no | — |

A space after `kpi` opened the menu again for a second class. In the quick-suggestions run, the menus held 46 VS Code
word completions and 72 kit snippets, and **no item from the extension**: what still pops there is VS Code's own word
completion and the snippets, which the setting asks for and the extension cannot suppress.
