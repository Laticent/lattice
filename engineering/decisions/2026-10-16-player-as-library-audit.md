---
status: in-progress
summary: Audit of the exported HTML player as a candidate standalone library. The player already does more than most HTML-export tools (hash-pinned CSP, a CSS prune checked against computed styles, a no-JavaScript floor, axe-clean landmarks, a re-openable source envelope), but its input is the Lattice engine's own DOM and about 20 Lattice modules. Measured on the 120-slide gallery: 2.74 MB, of which about 21% is repeated asset bytes, and two runs differ in one timestamp. Proposes splitting it into a generic packer (one safe, deterministic, readable file from any HTML document) and a slide player on top, with Lattice as the first producer, a conformance kind that proves both, and four owner forks.
---

# The player as a library: audit and proposal (2026-10-16)

**Status: in progress.** The owner ruled every fork on 2026-10-16 (§7). Phase 0 (§8) ships in
#2728; the assembler's first step is host parity.

## 1. The answer first

The player should become a library, and it should be **two packages, not one**:

1. **A packer.** It takes any HTML document plus its assets and returns one sealed file.
   The file has its CSS shaken to what the document uses, every asset baked in once,
   fonts subset, a content-security policy (CSP: the browser rule that says what the page
   may load) pinned by hash, remote resources gated behind the viewer's consent, the same
   bytes for the same input, and a structure a reader or screen reader can follow. None
   of that is about slides.
2. **A slide player** on top of the packer. It owns views (Present, Slides, Article),
   transport (keyboard, wheel, touch), the no-JavaScript floor, notes, captions, print and
   deep links. Its input is a neutral *slide document*, not the Lattice engine's DOM.

Lattice becomes the first producer: an adapter turns a rendered deck into a slide document
and plugs its own extensions (Guide, Anima motion, collage lightbox, code copy) into the
player. The rest of this note is the evidence for that split and what each layer is missing.

## 2. What the player is today

`assemblePlayer(data, caps)` (`lib/export/player-core.mjs:3080`, 3,437 lines) is a pure
assembler: it makes no DOM or filesystem calls of its own, and each host injects
`caps.{parseHtml, sanitize, sha256, inlineAssets, katexCss, subsetFonts}`. Three hosts
call it:

- **The CLI.** `lattice.js:4816-4908` calls `buildPlayerHtml` (`lib/export/html-player.js:112`;
  jsdom, DOMPurify, `subset-font`), then prunes in Chromium (`prunePlayerCssInPage`,
  `lattice.js:5091`).
- **The Studio.** `shareHtmlPlayer` (`docs/src/components/studio/share-export.ts:379`) calls
  the bundled copy, then `prunePlayerInBrowser`.
- **The video export.** `lib/export/video-cli.mjs:145` runs the CLI with `--player --narrate`
  and drives `window.__lpRender`.

That injection seam is the right shape for a library: it is how Calco works
(`2026-10-06-calco-office-export-library.md` §4). What is not library-shaped is everything
on either side of it:

- **The input is Lattice's.** `data.docHtml` is the engine's whole rendered document;
  `section[data-lattice-slide]` appears 18 times in `player-core.mjs`. `data.source` is the
  Lattice markdown, which the core re-reads for `pace:`, `delivery:`, `motion:` and
  `color-mode:`. Notes are `aside.lattice-notes`, and the envelope is the `lattice` format
  (`lib/core/lattice-doc.js:93`).
- **The core imports about 20 Lattice modules.** Static imports include `lattice-doc`,
  `resolve-color-mode`, `resolve-delivery` (and three delivery styles), `resolve-motion`,
  `resolve-pace`, `sanitize-style-text` and `slide-frame`, plus two generated bundles (Anima,
  Guide). Dynamic imports include `present-transport`, `@laticent/ltt`, `resolve-bookends`,
  the collage and code-copy kernels, and `prose-projection`, which pulls in the generated
  component catalog.
- **The CSS is Lattice's.** The chrome reads `--accent`, `--bg`, `--border` and the
  `--text-*` tokens.

## 3. Measured: the gallery deck as a player

The gallery deck is `test/integration/baseline-decks/gallery.md`, 120 slides, exported
twice with `node lattice.js … --player`. Each run took 82–109 s.

| What | Bytes | Note |
|---|---|---|
| Whole file | 2,742,199 | gzip 781,821, but a file opened from disk or an attachment is not gzipped |
| Inlined `data:` URIs | 1,142,437 | 54 URIs, **only 19 distinct** |
| …of which repeated | **577,670** | 21% of the file |
| Dual-mode (dark) block | 447,488 | never pruned; 892 rules, 116 distinct bodies, 259,031 bytes of selectors |
| …saved by merging adjacent identical rules | 26,976 | 1% of the file; merging rules that are far apart is not safe (below) |
| Deck sheet after prune | 250,772 | the CLI reports `1202/4460 rules kept, 777 KB saved` |
| Fonts after prune | 442,048 | `18/37 faces kept, 395 KB saved` |
| Script blocks | 139,971 | the player's script is 33,455; the inert source envelope is 106,500 |

Three findings came only from the measurement:

1. **The same font file is embedded once per weight.** `assets/fonts/` holds 17 `.woff2`
   files, and 10 of them are copies of 4 distinct files: Outfit 300/500/600 are one
   variable font, and so on. The player emits one `@font-face` per weight, each with the
   whole file. One face with a weight range (`font-weight: 300 700`) carries the same font
   once. The waste is in the source assets, so it also reaches the PDF and Studio paths
   (not measured there).
2. **A reused photo is embedded once per slide.** One 103,691-byte JPEG appears 4 times
   as an inline `background-image` on four slides. Hoisting each asset into one
   custom property (`--lp-asset-7: url(data:…)`) and referencing it keeps the
   no-JavaScript floor working and stores it once.
3. **Two runs are not byte-identical** (fixed in phase 0, commit `6aa6c98`). The only
   difference was `generatedAt` in the envelope: the CLI passed `now: Date.now()`, while
   the PDF path honors `SOURCE_DATE_EPOCH` (`lib/core/pdf-timestamps.js:102`). The golden test pins
   `now: 0` (`test/unit/export/html-player.test.js:1443`), so it cannot see this.

Taken together, about 21% of a large export is repeated asset bytes, and the fixes are
mechanical.

