---
title: Using the command line
description: Render, share and check Lattice decks from a terminal — copy-and-paste recipes for everyday tasks and for the advanced ones.
---

The `lattice` command turns a Markdown deck into a PDF, a PowerPoint, images,
or a web page. This page is a set of recipes: find the task, copy the command,
change the file names. Every flag is listed in the
[CLI reference](/reference/cli/).

The one rule to learn first: **the output file's extension picks the format.**

```sh
npx lattice deck.md deck.pdf
```

Change `deck.pdf` to `deck.pptx` and you get a PowerPoint instead. Everything
else is an option you add after the two file names.

## Before you start

You need **Node 22.12 or newer**. Install Lattice into your project:

```sh
npm install @laticent/lattice
```

Or clone the repository, which also gives you the helper scripts in
[Check a deck before you render it](#check-a-deck-before-you-render-it):

```sh
git clone https://github.com/Laticent/lattice.git
cd lattice
npm install
```

Either way, `npm install` downloads the headless Chromium that Lattice renders
with. The render itself needs no network and no account.

To check it works, ask for the version:

```sh
npx lattice --version
```

## Everyday tasks

### Render a PDF

```sh
npx lattice deck.md deck.pdf
```

The PDF keeps real text: you can select it, search it, and copy from it. The
first render of a session takes longer while Chromium starts.

Every format except `.html` also writes an HTML copy beside the output
(`deck.html` here). You can open it in a browser or delete it.

### Render on another canvas

A deck's `size:` sets its canvas. To render one deck on a different canvas
without editing it, pass `--size`. Try `square`, `portrait`, `story`,
`mobile-landscape` or `4K`:

```sh
npx lattice deck.md square.pdf --size square
npx lattice deck.md story.png --size story
```

### Pick a palette

The deck's front matter usually names its palette (`theme: cuoio`). To render
the same deck in a different palette without editing it, name one on the
command line:

```sh
npx lattice deck.md deck.pdf cuoio
```

The same thing with a named flag, which reads better in scripts:

```sh
npx lattice deck.md -o deck.pdf -p cuoio
```

To see every palette you can name:

```sh
npx lattice packages list --type theme
```

A palette on the command line beats the `LATTICE_PALETTE` environment variable,
which beats the deck's `theme:`. The default is `indaco`.

### Make a PowerPoint

```sh
npx lattice deck.md deck.pptx
```

Each slide becomes one full-bleed image, so the PowerPoint looks exactly like
the PDF. The trade-off is that the text is not editable in PowerPoint.

### Export slides as images

One PNG per slide, numbered `deck.001.png`, `deck.002.png`, and so on:

```sh
npx lattice deck.md deck.png
```

For JPEG or WebP, or for thumbnails and chart files in one download, ask for a
`.zip` image set:

```sh
npx lattice deck.md slides.zip
npx lattice deck.md slides.zip --image-format webp --image-size 1x
npx lattice deck.md slides.zip --image-format jpeg --image-quality 80 --no-svg
```

By default the zip holds full-size PNGs, a `thumbnails/` folder, and an
`assets/` folder with each chart and diagram as its own SVG. There is no loose
`.jpg` or `.webp` output. Asking for `deck.webp` stops with an error that
names the `.zip` command above.

### Print a handout

Print mode draws the deck in black ink on white, and gives chart series
hatching and dot patterns so they still read in grayscale:

```sh
npx lattice deck.md handout.pdf --print
```

To fit each slide onto office paper with a safe margin, add `--paper`. Use
`auto` to let Lattice pick the sheet, or name `letter`, `legal` or `a4`:

```sh
npx lattice deck.md handout.pdf --print --paper a4
npx lattice deck.md handout.pdf --paper letter --orientation portrait
```

`--paper` pages are images, so the text is no longer selectable.

### Present from a PDF

`--present` marks the PDF to open full screen in Acrobat and most desktop
viewers, with a soft fade between slides. You still advance the slides
yourself:

```sh
npx lattice deck.md talk.pdf --present
```

## Sharing a deck

### Send one file that plays anywhere

The player is a single `.html` file with everything inside it. It works
offline, opens with a double-click, and offers three views: Present, Read
Slides and Read Article.

```sh
npx lattice deck.md deck.html --player
```

Send the player, not a plain `.html`. A plain `.html` (and the one written
beside every PDF) keeps any `<script>` or `onerror=` in your deck live, so it
runs in whoever opens it, and the CLI warns when a deck has any. The player
drops both.

Your speaker notes travel with the player so that you can present from it. If
you are sending it to someone else, strip them first:

```sh
npx lattice deck.md deck.html --player --strip-notes
```

The player shows a deck's motion when the deck turns it on. To ship still
slides in a file you forward, add `--no-player-motion`.

To open the player in a set mode, whatever the deck says, add
`--player-mode light`, `dark` or `system`. To give it a spoken voice-over,
add `--narrate`. It uses the same optional voice install as
[a narrated video](#render-a-narrated-video):

```sh
npx lattice deck.md deck.html --player --player-mode dark
npx lattice deck.md deck.html --player --narrate --strip-notes
```

### Publish the deck as an article

`--read` writes the deck as a web article instead of a slide stack: real
headings, paragraphs and lists, with charts and tables as figures. Reader
modes and "summarize this page" tools can read it.

```sh
npx lattice deck.md article.html --read
```

### Make the deck readable on a phone

`--fluid` writes a viewer where each slide fills the screen and reflows to
portrait on a phone. Readers swipe between slides.

```sh
npx lattice deck.md deck.html --fluid
```

If you pass both `--fluid` and `--player`, `--player` wins.

### Keep the source inside the PDF

`--embed-source` attaches the deck's Markdown to the PDF. Anyone with the PDF
can re-render the deck. The source includes your speaker notes, so combine it
with `--strip-notes` if the notes are private:

```sh
npx lattice deck.md deck.pdf --embed-source
npx lattice deck.md deck.pdf --embed-source --strip-notes
```

### Send a PDF or PowerPoint someone can edit

`--reopenable` puts the whole deck inside a `.pdf` or `.pptx` as a `.lattice`
project. Whoever you send it to opens the Studio, picks **Import deck…** in the
deck switcher, and gets the deck back to edit, exactly as you wrote it. It is
the same file the Studio's "Re-openable in Lattice" switch writes, so the two
tools' exports open the same way.

Review comments never go in. Hidden slides do, and so do speaker notes unless
you add `--strip-notes`. A theme or component you installed with
`lattice packages add` travels with the deck.

```sh
npx lattice deck.md deck.pdf --reopenable --strip-notes
npx lattice deck.md deck.pptx --reopenable
```

## Speaker notes and captions

A plain HTML comment on a slide is that slide's speaker note:

```markdown
<!-- Open with the one number that matters. -->
```

Notes ride inside every PDF, hidden. Three switches change that:

```sh
# Write the notes to deck.notes.txt as well
npx lattice deck.md deck.pdf --notes

# Show a clickable note icon on every slide that has one
npx lattice deck.md deck.pdf --notes-icon

# Remove the notes from every copy: the PDF, the HTML and any embedded source
npx lattice deck.md deck.pdf --strip-notes
```

`--captions` writes WebVTT read-along captions: one `deck.vtt` for the whole
deck, plus one `deck.01.vtt` per slide. Each slide reads its own content
unless you wrote a `<!-- say: … -->` for it.

```sh
npx lattice deck.md deck.pdf --captions
```

`--strip-say` removes the spoken lines you wrote yourself (`say:`) and keeps
the generated narration. It also removes the retired `caption:` comments and
`captions:` map, including a comment that starts with `Caption:`, and says so
when it does. It does not touch any other speaker note, and `--strip-notes`
does not touch `say:` lines.

## Check a deck before you render it

These commands run from a clone of the repository.

### Lint the deck

The linter finds authoring mistakes in about a second, with no browser. Each
finding names the slide, says what will go wrong, and shows the fix.

```sh
npm run lint:deck -- deck.md
```

The options, one per line:

```sh
npm run lint:deck -- 'decks/*.md'          # every deck matching a glob (keep the quotes)
npm run lint:deck -- --strict deck.md      # warnings fail too
npm run lint:deck -- --fix deck.md         # apply every automatic fix, in place
npm run lint:deck -- --json deck.md        # machine-readable, for scripts and agents
```

The linter exits with `1` when it finds an error (or any finding, with
`--strict`), so it can guard a CI job or a commit hook.

### Start a slide from a skeleton

`new:slide` prints a working example of any layout, ready to paste into a
deck:

```sh
node tools/new-slide.js --list   # every layout, grouped by what it is for
node tools/new-slide.js kpi      # a kpi slide, printed to the terminal
```

The skeleton starts at the layout comment, so add a `---` line before it when
you append it to a deck:

```sh
{ printf '\n---\n\n'; node tools/new-slide.js kpi; } >> deck.md
```

### Find overflow while you write

A slide with more content than fits is clipped, and the render prints an
`OVERFLOW` warning that names the page. To see the problem marked on the page
itself, render a proof with the author marker:

```sh
npx lattice deck.md proof.pdf --overflow-marker author
```

The marker draws a red ring and an "Overflows" flag on each clipped slide.
The default, `reader`, draws a calm "Content clipped" tag instead, and `off`
draws nothing. The terminal warning prints at every level.

To make `author` your standing default, set `LATTICE_OVERFLOW_MARKER=author`
in your shell.

## Advanced tasks

### Render every deck in a folder

The command renders one deck at a time, so loop in the shell. `-q` keeps the
output to errors only, and Lattice creates the `out/` folder if it is missing:

```sh
for f in decks/*.md; do
  npx lattice "$f" "out/$(basename "${f%.md}").pdf" -q || echo "FAILED: $f"
done
```

### Render one deck in several palettes

```sh
for p in indaco cuoio ardesia; do
  npx lattice deck.md "out/deck-$p.pdf" -p "$p" -q
done
```

### Use a palette for a whole session

Set `LATTICE_PALETTE` once and every render in that shell uses it:

```sh
export LATTICE_PALETTE=cuoio
npx lattice deck.md deck.pdf
```

### Install a theme or component made in the Studio

Themes, components, finishes and motion made in the Studio are **packages**.
Install one once, and any deck can name it:

```sh
npx lattice packages check brand.zip   # test the package without installing it
npx lattice packages add brand.zip     # install it
npx lattice packages list              # everything shipped and installed
```

A theme named after a shipped one installs under a new name, and `add` tells
you which. A package that carries code asks you to approve it during `add`;
`--trust` approves it without asking. Replace an installed package with `--replace`, and remove one by
type and name:

```sh
npx lattice packages add brand.zip --replace
npx lattice packages remove theme/brand
```

To share a package, export it to a zip. This works for shipped packages too:

```sh
npx lattice packages export theme/brand -o brand.zip
```

Packages live in `~/.lattice/packages`. Set `LATTICE_HOME` to move the store,
or pass `--packages <folder>` to use a different store for one run, renders
included:

```sh
npx lattice deck.md deck.pdf --packages ./team-packages
```

### Approve a component that runs code

Some components carry code. Lattice runs that code only after you approve
it, in a browser with no network. A deck that uses an unapproved component
stops with the component's name and the command to approve it:

```sh
npx lattice packages trust component/org-chart     # show the code, then ask
npx lattice packages trust component/org-chart --yes
npx lattice packages untrust component/org-chart
```

If the code changes, Lattice asks again. Run without a terminal, `packages add`
cannot ask, so it installs the package unapproved; approve it afterward with
`trust`.

When Chromium's OS sandbox is off for that code, the approval prompt says so,
with the reason and the fix, and every render repeats that it is off. If
Lattice runs as root, as it often does in a container, the fix is to set
`CHROME_PATH` to a Chromium that an unprivileged user can run. On Ubuntu 23.10
and later, AppArmor stops the sandbox of a browser it has no profile for, such
as the Chrome that puppeteer downloads, even for an ordinary user. There the
fix is an AppArmor profile that lets the browser create user namespaces, or
setting the `kernel.apparmor_restrict_unprivileged_userns` sysctl to 0. Inside a
Docker container, Docker's default seccomp profile is what blocks the sandbox,
whatever the host's AppArmor says: start the container with a seccomp profile
that allows user namespaces.

To write a component that carries code, see
[Writing a code package](/guides/code-packages/).

### Start a plugin

In a clone of the repository, `packages new plugin` scaffolds a plugin in
`lib/plugins/<name>/`: a manifest, a render script, styles, docs and test
fixtures. Then rebuild and run the plugin tests, as the command tells you:

```sh
npx lattice packages new plugin demo-plot
npm run build
npm run test:plugins
```

To write it somewhere else for review, add `--dir`. The plugin lands in
`<dir>/<name>/`:

```sh
npx lattice packages new plugin demo-plot --dir ./review
```

### Render a narrated video

`lattice video` turns a deck into an MP4 with a spoken voice-over and a caption
track, plus a `.vtt` caption file beside it. It voices the deck with Kokoro, the
same on-device voice the Studio uses, so you need no account and no key.

The voice is an optional install. The first video also downloads the voice
model once (about 80 MB):

```sh
npm i --no-save kokoro-js@1.2.1 @breezystack/lamejs@1.2.7
```

Then render:

```sh
npx lattice video deck.md talk.mp4
npx lattice video deck.md talk.mp4 --mode dark --fps 60
npx lattice video deck.md phone.mp4 --size mobile-landscape   # fills a phone held sideways
npx lattice video deck.md talk.mp4 --no-guide --no-captions
```

By default the video follows the narration with the Guide, the focus and
gestures you see in Present mode. `--no-guide` leaves them out.

Already have a narrated export from the Studio (**Share → Webpage**, with
**Include narration audio** turned on)? Pass the `.html` instead, and nothing
is voiced again:

```sh
npx lattice video talk.html talk.mp4 --lead-in 2000 --outro 3000
```

Video needs a Chrome that can encode H.264, such as Chrome for Testing. Point
`CHROME_PATH` at it if Lattice picks the wrong browser.

### Allow web images

By default a render stays off the network. An image or font from a web
address shows as a placeholder, and the run tells you how many it left out.
To fetch them:

```sh
npx lattice deck.md deck.pdf --allow-remote
```

Fetching an image tells its server that someone opened the deck. Local files
and the bundled fonts, diagrams and math always work offline.

### When a PDF viewer shows something wrong

Lattice writes the PDF itself: one photo of each slide's background, with the
words, charts and links drawn on top as real text and shapes. If a viewer
still gets something wrong, try these one at a time:

```sh
# One full-page image per slide. The most compatible, but the text is not selectable.
npx lattice deck.md deck.pdf --raster

# Print with Chrome's own PDF printer instead of Lattice's writer
npx lattice deck.md deck.pdf --chrome-pdf

# Keep SVG images as vectors (they are converted to 2x PNG by default)
npx lattice deck.md deck.pdf --keep-vector-images
```

### A very large deck times out

Each render step has a 90-second watchdog. On slow hardware with a very large
deck, raise it:

```sh
LATTICE_RENDER_WATCHDOG_MS=300000 npx lattice deck.md deck.pdf
```

### Hand a deck to someone who uses Marp

From a clone, `export:marp` writes a self-contained bundle that renders with
the recipient's own `marp-cli`. It bakes the page splits into the Markdown and
includes the themes, fonts and assets:

```sh
npm run export:marp -- deck.md deck-marp.zip
npm run export:marp -- deck.md deck-marp.zip cuoio
```

The export does not render, so it cannot find overflow. Render a PDF first to
check.

## When something goes wrong

| What you see | What to do |
|---|---|
| `error: palette not found: brand` | Check the spelling against `npx lattice packages list --type theme`, or install the theme with `packages add` |
| `error: unsupported output extension` | Use `.pdf`, `.pptx`, `.png`, `.zip` or `.html`. For JPEG or WebP, use a `.zip` with `--image-format` |
| `error: unknown option` | Check the flag in the [CLI reference](/reference/cli/). Flags that take a value accept `--flag value` and `--flag=value` |
| The render says it cannot find a browser | Set `CHROME_PATH` to a Chrome or Chromium on your machine |
| A web image shows as a placeholder | Add `--allow-remote` |
| `OVERFLOW — 1 slide exceed the frame` | The slide holds more than fits. Render with `--overflow-marker author` to see it, then cut or split the content |

## What to read next

- [CLI reference](/reference/cli/) — every flag, variable and exit code.
- [Deck settings](/guides/deck-settings/) — the front-matter keys, including
  `player:`, `read:`, `fluid:` and `present:`, which do the same job as the
  flags on this page.
- [Themes & palettes](/guides/themes/) — the palettes you can name with `-p`.
