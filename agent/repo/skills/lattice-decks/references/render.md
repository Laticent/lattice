# Turn your deck into a PDF

You have a `.md` file. Here is how to see it.

## How Marp and Lattice divide the work

Read this once and the rest of the page explains itself.

**Marp** splits the Markdown into slides and drives a headless Chrome to print them.
It does not know what `kpi` or `quadrant` means — to Marp a `<!-- _class: kpi -->`
comment is just a class name to put on a `<section>`.

**Lattice** is what gives that class name a meaning, in two parts:

- **`lattice.css`** lays the slide out, and a palette like **`cuoio.css`** colors it.
  Most layouts are pure CSS and need nothing else.
- **the runtime `<script>`s** build the layouts that cannot be done in CSS — charts,
  diagrams, and the ones that rearrange their own content, like `kpi`. These run in
  the browser, during the render.

So a Lattice deck is a Marp deck, plus a stylesheet Marp has to be handed, plus the
three scripts the deck carries itself. **Miss any of them and the deck still renders** — as
plain Marp, or with the palette but no type, or with a layout flattened to a list.
None of those prints an error. That is the whole difficulty of this page.

## What your deck must carry

A Lattice deck is a Marp deck first. Six things make it one:

| In the deck | Why |
|---|---|
| `marp: true` in the front matter | Without it marp-cli treats the file as plain Markdown |
| `theme: cuoio` — a palette your renderer registered | An unregistered name falls back to plain Marp, silently |
| `---` alone on a line between slides | This is the slide separator; front matter ends with one too |
| `<!-- _class: NAME -->` at the top of each slide | Picks the layout. One per slide |
| the three runtime `<script>` tags, at the **bottom** | Marp emits raw HTML in document order — at the top they land inside slide 1 and print as text |
| `class: dark` for dark mode, **not** `color-mode:` | `class:` is Marp's own key. Lattice's richer registers are read by the full export pipeline, not by Marp |

And one thing on the renderer's side: **`html: true`**. marp-core escapes raw HTML by
default, which turns the deck's `<script>` tags into visible text and leaves every
chart and diagram unbuilt. Pass `--html` on the CLI, or set it in a config file.

The three tags, in this order — the runtime reads the dagre global synchronously
on its first draw, so it has to come last:

```html
<!-- markdownlint-disable MD033 -->
<script src="mermaid-v11.min.js"></script>
<script src="lattice-dagre.min.js"></script>
<script src="lattice-runtime.min.js"></script>
```

`examples/lattice-example-starter.md` carries all six. Copying it is the cheapest way
to get them right.

## Route 1: the Marp kit (nothing to install)

The `marp/` folder published beside this kit is a copy-and-go bundle — the engine
CSS, the palettes, the fonts and a config. Copy the folder, put your deck inside it
next to `Sample-Deck.md`, then:

```sh
npx @marp-team/marp-cli@^4.3.1 your-deck.md \
  --config-file marp.config.cjs --allow-local-files -o your-deck.pdf
```

**Put the deck inside the folder, not the folder beside the deck.** The config
registers the stylesheets by path relative to itself; a deck outside the folder
renders unstyled **with no error**, which is the single most common way this goes
wrong.

marp-cli renders the PDF through a Chrome or Chromium you already have. If it cannot
find one, point it at yours with `CHROME_PATH=/path/to/chrome`.

## Route 2: render the deck where it already is

Route 1 asks you to move the deck. When you cannot — the deck lives in a repository,
or you are an agent handed a path — hand marp-cli the stylesheets directly with
`--theme-set` and leave the deck alone.

First fetch the assets once. One command gets all of them, the typefaces included —
which matters, because there are dozens of font files and no practical way to name
them one at a time:

```sh
curl -fsSL https://github.com/Laticent/lattice/archive/refs/heads/dist-kits.tar.gz \
  | tar -xz --strip-components=1 lattice-dist-kits/marp
```

That leaves a `marp/` directory holding the stylesheets, the palettes, `fonts/` and the
three runtime scripts. Now point marp-cli at it and leave the deck where it is:

