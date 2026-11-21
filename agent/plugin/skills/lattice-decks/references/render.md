# Turn your deck into a PDF

You have a `.md` file. Lattice renders it.

## With one command

```sh
npx @laticent/lattice your-deck.md your-deck.pdf
```

The extension picks the format:

| Output | You get |
|---|---|
| `deck.pdf` | A vector PDF with selectable text |
| `deck.pptx` | PowerPoint; add `--editable` for real text boxes |
| `deck.png` | One PNG per slide: `deck.001.png`, `deck.002.png`, … |
| `deck.html` | The rendered deck; add `--player` for a self-contained player |

A third argument overrides the palette for one render:
`npx @laticent/lattice your-deck.md your-deck.pdf cuoio`. Add `--print` for a
black-and-white-safe copy. `npx @laticent/lattice --help` lists the rest.

It needs Node 22.13 or newer and a Chrome or Chromium on the machine. If it cannot find
one, set `CHROME_PATH=/path/to/chrome`.

## Check the deck first

```sh
node review/check.mjs your-deck.md   # from the kit root
```

No kit on disk? Fetch the checker and the catalog it reads, side by side as in the kit:

```sh
mkdir -p lattice/review lattice/reference
curl -fsSL https://lattice.style/agents/review/check.mjs -o lattice/review/check.mjs
curl -fsSL https://lattice.style/agents/reference/components.json -o lattice/reference/components.json
node lattice/review/check.mjs deck.md
```

It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot
be talked into approving a deck the way a model reviewing its own draft can. It catches
the wrong Markdown shape for a layout, a layout name that does not exist, and the
structural traps the reviewer flags.

## Without a command line

Open the deck in the Lattice Studio at <https://lattice.style/studio> and export from
there. Use this when you are writing in a chat product (a Claude Project, a GPT, a
Gem) that hands back a file rather than running a command.

## If the render looks wrong

| What you see | What to fix |
|---|---|
| The render stops with `unknown palette` | `theme:` names a palette that does not exist. The message lists the real ones |
| A layout comes out as a plain list | The slide is not in that layout's Markdown shape. Copy the skeleton from its file in `components/` again; `check.mjs` names the slide |
| `⚠ OVERFLOW` in the output | A slide holds more than fits. Split it, or cut words; the layout's file gives its capacity |

## Handing the deck to someone who uses Marp

Export a Marp bundle (Studio: **Share → Marp bundle**). The kit's
`render/lattice-export-to-marp.md` explains what the bundle carries and how to do it
by hand.
