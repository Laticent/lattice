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
   Measured on the Studio export of the sign-off deck: 1,390,177 → 926,003 bytes before that
   guard. The dead font set is `followups.d/2728-p2-studio-export-dead-font-faces.md`.

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
