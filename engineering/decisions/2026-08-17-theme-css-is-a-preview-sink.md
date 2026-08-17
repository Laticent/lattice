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
