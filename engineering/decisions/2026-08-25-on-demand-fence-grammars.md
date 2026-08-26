---
status: shipped
summary: >
  The 2026-07-19 preview-bundle work swapped highlight.js's full 192-language build for the
  36-language `common` one and halved cold load. It also opened a silent parity hole that
  nothing could see: the CLI and marp-core both still ship all 192, so the same deck coloured
  differently in the preview than in its own export, with nothing logged — a `powershell` fence
  measured 11 highlight spans in a lattice-emulator PDF and 0 in the Playground, `dockerfile`
  9 and 0. The hole was invisible because the engine's `highlight` option guards with
  `hljs.getLanguage(lang)` and silently emits plain text on a miss, and because WHICH languages
  a build supports was decided by an esbuild `onResolve` hook in a build script rather than
  declared anywhere the engine could answer for. Closed by keeping the `common` swap and
  fetching the rest per deck: `engine.languages` now declares the capability and answers
  `missing(markdown)`, tools/build-hljs-languages.js emits the 156 non-common grammars one
  file each, and the docs render chokepoint awaits only what a deck names. Measured on the
  real Playground: a deck using powershell + dockerfile fetches index.json plus two files
  (~7 KB) and reaches 11 and 9 spans — the export's exact counts — while a deck using only
  common languages fetches nothing. Per-language beat a single lazy "extras" chunk decisively
  (median 1.9 KB against 316 KB gzipped for one exotic fence) and the full build outright
  (+2.4 KB to the bundle against +259 KB gzipped). A separate finding rides along: `shell`
  and `console` are highlight.js's terminal-SESSION grammar, not a shell-script one, so a
  script fenced ```shell renders almost uncoloured on EVERY path — 15 spans as ```sh against
  2 as ```shell — which no amount of coverage repairs. That is now an authoring lint.
---

# On-demand fence grammars — close the preview/export highlighting gap without paying for it

**Date:** 2026-08-25 · **Status:** shipped
**Trigger:** an author reported that `compare-code` "doesn't look the same" in Marp and the
Studio as in the Playground or a Lattice export, with shell scripts, in indaco. Driving one
deck through marp-cli, the emulator, a Studio PDF export and the Playground found
compare-code itself in parity — marp-cli and the emulator produced **byte-identical PNGs** —
and turned up two different things instead. Both are recorded here.

## 1. What was actually wrong with the highlighting

### The gap: coverage differs by surface, silently

| Surface | highlight.js build | `powershell` | `dockerfile` |
|---|---|---|---|
| lattice-emulator (CLI/PDF) | full, 192 | 11 spans | 9 spans |
| marp-cli / marp-kit | full, 192 (marp-core's own) | 11 spans | 9 spans |
| Playground / Studio preview | `common`, 36 | **0** | **0** |
| Studio PDF export | — (rasterizes the preview) | **0** | **0** |

All four numbers are measured, not inferred. The preview shortfall came from one esbuild
plugin in `tools/build-playground.js` (`hljsCommonPreviewPlugin`) added by
`2026-07-19-preview-bundle-hljs-common.md`. That swap was correct and stays: it took the
preview bundle from 1.65 MB to 733 KB raw. What was wrong was that the decision was
*unobservable*. `lib/engine/index.js`'s `highlight` option is:

```js
if (lang && hljs.getLanguage(lang)) { …highlight… }
return '';   // ← a miss falls through to plain escaped text
```

which is the right graceful degradation for a genuinely unknown language and the wrong one
for a language the product supports and this build happens not to carry. Nothing distinguished
the two cases, so nothing could report it.

### The trap: `shell` is not a shell script

Independent of coverage, and the more likely explanation for what the author saw. In
highlight.js:

- **`bash`** — aliases **`sh`**, **`zsh`** — is a shell-SCRIPT grammar.
- **`shell`** — aliases **`console`**, **`shellsession`** — is a terminal-SESSION grammar
  whose job is to mark the `$` prompt in pasted output.

Measured on one eleven-line POSIX script, identical text, on every render path: **15 highlight
spans as ` ```sh `, 2 as ` ```shell `**. Both are correct behaviour. No amount of extra
language coverage changes it, which is why it is an authoring rule rather than a bug.

## 2. What was chosen, and against what

The requirement was full highlight.js coverage plus Mermaid (already shipping — Lattice writes
its own Mermaid grammar, `lib/integrations/mermaid/mermaid.hljs.js`; stock highlight.js has
none) with parity across Studio, Playground, CLI and the runtime. Four shapes, measured as
isolated minified+gzipped bundles:

| Option | Languages | hljs gzip | Cost to a deck using ONE exotic fence |
|---|---|---|---|
| Keep `common` | 36 | 53 KB | never colours it |
| `common` + a curated ~44 | 80 | 101 KB | still never colours an unlisted one |
| Ship the full build | 192 | 312 KB | **+259 KB on every page load**, always |
| **Per-language, on demand** | 192 | 53 KB up front | **median 1.9 KB**, only when used |

A fifth shape — one lazily-fetched "extras" chunk holding all 156 — was measured and rejected:
it keeps first paint free like the winner, but a single ` ```dockerfile ` then costs **316 KB
gzipped** against 1.9 KB. A 300× difference on the common case is not a close call.

