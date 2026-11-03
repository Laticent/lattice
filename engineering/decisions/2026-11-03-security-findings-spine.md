---
status: proposed
summary: >
  Security has one policy (remote-ref.js), two enforcing walls (the sanitizers, then the browser's
  policy) and no way to tell the author what was blocked. Lint stays a SOURCE check: lint:deck flags
  the unsafe things an author wrote, reading HTML and CSS through the shared readers (scanHtml,
  cssRefSpans) and judging addresses with the shared check (media-sources isRemoteRef), never a policy
  of its own. Separately, the enforcing layers return findings of what they removed, which the Studio
  and the exports show. A build:check census rule keeps private address readers out. D1 to D4
  answered by the owner 2026-11-03; D5, the lint-core byte budget, is open.
---

# Security findings: lint the source with the shared readers, and have the enforcing layers report

**Answer.** Lattice decides what is unsafe in one place and enforces it twice, but tells the author
nothing: a refused picture is a gray box, a stripped `onerror=` vanishes, and `lint:deck` is silent.
The fix has two halves that share one policy:

1. **Lint reads the source.** `lint:deck` flags what the author wrote: a web picture, a click-time
   beacon, a script or an event handler, a style that breaks out of its element. It reads raw HTML
   with `scanHtml`, CSS with `cssRefSpans`, and judges each address with the same check the scanner
   uses. It renders nothing and has no policy of its own.
2. **The enforcing layers report.** The scanner, the sanitizers and the code door return a list of
   what they removed beside their output. The Studio and the exports already render, so they show
   those findings at no extra cost. This half covers what the ENGINE writes, which is not in the
   source.

## Why this note exists

