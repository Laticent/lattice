---
status: shipped
summary: >
  #1709 reported that a Theme Studio description escapes its CSS comment into the preview.
  The reported fix — escape `*/` at the serializer — is necessary but does NOT close the
  hole, and the handoff's "part 1 first, it closes the reachable path today" is false as
  stated. Measured in Chromium 131: a `</style>` in theme CSS ends the preview frame's
  `<style>` element and runs script REGARDLESS of the CSS comment, because a `<style>`'s
  content is HTML RAWTEXT and the tokenizer does not read CSS. So the escape and the sink
  guard are two independent layers and both ship. On the real chain the two are also
  coupled in a way neither half predicted: the engine's packer strips whole comments, so a
  benign description never reaches the frame at all — it is the `*/` that truncates the
  header, leaving the payload OUTSIDE the comment for the packer to spare and the frame to
  parse. Verified end to end on the shipped bundle in a real browser: pre-fix EXPLOITED,
  post-fix not, with the slide still rendering. HARD RULE #22 and its gate were markup-only
  and now cover both channels, gate test written first. Separately, `flattenCssImports` got
  the real comment walk, which required promoting it to an ESM home both the CJS and the
  browser-bundled ESM side can reach.
---

# Theme CSS is a preview sink, and the comment escape is not the fix

