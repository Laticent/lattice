---
title: CLI reference
description: Every command, flag, environment variable and exit code of the lattice command line.
---

Every option the `lattice` command accepts. To learn the command through
worked tasks, start with [Using the command line](/guides/cli/). The same
list, in the terminal:

```sh
npx lattice --help
```

## Command shapes

```sh
npx lattice <deck.md> <output> [palette] [options]
npx lattice <deck.md> <layouts.css> <output> [palette] [options]
npx lattice -o <output> [-p palette] [-c layouts.css] <deck.md>
npx lattice packages <command> [options]
npx lattice video <deck.md | narrated-export.html> [out.mp4] [options]
```

Named flags win over positional arguments when you give both. Flags that take
a value accept `--flag value` and `--flag=value`.

## Output formats

The output file's extension picks the format. There is no other way to choose
it.

| Extension | What you get |
|---|---|
| `.pdf` | A vector PDF with selectable text |
| `.pptx` | A PowerPoint, one full-bleed slide image per slide |
| `.png` | One PNG per slide, named `<output>.001.png`, `<output>.002.png`, … |
| `.zip` | An image set: one image per slide, plus thumbnails and chart SVGs. See [Image set](#image-set) |
| `.html` | The rendered HTML as the deliverable, with no PDF. See [HTML output](#html-output) |
| no extension | A PDF, plus the HTML sidecar |

Every format except `.html` also writes an HTML sidecar, `<output>.html`.
Any other extension stops with an error. For `.webp`, `.jpg` or `.jpeg`, the
error also prints the `.zip` command to use instead.

## General options

| Option | What it does |
|---|---|
| `-h`, `--help` | Print the help and exit |
| `-v`, `--version` | Print the version and exit |
| `-o`, `--output <path>` | The output file, instead of the second positional argument |
| `-p`, `--palette <name>` | The palette, instead of the positional one |
| `-c`, `--css <path>` | Replace the bundled `lattice.css` layout sheet. For engine development, not for decks |
| `-q`, `--quiet` | Print errors only |
| `--size <name>` | Render on another canvas, over the deck's `size:` — for example `square`, `portrait`, `story`, `mobile-landscape`, `4K` |
| `--print` | Render in print mode: black ink on white, with textures on chart series. Any format. Same as `color-mode: print` |
| `--allow-remote` | Let the render fetch web images, media and fonts. Off by default, so web images show as placeholders |
| `--packages <dir>` | Use `<dir>` as the package store for this run |
| `--disable-plugin <names>` | Switch plugins off for this run, comma-separated (`mermaid,math`) or repeated. The engine and the plugins' bakes both skip them, so the PDF, images and PowerPoint show their source, and a deck's `plugins:` list cannot turn them back on. A `--fluid` or `--player` page shows their source too. An unknown name fails the run |
| `--default-plugins <names>` | Narrow the default plugin set for this run, comma-separated, or `none` (default: every shipped plugin). A plugin outside it loads only when the deck lists it in `plugins:` or a component the deck uses requires it; one that does not load exports as source on every output. An unknown name fails the run |
| `--overflow-marker <level>` | What a clipped slide shows: `reader` (default, a "Content clipped" tag), `author` (red ring and "Overflows" flag) or `off` |
| `--no-split` | Never paginate an overflowing slide. For measurement rigs that need page N to stay slide N |

## PDF options

| Option | What it does |
|---|---|
| `--present` | Open full screen in Acrobat and most desktop viewers, with a fade between slides. Same as `present: true` |
| `--raster` | Print each page as one full-page image. Most compatible; text is not selectable |
| `--paper <size>` | Fit each slide onto `auto`, `letter`, `legal` or `a4` paper with a 9 mm margin. Text is not selectable |
| `--orientation <o>` | `auto`, `landscape` or `portrait` for `--paper`. On its own, implies `--paper auto` |
| `--embed-source` | Attach the deck's Markdown to the PDF. Includes speaker notes unless you add `--strip-notes` |
| `--reopenable` | Carry the deck inside the `.pdf` or `.pptx` as a `.lattice`, so the Studio's **Import deck…** opens it for editing. The same payload as the Studio's "Re-openable in Lattice" switch. No comments; hidden slides and speaker notes ride along unless you add `--strip-notes` |
| `--chrome-pdf` | Print with Chrome's PDF printer instead of Lattice's writer |
| `--keep-vector-images` | Keep SVG images as vectors. By default they become 2x PNG, because some viewers mishandle clipped SVG |

## HTML output

These change what the `.html` file holds. The PDF, PowerPoint and image bytes
stay the same.

| Option | What the HTML becomes |
|---|---|
| (none) | The rendered slide stack |
| `--player` | A self-contained, offline player with Present, Read Slides and Read Article views, and the deck source inside for re-import. Same as `player: true` |
| `--read` | The deck as a web article: headings, paragraphs, lists, and charts as figures. Same as `read: true` |
| `--fluid` | A viewer where each slide fills the screen and reflows on a phone. Same as `fluid: true` |
| `--no-player-motion` | Ship still slides in the player even when the deck sets `motion: on`. Same as `player-motion: off` |
| `--player-mode <m>` | Open the player in `light`, `dark` or `system` mode, over the deck's `color-mode:` |
| `--narrate` | Voice the player with Kokoro, the Studio's on-device voice. Needs the optional voice install (see [`lattice video`](#lattice-video)) |
| `--no-guide` | Leave the Guide (the focus and gestures that follow the narration) out of a narrated player |

`--player-mode` and `--narrate` apply to `--player` only; without it, the render
prints a note and ignores them.

When several apply, `--player` wins. Between `--read` and `--fluid`, a flag
beats a front-matter key; with both as flags, or both as keys, `--fluid`
wins. When `--read` loses or `--player` overrides it, the render says so.

## Image set

These apply to `.zip` output only.

| Option | Values | Default |
|---|---|---|
| `--image-format <f>` | `png`, `jpeg`, `webp` | `png` |
| `--image-size <s>` | `max`, `2x`, `1x`, `half` | `max` (2x for HD, 1x for 4K) |
| `--image-quality <n>` | `1`–`100`, for `jpeg` and `webp` | `92` |
| `--image-mode <m>` | `inherit`, `light`, `dark`, `print` | `inherit` |
| `--svg-background <b>` | `inherit`, `light`, `dark`, `print` — the look of each standalone chart SVG | `inherit` |
| `--thumb-width <n>` | Thumbnail width in pixels | `480` |
| `--no-thumbnails` | Leave out the `thumbnails/` folder | |
| `--no-svg` | Leave out the `assets/` folder of chart and diagram SVGs | |

## Speaker notes and captions

| Option | What it does |
|---|---|
| `--notes` | Also write the notes to `<output>.notes.txt`, one block per slide |
| `--notes-icon` | Show a clickable note icon on each slide with a note. Notes are embedded but hidden by default |
| `--strip-notes` | Remove speaker notes from every copy: the HTML, the PDF annotations and any embedded source. `<!-- describe: -->` text stays |
| `--captions` | Also write WebVTT captions: `<output>.vtt` for the deck and `<output>.NN.vtt` per slide |
| `--strip-say` | Remove the spoken lines you wrote (`<!-- say: -->` and the front-matter `say:` map), keeping the generated narration. Replaces the retired `--strip-captions` |

## Palette resolution

The first of these that is set wins:

1. The palette on the command line (`-p`, or the positional argument)
2. The `LATTICE_PALETTE` environment variable
3. The deck's `theme:` front-matter key
4. `indaco`

List the palettes you can name with `npx lattice packages list --type theme`.

## `lattice packages`

Themes, components, finishes and motion made in the Studio are packages.

| Command | What it does |
|---|---|
| `packages list [--type <t>]` | List shipped and installed packages. `<t>` is `theme`, `component`, `finish` or `motion` |
| `packages add <file.zip \| folder>` | Check a package, then install it. `--replace` overwrites an installed one. A package with code asks for approval; `--trust` approves it without asking. With no terminal to ask in, it installs unapproved |
| `packages check <file.zip \| folder>` | Check a package without installing it |
| `packages export <type>/<name> [-o file.zip]` | Zip one package, shipped or installed. A shipped component that carries code cannot be exported |
| `packages remove <type>/<name>` | Remove an installed package |
| `packages trust component/<name> [--yes]` | Approve the code in an installed component. `--yes` skips the prompt |
| `packages untrust component/<name>` | Withdraw that approval |
| `packages new plugin <name> [--dir <dir>]` | Scaffold a plugin: a manifest, render script, styles, docs and fixtures. In a Lattice checkout it writes `lib/plugins/<name>/`; `--dir <dir>` writes `<dir>/<name>/` instead |

The store is `$LATTICE_HOME/packages`, or `~/.lattice/packages` when
`LATTICE_HOME` is not set. `--packages <dir>` overrides it for one run.

## `lattice video`

Renders a narrated deck to an MP4 (H.264 video, AAC audio, a caption track) and
a `.vtt` beside it.

- **`deck.md`** — voiced here with Kokoro, the Studio's on-device voice. Needs
  the optional voice install; the first run downloads its model (about 80 MB)
  once:

  ```sh
  npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7
  ```

- **A narrated `.html` export** — one made in the Studio (**Share → Webpage**
  with **Include narration audio**). Nothing is voiced again.

| Option | What it does | Default |
|---|---|---|
| `--mode <m>` | `light`, `dark` or `system`, for a `deck.md` | the deck's `color-mode:` |
| `--size <name>` | The canvas a `deck.md` is laid out on. `mobile-landscape` fills a phone held sideways | the deck's `size:` |
| `--no-guide` | Leave the Guide out of a `deck.md`'s video | Guide on |
| `--no-captions` | Write no caption track and no `.vtt` | captions on |
| `--fps <n>` | Frames per second | `30` |
| `--lead-in <ms>` | Hold on slide 1 before narration starts, when slide 1 is silent | `1000` |
| `--outro <ms>` | Hold on the last slide after narration ends | `1000` |
| `-q`, `--quiet` | No progress output | |

It needs a Chromium that encodes H.264 with WebCodecs, such as Chrome or
Chrome for Testing. Set `CHROME_PATH` to choose one.

## Environment variables

| Variable | What it sets |
|---|---|
| `LATTICE_PALETTE` | The palette, below the command line and above the deck's `theme:` |
| `LATTICE_OVERFLOW_MARKER` | The standing `--overflow-marker` level (`reader` or `author`; `off` is per render only) |
| `LATTICE_HOME` | The folder that holds the package store, `<dir>/packages` |
| `CHROME_PATH` | The Chrome or Chromium binary to render with. `PUPPETEER_EXECUTABLE_PATH` wins when both are set |
| `LATTICE_RENDER_WATCHDOG_MS` | How long one render step may take before it is stopped. Default `90000` |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success |
| `1` | A usage error, a missing file, an unknown palette, or a failed render |

## Helper scripts in the repository

These run from a clone of the repository, not from the installed package.

| Command | What it does |
|---|---|
| `npm run lint:deck -- <deck.md …>` | Check decks for authoring mistakes, with no browser. `--strict`, `--fix`, `--json`. Exits `1` on an error, `2` on a usage error |
| `node tools/new-slide.js <layout>` | Print a working skeleton of a layout. `--list` shows them all |
| `npm run export:marp -- <deck.md> <out.zip> [palette]` | Write a self-contained bundle that renders with `marp-cli` |
| `npm run new:theme -- <name>` | Start a new palette: `themes/<name>/<name>.css`, its `<name>-dark.css` twin and their manifests |
