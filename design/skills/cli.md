# Skill — Render, share and check a deck with the `lattice` CLI

> Turn a finished `.md` deck into the artifact someone asked for — a PDF, a
> PowerPoint, images, a shareable player, a handout — with the right command
> the first time, and prove it rendered clean before you hand it over.

**Read this when** you are asked to render, export, print, share or package a
Lattice deck from a terminal, or to script those steps. **You'll produce** one
or more output files from a deck, plus the evidence that each is clean (a quiet
render, a clean lint, and a look at the result).

This skill does not teach you to write the deck. For that, read `deck.md`.

---

## The 10/10 bar

A 10/10 export is one where the recipient gets exactly what they need and
nothing they should not have:

| The recipient needs… | 10/10 | Falls short |
|---|---|---|
| to read or forward it | a vector `.pdf` with selectable text | a `--raster` PDF when no viewer asked for one |
| to present it | `--present` PDF, or a `--player` `.html` | a PowerPoint when they never open PowerPoint |
| to print it | `--print`, plus `--paper` for office paper | the screen palette, which wastes ink and loses series in grayscale |
| to receive it from you | `--strip-notes` on anything that leaves your hands | your speaker notes riding in the file |
| images for a site or doc | a `.zip` image set in the format they asked for | loose PNGs renamed to `.jpg` |

And a 10/10 run is **quiet**: no `OVERFLOW` warning, no placeholder count from a
blocked web image, no "palette not found". A render that exits 0 while it warns
is not done.

## Mental model

- **One command, one deck, one output.** `lattice <deck.md> <output>`. There is
  no batch mode; loop in the shell.
- **The output extension picks the format** — `.pdf`, `.pptx`, `.png`, `.zip`,
  `.html`. Nothing else chooses it. An unknown extension (`.webp`, `.jpg`) is
  refused, never guessed.
- **Every format is the same render.** Lattice lays the deck out once in
  headless Chromium, then writes that layout as a PDF, a PowerPoint of slide
  images, PNGs or HTML. So a PowerPoint looks exactly like the PDF, and its text
  is not editable.
- **Every format except `.html` also writes `<output>.html`.** Expect the extra
  file; delete it if nobody needs it.
- **Flags and front matter do the same jobs.** `--player` is `player: true`,
  `--print` is `color-mode: print`, `--present` is `present: true`. A flag is for
  this one render; a front-matter key is for every render of the deck.
- **The render is offline by default.** A web image becomes a placeholder until
  you pass `--allow-remote`.

## Where it lives

| What | Where |
|---|---|
| The command | `npx lattice` — the `bin` of `@laticent/lattice` (`npm install @laticent/lattice`) |
| Its full option list | `npx lattice --help` |
| Package store | `$LATTICE_HOME/packages`, else `~/.lattice/packages` |
| The linter (clone only) | `npm run lint:deck -- <deck.md>` |
| Layout skeletons (clone only) | `node tools/new-slide.js <layout>` · `--list` |
| Marp hand-off (clone only) | `npm run export:marp -- <deck.md> <out.zip>` |
| The agent kit's checker (no clone) | `node review/check.mjs deck.md` |

Node 22.12 or newer. `npm install` downloads the Chromium the render uses. If a
render says it cannot find a browser, set `CHROME_PATH`.

## Recipe

1. **Lint first, when you can.** From a clone: `npm run lint:deck -- deck.md`.
   From the agent kit: `node review/check.mjs deck.md`. Fix every error. The
   linter runs in about a second, while a render takes tens of seconds, so this
   is the cheap place to catch a mistake.
2. **Pick the output from what the recipient will do with it.** Use the table in
   the 10/10 bar. When nobody said, render a `.pdf`.
3. **Pick the palette.** The deck's `theme:` applies unless you override it with
   `-p <name>`. Check a name with `npx lattice packages list --type theme`.
4. **Render.** Copy the matching line from the contract below.
5. **Read the whole terminal output.** Treat each of these as a failure even when
   the exit code is 0:
   - `OVERFLOW — N slide exceed the frame` — content is clipped. Cut or split the
     slide and render again. Render with `--overflow-marker author` to see which
     part is lost.
   - a count of remote images left out — pass `--allow-remote`, or use a local
     file.
   - `WARNING: --strip-notes left N comment(s)` — speaker text may still be in
     the embedded source. Find the comment and fix it before you send the file.
6. **Look at the result.** Open the PDF or a PNG of a slide and check it. A
   clean exit proves the render finished, not that it is right.
7. **Strip before you share.** Anything that leaves the author's hands gets
   `--strip-notes`, and `--strip-captions` too if the captions are private.

## The contract — copy, then change the names