**Date:** 2026-08-17
**Status:** shipped
**Follows:** `2026-08-17-composition-stays-content-addressed.md` §6 (the open item) and §7
(the logged, off-path #1709), `2026-06-29-component-transformer-threat-model.md` §5.1 (#616).
**Closes:** #1709. **Rules touched:** HARD RULE #22 (both channels now).

---

## 1. What was reported, and why it is not the whole defect

#1709, logged off-path by #1696's red-team lens, reads: `lib/theme/serialize.js`
interpolates a Studio `description` into a `/* … */` header without escaping the
terminator, so two characters end the comment and the remainder is live CSS in a sheet
that composes straight into a same-origin, un-sandboxed preview frame. The prescribed
fix was to neutralize `*/`, with the gate question deferred as a separate decision.

That framing has the mechanism wrong, and the error matters because it would have shipped
a fix that leaves script execution open. **Live CSS is not script execution.** CSS cannot
run script. What runs script is a different escape entirely, and it does not go through
the CSS comment at all.

## 2. The measurement that settled it

A `<style>` element's content is parsed in the HTML **RAWTEXT** state, which ends at the
first `</style` and has no notion of CSS comments or strings. Driven against the exact
concatenation shape of `docs/src/lib/single-slide-render.ts` in a real Chromium
(131.0.6778.204), with the theme CSS produced by the real `serializeTheme`:

| description payload | CSS comment closed? | `<style>` element closed? | **script ran?** |
|---|---|---|---|
| `</style>` only | no | **yes** (1 stray node) | **YES** |
| `*/` only | **yes** | no | no |
| `*/` then `</style>` | no¹ | **yes** (1 stray node) | **YES** |
| benign prose | no | no | no |

¹ the payload's own `/*` reopens it; the discriminator is the element, not the comment.

**Read the second row.** Escaping `*/` — the entire reported fix — removes the row that
does *not* execute and leaves both rows that do. A verification that stopped at "the
comment can no longer be closed" would have reported the issue fixed.

## 3. …and the measurement that made the escape necessary anyway

The obvious conclusion from §2 — "the serializer escape is cosmetic, only the sink matters"
— is also wrong, and the full chain shows why. Asked of the shipped bundle through the
public API a saved Studio theme actually travels on (`PG.addThemes` → `ThemeStore.cssFor`),
reading back `render().css`:

| description | marker survives compose? | `</style` in composed CSS? |
|---|---|---|
| benign prose | **no** | no |
| `</style>` with no `*/` | **no** | **no** |
| `*/` then `</style>` | no | **YES** |

`lib/engine/css.js` strips block comments while packing. A description that stays inside
its comment is therefore deleted before it can reach any frame — which is why the middle
row is inert. **The `*/` is the enabler:** it truncates the header, so the packer's strip
consumes only up to the injected terminator and leaves the payload behind as live CSS
text, which is then concatenated into the frame's `<style>`.

So the two layers are not redundant on this path; they are the two halves of one chain:

```
description --*/--> escapes the comment --> survives the packer's strip
            --</style>--> ends the frame's <style> --> markup --> script --> the user's key
```

Either half alone breaks the chain **on this path**. Both ship, because "this path" is not
a contract: `sanitizeStyleText` guards the frame against *every* CSS channel including ones
that never touch `serialize.js` (author `extraCss`, a component's live styles, whatever a
future caller pipes in), and the serializer escape holds even for a consumer that composes
without the packer. Defense in depth here is not ceremony — each layer covers inputs the
other cannot see.

## 4. Verified, on the surface a human uses (HARD RULE #23)

**Surface:** the built docs site served from `docs/dist`, driven in Chromium 131 through
`window.LatticePlayground` — the shipped Rollup/esbuild bundles, the documented public API,
the real `lib/theme/serialize.js` output, and the preview document assembled exactly as
`single-slide-render.ts` assembles it. Same probe, same payload, two builds:

| | **PRE-FIX** (`main`) | **POST-FIX** |
|---|---|---|
| `</style` in composed CSS | **yes** | no |
| `<style>` element text | **2,137 bytes** (truncated) | 700,749 bytes (intact) |
| stray injected nodes in the frame | **1** | 0 |
| slide still rendered | 1 section | 1 section |
| **sentinel on `window.top`** | **`"yes"` — EXPLOITED** | `null` |

The sink guard is verified **separately**, because the table above is the serializer's win
— post-fix the terminator never reaches the frame, so it would pass with no guard at all,
and reporting it as proof of both would be exactly the vacuous arm this repo keeps catching.
Handed CSS that already carries the terminator, through the shipped kernel:

| case | guard | `<style>` intact | stray nodes | **script ran** | rule still applies |
|---|---|---|---|---|---|
| raw `</style>` | **OFF** | **TRUNCATED** | **1** | **YES** | yes |
| raw `</style>` | ON | yes | 0 | no | yes |
| inside a well-formed CSS comment | ON | yes | 0 | no | yes |
| inside a CSS string | ON | yes | 0 | no | yes |
| uppercase `</STYLE>` | ON | yes | 0 | no | yes |

Every row keeps `section{color:red}` applying, so the guard is not buying safety by
breaking the stylesheet.

**Confirmed on the DEPLOYED artifact, not just a local build.** The tables above were taken
against a locally built `docs/dist`, which is a fair reading of "the shipped bundle" but not the
strongest one. The Cloudflare preview of this branch was then fetched directly and its 59 JS
chunks read: the guard is present verbatim in `deck-preview.<hash>.js` — minified to `I(t)`, with
the `[115,116,121,108,101]` charcode table and the hop-by-hop `indexOf("</")` scan intact — and it
is **wired at both sinks**, `"<style>"+I(l)+"</style>"` for the font block and `…+I(e)+"</style>
</head><body>"` for the composed sheet. So the guard is in the bytes a browser actually downloads,
not only in the bytes this machine built.

That check was done with `curl`, because a real browser could NOT reach the preview host from this
sandbox (the egress proxy resets the connection for Chromium; `--ignore-certificate-errors` is not
an acceptable workaround). So: the deployed BYTES are verified, the deployed PAGE was not driven.

**NOT verified, and named as such:** the Fabricate *live specimen* path. The description
does not reach that frame's `<style>` in either build — the specimen renders through the
packer, which strips the header — so that surface is inert for this defect and cannot
demonstrate either direction. The click path was driven (⌘K → Fabricate → Description →
type) and the field, the re-derive and the preview all behave; it simply is not where the
sink lives. The reachable path is the SAVED theme (`saveStudioTheme` → `extraTheme` →
`addThemes`), which is what §4's table drives.

## 4b. What the adversarial trio changed after the first commit (HARD RULE #25)

The change went in, then red team / inversion / checker ran against the committed diff. They
found **nine** things, and three of them were defects the first cut created or missed. Recording
them because the pattern matters more than the list: every one lived in the machinery around
the fix, and the two-line security primitive itself survived all three passes unchanged.

| # | Finding | Where | Fixed by |
|---|---|---|---|
| 1 | **The Export-Webpage path is a live same-origin sink.** `share-export.ts`'s `buildSelfContainedDoc` embeds the same composed sheet in the same `<style>` shape, has NO runtime-`<script>` marker, and its output is mounted in an un-sandboxed same-origin iframe **inside the running docs site** (`player-prune-browser.ts:76`) before it is downloaded. Red team drove `</style><link rel=stylesheet href=…>` in component CSS to a real cross-origin fetch from the docs origin, and the `<link>` was **harvested into the shipped artifact** — a beacon in every copy the recipient opens. It is NOT script execution (the assembler drops `<script>`/`onerror`), so: exfil, not key theft. | the gate's discovery rule | guarded; discovery re-keyed on document assembly |
| 2 | **Form feed.** The bad-string-token rule stopped at LF/CR but CSS Syntax §3.3 preprocesses **U+000C** to a newline too. A bad-string opened before an FF ran past it and swallowed the next comment — which then was not masked, so a theme's PROSE `@import` resolved. That is #1696's defect, reopened. | `css-comments.mjs` | `\f` added; verified through the real store |
| 3 | **`commentSafe` DELETED a character** while this note and the commit message both claimed it round-tripped: `"a 2*/3 split"` came back `"a 2*3 split"`, a changed claim rather than an escaped one. Found independently by two of the three. | `serialize.js` | escape with a backslash (inert in a CSS comment) — lossless, and now pinned |
| 4 | **Six test arms were vacuous.** The regex being replaced is LAZY, so a fixture with no trailing `*/` is satisfied by the broken implementation too. See §6. | the flattener test | `/* tail */` on every fixture; 2 → 7 arms bite |
| 5 | `url(icons/*)` — an unquoted url-token is a third context where `/*` is not a comment. The shared walk read it as one and DROPPED an import the naive regex resolved: a regression on valid CSS. | `css-comments.mjs` | url-token run type; 0 change over the 179-sheet corpus |
| 6 | The gate test wrote probe files into the real `docs/src`. `node --test` runs files concurrently, so another check scanning the same tree saw them — it produced a **real 1-in-6589 flake** during a push. | the gate test | `root` injected; probes live in a temp tree |
| 7 | A second, unguarded `<style>` sink in `deck-preview.js` (`fontCss`). Ours today, but `buildSrcdoc` is exported, and the file-scoped gate cannot tell the difference — so the file stayed green. | `deck-preview.js` | guarded; the guard is free (identity return) |
| 8 | Two arms named for control-character handling asserted only the `*/` property, which a newline can never violate — all three blanking mutants killed zero tests. Likewise "returned by identity" used value equality. | tests | real assertions added |
| 9 | "190 repo stylesheets" reproduced as neither 190 nor anything else; and §6's end-to-end prose dropped the trailing comment that makes the claim true. | this note | corrected in place (see §6 — the honest figure is **179**, and getting there cost a CI failure of its own) |

Findings 1, 2, 5 and 6 are defects **this change introduced or left open**, so none of them was
eligible for a follow-up issue (HARD RULE #18). Findings 3, 8 and 9 are the record being wrong,
which is the same class of defect in a repo where the record is how the next person decides.

### A pre-commit hook gap, found by tripping over it

`tools/affected-tests.js` maps `test/unit/<scope>/` to a `test:<scope>` npm script, and
**`test:theme` did not exist** — so staging only a file under `test/unit/theme/` failed the
pre-commit hook with `Missing script`. Pre-existing (that directory has been there since
#1680), but squarely on this change's path, since it is where the flattener's tests live and
it blocked this commit. Added, per HARD RULE #14 — a hook failure is a root cause, never a
`--no-verify`.

Two sibling scopes are still missing the same way and are **off** this path, so they are
logged here rather than pulled into the diff: **`test:diagnostics`** and **`test:runtime`**.
Either will fail a commit that stages only files in its directory.

## 5. The gate: HARD RULE #22 now has two channels

The rule and `checkPreviewHtmlSinks` were both written in terms of the slide-HTML sink, so
a builder passed the gate while concatenating unsanitized theme CSS two lines above the
sanitized HTML. That was the live state, not a hypothetical.

The gate now checks both, and — this is the correction finding 1 forced — the two arms have
**different discovery rules**, because they are about different things:

- **markup**: a sanctioned *preview builder*, recognized by the split runtime-`<script>` idiom,
  owes `sanitizeSlideHtml`. Unchanged.
- **stylesheet**: any `docs/src` module that assembles a **whole HTML document** (`<!doctype
  html`) containing a `<style>` element owes `sanitizeStyleText`.

The first cut keyed BOTH on the preview idiom, and that was wrong on its face once stated
plainly: "injects a runtime script" marks a live preview frame and has no causal relation to
"embeds untrusted CSS". It missed `share-export.ts` entirely — the one path here with a real
author→recipient split, where a preview frame is mostly self-XSS.

Document assembly is the honest marker for the class, and it is also precise: measured over
`docs/src` it selects exactly **five** files, all genuine document assemblers, no false
positives. The looser alternative — any `<style>` with an interpolation — selects **22**, mostly
our own font and chart CSS, and an allowlist that long stops meaning anything.

Its limits are real and worth stating rather than discovering later. The check is file-scoped
text matching, so it is satisfied by one `sanitizeStyleText(` anywhere in the file: a *second*
unguarded sink in an otherwise-guarded file passes (that is finding 7, now fixed at the source
rather than by tightening the gate), as do a call in a comment, a split `'<sty' + 'le>'`, and a
`<style>` opener hoisted into a shared module. Those weaknesses are inherited — the markup arm
has had all four since it was written — and closing them needs dataflow, not regex. What the
gate buys is that a NEW document assembler cannot be added silently.

**The test was written first**, per the standing rule this repo has had violated five times:
`test/unit/tools/preview-style-sink-gate.test.js`, 15 arms over scratch files in the tree the
gate really walks — every shape that must fire (raw `<style>`, `<style id=…>`, uppercase,
template-literal, HTML-sanitized-but-not-CSS), every shape that must not (no stylesheet
channel, `<link>` only, the word "style" in prose, an inline `style=` attribute, a bare
closing tag, a non-builder), and both channels shown to bite independently. It failed 7 arms
before the gate existed. `checkPreviewHtmlSinks` grew an injectable `sanctions` parameter so
the "listed builder drops the call" arms are testable at all.

## 6. `flattenCssImports` — the other half, and the module move it forced

`lib/theme/chain.mjs:106` still carried the naive `replace(/\/\*[\s\S]*?\*\//g, '')` — the
exact strip #1696 removed from the engine store, one level down, in the one path whose input
is caller-supplied by construction (`lattice-emulator.js --css`). It cannot tell an opener
from the same two characters inside a string, so `content: "/*"` followed by `@import
'shared';` paired that opener with the next real closer and silently dropped the import.

The blocker was structural, not logical. The correct walk lived in `lib/core/leading-is.js`,
which is CommonJS; `chain.mjs` is ESM **and** browser-bundled, so it could reach it by
neither `import` nor `createRequire` without breaking the bundle — the failure its own
docblock records. So the walk moved to `lib/core/css-comments.mjs` (ESM, pure, fs-free);
`leading-is.js` `require()`s it and re-exports for its five CJS callers, `chain.mjs` imports
it directly. **One implementation, two module systems** — not a second copy, which is how
this repo ended up with two same-named `stripCssComments` esbuild had to rename apart.
Both bundlers were run: esbuild (playground/emulator) and Astro/Rollup (docs site) take the
CJS→ESM hop.

**The import grammar was NOT touched, deliberately.** It stays wider than the engine store's
(it takes the bare `@import x;`). The two scanners resolve into different domains — a
registry and a filesystem — and §6 of the previous note is a ledger of six defects from
trying to unify them, including a narrowed grammar that silently stopped flattening a
documented CLI form. What is shared here is only the answer to "is this inside a comment",
which both must agree on and neither owns. §5's item (2) therefore remains open, by choice.

**Evidence:** byte-identical to the old flattener over all **179** committed stylesheets, `dist/`
included — `dist/lattice.css` is the DEFAULT layout sheet every render flattens, and the first cut
of the test skipped it.

That number took three tries, which is the point of writing it down. An early draft said "190",
matching no exclusion set at all. The correction said "267" — measured by walking the working
tree, which on this machine had a built `docs/dist` and `docs/public` contributing 88 generated
duplicates. **That inflated corpus then failed CI**: the test's `length > 200` floor was tuned to
a tree that had built the docs site, and a clean checkout has 179, so `unit (node 22)` went red on
a test asserting about its own environment rather than about the code. The corpus is now
`git ls-files '*.css'` — identical on every machine, and the honest definition besides, since
committed stylesheets are what ship. Over 300,000
fuzzed sheets every divergence is adjudicated against an **independently written** oracle
(a different code shape, from the CSS Syntax rules) rather than by a heuristic. Both
divergence classes occur and both are the old regex being wrong — it sometimes MISSED an
import (swallowed the range) and sometimes INVENTED one (mis-pairing a string-borne opener
exposed code genuinely inside a comment). A first cut of that test classified by direction
and called the second class a regression; it was the test that was wrong.

**One behavior change, named:** an entry sheet ending inside an UNTERMINATED `/*` now hides
what follows, where the old regex — needing a closer to match at all — treated the whole file
as live code. CSS consumes an unterminated comment to end-of-input, so the walk's answer is
the correct one, and it is what the engine store already shipped.

**End to end on the real CLI surface:** a `--css` sheet carrying the defect shape rendered to
PDF through `lattice-emulator.js`. The shape needs all three parts, and the third is easy to
drop: `content: "/*"`, then `@import 'shared';`, then **a later real comment**. The old regex is
LAZY — with no closing `*/` anywhere it matches nothing, strips nothing, and finds the import.
It is the trailing banner that gives the string-borne opener something to pair with. With it,
the old strip found **zero** imports in that file; the new walk resolves it and the imported
rule reaches the emitted HTML and the PDF.

That detail cost something. The probe sheet had the trailing comment; the unit-test fixtures
were written from the prose, which did not — so six arms named for this defect passed under the
naive regex they existed to catch. Found by the post-commit checker, fixed by adding
`/* tail */` to every fixture, and now verified in the other direction: reverting `chain.mjs` to
the naive regex fails seven arms where it previously failed two.

## 7. Performance

`sanitizeStyleText` runs over the composed sheet (~1.5 MB) on every srcdoc write and every
restyle — the axis on which two earlier cuts of the theme-import work were rejected (a 36x
regression; an O(n²) scan costing 20 s on a 1 MB sheet). So it was measured, and the first
implementation was not good enough:

| implementation | `dist/lattice.css` (1.5 MB) | with a `</style>` present |
|---|---|---|
| regex `replace(/<\/style/gi, …)` | 0.91 ms | 2.27 ms |
| **shipped** — hop-by-hop `indexOf` + charCode check | **0.13 ms** | **0.12 ms** |

The obvious `if (text.indexOf('</') < 0) return text` fast path does **not** fire on the real
corpus: the base sheet carries `</svg` inside a data URI. `indexOf` is a memchr-class search
(0.0017 ms for the full sheet) where the `i`-flagged regex walks (0.89 ms), so the scan hops
`indexOf('</')` and verifies each landing site with five `charCodeAt` comparisons — no
`toLowerCase` copy, and the input returned **by identity** when nothing needs escaping, which
is every real stylesheet.

## 8. What this note does NOT claim

- **The EXPORT surface is now PARTLY guarded, and the split needs stating.** The first draft
  of this bullet scoped all of "export" out on the grounds that export bytes need human
  sign-off. Finding 1 showed that reasoning does not survive contact with the code: the
  browser-side assembler (`docs/src/components/studio/share-export.ts`) mounts its document in
  a same-origin, un-sandboxed frame **inside the running docs site** before anything is
  downloaded, which is not an artifact-bytes question at all — it is #22's own domain. It is
  guarded here, along with the embedded-fonts block and the baked-finish `<style>` spliced into
  the markdown a recipient receives.
  **Still unguarded, deliberately:** `lib/export/html-player.js` and its browser bundle
  `docs/src/playground/player-core.generated.js` — the CLI-side export player. The fix belongs
  at the generator (HARD RULE #2 forbids editing the bundle), and that is the export pipeline
  proper, so it wants export sign-off rather than a silent edit. It is recorded as the single
  entry in `SANCTIONED_STYLE_SINK_EXEMPT`, so the gate names it every run instead of
  overlooking it.
  **CLOSED, 2026-08-17 — see §9.** The carve-out held for the length of one PR. The CLI sink
  was measured, guarded and gated; `SANCTIONED_STYLE_SINK_EXEMPT` is now **empty**, and the
  paragraph above is kept as written because it is the record of what was true at the time.
  **On exported bytes:** the guard returns its input **by identity** unless the CSS contains
  `</style`, and no stylesheet in the 179-sheet committed corpus does — so for every real deck the
  exported file is byte-identical. That is a measurement, not a promise, and it is why this was
  judged safe to include rather than held.
- **It does not claim `sanitizeStyleText` makes theme CSS safe.** It neutralizes exactly one
  sequence — the element terminator. CSS reaching a preview frame is the engine's own
  ~1.5 MB composed sheet, and filtering that by allowlist would break the product rather than
  protect it. Everything a stylesheet can do *as a stylesheet* it is still meant to do.
- **It does not claim the two content-side `@import` scanners are unified.** They are not;
  §6 says why, and the previous note's §5 item (2) stays open.
- **It does not claim the Fabricate live-specimen path was ever exploitable.** §4 says the
  opposite, in both builds. The reported issue is real on the saved-theme path; the severity
  as written in #1709 is slightly broader than what reproduces.
- The `*/` escape **neutralizes, it does not censor**: a description legitimately containing
  those characters round-trips as readable prose rather than throwing mid-derive. `label` is
  escaped alongside `description` — #1709 named only the latter, but both are free text, both
  are seeded from the same model reply, and both land in the same comment block.

---

## 9. Closing the export carve-out (2026-08-17, same day)

§8 held the CLI export path out of scope because a change there moves the bytes of a shipped
artifact, and that needs the human's sign-off rather than a silent edit. That was the right
call about *process*. It was not a claim the path was safe, and this section is what
measuring it found.

### 9.1 The sink, and the reachable input nobody had named

`lattice-emulator.js` assembles the page's one deck `<style>` from three caller-influenced
strings, and embedded all three raw:

| source | supplied by | reached the frame |
|---|---|---|
| the palette chain (`themes/<name>.css`) | `-p` / front matter; a Studio-saved theme is model-populated | yes |
| the `--css` layout sheet | the caller, by construction — it is a file path argument | yes |
| the deck's front-matter `style:` block | **the deck author** | yes |

The third is the one §8 never considered, and it is the most reachable thing here: it needs
no custom stylesheet and no flag, only a shared `.md`. That one document feeds **three**
outputs — the emitted `.html`, the PDF render, and the `--player` file a recipient opens.

### 9.2 Measured, pre-fix and post-fix, on the real surface (HARD RULE #23)

**Surface:** `node lattice-emulator.js <deck>.md out.html`, the emitted file then opened in
the real Chromium at `$CHROME_PATH` (131.0.6778.204) — the artifact a recipient
double-clicks, not a harness. Payload: `</style><link rel="stylesheet"
href="https://evil.example/beacon.css">`, inside a **well-formed CSS comment**, with the
caller's own `--sink-probe: 1` declared immediately after it.

| | **PRE-FIX** | **POST-FIX** |
|---|---|---|
| deck `<style>` element text (`--css` probe) | **21,903 bytes**, ending mid-word at `PAYLOAD BEGINS ` | 25,535 bytes, ending at the intended last rule |
| stray `<link href=evil…>` in the parsed DOM | **1** | 0 |
| stray injected `<span>` | **1** | 0 |
| cross-origin request on open | **1 (fired)** | 0 |
| the caller's own rule after the payload | **lost** | applies |
| slides rendered | 2 | 2 |

3,632 bytes were silently dropped and the remainder became markup — about 3,400 of them the
*engine's own* layout rules (the geometry vars, the Marp system block, the skip link, the
`main#deck` rules), the rest the tail of the caller's own sheet. The front-matter `style:`
probe reproduces the same result on the same surface.

**Those are BYTES, and the first cut of this table said so while measuring something else.**
`textContent.length` is UTF-16 code units, and this table is full of `—` and `’`; the honest
byte figures (`new TextEncoder().encode(…).length`) are 21,903 → 25,535, against 20,396 →
24,002 code units. Nothing qualitative moves, and that is exactly why it was worth fixing:
this repo spent a CI failure on 190-vs-179 in §6 for the same reason — a number reported in
a unit nobody checked. Caught by the independent checker, not by the author.

**And now re-derivable, which the first cut was not.** The checker's next observation was that
this table rested on the author's word — unlike §4, whose probes are committed — so the
measurement is committed too:
`2026-08-17-theme-css-is-a-preview-sink/probe-truncation-bytes.mjs`, which prints both units
and the element's tail for any rendered fixture. The guard's own fuzz result is committed
beside it (`probe-guard-fuzz.mjs`: 300,000 cases against an independently written oracle, 0
divergences, 0 non-idempotent) for the same reason — §9.7 asserted that number with nothing
behind it.

**The `--player` export is the one with a real author→recipient split, and it is worse
there:** the injected `<link>` was **harvested into the shipped file** — `assemblePlayer`
reuses `s.outerHTML` of each `head style`, and by then the parser has resolved the breakout
into a real element — so the beacon rides in every copy, and the player was 27 KB *smaller*
because the deck's own stylesheet had been truncated. This is finding 1's shape again,
reached from the CLI: exfil in each opened copy, not key theft (the player's
`default-src 'none'` CSP blocks the fetch; the artifact still carries the node).

### 9.3 Where the fix goes, and where it deliberately does not

At the emulator's **assembly**, upstream of `caps.parseHtml`. Fixing it inside
`lib/export/player-core.mjs` cannot work: that assembler receives a parsed DOM, so the
breakout is already resolved before it can see it. `lattice-emulator.js` is CommonJS and the
guard is ESM; `require()` of an `.mjs` is native on the pinned engines and already the house
idiom (`leading-is.js`, `comment-directive.js`, `boundary-parser.js`, `math-block-rule.js`).

Four guarded sites in the emulator, and **two of them are real breakouts, not one.** The
first draft of this section called site 3 "depth"; the inversion pass proved otherwise and
the correction is the more interesting half of this record. (Site 4 *is* depth — an earlier
version of this sentence said "sites 3+4", which over-warned in a way its own list contradicted.)

1. the `htmlDoc` deck `<style>` — hoisted into one `deckStyleText` string so the *whole*
   element body is guarded at the point of embedding, not each piece separately. **The
   defect §9.2 measures.**
2. the look-diagram **scratch page**, whose `<style>` also takes `layoutCSS`. Nothing it
   emits ships, but a script node there reads and writes the browser this process drives.
   **Depth.**
3. + 4. the `--player` **prune re-wrap**, which puts CSS back into a fresh `<style>` after
   `prunePlayerCss` — and that is a css-tree parse→generate, which does not merely *risk*
   normalizing the escape, it **does**:
   ```
   IN   section::after{content:"<\/style>"}
   OUT  section::after{content:"</style>"}
   ```
   So the document's own guard is *undone* here and the re-wrap owns the terminator outright.
   **A second real breakout**, demonstrated end to end on the CLI: with site 3 unguarded, a
   deck whose front-matter `style:` puts the payload in a `content:` string ships a player
   carrying a live `<link href=evil…>`. Site 4's input is the base64 `@font-face` block from a
   fixed manifest and cannot carry `<`, so that one is depth.

The fifth `<style>` in the file (`embeddedFontsStyle`, the base64 block) is deliberately
unguarded for the same reason as site 4 — a fixed face manifest plus base64, neither of which
can contain `<`. Saying "all four `<style>` sites" would be a claim about the file's total and
would be wrong; there are five, and one needs nothing.

`player-core.mjs` is guarded at the three places it *re-serializes* transformed CSS into a
fresh element (the KaTeX block; `themeDualMode` + `minifyCss` on the deck block; the dual-mode
block). **That one really is depth, and the difference is worth stating:** no reachable
breakout through `player-core` was found, by the author, the red team, or the checker
independently. The parse closes every path that arrives in `docHtml`; `minifyCss` stashes
strings and urls verbatim and drops comments, so it preserves the escape rather than undoing
it; and the one path that survives a parse — `hoistInlineLightDark`, which lifts an inline
`style=` **attribute** (not RAWTEXT, so a `</style>` in it is preserved intact) into the
dual-mode block — is closed one layer earlier, because DOMPurify drops the whole attribute
when its value carries the payload. That last claim was flagged as the weakest thing in this
record and was then attacked specifically: measured through the real `createSlideSanitizer`
with DOMPurify 3.4.11 against raw, uppercase `</STYLE>`, `</style/`, `</style\t`, entity-
encoded, and payloads inside `content:`, `font-family:`, `url()` and a custom property — every
one dropped, with a benign `light-dark()` attribute surviving as the control. The mechanism is
DOMPurify's `SAFE_FOR_XML` attribute-value check, not a CSS filter. The guard stays because
`darkStyle` is where that hoisted text lands and nothing but the guard stands between the two
if DOMPurify's rule ever loosens.

`playerCss` is this file's own chrome and interpolates nothing but the canvas numbers, so it
carries no #22 channel. Style elements copied through verbatim as `outerHTML` need nothing
either: the parser's guarantee is that their text contains no `</style`.

### 9.4 The exported bytes did not move — measured, not asserted

The corpus is `git ls-files '*.css'` — **179** sheets, identical on every machine (§6 records
what a working-tree walk cost). **None contains `</style`.** So the guard returns its input by
identity for every real deck, and:

Two decks, each in light and dark — `examples/build.md` (7 slides) and
`examples/kaizen-craftsmanship.md` (16 slides across cards-grid, split-panel, cycle,
glossary and quote), because one deck is an anecdote:

| artifact | before → after |
|---|---|
| `.html` | **byte-identical** |
| `.pdf` | **byte-identical** |
| `--player` `.html` | identical except `generatedAt` in the base64 envelope |

That last row is not a hedge: two runs of the **unchanged** code differ in exactly the same
field, at the same byte offsets, and with `generatedAt` normalized the before/after files
compare equal. The noise floor was measured first precisely so the claim would mean something.

**One trap, worth the sentence it costs.** The first A/B was taken against `git show
main:lattice-emulator.js` and showed the PDF shrinking by 26 bytes AND turning from
nondeterministic to deterministic — which reads exactly like a real byte-identity violation,
and cost an hour of bisecting four hunks to chase. It was the *reference* that was wrong:
local `main` was stale by a long way, and decompressing the one differing PDF object stream
showed a live `D:20260817…` `/CreationDate` on the "before" side against a pinned epoch on
the "after" side — the stale ref predates `lib/core/pdf-timestamps.js` existing at all. **The
pre-change reference for a branch is `HEAD~1` / `origin/main`, never a local `main` nobody
has fast-forwarded.** The bisect was not wasted, though: it is what proved each hunk's effect
individually, and it is how the wrong reference was caught rather than shipped as a claim.

### 9.5 The gate now walks the export pipeline

`checkDocumentStyleSinks` walked `docs/src` and nothing else, so neither
`lattice-emulator.js` nor `lib/export/**` was scanned at all and this gap could have recurred
in silence. The roots are now `DOC_STYLE_SINK_ROOTS` — `docs/src`, `lib/export`,
`lattice-emulator.js` — which is the line at "ships", not at "exists". Measured before
committing to it, per the same discipline that set the `docs/src` marker at 5 files rather
than 22: the document-assembler marker selects **2** files outside `docs/src` under these
roots, both genuine, where a whole-repo walk selects **14** outside `docs/src` — the other 12
being `dist/` build products (which HARD RULE #2 forbids hand-editing, so a gate demanding a
fix there would demand the one fix that is never allowed), frozen decision-doc probes, a
bench, and local measurement tools whose output reaches nobody. (The first draft said 13;
that figure quietly excluded `.test.mjs`, which the gate does not. Corrected by the checker,
same class as §6's 190-vs-179.)

**`SANCTIONED_STYLE_SINK_EXEMPT` is now empty.** Its single entry excused the generated
player bundle because "the fix belongs at its generator" — true when written, and false the
moment the generator was guarded, since the bundle inherits the call. Leaving it would have
been a sanction for a fix that had already landed: the exact stale lie the list's rot check
exists to catch.

**The gate test was written first** and failed **6** arms before the gate moved: the root set
(pinned by value, so widening #22 cannot happen quietly), the emulator firing as a *file* root
rather than a directory, `lib/export` firing, the exemption excusing a file under a new root
while a stale one still fires, and **two** live-tree arms. Each was then re-checked by
mutation — dropping either new root, adding `dist`, and resolving a file root through
`listSourceFiles` each kill 3–4 arms.

An earlier draft listed *"`dist/` staying unscanned"* among the six. It is not: that arm
**passes** under the old gate too, vacuously, because a `docs/src`-only walk never reaches
`dist/` either. The count was right and the list was wrong — the negative controls are worth
having, but they were never part of what the test proved. Caught by the checker.

**A third shape the document marker cannot see, and the gate that closes it.** A module that
assembles no document at all, takes CSS back OUT of one, prunes it, and re-wraps it is invisible
to `checkDocumentStyleSinks`. There were **two** such sites and they are twins — the CLI's
(`lattice-emulator.js`) and the browser's (`player-prune-browser.ts`). The first cut of this
work guarded one of the two; §9.7 is what that cost. `checkCssTreeRewrapSinks` now checks both,
and — unlike every other arm of #22 — it checks **per site, not per file**. That is the point of
adding a check rather than widening one: both files rebuild two elements each and call the guard
elsewhere besides, so a file-scoped rule certifies either twin with its CSS re-wrap stripped.
Measured: with the per-site rule, all **four** re-wraps are individually caught; with a
file-scoped one, **none** is.

**What the gate still cannot catch, said plainly.** Un-guarding the emulator's page `<style>`
kills **zero** gate arms — the document arm is file-scoped text matching and the file still
calls `sanitizeStyleText` at its other sites. That is §5's inherited weakness, not a new one,
and it is why the real defense there is behavioral:
`test/integration/export/style-sink-breakout.test.js` renders the actual CLI and asserts on the
parsed artifact, and all **three** of its arms fail when that guard is removed. Its `--player`
arm renders **without** `--css` on purpose: the prune only engages on a target block ≥ 50 KB, so
the tiny hostile sheet skips the re-wrap entirely — a first cut used `--css` there and left both
prune guards deletable with everything green.

**What kills what, precisely** — an earlier draft of this paragraph was loose in both
directions, and the checker measured each cell:

| guard site | killed by |
|---|---|
| emulator page `<style>` (site 1) | all three integration arms |
| emulator prune CSS re-wrap (site 3) | the `--player` integration arm, and the re-wrap gate |
| emulator prune FONT re-wrap (site 4) | the re-wrap gate only — no behavioral test |
| both browser-twin re-wraps | the re-wrap gate only — no behavioral test |
| emulator look-diagram scratch page (site 2) | **nothing** (it needs a mermaid `look` render no fixture has) |
| `player-core.mjs`'s three | no behavioral test; removing **all three** trips the document arm, removing **one** trips nothing |

The player-core arms in `test/unit/export/html-player.test.js` pin that the *transforms*
preserve an escape, not that the *guards* fire. That is the honest state rather than a
coverage claim — and it is why the guard census in
`test/unit/export/style-guard-census.test.js` exists: it pins every one of these call sites
by count, so the rows reading "nothing" and "gate only" can no longer disappear silently.

Where those unit arms are careful is a different axis: the safe outcomes are **two**, the escape
surviving *or* the text being deleted outright (`minifyCss` strips comments), so each case
declares which it expects rather than asserting the first and going vacuous on the second.

### 9.6 A hook gap, closed alongside — and the root cause under it

§4b logged `test:diagnostics` and `test:runtime` as missing `test:<scope>` scripts —
`tools/affected-tests.js` maps `test/unit/<scope>/` to one, so staging only a file in either
directory fails pre-commit with `Missing script`. Both are added here (HARD RULE #14: a hook
failure is a root cause, never a `--no-verify`), with their `SCRIPT_META` entries, because the
HARD RULE #15 capabilities gate fails `build:check` on an undescribed script.

**Why it rode along, stated correctly.** A first draft of this paragraph said it "unblocks the
same hook this change's own test files trip". **That is false**, and the checker caught it: this
change's test files are under `test/unit/export/`, `test/unit/tools/` and
`test/integration/export/`, none of which is `runtime` or `diagnostics`, and integration paths
are skipped by `affected-tests.js` outright. The hook could not have tripped. The real reason is
plainer and does not need dressing up: the handoff that commissioned this work directed both
items into one PR as hook-unblocking infra, and said so. §4b had logged them as off-path, which
under HARD RULE #18 means logged rather than pulled in; the instruction to pull them in was
explicit, so they are here, and the PR body says which half is which.

**The root cause is that the mapping is hand-maintained.** `test:theme` was added by hand in
#1718 and two more by hand here — three patches to one gap. A unit arm now asserts that **every**
`test/unit/<dir>` has a matching `test:<dir>` script, so the fourth instance fails a test instead
of someone's commit.

### 9.7 What the adversarial trio found — one of them a live hole this change had walked past

Red team, Munger inversion and an independent checker ran against the committed diff (HARD
RULE #25). The pattern from §4b repeated exactly: **the two-line security primitive survived
all three passes unchanged, and everything they found was in the machinery and the record
around it.**

**The one that mattered.** Site 3+4's own reasoning — *css-tree normalizes the escape away, so
the re-wrap owns it* — is true of **two** identical twins, and the first cut guarded one:

| | site | first cut |
|---|---|---|
| CLI | `lattice-emulator.js` prune re-wrap | guarded |
| browser | `docs/src/components/studio/player-prune-browser.ts` | **not** |

The browser twin's own header calls it "the app-side twin of the CLI emulator's
`prunePlayerCssInPage`". It runs the same `prunePlayerCss` on the same block, and its output is
what `share-export.ts` mounts in a same-origin frame and then downloads to a recipient. Red team
drove it end to end against a **real `docs/` build** — the shipped `player-prune-browser.<hash>.js`
chunk, imported in the running Studio page in Chromium 131 — and observed a **real cross-origin
request fired when the downloaded artifact is opened**, with the assembler's own guard present
and correct two modules upstream. So: the change fixed the CLI and left the Studio's
Export-Webpage shipping the beacon it had just closed on the other path.

That is not a pre-existing defect to log. This change *established* the mechanism, guarded one
twin, and wrote a record saying the class was handled — HARD RULE #18's "a window YOU created"
covers a fix that stops halfway as squarely as a regression. It is guarded here, and
`checkCssTreeRewrapSinks` (§9.5) exists so a third twin cannot be written unguarded.

**Fix verified on the same surface the exploit was demonstrated on** (HARD RULE #23) — the
built `docs/dist`, the shipped `player-prune-browser.<hash>.js` chunk imported inside the
running Studio page, Chromium 131, same payload and same harness:

| | **PRE-FIX** | **POST-FIX** |
|---|---|---|
| live `</style><link` in the artifact's bytes | **yes** | no |
| stray `<link href=BEACON>` in the parsed artifact | **1** | 0 |
| stray injected `<span id=pwn>` | **1** | 0 |
| the deck's own rule still inside a `<style>` | **no** (truncated) | yes |
| **beacon requested when a recipient opens the file** | **`OPENED:…/BEACON.css`** | **none** |

And in the shipped bytes themselves, the same read §4 did of the deployed artifact: the
re-wrap is `` `<style>${fe(y.css)}</style>` ``, where `fe` is imported from
`deck-preview.<hash>.js` and resolves to the guard verbatim — the `[115,116,121,108,101]`
charcode table and the hop-by-hop `indexOf("</")` scan, minified to `I` and exported `as s`.

**Also folded in from the three passes, each verified before acting:**

- the integration fixture's payload lived only in a CSS *comment*, which `minifyCss` and
  css-tree both delete — so the `--player` arm was structurally incapable of failing on the
  prune guards. A `content:`-string payload and a no-`--css` render fixed it; the CSS re-wrap
  mutant now dies.
- the byte figures were UTF-16 code units (§9.2), the "13" excluded `.test.mjs` (§9.5), the
  six failing arms were mis-listed (§9.5), "all four `<style>` sites" was a wrong claim about a
  file with five (§9.3), and §9.6 rested on a premise that was not true. Five record defects,
  zero code defects, which is the ratio §4b predicts.
- `sanitizeStyleText` itself held: 300,000 fuzz cases against an independently written oracle,
  seeded with `</styl`, `</styles`, `<</style`, `</style/`, `<\/style`, lone surrogates — zero
  divergences, zero non-idempotent results, no overlap hole in the `indexOf('</', i + 2)` step.
  And it does not corrupt valid CSS: a deck legitimately carrying the terminator in a
  `content:` string and inside a `url(data:image/svg+xml,…<style>…</style>…)` was rendered and
  opened in real Chromium — computed values identical to the author's, the SVG still decodes
  and paints, no truncation.
- every other round trip between guard and shipped bytes was checked and holds: `minifyCss`,
  `themeDualMode`, `resolveLightDark`, jsdom parse→`outerHTML`, `subsetEmbeddedFonts`,
  `inlineAssets` (which `encodeURIComponent`s `<` to `%3C`), Chromium's `outerHTML` player bake,
  and the `textContent =` writes. **css-tree is the only one of those that reproduces a live
  terminator — but the class is any CSS SERIALIZER, not css-tree.** A first draft wrote "only
  css-tree", which is the same over-narrow generalization this whole section exists to correct,
  one level up, and it had been written into the gate's name and into HARD RULE #22. Measured
  in the same Chromium 131, the CSSOM does exactly what css-tree does:
  ```
  input             .x::after{content:"<\/style><img src=x>"}
  rule.cssText   →  .x::after { content: "</style><img src=x>"; }
  ```
  So the rule to carry forward is: **CSS that goes through any serializer and comes back to
  markup owes the guard again at the re-wrap.**

**Logged, off-path, not pulled into this diff** (HARD RULE #18's other half):

- **`.astro` is invisible to the stylesheet arm.** `listSourceFiles` matches
  `.js/.ts/.tsx/.mjs/.cjs`, and `docs/src` is majority `.astro`; eleven committed `.astro` files
  carry both a doctype and a `<style>`, including `docs/src/pages/studio.astro`'s
  `<style is:inline set:html={SHELL_CHROME_CSS + …}>`. Those constants are internal today, so it
  is latent — but §5's "a NEW document assembler cannot be added silently" is false for the
  commonest file type in the root it walks. Widening the extension list changes what **every**
  gate sharing that helper sees, which is not a change to make inside a security PR.
- **The document marker is evadable** — a split doctype literal, no doctype at all (a quirks-mode
  document is still same-origin and still runs script), a doctype hoisted into a shared constant,
  a split `<style>` opener, or DOM-API assembly all pass. The marker tracks a proxy for the
  security property, not the property.
- **Three more second-sinks in already-guarded files**, where the *unguarded* value is the more
  caller-influenced one: `deck-preview.js` (`bg` from `getComputedStyle(…).getPropertyValue`),
  `presenter-window.js` (`bg`), and `deck-export.js` (`theme.css` + `theme.name` spliced into a
  `<style>` in markdown handed to a recipient, and `theme.name` additionally into a `/* … */`
  header — the #1709 shape at a second serializer).
  **The reassurance that followed this sentence — "no live payload path was found for any of
  the three" — was falsified within the hour, and by the next commit.** §9.8 records the red
  team driving `deck-export.js`'s block through the real CLI to a live `<link href=evil…>`.
  The sentence was true about the *search* and false about the *world*, and it was doing
  load-bearing work in a decision to log rather than fix. `deck-export.js` and its `bridge.js`
  sibling are guarded now; the two `bg` interpolations remain logged, with no such reassurance
  attached.
- **`lib/core/marp-bundle.js`** hands the deck (front-matter `style:` intact) and theme CSS to
  marp-cli, which inlines them into a `<style>` in *its* renderer. Same class, different engine,
  and it will never match a "assembles a document" marker because it does not assemble one.
- **The fail-open shape of the root list.** The inversion's strongest structural argument is that
  a security gate enumerating three roots fails open by construction, and that inverting it —
  walk everything, exclude by allowlist — costs about four entries and fails closed. The
  commissioning handoff weighed exactly this trade and chose roots, with the reason stated
  ("rather than bolting on an allowlist nobody will maintain"), so it is recorded here as the
  live alternative rather than taken unilaterally. Its longer-term form is a single
  `assembleDocument()` chokepoint in `lib/core` — the only way anything in the repo turns strings
  into a document, with both channels inside it. That is where this class actually closes, and it
  is a coordinated pass across CJS/ESM/TS/Astro that would move exported bytes on every surface at
  once. Named as the destination, deliberately not attempted here.

### 9.8 The second trio pass, on the fix pass itself

§9.7's corrections were reviewed by a second red team / inversion / checker round, scoped to
the delta rather than re-attacking a primitive that had already survived three passes and
300,000 fuzz cases. It found the same shape a third time, which is the finding that matters
more than any individual item: **this change kept fixing one twin and declaring the class
closed.**

**A THIRD unguarded twin, demonstrated.** `share-export.ts`'s `embedFinishInMarkdown` splices
a saved finish's CSS into a `<style>` in markdown handed to a recipient, and carries an
explicit `#22 stylesheet channel` comment. Two functions with byte-identical shape did not:

| | what it embeds | first cut |
|---|---|---|
| `share-export.ts` `embedFinishInMarkdown` | a saved finish's CSS | guarded (#1718) |
| `docs/src/components/studio/export/deck-export.js` `embedThemeInMarkdown` | a **saved library theme**'s CSS | **not** |
| `lib/layout/bridge.js` `componentBlock` | **model-authored component** CSS | **not** |

Red team took `embedThemeInMarkdown`'s exact byte output for a hostile theme through the real
CLI: `1` live `<link href=evil…>` in the exported document, the theme's own CSS after the
payload turned into markup. Both are guarded here — the **whole element body**, not just the
CSS, because the theme/component *name* rides in the comment header above it and is free text
too. Pre-existing rather than introduced, but on this change's path by any reading: the guarded
twin is the model, and a PR whose deliverable is "the export half of this class is closed"
cannot ship with two literal copies of it open.

**The guard census.** Six of seven guard call sites were killed by no test — the three gates
are all text matchers, so deleting one call in a file that still calls the guard elsewhere
produces zero errors. Both reviewers measured that independently, and one watched it happen
live. `test/unit/export/style-guard-census.test.js` now pins the call count per file, by value,
with a stated reason for every `<style>` that deliberately has none. It kills every previously
unkillable mutant, and its anti-vacuity arm immediately found a file the census had missed
(`presenter-window.js`). It also pins the **third-party assumption** underneath §9.3's "depth"
call: DOMPurify dropping a `style=` attribute whose value carries the terminator, measured
against the real sanitizer — because `package.json` pins DOMPurify with a caret and
`dependabot-auto-merge.yml` merges semver-minor bumps unread, so that contract could change
overnight against a suite that stays green with all three of those guards removed.

**The `--player` arm was silently vacuous.** Every assertion in it is also satisfied by the
upstream guard alone, so the moment the prune bails — a target under 50 KB, or a failed
computed-style gate — the arm tests nothing and reports green. Measured: with the re-wrap guard
deleted AND the prune forced to bail, all three arms passed. It now asserts the emulator's own
`pruned unused CSS: N/M rules kept` line, so "the prune ran" is evidence rather than assumption.

**The re-wrap gate's discovery rule was weaker than its docstring.** "Per site" was really
"per element body", satisfied by a guarded value sitting beside an unguarded one, or by a
`sanitizeStyleText(` written inside a **comment**. It now requires every interpolation in the
element to carry the call, `.replaceAll` counts as a re-wrap, and — the part that was missing
and that the other two arms already had — **its evasion envelope is written into its docblock**:
seven measured shapes that pass while genuinely re-wrapping pruned CSS. An undeclared envelope
is how a gate gets trusted past its worth.

**The root-cause test rested on a false premise.** `affected-test-scopes.test.js` filtered to
directories containing a `*.test.js`, but `tools/affected-tests.js` maps on the **path prefix**
for *any* staged file — a fixture, or a `.test.js` one level deeper. Red team staged both shapes
and watched the hook fail with the test green. The filter is gone.

**Also corrected in the record:** §9.7's bolded "Only css-tree reproduces a live terminator" was
the same over-narrow generalization one level up — measured, the CSSOM's `cssText` does exactly
what css-tree does — and that narrow name had been written into the gate's identifier and into
HARD RULE #22. And §9.3's lead said "sites 3+4 were called depth" while its own list says site 4
*is* depth.

**Logged, off-path, not pulled in:** `docs/src/playground/snapshot-cache.js` serializes live
CSSOM rules (`rule.cssText` / `rule.style.cssText`, which normalize the escape) into
`localStorage`, and `docs/src/pages/playground.astro:447` writes that into a `<style>` in the
**top** docs document. It is inert for exactly one reason — the sink is `textContent =`, which
does not parse markup — so it is safe by the choice of one line rather than by anything this
change built. That is the CSSOM twin of the css-tree re-wrap, and the next person to reach for
`insertAdjacentHTML` there makes it live.

---

## 10. The plain `.html` keeps the deck's own HTML live, by design (2026-10-06)

§9 guarded the stylesheet channel of the CLI export. It left the markup channel of the plain
`.html` as written, and #2558's brief asked whether that was a hole or a decision: a slide
holding `<img src=x onerror="top.p=1">` exports to a file that runs the handler.

**Measured on the real surface.** `node lattice-emulator.js deck.md out.html`, the file opened in
Chromium 131.0.6778.204 from `file://`, with an `onerror` image and an inline
`<script>window.q=1</script>` on one slide:

| artifact | `window.p` (onerror) | `window.q` (script) | `[onerror]` left in the DOM |
|---|---|---|---|
| plain `.html` | **1** | **1** | 1 |
| `--player` | null | null | 0 |

**The decision: by design, and now said out loud.** The plain `.html` is the page the export
renders from. The PDF, PPTX and PNG are captured from this same file
(`page.goto('file://' + outHtml)`), and design/skill.md § "Raw HTML in a deck" documents author
`<script>` as a feature whose `requestAnimationFrame` output lands in the PDF. Stripping script
from it would break that documented feature and make the `.html` differ from the PDF it sits
beside. The artifact built for a recipient is `--player`: it sanitizes the slide DOM through
`createSlideSanitizer` under a `default-src 'none'` CSP, pinned by
`test/unit/export/html-player.test.js` ("hostile onerror is stripped"). That matches the Studio's
share export, which also produces the player. So no export bytes change, and this is not an
export change that needs sign-off.

**What was wrong was the silence.** The CLI wrote a file that runs code and said nothing, and its
own comments and two records called that file "emailable". It now warns, once per run, whenever
the file it leaves carries executable HTML of the deck's (`lib/core/live-author-html.js`, called
where the emulator applies the live document's CSP, on the final bytes):

```
  ⚠ deck.html keeps the deck's own HTML live: 1 <script> and 1 on… handler. Whoever opens the file runs them.
      To hand the deck to someone, export with --player: it sanitizes the slides and runs under a strict CSP.
```

It counts executable `<script>` elements without the engine's `data-lattice-script` marker,
`on…=` attributes, `srcdoc` frames and `javascript:` URLs. It is text matching, not a parse, and
it errs toward warning: an attribute value that contains ` onclick=` counts once too many.
It warns for the `.html` sidecar written beside every PDF, PPTX and PNG too. That was the
inversion pass's strongest objection: an author who asked only for `deck.pdf` also gets a live
`deck.html` they never asked for. Because it reads the file the run leaves, `--player` and
`--read` (both sanitized) print nothing, and a `--player` whose assembly failed, which leaves
the plain render in place, does warn; the first cut counted before the raster and got both of
those wrong (the independent checker). A deck with no raw HTML prints nothing. The three galleries
that carry a Mermaid loader `<script src=…>` for the editor preview print one line, which is
true: that tag is live in their exported `.html`.

**What the plain `.html`'s CSP does and does not do.** `lib/core/subresource-csp.mjs` blocks a
remote image and outgoing `connect-src`. It sets no `script-src` and no `default-src`, so it does
not contain a deck's own script: a kept `<script>` can still navigate the page or open a window.
That is consistent with this decision, and is the reason the warning names `--player` and not
the CSP.

**The PDF render gives a deck's script nothing an opened page lacks.** The red team checked the
launch: `--no-sandbox` plus the offline set (`lib/core/offline-chromium.js`), with no
`--allow-file-access-from-files` and no `--disable-web-security`. The three functions the page
can call are fenced to the deck folder and the Lattice install by real path, and return only
images and fonts (`lib/export/pdf-asset-reader.js`). `--allow-remote` drops the offline set,
which is the exporter's own choice.

**Found on the way, not decided here (both in `followups.d/`; the first is now §11):**

- **Export-to-Marp ships a recipient a renderer told to run the deck's HTML with local file
  access.** `lib/core/marp-bundle.js` writes `html: true, allowLocalFiles: true` into the
  bundle's `marp.config.cjs`, and the Studio's Share sheet offers the bundle from the editor
  source unsanitized. The Studio preview sanitizes, so a deck whose script came from an AI edit
  or an import can ship a payload its author never saw run. Measured afterwards with real marp-cli 4.3 on the bundle's own `npm run pdf`: with `html: true`
  a deck's `<script>` and `onerror` both run in its headless Chrome and a beacon image reaches the
  network; with `html: false` all of it prints as text. Reading a local file failed (`fetch` and XHR
  of `file://` both blocked), so that part of the red team's reasoning does not hold. A bundle's
  `marp.config.cjs` is already code the recipient runs, so the real gap is the Studio path, where the
  author never saw the script. The fix changes an exported artifact, so it waits for the owner.
- **Whether the sidecar should be written at all** when nobody asked for an `.html`. Changing the
  default changes what every PDF export leaves on disk, so that is the owner's call too.

## 11. The Export-to-Marp bundle drops the deck's own executable HTML (2026-10-07)

§10 left one hole open for the owner: the Export-to-Marp bundle's `marp.config.cjs` sets
`html: true`, so the recipient's `npm run pdf` ran the deck's own `<script>` and `on…` handlers in
marp-cli's headless Chrome. The flag has to stay: the runtime arrives as `<script>` tags at the
end of the deck. The gap is the Studio path, where the preview sanitizes, so a script an AI edit
or an import put in the source never ran in front of its author.

**What ships (pending the owner's sign-off on the PR).** `withRuntimeScripts`, the one function
both producers (the CLI's `tools/export-marp.js` and the Studio's Share sheet) end with, now
passes the deck through `withoutLiveAuthorHtml` (`lib/core/live-author-html.js`). It removes what
the §10 warning counts: `<script>` elements that run (not data scripts, not the engine's marked
ones), `on…=` attributes, `srcdoc`, `javascript:` URLs (entity-encoded and whitespace-split
ones too), `vbscript:` URLs, and a `data:` URL that is not an image (in a frame, not an SVG
image either: CodeQL's incomplete-scheme check flagged the first cut, which knew only
`javascript:` and `data:` frames). It also removes a `<base href>`, which would
re-point the bundle's relative runtime `<script src>` tags at another host, and a
`<meta http-equiv=refresh>`, which navigates the render away (the inversion pass found the
first). It runs after the previous runtime block comes off
and before the new one goes on, so Lattice's own three tags stay. Fenced, indented and inline
code stay byte-identical: they render as escaped text. `withRuntimeScriptsReport` returns what
it removed, counted after the previous export's runtime block comes off, so a re-export does not
report Lattice's own tags. The CLI prints it, the Studio's Share sheet puts it in the toast, and
the bundle's README says the trailing tags are the only scripts.

**How the strip knows it worked.** Finding inline code spans in raw markdown is a parse, and a
hand-rolled one can disagree with markdown-it, which would hide a live tag inside a "code span".
So the strip renders its own output with markdown-it and counts what is still live, with the same
detector the strip uses. If anything is, it runs again with inline spans read as live text, and
then over fences too. The fallbacks over-strip a code sample, which is the safe direction. The
check renders with plain markdown-it, not marp-core: the red team found the two agree on raw-HTML
passthrough for every probe it ran (about 45, through real marp-core 4.4 in Chrome 131, none of
which executed), but a future marpit change that passes through HTML markdown-it escapes would
not be seen by the check. The hand-copied inline-HTML regex is pinned to markdown-it's own in
`test/unit/core/live-author-html.test.js`.

**Measured with real marp-cli 4.3.1** on the bundle's own `npm run pdf` command, a local listener
on port 8765, and a probe deck carrying an inline `<script>`, an `<img onerror>`, a `javascript:`
link, a `srcdoc` frame, an inline code span and a fenced sample:

| bundle | beacons that reached the listener | quoted code |
|---|---|---|
| before (`main`) | 4 (`/script`, `/onerror`, `/srcdoc` ×2) | kept |
| after | **0** | kept, byte-identical |

The listener was re-checked as a control in the same run: the `main` bundle hit it four times
again.

**Cost, measured over every shipped deck.** Of the 418 tracked decks with `marp: true` in their
front matter, 415 bundle unchanged. The other three (`examples/gallery-jargon.md`,
`lib/components/diagram/diagram/diagram.gallery.md` and the baseline `gallery.md`) lose only their
editor-preview loader tags: `<script src="../dist/lattice-runtime.js">` and its Mermaid sibling.
Those tags pointed outside the bundle, which carries its own runtime block. (`kit/Sample-Deck.md`
carries the runtime block itself, which the bundle already strips and re-appends, so it reports
nothing.) The strip takes 148 ms over all 418 decks. The documented feature in design/skill.md §
"Raw HTML in a deck" (author script painting into the PDF) still works in the CLI's own PDF and
`.html`. It no longer works in a Marp bundle, which is the point of the change.

**What the independent checker changed.** Two defects in the first cut, both fixed before commit:

- *A cut could join its neighbors into new live HTML.* `<scr<script>x</script>ipt>` came out as
  `<script>`. The strip now repeats on its own output until a round changes nothing (at most 8
  rounds), and a deck that still renders live HTML after that has every `<` escaped to `&lt;`, so
  its HTML shows as text. No shipped deck reaches that last step. Pinned with the checker's three
  inputs.
- *The tag regexes were quadratic on raw markdown.* They rescanned to the end of the input from
  every `<`, so 128 KB of `<a b` took 8.6 s and 1 MB did not finish in nine minutes: a hostile
  deck froze the CLI export or the Studio tab. Before this change those regexes only ever read
  markdown-it's escaped output. The strip now reads tags in one forward pass, the way the browser's
  tokenizer does (`scanTags`). The same inputs at 1 MB take 0.4–0.8 s, pinned by a timing arm.

**Checked against the renderer that ships, not a stand-in (2026-10-07, raising the merge card).**
The strip's self-check renders with plain markdown-it, and the pre-merge card named that as the one
caveat touching the core claim. So every one of the 418 shipped decks' bundled markdown, and 16
attack inputs (the probe, the red team's and checkers' cases), went through real marp-core 4.4
with `html: true`, the bundle's own setting, and were counted with the strip's own detector after
subtracting marp-core's own helper script: **0 live in all 434**. The sweep found one real bypass
on the way: `<svg><style><img src=x onerror=…></style></svg>`. The scan skipped a `<style>` body as
raw text, as HTML does, but inside SVG or MathML it is markup, and Chromium ran the handler
(measured). Raw-text bodies are now skipped only outside foreign content. It also found that the
scan read `<scr<script>` as the browser would, one tag named `scr<script`, where markdown-it
renders the text `<scr` and a real `<script>`; on deck source the scan now follows markdown-it's
tag-name rule. And the fallback order changed: each pass kind runs to its own fixed point before
the strip reads inline code as live, so a joined tag no longer costs the deck its code samples.

**Pinned against the real thing.** `test/integration/export/marp-bundle-author-script.test.js`
builds the bundle with `tools/export-marp.js`, renders it with marp-cli (`npx`, the
`MARP_CLI_RANGE` pin, failing in CI rather than skipping, as `marp-admission.test.js` does),
opens it in Chromium and asserts that no payload ran, the runtime loaded with no `<base>` in the
page, and quoted code still shows. With the strip disabled it fails: four payloads ran
(`script`, `onerror`, `srcdoc`, the `<svg><style>` breakout) and the `<base>` kept the runtime
from loading.

**What it does not do.** A plain remote image (`<img src="https://…">`, or markdown's
`![](https://…)`) still loads in marp-cli. That is a web image, a feature, and the same in any
Marp deck. Stripping it would break decks rather than close a hole. For the same reason an
`<iframe src="https://…">`, `<object data="https://…">` or `<embed>` pointing at a remote page
stays: the page it loads runs in its own origin, not the deck's. That is network reach, as a
remote image is, and not the deck's own script. An SVG `<animate>` that sets
`href` to `javascript:` is caught (`values`, `to` and `from` are URL attributes here). The strip
is text matching backed by a render check, not a DOM sanitizer, because its output is markdown.

**The stronger design, not taken here.** The inversion pass's steelman: this is a denylist, and
a tag nobody remembered (as `<base>` nearly was) breaks it quietly. An allowlist removes the
class: load the runtime through a marp-cli `engine:` plugin in `marp.config.cjs` instead of raw
`<script>` tags, then set marp-core's `html` option to an allowlist of the tags and attributes
Lattice decks use. It costs every deck that uses unusual HTML, and the allowlist needs keeping.
Logged in `followups.d/` rather than built in this PR.


## 12. A fence opened in the front matter blinded both of the bundle's checks (2026-10-07)

The bundle's two passes over the deck's markdown both read it with plain markdown-it: § 11's strip
(`lib/core/live-author-html.js`, to tell code from live HTML), and #2577's refusal of forged plugin
markers (`lib/plugins/author-markup.js` `refuseAuthorMarkupInSource`, to find the raw-HTML lines).
Plain markdown-it reads the YAML front matter as Markdown; Marp removes it before it parses. So a
front-matter value whose next line opens a fence made the whole body one unclosed code block to both
passes and live HTML to Marp:

````markdown
---
marp: true
note: |
  ```
---

<img src=x onerror="document.title='pwned'">
<div data-lattice-hydrate="function-plot" data-lattice-config="…" data-lattice-settle="pending"></div>
````

The independent checker on #2578's first draft found it and ran it through `tools/export-marp.js`,
real marp-cli 4.3.1 and Chromium 131: the strip removed nothing and `title` became `pwned`, and,
with `function-plot.js` beside the runtime, the forged figure was drawn. `main` after #2577 still
let the marker through (measured).

**What ships.** Both passes now parse the deck with a closed front matter's lines emptied, as Marp
parses it, so line numbers still match (`withoutFrontMatterLines` in the strip; the same step in
`refuseAuthorMarkupInSource`, which already refuses the front matter's own text whole). The strip still
scans the front matter's text, because Marp renders a `header:` value as Markdown. An unclosed front
matter is not front matter to Marp, so it stays in the parse.

**Measured.** The bundled markdown of all 422 tracked `marp: true` decks (`withRuntimeScripts`) is
byte-identical to `main`'s, in 335 ms. Each pass has a unit case that fails without the change
(`test/unit/core/live-author-html.test.js`, `test/unit/plugins/author-markup.test.js`).