The curated-set option was rejected on a different axis: it is not parity. An unlisted language
is still silently grey, and the list needs curating forever — the same unobservable shortfall
in a smaller size.

## 3. The shape that shipped

**The engine declares the capability; the host performs the fetch.** That split is forced, not
stylistic: `render()` is synchronous BY DESIGN (`lib/engine/README.md` — the headless-Chromium
PDF path has raced on async reflow before), so anything that must be loaded before a render has
to be awaited *above* it, in the caller — and the caller is also the only party that knows the
asset base, the content hash and the service worker.

```
lib/core/fence-languages.js     pure kernel: walk the fences, name the languages,
                                  tell a script from a session
lib/engine  `languages`         has / list / needed(md) / missing(md) / register(name, def)
tools/build-hljs-languages.js   156 grammars → docs/public/playground/hljs/<name>.js
                                  + index.json (aliases resolved at BUILD time)
lib/playground                  missingLanguages(md) · drainLanguages()
docs/src/lib/ensure-hljs-…      fetch + inject, mirroring ensure-katex.ts
docs/src/lib/render-engine.ts   awaits it at the one chokepoint every surface passes
```

Three details are load-bearing and each has a failure mode behind it:

- **The queue, not a callback.** Each grammar file pushes `[name, definition]` onto
  `window.__latticeHljs` and `drainLanguages()` empties it. Classic-`<script>` arrival order
  against the engine bundle is not something the page controls, so a file that lands early must
  wait rather than call into a global that does not exist yet.
- **Aliases resolved at build time.** A grammar declares its aliases *inside* the file, so
  without the manifest the browser would have to fetch speculatively to learn whether the file
  it wants is the file it asked for. `index.json` maps `ps1` → `powershell.js` in one lookup.
- **Nothing rejects.** A grammar that will not load leaves its fence in plain monospace — which
  is exactly what happened before this change, and is not worth failing a preview over.

## 4. Verified

On the real Playground (HARD RULE #23), not a harness:

- A deck with `powershell` + `dockerfile` fences requested exactly `index.json`,
  `powershell.js`, `dockerfile.js` and rendered **11 and 9 spans** — the emulator export's
  exact counts.
- A deck using only `common` languages requested **nothing** and rendered identically to before.
- Engine bundle: 930.4 KB → 932.8 KB raw (**+2.4 KB**), against +259 KB gzipped for the full build.
- Grammar assets: 156 files, 932 KB total on disk, median 1.9 KB. `docs/public/playground/` is
  gitignored (`2026-08-17-generated-bundles-uncommitted.md`), so none of it is committed and an
  hljs bump regenerates the lot with no diff to review.

## 5. What this does NOT close

**The Marp paths.** marp-core carries the full highlight.js, so language coverage there was
never the problem — but it is marp-core's own instance and Lattice's markdown-it plugins never
run on it, so a ` ```mermaid ` fence gets no Lattice grammar in the marp-kit or the VS Code
preview. In practice those fences are upgraded to real SVG by `lattice-runtime.js`, so the
uncoloured source is only visible when that upgrade fails.

**The Studio PDF.** It rasterizes the preview into jsPDF, so it inherits whatever the preview
renders — including, now, correctly-coloured exotic fences. It remains a raster: 0 selectable
characters against the CLI PDF's 1,152, and 2.9× the file size for the same three slides. That
is a separate and larger piece of work, tracked outside this note.