```sh
# Everyday
npx lattice deck.md deck.pdf                        # vector PDF
npx lattice deck.md deck.pdf cuoio                  # same, in another palette
npx lattice deck.md -o deck.pdf -p cuoio            # same, with named flags
npx lattice deck.md deck.pptx                       # PowerPoint, one image per slide
npx lattice deck.md deck.png                        # deck.001.png, deck.002.png, …
npx lattice deck.md talk.pdf --present              # opens full screen

# Print
npx lattice deck.md handout.pdf --print             # ink on white, textured series
npx lattice deck.md handout.pdf --print --paper a4  # fit to paper (letter|legal|a4|auto)

# Share
npx lattice deck.md deck.html --player --strip-notes    # one offline file, three views
npx lattice deck.md deck.html --player --no-player-motion
npx lattice deck.md article.html --read                 # the deck as a web article
npx lattice deck.md deck.html --fluid                   # phone-friendly viewer
npx lattice deck.md deck.pdf --embed-source --strip-notes

# Images
npx lattice deck.md slides.zip                                  # PNG + thumbnails + chart SVGs
npx lattice deck.md slides.zip --image-format webp --image-size 1x
npx lattice deck.md slides.zip --image-format jpeg --image-quality 80 --no-svg
npx lattice deck.md slides.zip --image-mode dark --svg-background print

# Notes and captions
npx lattice deck.md deck.pdf --notes                # + deck.notes.txt
npx lattice deck.md deck.pdf --notes-icon           # visible note icons
npx lattice deck.md deck.pdf --captions             # + deck.vtt and deck.NN.vtt

# Checking
npx lattice deck.md proof.pdf --overflow-marker author
npm run lint:deck -- deck.md
npm run lint:deck -- --json deck.md                 # for a script or an agent
npm run lint:deck -- --fix deck.md                  # apply automatic fixes in place

# Many decks, or many palettes
for f in decks/*.md; do npx lattice "$f" "out/$(basename "${f%.md}").pdf" -q || echo "FAILED: $f"; done
for p in indaco cuoio ardesia; do npx lattice deck.md "out/deck-$p.pdf" -p "$p" -q; done

# Packages made in the Studio
npx lattice packages check brand.zip
npx lattice packages add brand.zip
npx lattice packages list --type theme
npx lattice packages export theme/brand -o brand.zip
npx lattice packages remove theme/brand
npx lattice packages trust component/org-chart
npx lattice deck.md deck.pdf --packages ./team-packages

# Video from a narrated Studio export (Share → Webpage, with narration audio)
npx lattice video talk.html talk.mp4 --fps 30

# Viewer trouble
npx lattice deck.md deck.pdf --raster               # image pages, maximum compatibility
npx lattice deck.md deck.pdf --chrome-pdf           # Chrome's printer instead of Lattice's
npx lattice deck.md deck.pdf --keep-vector-images
LATTICE_RENDER_WATCHDOG_MS=300000 npx lattice big.md big.pdf
```

Palette precedence, highest first: the command line (`-p` or the positional
palette), then `LATTICE_PALETTE`, then the deck's `theme:`, then `indaco`.

## What good looks like / What bad looks like

**Good** — a client deck, sent by email:

```sh
npm run lint:deck -- q3-review.md
npx lattice q3-review.md q3-review.pdf --strip-notes
```

The lint is clean, the render prints no warning, and the PDF has selectable text
and no notes.

**Bad** — the same request:

```sh
npx lattice q3-review.md q3-review.pdf --raster --embed-source
```

The text is no longer selectable, for no reason anyone gave. The Markdown source
rides inside the PDF with every speaker note in it. And nothing was checked.

**Good** — images for a web page:

```sh
npx lattice deck.md slides.zip --image-format webp --image-size 1x --no-svg
```

**Bad** — `npx lattice deck.md slides.webp`. It is refused, because a loose
`.webp` is not a format. The `.zip` route above is the one that exists.

## Ship checklist

- [ ] The lint is clean (`npm run lint:deck`, or `review/check.mjs` from the kit).
- [ ] The render printed no `OVERFLOW`, placeholder or palette warning.
- [ ] The output format matches what the recipient will do with it.
- [ ] Anything that leaves the author's hands carries `--strip-notes`.
- [ ] `--embed-source` appears only when someone asked for the source.
- [ ] You opened the result and looked at it.
- [ ] You told the person which file is the deliverable, and whether the `.html`
      sidecar matters.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Naming a format by extension that is not one (`out.webp`, `out.jpg`) | The run is refused | `out.zip --image-format webp` |
| Forgetting that each render writes `<output>.html` | Stray files in the output folder | Expect it, or render `.html` on purpose |
| Sharing a player or PDF without `--strip-notes` | Speaker notes reach the recipient | Add `--strip-notes` to anything you send |
| Adding `--embed-source` to "be helpful" | The whole source, notes included, ships in the PDF | Add it only on request, with `--strip-notes` |
| Passing `-p` to fix a typo in the deck's `theme:` | This render is right; the next one is not | Fix `theme:` in the deck |
| Treating exit 0 as "done" | A clipped slide ships with a "Content clipped" tag | Read the output; fix every `OVERFLOW` |
| Reaching for `--raster` or `--paper` by default | Text stops being selectable | Use them only for a viewer that needs it, or for paper |
| Expecting a web image to load | It renders as a placeholder | `--allow-remote`, or a local copy |
| Passing a value to a boolean switch (`--print true`) | `true` is read as a palette name and the run fails | Boolean switches take no value |
| Rendering a batch with no failure report | A failure scrolls past unseen | `-q`, plus an `echo` on failure, as in the loop above |

## Canonical sources

- `npx lattice --help` — the command's own list, printed from the code that
  parses it. When this skill and the help disagree, the help wins.
- The docs site: **Using the command line** (`/guides/cli/`) and **CLI
  reference** (`/reference/cli/`).
- `engineering/pipeline.md` — how the render pipeline works inside.
- `lib/base/base.registers.docs.md` — the front-matter keys that match the flags.
- `design/skills/deck.md` — writing the deck this skill renders.
