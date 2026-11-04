---
status: shipped
summary: An Export-to-Marp bundle carried its front matter twice — the YAML at the top (Marp's) and a baked copy in the trailer (the runtime's) — so an edit after export did nothing for every key Marp does not read, and `class: no-progress` landed only on slides without their own `_class` (Marp's spot-replaces-global rule). Measured every host: marp-cli runs the bundle's engine; Marp for VS Code runs none of our code, its preview can fetch the deck only as last SAVED, and "Export Slide Deck…" can read nothing but what Marp rendered. Owner ruled the semantics (a deck class applies to every slide; a slide overrides with an explicit token, so `with-progress` is added) and the mechanism ("Both"): Lattice keys move into ONE settings block under the front matter, which every host renders live from the buffer; the marp-cli engine also writes the live top, and the VS Code preview re-reads the saved file (VS Code does not re-render on save, so it watches while visible). Lattice folds the block back at the engine's doors and on re-export. Also fixes `marp: true` missing from bundles of decks that had front matter.
---

# A Marp bundle's settings live in one place, and every host reads it live

**Ask:** "it looks like class: no-progress doesn't work in marp … this is a serious failure. we are
not going to sweep it under the rug. no jank. no settling."

## What was wrong

`lib/export/marp-bundle.js` wrote the deck's front matter twice: once at the top, where Marp reads
it, and once as a baked JSON copy in the trailer (`application/lattice-front-matter`), which the
runtime read (2026-07-29-export-to-marp-broken.md §2 recorded the tension and left it: "the front
matter now lives in two places … Not taken."). Two consequences, both measured on marp-cli 4 with a
ten-slide probe deck (two dividers, one slide per `no-*` token):

| edit after export | slides that dropped the rail |
|---|---|
| none (`class: no-progress` exported) | all of them |
| `class: no-progress` added at the top | only the one with no `_class` of its own |

The second row is Marp applying the top `class:` (Marpit: a slide's `_class` REPLACES the global
class) while the runtime read the stale copy. Every other Lattice key (`color-mode:`, `finish:`,
`logo:`, …) edited at the top did nothing at all.

The engine, Studio and Playground were never affected: they apply the deck class additively.

## The rule (owner, 2026-11-03)

"If the front matter says no-progress that applies to all the slides. If we have support for
`_class: progress` and one puts it on a slide it should override the front matter." So a deck class
reaches every slide, and a slide overrides with an explicit token. `progress` is the progress-bar
chart component, so the token is `with-progress`, pairing with `with-pagination`. Because the deck
class is ON every slide, `with-progress` must beat `no-progress` when both are present
(`railShown`, lib/forms/tile/progress/progress.transform.js), and it beats `silent` as
`with-pagination` does.

## What each host can see — measured, not assumed

| host | runs our marp.config engine? | can the runtime read the deck file? |
|---|---|---|
| marp-cli (the bundle's npm scripts / VS Code tasks) | yes | no (`file://`) — but the engine can write the live top into the page |
| Marp for VS Code preview (scripts allowed) | no | yes, `fetch(document.baseURI)` → 200, but the file **as saved**, not the buffer |
| Marp for VS Code "Export Slide Deck…" | no — it writes its own `.marp-vscode-cli-conf-*.json` | no — marp-cli saves a temp HTML in the OS temp dir and opens it over `file://`, no extra flags |

Sources: VS Code 1.144.1 + Marp for VS Code 3.6.1 desktop under xvfb (the harness in
`engineering/gotchas/vscode.md`), marp-vscode's `lib/extension.js` (`createConfigFile`,
`marpCoreOptionForCLI`), marp-cli 4's `saveTmpFile`. An unsaved edit adding `class: no-progress` at
the top of a bundle in the real preview reproduced the owner's report exactly.

So: the deck **body** is the only channel every host renders live from the open buffer.

## The design (owner chose "Both")

1. **One home per key.** The exporter (`withBundleFrontMatter`, lib/export/bundle-front-matter.js)
   splits the front matter: keys Marp consumes (`MARP_FRONT_MATTER_KEYS`) stay on top, every other
   key — `class:` included — moves into a raw-YAML settings block directly under it:

   ```
   ---
   marp: true
   theme: indaco
   ---
   <script type="application/lattice-settings">
   class: no-progress
   color-mode: dark
   </script>
   ```

   No trailer copy. `class:` moves so that it reaches every slide in every host; on top, Marp would
   drop it on `_class` slides. A key whose text could end its `<script>` early (`</`, `<!--`,
   `<script`) stays on top.
2. **marp-cli** re-emits the block as a JSON-escaped data block (never the markup a person typed)
   and still writes the live top front matter into the trailer, so a `class:` someone typed at the
   top lands there too.
3. **The runtime** merges the top (where visible) with the block: the block wins a shared key,
   `class` is the union (`mergeFrontMatter`). A host that re-renders (Marp for VS Code, on every
   edit) writes a fresh block, and the runtime resolves the deck's settings again
   (`refreshDeckFrontMatterIfRewritten`).
4. **The VS Code preview backstop:** the preview reads the saved deck (`readDeckText`), and because
   VS Code does **not** re-render the preview on save (measured: the save landed, the preview did
   not change), it re-reads the file about once a second while visible, then swaps the deck-wide
   classes on the slides on screen — taking back only the tokens the runtime itself added
   (`deckStamped`), never a slide's own.
5. **The rail reconciles** instead of only injecting, so a class that lands after first paint takes
   the rail with it (and back).
6. **Back into Lattice:** `foldSettingsBlock` at the engine's three doors (render, geometry,
   paneOrientations), in lint (`lintTextWith`, and `fixLineIndex` for fixes), and first thing on
   re-export. The fold keeps EVERY line on its number, front matter included: the seam becomes YAML
   comments and `</script>` the closing fence, and a key the top shares with the block is commented
   out at the top. So a lint finding on a block key, and the fix that edits it by line, land where
   the author sees it. Re-export uses the compact merged form and is byte-identical.

## Verified

- marp-cli HTML: untouched export; `class: no-progress` added in the block; added at the top; a
  `with-progress` slide under a deck-wide off — every slide right in each case.
- Real VS Code preview: unsaved edit in the block → all ten slides right, live. Edit at the top →
  slides with no `_class` at once (Marp), the rest within ~1 s of saving. Deleting a saved top class
  then saving → the rail returns on every slide, including the one Marp had stamped. 3/3 clean runs.
- Engine CLI renders an exported bundle's deck identically to the source (fold).

**A harness trap worth keeping:** four early VS Code runs looked like the runtime breaking VS Code's
patch of the preview. All four had TWO preview frames: VS Code restored a stale preview tab from
`User/globalStorage/storage.json`, and the probe read it. Clearing that file gave one frame and 3/3
correct runs. Count the frames before believing a VS Code result.

## What the maker-checker pass found, and what changed

An independent checker reviewed the diff and confirmed five defects; all are fixed in this change:

| finding | fix |
|---|---|
| The in-browser exporter's test sliced from the old trailer marker, so it went red and its second half passed vacuously | repointed at the settings block, with the block's presence asserted first |
| Runtime provenance lived in a side table, so a host that patched a slide IN PLACE could leave a record naming a token the slide now wrote itself; a later restamp removed the author's token | the record lives ON the slide (`data-lattice-deck-tokens`), so the host's attribute rewrite erases it with the class list it describes. Clearing the whole table on re-render was tried first and failed the other way: slides the host did not touch could never lose their stamped token |
| A column-0 comment inside a nested map split the map across the top and the block, breaking Marp's YAML | blank and comment lines wait for the next real line; indented ⇒ still inside the key |
| `class: >-` leaked `>-` as a class token; `'a#b'` lost its `#b` | the token reader follows YAML's comment and block-scalar rules |
| Lint never saw a bundle's block (a regression: before, its keys were on top) | lint folds the block, line for line; fixes locate on the folded text |

## What this does not cover

- VS Code's **Strict** preview level runs no scripts at all, so nothing the runtime draws (the rail
  included) exists there; the block sits in slide 1 as an invisible `<script>`. Unchanged.
- VS Code in **Restricted Mode** prints raw HTML as text, which now includes the settings block on
  slide 1 (it already printed the runtime tags on the last slide). The README's step 2 (trust the
  folder) is the remedy, as before.
- A `class:` typed at the **top** and exported with VS Code's own Export command is not seen: that
  command reads only the block, which is where the README sends deck settings.
- The VS Code save-watcher re-stamps the deck-wide CLASS registers (`class:`, `color-mode:`,
  `finish:`, `mode:`, …). A `logo:`, `meta:` or `marks:` typed at the top instead of in the block
  lands on the next edit, when VS Code re-renders. In the block, every key is live as typed.