The owner asked, after Segno R4 (#3018): "what should the linter be doing to make sure things are
flagged as insecure, and more broadly, a shared spine that all use to ensure security is built in?"
R4 had just shown the cost of private readers. Four consumers each read markup or CSS their own way,
each disagreed with the browser somewhere, and a fifth (`lib/export/html-player.js`) was found only
because a review went looking.

A first draft of this note had `lint:deck` render the deck and lint the output. The owner rejected
that: a linter works on sources. The draft also called a source check "a second reading of the
policy". It is not, as long as the source check uses the shared readers and the shared address check;
what R4 removed was private READERS, not the act of checking source.

## What exists today (read from the tree, 2026-11-03)

| Layer | Where | What it returns |
|---|---|---|
| **Read** markup and CSS | `scanHtml`, `cssRefSpans` (Segno R2, R3) | Spans with offsets, and `unsure` spans with a reason |
| **Judge** an address | `lib/core/media-sources.js` `isRemoteRef` (re-exported as remote-ref's `isRemoteUrl`) | Whether the address is a fetch to another site |
| **Decide** what a rendered document may keep | `lib/core/remote-ref.js` (`blockWebImages`, `blockWebCss`, `remoteRefsInHtml`) | Rewritten text, plus `blocked: [{ url, origin, kind }]` with no slide or place |
| **Enforce**, wall one | `sanitizeSlideHtml`, `sanitizeStyleText`, `sanitize-diagram-svg.mjs` | Cleaned text only. DOMPurify keeps a `removed` list per call; nothing reads it |
| **Enforce**, wall two | `lib/core/subresource-csp.mjs`, sandboxed frames | A browser console line |
| **Plugins** | the code door (`code-door-core.mjs`, `code-door-fence.mjs`) | A note in the slide (`data-package-error`) with the reason |

The linter (`lib/authoring/lint-core.js`) reads source and has no security rule. Its security-adjacent
rules are `unknown-plugin`, `plugin-fence-attributes`, `shell-fence-is-script` and
`author-script-defers`. It reads Markdown images with regexes of its own (`BG_LINE_RE` at
`lint-core.js:986`, and others), which is the deck pipeline's to replace: its P3 and P4 move lint-core's
own scanners onto the shared document model (`2026-10-22-segno-deck-pipeline.md`).

## The design

### 1. Lint: source rules over the shared readers

| What the author wrote | How lint reads it | What it says |
|---|---|---|
| `![](https://…)`, `![bg](https://…)`, a reference definition | lint-core's Markdown image reading today; the deck model's inline structure once P4 ships | "loads from another site: the preview shows a placeholder and the export leaves it out" |
| Raw HTML: `<img src>`, `srcset`, `<video poster>`, an SVG `<image href>` | `scanHtml` over each raw HTML block and inline HTML span | the same |
| `ping=`, `<form action>`, `formaction=` | `scanHtml` | "sends a request when clicked; the preview removes it" |
| `<script>`, an `on…=` handler, a `javascript:` link | `scanHtml` | "the preview strips it; it never runs" |
| A `style` attribute or `<style>` naming a web address, or holding `</style>` | `cssRefSpans`, and the test `sanitizeStyleText` applies | the web-address message, or "ends the style early; the preview neutralizes it" |
| Markup `scanHtml` reports as `unsure` | `scanHtml`'s `unsure` spans | "a browser may build this differently from the preview" |
| A plugin that is not approved | `unknown-plugin`, unchanged | unchanged |

Every address goes through `isRemoteRef` and the deck's allowed origins, the same inputs the scanner
uses, so the linter and the render cannot disagree about which address is a web address. Each rule
lives in `lint-core.js` (HARD RULE #7), is a warning (D2), and carries a fix.

### 2. Report: the enforcing layers say what they removed

The scanner, the sanitizers and the code door return `findings` beside their output:

```js
{ layer, rule, slide, at: { from, to }, what, why, fix }
```

- `remote-ref.js` adds the slide and the place to what `blocked` already has.
- The slide sanitizer copies DOMPurify's `removed` list out (D3). `sanitizeStyleText` reports each
  `</style>` it neutralized.
- The code door returns the record its note already prints.

The Studio's Coach and editor marks, and each export's completion warning, show these. They are the
same `rule` names the linter uses, from one table beside the policy, so an author sees one message
for one problem whichever surface shows it.

**Why both halves.** Lint catches what the author can fix in the source, before any render. The
report catches what only the render knows, such as a picture a plugin or a chart writes. Neither
decides policy; both read the one table.

### 3. A census gate, so private readers stay gone (D4)

A `build:check` rule fails when code outside the sanctioned readers reads addresses out of markup or
CSS with a pattern of its own (a regex over `src=`, `href=`, `url(` or `background` applied to markup
or a style). Its allowlist fails on a stale entry, like HARD RULE #22's. Day one it lists two entries,
each with its reason: `lib/export/html-player.js` (the R4 migration left, `followups.d/2909-p4-…`) and
lint-core's Markdown image regexes (until the deck pipeline's P4). It changes what an existing gate
finds, and adds no CI job or step.

## Cost, measured

Gzip sizes of each piece bundled alone (esbuild, minified, level 9; 2026-11-03):

| Piece | Gzip | Already in the engine bundle? |
|---|---|---|
| `media-sources.js` (`isRemoteRef`) | 1.2 KB | **Yes**: `lattice-playground.js` carries it, so it costs lint-core nothing |
| `html-ref-reader.js` + `html-ref.generated.js` (`scanHtml`) | 1.9 KB + 3.1 KB | No |
| `css-ref-reader.js` + `css-ref.generated.js` (`cssRefSpans`) | 1.4 KB + 2.5 KB | No |

`lintCoreGz` counts lint-core and its imports beyond the engine's own closure. It measured 123.5 KB
against a 124.3 KB ceiling on #3018's head, so 0.8 KB is left. The HTML and CSS readers add up to
about 8.9 KB, which does not fit (D5). The exact figure is S1's to measure in the real build: a piece
the Studio's lint chunk already shares with another chunk may cost less.

The report half costs nothing new in time: the Studio and the exports already render and already run
the scanner.

## Phasing

Each phase ships alone and reverts alone.

| Phase | What | Evidence it owes |
|---|---|---|
| **S0** | The `rule` table and finding shape in one kernel | One test per rule |
| **S1** | Lint's source rules (section 1), over `scanHtml`, `cssRefSpans` and `isRemoteRef` | Every rule fires on a picked case and is silent on the 349 decks under `examples/` except where a deck really holds the construct; each such hit reviewed; lint time and `lintCoreGz` measured before and after |
| **S2** | `remote-ref.js` returns findings beside `blocked` | Every current consumer's output byte-identical on the corpus |
| **S3** | The sanitizers report what they removed | A seeded stream: every removal appears as a finding, and nothing else does |
| **S4** | The Studio's Coach and editor marks, and the export warning, show render findings | The real Studio at three widths and in WebKit; the export warning before and after |
| **S5** | The census rule in `build:check` | Its failing arm: a planted regex reader in `docs/src` fails the build |

## Decisions for the owner

Answered by the owner on 2026-11-03:

- **D1. Where lint reads. Answered: the source.** "Linting works on sources." `lint:deck` renders
  nothing; it reads the source with the shared readers and judges addresses with the shared check.
  What only the render knows is reported by the enforcing layers (section 2), not linted.
- **D2. Severity. Answered: a warning, never a block.** The render already enforces; the warning
  explains and gives the fix. The package gallery gate keeps refusing, as now.
- **D3. The sanitizers report what they remove. Answered: yes.**
- **D4. The census rule in `build:check`. Answered: yes.**

Open:

- **D5. The lint-core byte budget.** Lint's HTML and CSS rules need `scanHtml` and `cssRefSpans`,
  about 8.9 KB gzipped bundled alone, and `lintCoreGz` has 0.8 KB left under its ceiling.
  *Recommended:* in S1, measure the real cost in the Studio build and raise the `lintCoreGz` ceiling
  by that measured amount, declared in `docs/route-budget.d/`. *Alternatives:* ship only the rules
  that need neither reader first (Markdown images, judged with `isRemoteRef`, which costs nothing),
  and add the HTML and CSS rules when the deck pipeline's model carries those readers anyway; or load
  the security rules lazily in the Studio only, which breaks lint-core's "synchronous, shared by CLI,
  `validate()` and browser" contract (HARD RULE #7) and is not recommended.

## Not decided here

- The exact wording of each rule's message and fix. That is S1's, against real decks.
- Whether a finding ever blocks an export. This note says no.
- The CLI export's reader itself, which is the 2909-p4 follow-up.