**The dark block is not a mechanical fix.** Its 892 rules carry only 116 distinct bodies,
because `hoistInlineLightDark` and `themeDualMode` write each body under up to eight scope
prefixes (the viewer's dark choice, the no-JavaScript flip, the pinned-light restores). Merging
two identical rules that are far apart moves one of them past the rules in between, and that
changes which rule wins wherever an element matches both. Merging only adjacent rules is
safe, and it saves 27 KB. The real lever is the 259 KB of repeated selector prefixes, and
shortening those means CSS nesting or a different scheme switch. Both touch the
no-JavaScript floor on older engines, so the dark block goes to the packer work (phase 2),
where the computed-style gate can prove a merge. Each changes exported bytes, so it needs the owner's dark- and light-mode
sign-off (Quality Bar).

## 4. The owner's five priorities, audited

### 4.1 CSS tree-shaking

**State.** `lib/export/player-prune.js` parses with css-tree and strips each selector to its
static base. The host runs `querySelector` for each base in Chromium across the three views,
then compares computed styles (`GATE_PROPS`, `:30`) for every element and `::before`/`::after`
with the full sheet and the pruned one. Any difference ships the full sheet. Keeping a rule
whenever in doubt makes the prune safe; the computed-style gate makes it verified. That
puts it ahead of PurgeCSS, which matches class names in text and verifies nothing.

**Gaps.**

- **Scope.** Only the single largest `<style>` of 50,000 characters or more is pruned
  (`lattice.js:5112`). The dark block, the player chrome and KaTeX never are, and the dark
  block is now larger than the pruned deck sheet.
- **Kinds of CSS.** Unused custom properties and unused `@keyframes` are never dropped,
  and identical declaration bodies are never merged (§3: 27 KB of adjacent repeats, 259 KB of repeated selector prefixes).
- **States the gate never enters.** The gate runs in the scheme that was baked, in one
  viewport, and does not open notes, play narration, enter hover or focus, or emulate print.
- **Classes JavaScript adds.** A class runtime JavaScript adds later is invisible to the
  gate. That is why `PLAYER_PRUNE_SAFELIST` (`:88`) exists, and every entry in it was a bug
  first: `.anima-live` collapsed live charts to 300×150, and code-copy buttons lost their
  styles. A one-colon `:before` once dropped every pseudo-element rule (#2366).
- **Determinism.** The kept set depends on the Chromium build and on `document.fonts`
  load timing.

**Library move.** Prune every sheet, the dark block included. Make the safelist a
*declaration each extension owes*: an extension lists the classes and attributes it adds
at runtime, and the packer keeps them. Then a missing entry is a conformance failure, not
a bug a reader finds. Run the gate over a declared state matrix (scheme × view × viewport
× notes × print × `:hover`/`:focus` forced through CDP, the Chrome DevTools Protocol).
Offer two tiers: a **static** matcher (no browser, deterministic, fast) for producers
without Chromium, and the **browser gate** as verification. A producer that can run the
gate gets the verified result; one that cannot gets a conservative one.

### 4.2 Baking in images and media

**State.** The CLI's `inlineFileUrls` (`html-player.js:70`) bakes `file://` images and CSS
`url()` as raw base64, deduped by URL only. The Studio's `inlineUrlMedia`
(`inline-url-media.mjs:132`) fetches its own origin (others only behind an author switch),
with limits: 48 MB total, 200 pictures, 8 MB each, 20 s timeout.

**Gaps.**

- **Duplicates.** Nothing dedupes by content hash or across slides (§3).
- **Encoding.** Nothing resizes an image to its largest displayed size, re-encodes
  (AVIF/WebP with a JPEG fallback), or keeps `srcset`, which is dropped (`:22`).
- **Media.** Video and audio files are never embedded.
- **Size.** No size budget or "too big to email" warning exists; the 2026-07-07 note asked
  for one at about 10 MB.
- **Security.** The CLI reads **any local path** a deck names. `html-player.js:63` flags
  this: a server-side bake of an untrusted deck could read `file:///etc/passwd` into the
  output. A library run by strangers on untrusted input must default to an asset-root
  allowlist.

### 4.3 External resources and viewer consent

**State.** The player's CSP (`player-core.mjs:3344`) is
`default-src 'none'; script-src 'sha256-…'; style-src 'unsafe-inline'; img-src data:; font-src data:; …`.
The hash pins scripts only; styles are inline and unpinned. It makes
zero remote requests, measured (`2026-09-01-export-remote-subresource-posture.md`). A web
image is baked at export or drawn as a hatch placeholder (`remote-ref.js:527`). **There is
no viewer-side prompt.** The CSP makes one impossible by design: a `<meta>` CSP can only be
tightened at runtime, never loosened.

**Library move: a consent mode the author opts into.**

1. **The author declares origins.** At pack time the author lists the origins a document
   may reach, and the packer writes exactly those into `img-src` / `media-src` /
   `frame-src` (the ceiling).
2. **Nothing loads until the reader says yes.** Every remote element ships inert, as a
   placeholder with the URL in a data attribute. A banner names each origin and what it
   would load; "Allow" swaps the real URL in. That is the gate.
3. **No JavaScript means no load.** Without script nothing loads, and each placeholder
   carries a plain link to open the resource in a new tab.
4. **Embeds are sandboxed.** A third-party embed is a sandboxed `<iframe>`, never markup
   in the page.

The default stays what ships today, zero remote. One honest limit: consent cannot persist
reliably for a file opened from disk, so it is asked each time the file is opened.

*As shipped (§11.4):* the policy grants `connect-src` for the declared origins and never `img-src`,
the script fetches each picture after consent, and the per-picture links sit in the banner rather
than on each placeholder.

**Also found.** Under `--allow-remote` the CLI probably ships remote `<img>` URLs that its
own CSP then blocks: a broken image rather than a placeholder. This is inferred from the
code, not run. Two comments contradict the source about the CSP (`inline-url-media.mjs:8`
says `img-src data: blob:`; the source says `data:`).

### 4.4 No JavaScript

**State.** Strong. Hidden radios and `html:has(...)` drive Present as a scroll-snap strip,
the light/dark flip and the view switch; an engine without `:has()` gets the stacked column
(`2026-09-29-player-no-js-controls.md`). `test/integration/export/player-no-js.test.js`
passes 7/7 in Chromium and WebKit.

**Gaps.** Slides carry `id`s already (`id="1"`), but nothing reads the URL hash, so there
is no deep link or `:target` navigation, no `<noscript>` note, and no designed print sheet. The player's CSS has one
`@media print` rule and no `@page`, and `lib/core/print-sheet.mjs` serves only the PDF path.

### 4.5 A structure readers can read

**State.** `lang`, `<title>`, `header`/`main`/`nav[aria-label]`/`article` landmarks, an
`aria-live` slide counter, named chart SVGs, and reduced motion. The axe gate
(`test/integration/invariants/axe-a11y.test.js`) runs with a zero budget, and the
Article view is a real prose projection.

**Gaps.**

- **Metadata.** Only `charset`, `viewport`, the CSP and `title` ship: no
  `<meta name="description">`, no OpenGraph tags, no JSON-LD.
- **Contrast modes.** No `forced-colors` or `prefers-contrast` handling exists anywhere in
  `lib/`.
- **Language.** There is no `dir`/RTL support, and the chrome strings are English literals.
- **Order.** The slides and the Article are two copies of the content. A reader-mode
  extractor or search engine sees whichever comes first; `#lp-doc` ships `hidden` to steer
  this.

## 5. What else a library like this needs (the ones not on the list)

| Capability | State | Why it matters for a library |
|---|---|---|
| **Byte-identical output** | Partial: the CLI clock is pinned (phase 0); the prune depends on the browser build, and the Studio prunes in the author's own browser | The owner's "deterministic" goal; a library needs a reproducibility test like `pdf-reproducible.test.js` |
| **Deep links per slide** | Absent (no `location.hash` or `history`), though slides already carry `id`s | Sharing "slide 12" is the most common thing a reader does |
| **Size budget and report** | Absent | A packer should print a breakdown (CSS / fonts / images / script, repeated bytes) and warn past a budget |
| **Studio parity** | The Studio never subsets fonts (`share-export.ts:377`) | Two hosts produce different files from one deck; a library has one pipeline |
| **Extension contract** | Implicit: hand safelist, inline bundles | Guide, Anima, lightbox and code copy become plugins that declare their script hash, CSS, runtime classes and a no-JS fallback |
| **Lazy decode for big files** | Absent | All `data:` URIs parse up front; `content-visibility: auto` and decode-on-view keep a 50 MB deck responsive |
| **Provenance** | Partial: an unsigned `build`/`playerVersion` | An optional signature over the envelope lets a recipient know the file is what the author sent |
| **Media embedding** | Absent for video and audio | Narration audio already rides as inert blocks; author video does not |
| **Contrast modes, RTL, localized chrome** | Absent | General users need them even where Lattice decks have not |
| **Embedded source** | Present (envelope; `2026-10-05-reopenable-exports.md`) | Keep it, but as a generic "payload" slot the producer defines |
| **A second producer** | None | Without one, "library" is a claim. A Marp or reveal.js HTML fixture proves the slide-document contract is neutral |

## 6. The shape

```
@laticent/<packer>   any HTML + assets  →  one sealed file
  prune (static | browser-verified) · asset store (content-hashed, once)
  fonts (subset, variable-face collapse) · images (resize, re-encode)
  CSP (hash-pinned) · consent mode · determinism (epoch) · size report

@laticent/<player>   slide document  →  packer input
  views · transport (present-transport kernel) · no-JS floor · notes
  captions (LTT) · print sheet · deep links · a11y chrome · extension API

Lattice adapter      rendered deck  →  slide document + extensions
  Guide · Anima · collage lightbox · code copy · delivery / pace / motion
  registers · prose projection (Article) · lattice envelope
```

**Names.** By the sibling brand system (`2026-07-18-sibling-brand-system.md`), Italian
working names: **Plico** for the packer (a sealed packet you hand someone) and
**Sipario** for the player (the stage curtain). Both are placeholders until the owner
rules.

**Kernels that stay shared.** `present-transport.mjs` (HARD RULE #1) and
`sanitize-style-text.mjs` (#22) serve Present and the Studio too. They move *into* the
player and packer, and Lattice imports them back, so one source of truth survives. The
HARD RULE #22 sink allowlists (`checkDocumentStyleSinks`, `checkCssTreeRewrapSinks`)
move with them.

**A harness like the conformance one.** The conformance harness
(`2026-10-15-conformance-harness.md`; `lib/conformance/`) is a contract, a runner and a
debt ledger, today with one kind and a `static` tier only. It fits as two layers:

- **Library-local tests** (the Calco and Fuoco pattern), run over a fixture corpus that
  includes a non-Lattice producer.
- **A `packed-document` conformance kind.**
  - *Static clauses that can land now:* every adapter supplies every `caps` key; every
    engine-emitted attribute survives the sanitizer; every extension declares its runtime
    classes; no asset appears twice; the same input and epoch give the same SHA.
  - *Rendered clauses that wait for the `render` tier* (phase 2, owner-ordered before
    phase 3): zero network requests, a zero computed-style diff across the whole state
    matrix, the no-JS floor shows every slide's text, axe at zero, and the file opens
    back to its source.

## 6a. What a generic player would mean

The owner asked what "generic" would mean here, whether it is a set of shells to fill, and
which other domains would use it. The answer is yes: shells.

**The idea in one line.** The player is a frame around a *sequence of fixed-size pages*. It
owns a fixed set of named regions (the shells), and a producer fills them with ordinary
HTML. The player never knows what is inside a page.

**The shells.**

| Shell | What the producer puts in it | What the player does with it |
|---|---|---|
| `header` | a title, a brand mark | the top bar |
| `toc` | optional; the player builds it from each frame's title when left empty | the slide list, and deep links (`#intro`) |
| `stage` | the frames: one `<section>` per page, at a declared size (1280×720) | fits a frame to any screen; Present, the Slides strip, keyboard, wheel, swipe, the no-JavaScript strip |
| `notes` | an `<aside>` inside a frame | the notes panel |
| `captions` | an optional timed track (LTT or WebVTT) and audio | the caption band, narration |
| `article` | an optional flowing version of the same content | the Article view, reader mode, search engines |

**The input is plain HTML with a few attributes**, which is the owner's "neutral HTML"
instinct. A file like this already reads properly with no player at all, so the player
only adds to it:

```html
<html lang="en">
<head><title>Q3 review</title><style>/* the producer's CSS */</style></head>
<body data-frame-size="1280x720">
  <header>Q3 review</header>
  <main>
    <section data-frame id="intro" data-title="Where we stand">
      <h1>Revenue up 12%</h1>
      <aside data-notes>Pause here for questions.</aside>
    </section>
    <section data-frame id="risks" data-title="Risks">…</section>
  </main>
  <article data-reading>…</article>
</body>
</html>
```

Lattice's adapter does little more than rename. `section[data-lattice-slide]` becomes
`section[data-frame]` and `aside.lattice-notes` becomes `aside[data-notes]`. Lattice's prose
projection fills `article`. Guide, Anima, the collage lightbox and code copy plug in as
extensions. The player's chrome gets its own small token set (`--player-accent`,
`--player-bg`, …) that a producer maps to its theme, in place of reading Lattice's `--accent`
directly.

**What stays Lattice's.** Everything that *decides* what a frame looks like or says:
components, themes, delivery styles, pace, motion registers, the prose projection, the Guide
and the `lattice` envelope. The player decides only how a sequence of finished frames is
shown, navigated, narrated and printed.

**Domains, besides Lattice.** Anything that is a sequence of fixed pages someone reads alone
or has walked through:

- **Other slide tools.** Marp, reveal.js, Slidev, Quarto or Pandoc slides as one offline
  handout file with notes and a reading view, which none of them ships today.
- **Training and onboarding.** Narrated, captioned step-by-step modules that open from an
  email attachment, without an LMS (a learning-management system) or a video file.
- **Comics, picture books and storyboards.** Fixed pages, page turns, alt text and a
  reading order.
- **Board packs and reports.** Fixed pages to present, plus a flowing version to read.
- **Data stories.** One chart per frame, with narration.
- **Portfolios and design reviews.** One mockup per frame, with notes for the reviewer.
- **Kiosks and signage.** Frames on a timed loop.
- **Recorded talks.** A narrated deck in place of a video: a fraction of the size, and
  searchable and readable.

**What it would cost.**

- **The 18 selectors.** Every `section[data-lattice-slide]` in `player-core.mjs` becomes
  a new frame attribute (not `data-frame`, which the engine already writes; §10), inside Lattice first, with the bytes checked.
- **The chrome CSS.** It moves from Lattice tokens to player tokens.
- **The core's direct reads.** The core stops reading the markdown source for `pace:`,
  `delivery:` and `color-mode:`; the adapter passes those values in.
- **Extensions.** They move behind an extension API that declares each one's script hash,
  CSS and runtime classes.

None of it needs a package to exist first.

**The cheap way to find out.** Before any extraction, do two things. Teach today's player
to read the shells' attributes (the adapter renames, the bytes stay checked), then feed it
one reveal.js and one Marp HTML file. If both play with notes, Article and the no-JS floor,
the contract is real and extraction is a packaging step. If they do not, what broke is the
list of Lattice assumptions still left.

## 7. Forks for the owner, and the 2026-10-16 rulings

1. **Split.** *Ruled: the packer, for sure.* The generic player is dropped. After the trio
   (§10), the owner ruled the shape: an **assembler and connectors, as a fenced module inside
   this repo, unpublished**. Lattice's player stays here as Lattice's connector, and **host
   parity comes first** (`followups.d/2728-p1-player-host-parity.md`). The owner wants to
   understand what a generic player means and where else it would be used before ruling;
   §6a is that explanation, and its "cheap way to find out" is the proposed next step.
2. **Input contract.** *Open.* The owner's instinct was "neutral HTML". §6a makes that
   concrete: plain HTML with a handful of `data-` attributes.
3. **Remote resources.** *Ruled: the opt-in consent mode (§4.3), off by default.*
4. **Order.** *Ruled: the fixes go into today's player first (phase 0).*

## 8. Phases

0. **Fixes in place (ruled):** the pinned clock, content-hashed assets stored once, and
   identical font files declared once, plus a player reproducibility test, in the current
   tree. One export sign-off.
   **Result, 2026-10-16.**

   | Deck | Before | After | Change | What fired |
   |---|---|---|---|---|
   | gallery (120 slides) | 2,742,199 | 2,357,094 | −14% | 2 repeated pictures stored once (376 KB) |
   | `examples/html-player.md` | 857,831 | 765,105 | −11% | 3 identical font files declared once |

   The font merge did not fire on the gallery, and that is correct. Hub-spoke text uses weights
   560, 680, 720 and 760, and 560 falls inside Outfit's 500–600 run, where a merged face would
   render 560 rather than snapping to 600 as it does now. The first wiring read literal weights
   from the *unpruned* deck sheet, which names every component's weights, so it blocked every
   merge in every deck. The guard now reads the CSS that ships. Two runs are byte-identical.

   **Proof the change does not show:**

   - Every weight from 100 to 900 of each bundled family renders pixel-identical in Chromium,
     WebKit and Firefox, at every weight a face declares and every weight outside a run.
   - Old against new, `examples/html-player.md` is pixel-identical in all three engines, in
     Present, Slides and Article, light and dark.
   - The gallery is pixel-identical in the same grid in all three engines.

   **The Studio check, which the pre-merge confidence asked for, found a regression the CLI
   could not show.** The Studio's Webpage export carries a second, relative-URL set of the
   bundled `@font-face` rules, which cannot load from a file. While every face declared one
   weight, Chromium treated the two sets as one composite and fell back to the embedded copy.
   Once the merge widened Outfit to `300 700`, the broken exact `400` became the closer match:
   Chromium chose it, it failed, and the player's toolbar fell back to the system font. WebKit
   was unaffected. The merge now leaves alone any family that another stylesheet declares.
   With the guard, the Studio export of the sign-off deck goes from 1,390,177 to 1,182,881 bytes
   (−15%, from the picture hoist alone). Old against new, that export is pixel-identical in
   Chromium and WebKit in all three views, light and dark. In Firefox every comparison matched
   except one, where the screenshot caught the *old* file before it had re-fit its slides; a
   control comparing two copies of one file never differed. All 10 `webpage-export` e2e tests
   pass, with one probe corrected to read the computed picture rather than the declared text.
   The dead font set is `followups.d/2728-p2-studio-export-dead-font-faces.md`; once it is gone,
   the Studio gets the font merge too.

   One thing turned up along the way: Firefox took more than 30 seconds to load the old 2.7 MB
   gallery file from disk.

1. **Packer behind the seam:** move prune, inlining, fonts, CSP and the asset store into
   the package with a boundary gate, and keep the bytes identical. *Corrected by the trio
   (§10):* the golden test cannot prove this. It never reaches subsetting, inlining, the hoist
   or the prune, so this phase needs a second golden that does, plus a before/after SHA of a
   real export, and it still owes the export sign-off. Add the static conformance clauses.
2. **Packer features:** prune every sheet over the state matrix, the extension
   declarations, the asset-root allowlist, image resize and re-encode, the size report,
   and the consent mode.
3. **Player (held, §6a):** the shell contract, the views and transport, deep links, the
   print sheet, a foreign-producer fixture, and the Lattice adapter. The adversarial trio
   runs before the first npm version (HARD RULE #25; `2026-10-08-library-audit.md` §3).

## 10. The adversarial trio on the player fork (2026-10-16)

The owner asked whether a shell-based player is worth building, or too domain-specific, and
offered an alternative: an **assembler and connectors**. The trio (red team, Munger inversion,
independent checker) ran on three shapes:

- **(A)** the shell player of §6a;
- **(B)** the owner's assembler and connectors: the library only seals a document (prune,
  dedupe, fonts, CSP, consent, determinism), and each producer's connector brings its own
  runtime, CSS, runtime-class declarations and no-JS fallback. Lattice's player stays here as
  Lattice's connector;
- **(C)** none of it: keep improving the player in place.

**Verdict: (B), as a fenced module inside this repo, not published.** That means no npm
package, no product name and no public page until a second producer commits to using it.
(A) loses on all three lenses.

**Why (A) loses.**

- **No evidence of demand.** No issue, followup or doc asks for it, and every foreign slide
  tool ships its own runtime, so a shared player competes with those runtimes rather than
  serving them.
- **Foreign input fails silently today.** The red team fed a reveal.js-shaped document
  through `buildPlayerHtml`. It returned a 63,201-byte file with zero slides, no error and no
  warning.
- **The proposed attribute is taken.** The engine already writes `data-frame` on every
  section (`lib/integrations/markdown-it/plugins.js:988`) and on inline sparks, icons and
  avatars.

**What (B) has to survive.**

1. **The prune gate needs a state driver.** The gate is the one thing that makes the prune
   safe, and it works by putting the page into each of the player's views (`#lp-app`,
   `data-lp-view`). A generic assembler cannot do that for a document it does not know, so a
   connector owes a small *state driver* as well as its declarations. *Falsifier:* write the
   connector for a plain reveal.js export first. If the gate cannot pass on declared data plus
   a driver of a few lines, the contract is the shell player under another name.
2. **Determinism holds only within one engine.** The Studio prunes in the author's own
   browser, and the kept set depends on that engine. The promise has to be stated per engine
   (and per tier), not as a headline.
3. **The hosts are the measured pain, not the producers.** The CLI, the Studio and video
   (with the desktop app to come) already make different files from one deck. The Studio
   never subsets fonts, and the prune orchestration is written twice by hand (`lattice.js`
   and `player-prune-browser.ts`). That is HARD RULE #1 debt with or without a library. *First
   acceptance test:* the same deck at the same epoch gives the same SHA from the CLI and the
   Studio in Chromium.
4. **The style-sink gates find files by root.** `DOC_STYLE_SINK_ROOTS`
   (`tools/check-ownership.js:5890`) must name the new folder, or a sink there goes unscanned.
   A connector's runtime that writes markup is unvouched: the assembler can hash it into the
   CSP, but it cannot sanitize it.
5. **The license reaches every recipient.** The runtime is embedded in every exported file,
   so an AGPL assembler reaches whoever opens the file, not just whoever integrates it. That
   has to be ruled before anything publishes.

**The smallest first slice of (B), which leaves bytes unchanged:**

1. Lift the tail of `assemblePlayer` (the CSP builder, `subsetFonts` and
   `hoistRepeatedAssets`) into one assembler function taking `{ html, scriptHashes, media }`.
2. Give `player-prune.js` `{ safelist, skipStyleIds }` options that default to today's
   constants.
3. Bless a second golden first, on a fixture that fires every stage (a real small font, two
   repeated pictures, an unused rule), and compare a gallery export's SHA before and after.
4. Add a refuse-on-zero-frames guard, so a document the connector cannot read fails loudly
   instead of exporting an empty shell.

**What flips the verdict.** A real second producer (an outside user, or a Laticent product
that ships non-Lattice HTML) commits to the assembler: then publish (B). If that producer also
wants views and transport rather than bringing its own, reopen (A).

## 11. Host parity, the assembler's first step (2026-10-16)

The owner ruled host parity first (§7, §10 point 3). The work landed in one PR, one commit per
item, and this section records each result.

### 11.1 One packer for both hosts (P1)

**What moved.**

- **The prune orchestration** is one function, `prunePlayerHtml(html, openPage, opts)` in
  `lib/export/player-prune.js`. Each host supplies only a page: `lattice.js` opens a scratch
  Chromium tab and runs the probes with `page.evaluate`; the Studio's `player-prune-browser.ts`
  mounts an offscreen iframe and calls the same probes in-process with the frame's document.
  The three probes (`probeFontUse`, `probeUsedSelectors`, `probeGate`) read nothing from module
  scope, so they survive being shipped to a page as text. `opts.safelist` and
  `opts.skipStyleIds` default to today's constants; they are the first connector seam (§10).
- **The assembler's tail** is one function, `sealPlayer({ html, scriptHashes, media }, caps)` in
  `lib/export/player-seal.mjs`: it writes the CSP, glyph-subsets the fonts and hoists repeated
  pictures. `assemblePlayer` leaves a slot for the policy and hands the document over. It knows
  nothing about slides.
- **The Studio now subsets fonts.** `subsetEmbeddedFonts` moved to `lib/export/player-fonts.js`,
  and the player-prune bundle carries it with `subset-font`, HarfBuzz's glue and the woff2 codec.
  The Studio fetches HarfBuzz's wasm and hands it over. Measured: the browser subset of
  `outfit-400.woff2` is byte-identical to Node's.

**A divergence nobody had listed.** The Studio's bundle of `player-core.mjs` re-printed the
transport kernels the player inlines with `${fn.toString()}`: esbuild turns tabs into spaces,
`undefined` into `void 0`, and renames a colliding binding `keyAction2`. So the Studio's player
script, and the CSP hash over it, differed from the CLI's for every deck. `build-player-core.js`
now replaces each such call in the bundle with the text Node itself returns, as a string literal
that no later minifier can rename. In the production docs build, the Studio export of
`examples/html-player.md` now carries the CLI's player script byte for byte (sha256 prefix
`ad0b78e8131d`); before, it did not (`12e273602179`).

**Evidence.**

| Check | Result |
|---|---|
| Second golden (`test/fixtures/player-stages`), blessed on the code BEFORE the move | subset, hoist (2), CSS prune (5/433 rules), font prune (3/4), merge (1) all fire; SHA `5c2afbe1…`, 101,757 bytes |
| The same golden after the move, CLI host | identical |
| The same golden, the Studio's own modules bundled into Chromium | identical (failed at 101,837 bytes with the `.toString()` fix reverted) |
| Gallery `--player`, `SOURCE_DATE_EPOCH=0`, before and after | identical, `0b26848b…`, 2,357,094 bytes |
| Studio export of `examples/html-player.md` (production build) | 1,095,824 → 918,858 bytes (−16%), from the subset |

The CLI's bytes did not move. The Studio's did, so this needs the export sign-off.

**What it costs the Studio.** The player-prune chunk, which loads only on a Webpage export, grows
from 236,531 to 1,638,297 bytes minified (685,802 gzipped, unminified source), almost all of it
the woff2 codec, and the export fetches HarfBuzz's wasm (634,892 bytes). Subsetting the
`examples/html-player.md` export's twelve faces takes 0.55–0.77 s on the main thread in headless
Chromium, during the export's existing "Optimizing…" step. The wasm comes from the docs install and
the glue from the root install, so `test/unit/export/player-subset-wasm-pin.test.js` fails when the
two lockfiles pin different HarfBuzz releases.

**What the subset changes on screen.** Old against new Studio export, in Present, Read · Slides
and Read · Article, light and dark: WebKit pixel-identical; Chromium identical except 18 pixels of
anti-aliasing in one toolbar label in dark Read · Slides; Firefox draws the Playfair headline a
few pixels narrower in every view (4,220–8,149 changed pixels per view). A control of one file
against a copy of itself differed nowhere. Subsetting the OLD file in Node reproduces the
Firefox difference exactly, so it is the subset itself, which every CLI export has always carried;
the glyph advances at `wght` 700 are identical in both files (checked with fontTools), so it is
Firefox's rasterizer treating the subset file differently, not a metric change. Logged as a
followup rather than fixed here.

**What is still not at parity.** The packer is; the renderers are not. The CLI renders a deck to
`docHtml` in its own Chromium page and the Studio renders it in the author's browser, and those
documents differ (a different engine bundle, the Studio's minified flat sheet, the Studio's
second font set, §11.2). The provenance stamp differs too (`build: 'studio'`). So "the same deck at
the same epoch gives the same SHA from both hosts" holds at the packer seam and is asserted there;
from markdown to file it does not hold yet, and closing that gap means one front end.
`now` is pinned to the epoch in the Studio as it is in the CLI.

### 11.2 The Studio's dead font faces (P2)

**Cause.** `assemblePlayer` removed the deck sheet's own `@font-face` rules with a regex that
matched only `url(fonts/…)`, the CLI's spelling. The Studio's sheet spells them
`url(/playground/v/<hash>/themes/fonts/…)`, so they shipped. Under `font-src data:` they can only
fail. The fix is one rule for both hosts, `stripUnloadableFontFaces` in `player-core.mjs`: drop a
face whose every source is a non-`data:` URL, unless it also names a `local()` source; never touch
`#lattice-embedded-fonts`.

The checker found that the first cut ran the strip on each `<style>` element's markup, before the
step that sanitizes and minifies its CSS. Deleting a face can join `</sty` and `le>` around it into
a live terminator, and the text after it then parsed as markup in the shipped file (a reproduced
breakout, HARD RULE #22; the old `fonts/`-only regex had the same hole). The strip now runs on the
CSS inside that step, before `sanitizeStyleText`, and a scanner that skips strings and comments
replaced the regex, so a quoted `}` in a family name no longer cuts a rule short.
`test/unit/export/player-dead-font-faces.test.js` pins both, and fails on the first placement.

**Evidence**, on the production docs build, Studio export of `examples/html-player.md`:

| | P1 export | P2 export |
|---|---|---|
| Bytes | 918,858 | 735,536 (−20%; −33% against the 1,095,824 base) |
| `@font-face` outside `#lattice-embedded-fonts` | 37 | 0 |
| `error` faces in `document.fonts` (Chromium / WebKit / Firefox) | 8 / 0 / 8 | 0 / 0 / 0 |
| Faces shipped | 12 | 6: Outfit 300–700 and JetBrains Mono 400–600 each declared once |
| Pixels against the P1 export, 3 engines × 3 views × light/dark | | identical in all 18 |

The CLI's bytes did not move (gallery `0b26848b…`; `examples/html-player.md` `55801c3d…`, both
before and after). The Studio's merge goes further than the CLI's on the same deck (Outfit's five
weights become one face, where the CLI merges only 500–600) because the Studio bundles different
font files, which is the front-end difference §11.1 names, not a packer one.

### 11.3 The reveal.js falsifier (P3)

The trio's test (§10, point 1): if a plain reveal.js export cannot pass the prune gate on declared
data plus a few-line state driver, the contract is the shell player under another name.

**The file.** A hand-written six-slide reveal.js 5.1.0 deck (seven slides counting one vertical
stack, with fragments, a `data-background-color` slide, a quote, code and a table), with
`reveal.css`, the white theme and `reveal.js` inlined: 168,207 bytes. It lives in the session's
scratch, not the repo; reveal.js is not a dependency.

**What the kernel needed first.** `prunePlayerHtml` hardcoded the Lattice player: the gate
snapshotted `#lp-app *` and drove `data-lp-view`. The declarations are now data with Lattice's as
the default (`LATTICE_CONNECTOR`): a `root`, a list of `states` (each a list of
`[selector, attribute, value]` writes, with `+class` / `-class`), a `reset`, the font block's id,
the sheet-size floor, a `safelist`, the skipped style ids, and `freezeMotion`. The CLI's bytes did
not move.

**What the run found, in order.**

1. **Under the Lattice declaration the gate passed on nothing.** No `#lp-app`, so both snapshots
   were empty and equal: the prune kept 73 of 373 rules and every state but the first rendered
   differently (14,549–921,584 changed pixels). The gate now refuses when its root matches no
   elements.
2. **With a reveal root and one state, the gate passed and the file still broke.** Rules for
   classes reveal adds while presenting (`past`, a fragment's `visible`) were dropped, and the
   gate never entered those states. So selectors are now matched in every declared state too.
3. **The first state driver let states accumulate**, so the gate's second pass ran on a different
   DOM. Each state now starts from the page as loaded.
4. **Reveal's transitions made the gate refuse** (a fragment snapshotted mid-fade). `freezeMotion`
   stops transitions and animations while the probes drive states. A small synthetic deck did not
   reproduce reveal's timing, so the evidence for it is this run, not a test.
5. **Three more rounds of pixel diffs found the rest**: the navigation arrows' `enabled` /
   `fragmented` / `highlight` and `.reveal`'s `has-dark-background` / `has-light-background`.

**Verdict: the gate passes, and the contract is not Lattice-specific, with one condition.** The
final declaration is ten states (fourteen attribute writes) plus `freezeMotion`:

```json
{ "root": ".reveal", "freezeMotion": true, "minSheetChars": 20000, "skipStyleIds": ["theme"],
  "states": [[], [[".reveal .slides section","-class","present"],[".reveal .slides section","+class","past"]],
    [[".fragment","+class","visible"],[".fragment","+class","current-fragment"]],
    [[".reveal","+class","overview"]], [[".reveal","+class","paused"]],
    [[".reveal .controls button","+class","enabled"]],
    [[".reveal .controls button","+class","enabled"],[".reveal .controls button","+class","fragmented"]],
    [[".reveal .controls button","+class","highlight"]],
    [[".reveal","+class","has-dark-background"]], [[".reveal","+class","has-light-background"]]] }
```

With it, the gate passes, the prune keeps 100 of 373 rules (168,207 → 127,787 bytes), and the
pruned file is pixel-identical to the full one in all twelve states the walk drives through
reveal's own API (every slide and fragment step, the overview, and pause); a control of the full
file against itself was also zero everywhere. The condition: **the gate checks only the states it
is told about.** It passed with one state while slides broke, and the declaration took three rounds
of diffing to complete. So a connector's declaration has to be authored by someone who knows the
runtime's class vocabulary, and it should ship with a walk like this one, through the runtime's own
API, as its proof. That is what freezing the connector contract needs: a declared-states field and
a required runtime walk, not a shell player.

**The guard.** `assemblePlayer` now throws when the document has no `section[data-lattice-slide]`.
The reveal file made a 120,508-byte player with zero slides before; now the CLI reports
"--player assembly failed". The engine renders at least one slide for every deck, an empty one
included, so no Lattice deck reaches it.

`test/integration/export/player-connector.test.js` pins items 1–3 on a small foreign deck, reading
the page itself after each probe (no state class or freeze style left behind, a gate with no
declared state refuses), and `test/unit/export/player-zero-frames.test.js` pins the guard. The
checker found the first cut of those tests could not fail on the restore or the freeze cleanup;
both now fail when either is disabled. It also had `root` wrapped in `:is()` (a comma in it split
the gate's selector), an `undefined` override keep its default instead of erasing it, and the
freeze style excluded from the gate's choice of sheet.

### 11.4 Viewer consent for remote pictures (P4)

**What ships.** `--player-consent <origins>` (CLI). Each web picture from a declared origin ships
as the drawn placeholder `blockWebImages` already writes, its address kept inert in
`data-lattice-web-src`. A banner names the sites and says what loading sends them ("your IP address
and the time you opened this file"), with **Load pictures** and **Not now** styled alike. On Load,
the hash-pinned script fetches each address once (CORS, no cookies, no referrer), checks the answer
is a picture, and swaps it into every copy (the slide and the Read · Article figure) as a blob URL.
With scripting off nothing loads, the banner lists each picture as a plain link, and a checkbox
closes it. It is hidden in print and in a video recording. A deck that declares no origin, or one
it never uses, ships byte-identical to before.

**Shipped differently from §4.3, because the trio broke the first cut.**

- **The policy never names a picture site in `img-src`.** The first cut granted
  `img-src data: <origin>`. The red team then loaded from the declared site on open, before
  consent and with scripting off, in Chromium, WebKit and Firefox, through deck CSS the placeholder
  pass does not rewrite: `image-set()`, a CSS-escaped `url`, and an SVG `<feImage>`. With the site
  in `img-src`, the policy was no longer a backstop for it. The shipped policy is
  `img-src data: blob:; connect-src <origins>`: deck markup and CSS cannot open a `connect-src`
  request, so only the script can, after the reader presses Load. Re-run against the red team's own
  deck: zero requests before consent in all three engines, with and without scripting; after
  consent only the declared site is contacted, and a redirect to an undeclared port is refused.
- **The cost of that design:** the picture's host must allow a cross-origin read (it sends
  `Access-Control-Allow-Origin`). When it does not, the request still reaches the site, the picture
  stays a placeholder, and the banner says so and shows the links. The docs and `--help` say this.
- **`--allow-remote` now embeds.** The inversion pass found the better answer to most authors' need
  already in the repo: under `--allow-remote` the CLI embeds every web picture it can fetch
  (`inline-url-media.mjs`, as the Studio's "Embed pictures from other sites" does), and one it
  cannot fetch ships as the placeholder with a note. Before, such a player shipped
  `<img src="https://…">` under `img-src data:`, a broken image. Consent mode is for pictures that
  must stay live.
- **The checker's fixes:** Space on a focused banner button turned the slide (the Present keymap
  listens on the window) and now presses the button; at 390 px the banner covered the slide arrows
  and now sits above them; the CLI refused `https://X.com/`, which is an origin; the failure line
  says "the pictures" when none loaded; `--player-consent` without `--player` now prints the same
  note `--player-mode` does.

**Evidence.** Driven through Playwright in Chromium, WebKit and Firefox, on a CLI export whose
"remote" site is a local server that counts requests:

| Check | Chromium | WebKit | Firefox |
|---|---|---|---|
| Requests on open, scripts on | 0 | 0 | 0 |
| Requests on open, scripts off | 0 | 0 | 0 |
| After Load pictures (host sends CORS): pictures shown, requests | 2 of 2, 1 | 2 of 2, 1 | 2 of 2, 1 |
| After Load pictures (host sends no CORS): banner shows the links | yes | yes | yes |
| Space on a focused Load pictures | loads, slide unchanged | same | same |
| No-JS Close | hides the banner | same | same |
| Red team's leak deck, before consent, scripts on and off | 0 | 0 | 0 |

**Scope left out, stated.** Pictures only. A web `![bg]` becomes a hatch at render and loses its
address; video, audio and embeds are not offered, and the export says when a declared site carries
any of them. The Studio has no way to declare origins yet, so this is CLI-only; the logic sits in
`assemblePlayer`, so the Studio needs only the setting. Consent is asked each time the file opens.

### 11.5 Why Firefox takes half a minute to open the gallery player (P5)

**The cause is the no-JS dark-mode switch.** The player ships a hidden checkbox (`#lp-nj-flip`)
so a reader with scripting off (iOS Quick Look) can still flip the theme, and the dark block
(`#lattice-dual-mode`) repeats every scheme rule under a root that tests it:
`:root:not([data-lp-scheme=dark]):where(:not(.lp-js):has([id=lp-nj-flip]:checked)) …`. The
gallery's dark block carries 326 such rules (695 `:has()` selectors). A `:has()` anchored on the
root makes Firefox re-match those rules as the parser inserts each node, so parsing the
2.36 MB file takes about half a minute; DOMContentLoaded and load land together.

**Measured** with Playwright Firefox 142, 15 interleaved loads of each file from disk:

| File | Median load | Min | Max |
|---|---|---|---|
| The shipped gallery player | 32,241 ms | 30,961 | 33,599 |
| The same file, flip rules rewritten as `[id=lp-nj-flip]:checked~* …` (sibling, no `:has()`) | 718 ms | 207 | 860 |
| The same file with the 326 flip rules removed | 609 ms | 219 | 849 |
| `examples/html-player.md`'s player, for scale | about 220 ms | | |

Bisecting got there in three steps: removing every `<style>` took the load to 0.3 s; of the
blocks, only removing the dark block did (0.7 s); of its 800 rules, the 326 with `:has()` carry
all of it. Scripts, pictures and fonts made no difference. Chromium opens the same file in under a
second.

**Not fixed here, and why.** The rewrite above is a measurement, not a candidate. The flip rules
hold the same specificity as `:root[data-lp-scheme=dark]` on purpose (the `:has()` sits inside
`:where()`), so each wins or loses exactly as the rule it mirrors; a sibling form adds the
checkbox's specificity. And the rules that restyle `:root` itself (the token arms, the page
background, `color-scheme`) cannot follow a sibling combinator, because the root is not a sibling
of anything. A real fix redesigns the no-JS floor (likely: move the token arms to a wrapper that
follows the checkbox, and keep `:root` for what only the root can carry), changes every export's
bytes, and needs the scheme matrix and an export sign-off of its own. It is a followup.

### 11.6 A `![bg]` on a slide that is not `image` (P6)

**What the followup saw was a CLI bug, not an authoring error.** The shared engine draws a
`![bg](x)` on a slide that is not `image` as the slide's own full-bleed background
(lib/engine/background-image.js, Marp's behavior), and the Studio showed it. The CLI did not:
`lattice.js` lifted EVERY `![bg]` into a `.lattice-bg` div before render, and only the `image`
layout positions that div, so on any other slide the picture drew nothing, in the PDF, the HTML
and the player. A lint telling the author to add `image` would have taught a workaround for that
bug, and told Studio authors something false.

**Fixed at the root (HARD RULE #1):** the CLI now lifts with the engine's own class-aware
`liftImageBgImages`, so both hosts draw the same thing. That function also learned the running
`<!-- class: image -->` directive, which the CLI used to get right only by lifting everything; a
slide's own `_class:` overrides it. No committed deck has a `![bg]` on a slide that is not `image`,
and six decks that use `![bg]` (`adaptive-image`, `sample-images`, `marp-export-fidelity`,
`pdf-export-portability`, `finish-canvas-light-half`, `slide-edge`) render byte-identical HTML
before and after. The player half of this (the section background's `url(&quot;…&quot;)` was not
inlined) is §11.7, which landed first so this never shipped a `file://` reference.

**The lint, for what still silently fails** (`lint-core.js` rule 14e, registered in
spec/diagnostics.md):

- `bg-side-unread`: `left` / `right` or a ratio on a slide that is not `image`. The picture fills
  the slide behind the text; fix: add `<!-- _class: image -->`.
- `bg-ratio-unread`: a ratio such as `![bg left:40%]` on an `image` slide. The lift does not read
  it, so the slide loses its panel; fix: write `![bg left]`.

The checker found two defects in the first cut of the running-class reading, both now pinned by
tests: a quoted `_class: "image"` was not read as `image` (the engine strips the quotes), and a
class directive written inside a code fence was taken as real, which in the running form switched
every later slide to `image`. The lift now walks lines outside code and unquotes the value. (It
cannot reuse the linter's scanner: the playground build keeps the engine off the linter's boundary
parser.)

A plain `![bg]` is not flagged: it works. Both rules fire on the repros, stay silent on every
committed deck (`lint:deck --all`: no new findings), and `test/unit/authoring/bg-keyword-lint.test.js`
pins them and the running-class lift. Demo deck: `examples/bg-on-any-slide.md`.

**The lift moved onto the engine's own tokens (2026-10-20, followups `2739-p10` and `2739-p13`).** The class-aware
line walk above decided which slide a `![bg]` is on by itself, and the engine disagreed on several shapes: a setext
heading (`Title` over `---`), and under the default `split: headings` a setext `h2` that is itself a slide boundary,
`***` rules, a `---` inside `$$`, a directive indented as code, text after a directive's `-->`. #2776 tried a better
walk (three checker rounds kept finding shapes) and a second markdown-it parse per render (exact, but about 1.6 KB gz
on the engine, and `getting-started` was ~100 bytes under its ceiling). Neither shipped.

Now the engine's `lattice_background_image` rule (lib/engine/background-image.js) does the lift. It already ran after
`lattice_directives_apply` to turn a `![bg]` into the section's background; on a slide whose resolved class has
`image` it writes the `.lattice-bg` panel (`bgPanel` in lib/core/bg-image.js) where the picture stood instead: one
HTML block when the paragraph holds only pictures, inline HTML inside prose. The engine's own boundaries and
directives decide, with one parse and no source offsets. A pane split into pages (a 9:16 deck) is an ordinary
`image` slide by then, so its picture lifts too, which no source lift could see (`2739-p13`); a 16:9 deck that lays
the same panes out side by side renders byte-identical to before. The source pre-pass is gone from every render
path (the engine's body and pane renders, `_tokens`, the CLI). The Marp bundle ships Markdown, so its two exports
keep the line walk, moved to lib/core/bg-image-lift.js so the engine, the playground bundle and the viewer runtime
no longer carry it.

| Measure | `main` | Now |
|---|---|---|
| Differential fuzz (`.scratch` harness: every `![bg]` against the class of the section its text marker lands in), seed 1 | 476 of 1,463 disagree | 0 of 1,463 |
| The same, seeds 2 and 3 | | 0 of 1,398; 0 of 1,377 |
| Committed decks using `![bg`, engine HTML | | 0 of 69 change |
| `getting-started` engine closure (`engineJsGz`, chunk hashes fixed) | 317,118 B | 317,099 B |

The fuzz leaves out a picture markdown-it never parses (in a fence, a comment, or raw text inside an HTML block):
it is text in both renders. Shapes whose bytes change, each now following the engine: a picture inside prose on an
`image` slide (it was the section's background, because the walk lifted only at line start), the boundary cases
above, and two the walk got right by accident and the engine reads otherwise. A `![bg]` inside a raw HTML block
(`<div>` then the picture on the next line) is text, as any markdown there is; the walk lifted it, no committed deck
has the shape, and keeping it cost 73 bytes the engine budget does not have (`getting-started` sat 27 bytes under its
ceiling). A URL markdown-it does not parse as a link (`![bg](my photo.jpg)`, with a space) is text too, as on any
other slide; `<my photo.jpg>` is the CommonMark spelling. The Marp bundle's walk loads only for that export, as its
own module (`esm/bg-image-lift.js`): an entry of the split ESM build shared bg-image.js with the engine and cost it
about 2 KB, and a CommonJS module with requires cannot be imported from the Studio's source on the dev server.
`test/unit/engine/bg-image-panel.test.js` carries #2776's 34 checker cases
against the engine.

### 11.7 A relative section background reached the player un-inlined (P7)

**Reproduced.** `![bg left:40%](a.jpg)` on an `image` slide: the lift reads only `left` / `right`
(lib/core/bg-directive.js `BG_RE` takes word characters), so the slide falls through to the
engine's section background, `style="background-image:url(&quot;a.jpg&quot;)"`. The CLI renders
with no base URL (its PDF resolves relative paths against the deck folder), and the player's
inliner matched `url(file://…)` with `'` or `"` only. The exported file carried `a.jpg` twice, a
path that points at nothing once the file leaves the folder, and the run reported
"0 image(s) inlined" with no warning. The same seam carried an absolute `file://` background
un-inlined, and the engine's informational `--background-image:"url(\"file://…\")"` copy put
the author's folder path into the shared file.

**Fixed, in the player adapter (`html-player.js`):** relative `url()` in `style` attributes now
resolves against the deck folder before inlining (`resolveStyleUrls`); the inliner reads the
`&quot;` / `&#39;` forms; and the informational copy is dropped when it names a local file (nothing
reads it back; lib/engine/background-image.js says so). The asset hoist also reads `&quot;`, so a
picture used as two slides' backgrounds ships once. On the repro: "1 image(s) inlined", "stored 1
repeated background picture(s) once, 101 KB saved", no `file:` anywhere in the file, and a missing
picture is now listed in the report. The gallery and `examples/html-player.md` players are
byte-identical. `test/unit/export/player-style-urls.test.js` pins it.

Not fixed: the ratio itself. `left:40%` still renders a full-bleed background rather than the image
layout's panel; reading Marp's split ratios is a feature of its own (a followup). P6 makes the lint
say so.

**After the rebase onto #2748.** main had fixed the same relative-background gap with its own
inliner (`mapPlayerContexts`, a tag scanner), so the two were merged, and the checker found four
defects where they met:

- `resolveStyleUrls` still ran a pattern over the whole document. Chromium writes `"` raw in text,
  so a code sample such as `<div style="background:url(pic.jpg)">` in inline code was rewritten to
  the author's absolute `file://` path, and the inliner then rightly left that text alone. The
  resolver now runs inside `mapPlayerContexts`, on `style` attributes only.
- The resolver checked only that a path existed, so a folder named `x.png` also leaked its path. It
  now requires a regular file.
- `liftImageBgImages` read a class directive one line at a time and missed
  `<!--\n_class: image\n-->`, which the engine applies. A comment that opens a line and stays open
  now runs to its first `-->`, as markdown-it's HTML block does: a `---` inside it is not a slide
  break, and only a directive that opens it counts. A `<!--` in the middle of prose is text, as it
  is to the engine (the checker's second pass caught the first cut hiding later slide breaks).
- main seeded the lift from a front-matter `class:` line, including one that never closed. The
  deck-class register (`lib/core/deck-class-register.js`) refuses a component name such as `image`
  as a deck class, so the engine rendered those slides `content form` and the lift drew an empty
  panel. The seed is now `deckClassTokensFromFrontMatter` of a closed block, the tokens the engine
  itself admits.

Still open: the lift's `---` line walk disagrees with the engine on a setext underline (`Title\n---`),
other rule forms, a `---` in `$$` math and a directive indented as code (673 of 5,289 fuzzed markers
on `main`). #2776 tried a better walk and then a read through `slideClassSpans`; the second matched
the engine on every fuzzed marker but cost a second parse and ~1.6 KB gz on an engine already at its
ceiling, so both came out. The design left is a token rule inside the engine's own parse
(followups.d/2739-p10-bg-lift-setext-underline.md).

### 11.8 The Studio's player shipped the authoring overflow marker to its reader

**Found while measuring §11.9**, and older than this work: the `main` export of
`examples/html-player.md` already carried it. Every player the Studio made stamped
`data-lattice-overflow-marker="author"` on every slide and kept the type-floor `illegible-tab` node.
On a deck with a clipped slide, the reader of the shared file saw the red ring, an "OVERFLOWS" tag
and a yellow "Fix Me" chip. The CLI's player of the same deck shows the calm "Content clipped" pill.
`lib/core/resolve-overflow-marker.js` states the contract this broke: "nothing a READER receives has
it".

**Cause.** The Webpage export bakes its slides in the Studio's capture frame, which runs the
runtime. The runtime tells an export from an authoring surface by the export-settings block
(`lib/core/export-settings.js`). The frame carried none, so the runtime drew the authoring signal.
The CLI never had the problem: it bakes at its resolved level and then runs a strip in
`page.evaluate`, a strip the Studio had no copy of.

**Fixed, one mechanism per host and one function for both.** `withExportSettings` in
`deck-export.js` writes the standard block into the capture frame's head, so the runtime draws the
export's level. It lives in the export module rather than in `buildSrcdoc`: the first cut put it in
`deck-preview.js`, which loads with every preview, and the route budget measured +444, +378 and +374
bytes of gzipped eager JavaScript on the studio, playground and home routes. Moved, the three routes
measure what `main` does. The
Webpage bake passes the workspace's `overflowMarker` setting through `resolveExportOverflowMarker`,
the resolver the CLI and the Marp bundle use, so a stored `off` or a junk value falls back to
`reader` instead of silencing every clip (`loadSettings()` does not validate it). The strip moved out
of lattice.js into `stripMarkerForLevel` in the kernel, which the CLI hands to `page.evaluate` and the
Studio calls on its frame. `resolveExportOverflowMarker` moved into the same kernel, re-exported from
`marp-bundle.js`, because that kernel requires nothing and the docs dev server's CommonJS shim serves
only such a file. The independent checker caught the first cut importing `export-settings.js` and a
named export from CommonJS: both break `npm run dev` and neither shows in a production build. The
modules now load on the dev server. A full export there stays blocked by followup `2710-p5`, which
predates this work. The CLI's player bytes are unchanged on the overflow repro and on
`examples/html-player.md`. `test/unit/core/resolve-overflow-marker.test.js` pins the strip per level,
and `docs/e2e/webpage-export.spec.ts` drives the real Share → Webpage flow and asserts the reader
marker, the visible pill and no "Fix Me" chip.

Not changed: the Studio's PDF, PNG and PowerPoint exports rasterize through the same frame without
a level, as before. Whether they show the authoring marker is a separate question; it is a followup,
not part of this player fix.

### 11.9 What still separates the two hosts' files

§11.1 put the packer at parity and asserts it. From markdown to file, the same deck still gives two
different files, and the owner's acceptance test (same deck, same epoch, same SHA) holds only at the
seam. Measured on `examples/html-player.md` at epoch 0, the CLI's player against the Studio's real
Share → Webpage export:

| Part of the file | Same? | What differs |
|---|---|---|
| Player script (33,453 bytes) | yes | `ad0b78e8…` from both |
| Player stylesheet (21,111 bytes) | yes | |
| Embedded fonts | no | The Studio vendors its own woff2 copies (`docs/src/playground/fonts/`). Five carry different bytes from the canonical `assets/fonts/`: Caveat 700, Outfit 400 and 700, Shantell 400 and 700. So the hosts draw those weights from different files, and the prune keeps 9 faces from the CLI and 6 from the Studio |
| Deck stylesheet | rules and order same | The Studio fetches `dist/lattice-min.css`; the CLI reads `dist/lattice.css`. Different minifiers: `.15625` against `0.15625`, quote style, `[data-cards=center]`. 2 rules apart (155 and 153) |
| Dark/light stylesheet | 583 rules each, same order | the same minifier difference |
| Slide markup | no | The Studio defines 6 more texture pattern sets (onyx, concrete); its bake serializes `style` through the browser and keeps the runtime's `--_sec-1cqi` stamps; and, before §11.8, the marker level |
| Deck record | no | The Studio stamps `build: 'studio'` and `playerVersion: 'studio'`, and sends no `config` |

Each row is a change to exported bytes in one host or both, and the font row also changes what the
Studio's own preview draws. Followup `2739-p1` carries this table as its work list.

**The definition, ruled by the owner on 2026-10-17.** Parity is the same content and the same
metadata from both hosts, ignoring three things: the time stamp (`generatedAt`), the signing hashes
(the policy's script hashes, which follow from the script), and which host made the file (the new
`host` record field, `cli` or `studio`). Formatting counts. The owner asked for the whole gap,
diagrams included, in this PR.

**Measured on a 12-deck corpus** (`.scratch` comparator: record fields, policy, scripts, every
stylesheet by bytes and by meaning, fonts per face, slide markup with sorted attributes, visible
text), after the first round of fixes:

| Fix | What it closed |
|---|---|
| Both hosts compose the deck sheet from the minified builds (`shippedSheetText`, also `tools/palette-sweep.js`) | every stylesheet byte difference on decks without math or diagrams. The CLI's PDF pages rasterize to identical PNGs (html-player, a11y, chart-family-coverage) |
| The Studio builds its document from `exportDeckStyleText` and the CLI's texture selection; the `style:` packing moved to `lib/export/author-css.js` | the page-number rule, `position:relative`, the notes and description rules; six unused texture sets |
| Six Studio woff2 copied from `assets/fonts/`, held by a new byte check in `fonts:check`; `GLYPH_UPPER_FONTS` re-pinned (`fonts:measure`: 0 under) | Outfit 400/700, Caveat 400/700, Shantell 400/700 |
| `PLAYER_VERSION` in one module, `ENGINE_BUILD` from `package.json` into the Studio bundle, `config` from the engine's parser, `host` added | the record |
| The bake restores each slide's engine `style` attribute | the browser's re-serialized style and the `--_sec-1cqi` stamps |

**Second round.** A byte-strict check (whole file, normalizing only the three exclusions) replaced
the semantic one as the bar:

| Fix | What it closed |
|---|---|
| One `data:` encoder (`lib/core/data-uri.js`): SVG percent-encoded, the rest base64 | collage and avatars pictures |
| A quote-aware `url()` reader for the runtime (`lib/core/css-url.js`) | the bake frame cut a percent-encoded SVG at its first `)` and lost the image slide's size bucket |
| KaTeX made self-contained by one transform (`lib/export/katex-inline.js`) | the Studio's math players shipped no KaTeX faces at all |
| The Studio renders the deck's declared theme, not its `-dark` twin | `data-theme` on every slide of a dark deck |
| The bake frame lays slides out at one to one | function-plot drew 6% small |
| function-plot draws with a seeded `Math.random` | random clip ids, which also made two CLI runs differ |
| The packer sorts every slide element's attributes | the order the CLI's string pass and the Studio's runtime wrote them |
| One `@font-face` rule and the manifest's order (`lib/fonts/face-rule.js`) | the font block |
| The bake drops the runtime's image-text bookkeeping mark | one attribute |

**Byte-identical now, apart from the three exclusions:** html-player, marp-export-fidelity,
chart-family-coverage, collage, build, studio-present, backdrop-register, math-bare-equation and
avatars (9 of 12). Still open: Mermaid (a11y, carbone-curation: two pipelines, and the CLI
envelope's baked "source"), `size: story` (adaptive-sizing), and the player's default mode when
the deck sets no `color-mode:`.

**Third round: the structural split.** A deck at `square`, `portrait`, `story` or `mobile` is cut
into cover, one page per element, and closing (lib/core/structural-split.js). The CLI's `--player`
made that cut; the Studio's Webpage export did not, so `adaptive-sizing` shipped 32 slides from the
CLI and 8 from the Studio.

| Fix | What it closed |
|---|---|
| The Studio export runs `PG.splitForPreview` with `settle: false`, the CLI's own setting, on the render and on the strip-notes candidate | the page count |
| The Studio's slide numbering keeps a number the split already wrote (`2.2`, page 2 of slide 2) | every split page's `data-lattice-slide` |
| `roleOpenTag` (lib/core/split-envelope.js) drops `data-cards` / `data-cards-coda` when the swapped class names no card-row component | the cover inherited its source slide's stamp. The Studio's bake runs the runtime, which drops it; the CLI's export page runs no runtime and kept it. The attribute was visually inert on a `content` cover (nothing there reads `--cards-align`), so no PDF moves |

**Byte-identical now:** the nine above plus adaptive-sizing (10 of 12), and auto-split,
cover-paginate and inventory-split-portrait on a second split corpus. Still open: Mermaid.

**Fourth round: diagrams.** The two hosts draw a Mermaid diagram with the same library build and
the same kernel (`renderDiagrams`), and the drawings already had identical geometry. What differed
was everything around the drawing, plus three measurement contexts:

| Fix | What it closed |
|---|---|
| The Studio's bake ships each drawn figure in the `figure-baked` shape (`div.mermaid-svg[data-mmd-idx]`, the manifest's player surface), built by `bakedFigureOpenTag` in a new `lib/plugins/mermaid/shared/baked-figure-tag.js` the CLI bake uses too | the spent source `<pre>` and the live `.mermaid` sibling, and the stylesheet rules the prune kept for them |
| One svg id prefix (`lattice-mmd-N`) on every path; the accessible-name floor (`aria-label="Pie chart"`) and the sankey label collapse moved into the shared module and applied by the browser pass too | the root's id, a name the live preview and the Studio never gave a diagram, and a label newline |
| The Studio's bake sets the root's background and declares the xlink namespace, as the CLI's worker does | the root `style` and `xmlns:xlink` |
| The browser's token reader returns a literal hex as written, and a `light-dark()` token as the hex of the side its probe resolved | `fill="rgb(…)"` against the CLI's `fill="#C2E6C8"` |
| The Studio's Webpage bake frame writes `playerBake: true` into its export settings block, and a browser render that sees it (`ctx.isPlayerBake()`) takes the export's Mermaid config and draws in a 784 px stage, the box the CLI's worker draws in (`DIAGRAM_STAGE_WIDTH`) | flowchart roots in px, a 1280-wide Gantt against 784, xychart positions a few millionths apart |
| The bake restores each slide's engine `style` before it measures, re-runs the card-tag equalizer (the kernel the CLI injects), and runs strip, restore, bake and read with no `await` between them | label `y` noise from the fit agent's transform; `--card-tag-block`, a layout input the round-one restore had dropped (a regression this PR introduced and this round fixes); `illegible` berths the live runtime re-minted during the wait, and only under load |
| The CLI's envelope carries the deck as authored (`md`), and its record's `config` is parsed from the same text | baked SVG as the re-import "source" (the 2026-08-05 note's user-visible win), and the `glossary: auto` key the auto-glossary strips |
| The CLI's finished player file restores `feDropShadow`, which jsdom's HTML parser lowercases | a dead `<fedropshadow>` element: every Mermaid drop shadow in a CLI player file drew nothing |

**Byte-identical now, across 25 decks:** every deck above, plus system-design-foundations (234
slides at 4K, 32 diagrams), sequence-narration, mindmap-branch-colors, mermaid-sketch-labels,
xychart-narration, containment-tier, chart-body-tier, hub-spoke-sketch, plugin-system-phase-b and
card-tag-placements. Measured with both hosts on one Chromium build (141). The CLI's default browser
in this sandbox is Chrome 131, and two Chromium versions spell some computed colors differently
(`oklch(0.47 0.017 259.53)` against `oklch(0.47 0.017 none)` for the same `color-mix()`), so the
claim is per browser build. A Studio export made in Safari or Firefox will differ from the CLI's
wherever the bake reads a computed style.

**Fifth round: keeping the files equal as the runtime grows (followup `2739-p9`, 2026-10-20).** The
Studio reaches parity by running the live runtime in its bake frame and then undoing what the runtime
wrote: each slide's `style` restored, the card-tag equalizer re-run, `data-lattice-image-text` removed,
diagrams drawn in a 784 px stage. So any NEW runtime stamp on a slide or inside one is a byte only the
Studio's file carries, and the nightly spec covers three decks. Two changes:

| Change | What it guards |
|---|---|
| The Mermaid export stage starts from `all: initial` plus `direction: ltr` (which `all` leaves out), then sets its own box (`STAGE_TEXT_RESET`, lib/plugins/mermaid/shared/baked-figure.js). The first cut named all 32 inherited text properties; the shorthand computes the same in Chromium and saves about 250 bytes gzipped in the viewer runtime, which the engine's byte budget counts | The stage hangs off the frame's `body` and inherited its font, line height, spacing and case, where the CLI worker's `#container` sits in mermaid-cli's bare page. Mermaid's own sheet sets the font on its svg, so nothing differed yet; a frame style added later could have moved a label in one host only |
| `PARITY_CORPUS=1` runs `docs/e2e/player-host-parity.spec.ts` over the 25 decks this section measured (`PARITY_DECKS=a,b` for a named list) | A change to the bake or to a runtime pass the bake frame runs is checked against the whole corpus before it ships, not against three decks |

Measured after the reset: **25 of 25 decks byte-identical** (`PARITY_CORPUS=1`, Chromium 141, 10.1 min).

**The structural alternative, not taken here.** Subtraction is the weak point: every stamp the runtime
learns is a stamp the bake has to know to remove. The other design gives the Webpage export a bake
frame that runs the CLI's own export page, the runtime-free document `lattice.js` builds for
`--player`, with the same overflow watcher, card-tag kernel and diagram worker contract, and no live
runtime at all. Then parity holds by construction, and the restore list in `finishBake` goes away.
It costs a second frame type in the Studio and moves the Mermaid draw out of the live preview's
renderer, so it is a design change, not a fix; it is recorded here as the move to make when the
subtraction list next grows.

**The default mode is a UI choice, not a pipeline gap.** With the Studio preview in light, every
deck above opens in the same mode from both hosts. With the preview in dark, a deck with no
`color-mode:` exports dark from the Studio by default. The export panel deliberately defaults to
what the preview shows (`WebpageOptionsPanel`, "a plain deck is WYSIWYG"), and the author can pick
any mode, as `--player-mode` does for the CLI. Changing that default is the owner's call.

## 9. Stale claims found along the way

- `player-core.mjs:3433` still calls font subsetting "the single biggest size lever
  (~6×)". The 2026-07-07 note measured about 28%.
- `2026-07-07-html-lattice-player.md` says the prune kernel lives in `html-player.js` and
  `lattice-emulator.js`. It now lives in `player-prune.js` and `lattice.js`, and
  `lattice-emulator.js` no longer exists. Its architecture table also names a dual-screen
  `postMessage` pairing and `lib/export/player/`, and neither exists.
- `2026-07-03-semantic-html-accessibility.md` §15.1 says the player has no `<main>`, no
  named nav and no reduced motion. All three ship now.
- `inline-url-media.mjs:8` misstates the player's CSP (§4.3).
