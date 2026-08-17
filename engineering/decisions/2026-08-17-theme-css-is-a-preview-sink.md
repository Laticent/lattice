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

**NOT verified, and named as such:** the Fabricate *live specimen* path. The description
does not reach that frame's `<style>` in either build — the specimen renders through the
packer, which strips the header — so that surface is inert for this defect and cannot
demonstrate either direction. The click path was driven (⌘K → Fabricate → Description →
type) and the field, the re-derive and the preview all behave; it simply is not where the
sink lives. The reachable path is the SAVED theme (`saveStudioTheme` → `extraTheme` →
`addThemes`), which is what §4's table drives.

## 5. The gate: HARD RULE #22 now has two channels

The rule and `checkPreviewHtmlSinks` were both written in terms of the slide-HTML sink, so
a builder passed the gate while concatenating unsanitized theme CSS two lines above the
sanitized HTML. That was the live state, not a hypothetical.

The gate now checks both, independently: a sanctioned builder owes `sanitizeSlideHtml`, and
— **only if it embeds a `<style>` element** — also `sanitizeStyleText`. Keying the second
obligation on a per-file marker rather than an allowlist field is deliberate: a field would
need maintaining and could rot into a lie, while the marker is re-derived from the source
every run.

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

**Evidence:** byte-identical to the old flattener over all 190 repo stylesheets; over 300,000
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

**End to end on the real CLI surface:** a `--css` sheet carrying the defect shape
(`content: "/*"` then `@import 'shared';`) rendered to PDF through `lattice-emulator.js`. The
old strip found **zero** imports in that file; the new walk resolves it and the imported rule
reaches the emitted HTML and the PDF.

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

- **It does not claim the HTML/PPTX EXPORT path is guarded.** `lib/export/html-player.js`
  builds a self-contained document with its own `<style>`, and the same class applies there.
  It is deliberately out of this change: an export change alters the bytes of a shipped
  artifact and needs human sign-off (the QUALITY BAR's one hard stop), and #22's domain is
  the preview frame. Logged here per HARD RULE #18's off-path rule; `sanitizeStyleText` is
  sitting in `lib/core/` ready for it.
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
