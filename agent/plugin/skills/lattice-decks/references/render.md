# Turn your deck into a PDF

You have a `.md` file. Here is how to see it.

## The quickest route: the Marp kit (nothing to install)

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
Needs Node 22.12 or newer and a Chromium that Puppeteer can find.

## What about `npm install`?

Not yet. The package is not published to the npm registry, so an `npm install`
line would fail on your first attempt. Use one of the three routes above until it is.

## Before you render, check the deck

```sh
node review/check.mjs your-deck.md   # from the kit root
```

It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot
be talked into approving a deck the way a model reviewing its own draft can.