```sh
# Both of these resolve against the OUTPUT file, so they go beside it —
# the typefaces, and the runtime scripts the deck names at its bottom.
cp -r marp/fonts path/to/
cp marp/mermaid-v11.min.js \
   marp/lattice-dagre.min.js \
   marp/lattice-runtime.min.js \
   path/to/

npx @marp-team/marp-cli@^4.3.1 path/to/your-deck.md \
  --html --allow-local-files --pdf -o path/to/your-deck.pdf \
  --theme-set marp/lattice.min.css marp/cuoio.min.css
```

### Three rules about where those files may live

Each was checked by rendering the same 10-slide deck both ways and looking at the
result. Each wrong answer produces a deck, not an error.

| Asset | May it be a URL? | Where it must be |
|---|---|---|
| The stylesheets (`--theme-set`) | **No** | A local path. marp-cli resolves themeSet entries as paths only; a URL renders the deck in **default Marp styling** and says nothing |
| `fonts/` | No | Beside the **output** file, not beside the stylesheet. marp-cli inlines theme CSS into the page, so `url(fonts/…)` resolves against the output document. Get this wrong and the palette and layout are right while the type falls back to a system serif |
| The three runtime `<script src>` | **Yes** | Beside the **output** file, like the fonts and for the same reason, or a CDN URL. Both were verified rendering the same layout identically |

### Skipping the download for the scripts

The scripts are the one asset that may be a URL, so a deck can carry them directly and
you download nothing but the two stylesheets:

```html
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/mermaid-v11.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/lattice-dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits/marp/lattice-runtime.min.js"></script>
```

Two costs to know before you take that trade. The render now needs network access, so
it fails where the kit route would not; and **`@dist-kits` is a moving branch**, which
is what you want for fixes and not what you want for a deck that must render the same
way next year. Pin a tag instead of the branch when that matters.

There is a second URL for these files, and it is **not** interchangeable. To grab one
file on its own — a different palette, say — fetch it from the repository directly:

```sh
curl -fsSLO https://raw.githubusercontent.com/Laticent/lattice/dist-kits/marp/cuoio-dark.min.css
```

**That host is for downloading and never for a `<script src>`.** It serves JavaScript
as `text/plain` with `nosniff`, so the browser refuses to run it, the layout comes up
flat, and nothing anywhere says why. Use the CDN above in a tag; use this one in a
`curl`.

## In the browser, with nothing at all

Paste the deck into the Lattice Studio at <https://lattice.style/studio> and export
from there. Useful when you have no Node, or you want to try a different palette
before committing to one.

## From a clone of the repository

If you have the source checked out, the engine renders PDF, PPTX, PNG and HTML:

```sh
node dist/lattice-emulator.js your-deck.md your-deck.pdf
```

The output format is chosen by the extension — `.pdf`, `.pptx`, `.png`, `.zip`, `.html`.
Needs Node 22.12 or newer and a Chromium that Puppeteer can find. This route needs no
`--theme-set` and no `<script>` tags: the engine owns both ends, and it strips the
deck's runtime scripts before export, so a deck carrying them renders the same here.

## What about `npm install`?

Not yet. The package is not published to the npm registry, so an `npm install`
line would fail on your first attempt. Use one of the routes above until it is.

## If the slides come out wrong

Every failure on this page is silent, so work back from what you see:

| What you see | What is missing |
|---|---|
| Plain Marp slides — no palette, no layout | The stylesheets never registered. Check they are local paths, not URLs |
| Right colors and layout, wrong typeface | `fonts/` is not beside the **output** file |
| One layout flattened to a list or a bare fence | The runtime scripts did not run: missing, in the wrong order, at the top of the file, or `--html` was not passed |
| `<script src=…>` printed on slide 1 as text | `--html` was not passed, so marp-core escaped it |
| A blank final page after a diagram | An old runtime. Mermaid appends a tooltip to `document.body`, past the last slide, and Chrome spills one more sheet. The shipped runtime pins it; re-fetch yours |

## Before you render, check the deck

```sh
node review/check.mjs your-deck.md   # from the kit root
```

It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot
be talked into approving a deck the way a model reviewing its own draft can.
