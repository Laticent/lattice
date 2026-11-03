---
status: proposed
summary: >
  One spine, two independent consumers. The spine is the shared readers (scanHtml, cssRefSpans, the
  Markdown reading) plus ONE policy table: which addresses are another site, which attributes fetch on
  render or on a click, which tags and attributes are script, which styles end early. The linter reads
  the SOURCE through the spine and warns; the renderer reads its OUTPUT through the spine and blocks.
  Neither calls the other or reads the other's results; they agree because they ask the same questions
  of the same facts. A build:check census rule keeps private readers and private copies of the table
  out. D1, D2 and D4 answered by the owner 2026-11-03; D3 is re-asked under this model; D5 (lint-core
  bytes) is open.
---

# One security spine: the linter warns, the renderer blocks, and neither depends on the other

**Answer.** Security has two jobs done by two independent consumers:

- **The renderer blocks.** It reads its own output and removes what is unsafe: the scanner refuses web
  addresses, the sanitizer strips script, the browser's policy stops anything left. It must work with
  no linter in sight, because a deck can arrive from anywhere.
- **The linter warns.** It reads the source the author wrote and tells them what is unsafe and how to
  fix it. It must work with no render, because a linter works on sources.

Neither calls the other, and neither reads the other's results. They agree because both ask the same
questions of the same facts: **the spine**. The spine is the shared readers plus one policy table.
Today those facts are scattered: the scanner keeps its attribute lists inside `remote-ref.js`, the
sanitizer keeps its strip list inside `sanitize-slide-html.mjs`, and the linter has neither. So the
work is to put the facts in one place, have the renderer read them from there, and give the linter
rules that read them too.

## Why this note exists

The owner asked, after Segno R4 (#3018): "what should the linter be doing to make sure things are
flagged as insecure, and more broadly, a shared spine that all use to ensure security is built in?"

Two earlier drafts of this note got the shape wrong, and the corrections are the design:

1. The first had `lint:deck` render the deck and lint the output. The owner: "linting works on
   sources." A linter that needs a render is coupled to the renderer.
2. The second kept lint on source but had the renderer REPORT what it removed, for the Studio to show.
   That still couples them: a surface reading the renderer's removals depends on the renderer telling
   it. The owner: "linter warns, renderer blocks"; if they depend on each other, there is a problem.
   They should arrive at the same fact through the same spine and act on it independently.

## What exists today (read from the tree, 2026-11-03)

| Fact | Where it lives | Who reads it |
|---|---|---|
| Is this address another site? | `lib/core/media-sources.js` `isRemoteRef` | the scanner (as `isRemoteUrl`) |
| Which attributes fetch on render | `RENDER_FETCH_ATTRS` in `lib/core/remote-ref.js:804` | the scanner only |
| Which attributes fetch on a click | `CLICK_FETCH_ATTRS` in `remote-ref.js:812` | the scanner only |
| Which attributes name an address at all | `FETCH_ATTRS` in `remote-ref.js:90` (exported) | the scanner, the gallery gate |
| Which tags and attributes are stripped | `FORBID_TAGS`, `FORBID_ATTR` in `lib/core/sanitize-slide-html.mjs:39` | the sanitizer only |
| Which style text is script or ends early | `STYLE_SCRIPT_RE` in `sanitize-slide-html.mjs:105`; `sanitizeStyleText` | the sanitizers only |

The readers are already shared: `scanHtml` and `cssRefSpans` (Segno R2, R3, R4). The Markdown side is
not: lint-core reads Markdown images with regexes of its own (`BG_LINE_RE` at `lint-core.js:986`, and
others), which the deck pipeline's P3 and P4 replace with the shared document model
(`2026-10-22-segno-deck-pipeline.md`).

The linter (`lib/authoring/lint-core.js`) has no security rule. The nearest are `unknown-plugin`,
`plugin-fence-attributes`, `shell-fence-is-script` and `author-script-defers`.

## The design

### 1. The spine: readers plus one policy table

A small, require-free kernel, `lib/core/content-policy.js`, holds every fact both consumers need:

- the attribute sets: render-time fetch, click-time fetch, any address;
- the tags and attributes the sanitizer strips, and which attributes are event handlers (`on…`);
- the style tests: script in a style, a `</style>` that ends the element early;
- the address question, by re-exporting `isRemoteRef` and the allowed-origin rule (the site's own
  origin, plus the deck's `webOrigins`).

Each fact is DATA plus a pure predicate, with no reading of markup in it. The readers stay where they
are (`scanHtml`, `cssRefSpans`, the Markdown reading). The kernel requires nothing, so the docs dev
server and the plugin code door can load it (the rule `css-ref-reader.js` follows).

### 2. The renderer blocks, reading the spine

`remote-ref.js` and the sanitizers import their lists from `content-policy.js` and keep their own
logic. Behavior does not change: on the corpus, every rendered and exported document is byte-identical
before and after. The renderer gains nothing and loses nothing, except that its facts now live where
the linter can read them too.

The renderer keeps its own visible marks, which are part of its output and need no linter: the web-
image placeholder, and the code door's note in the slide (`data-package-error`).

### 3. The linter warns, reading the spine

`lint:deck` gets rules that read the SOURCE through the shared readers and ask the spine:

| The author wrote | Read with | The spine's question | The warning |
|---|---|---|---|
| `![](https://…)`, `![bg](https://…)`, a reference definition | lint-core's Markdown reading today; the deck model once P4 ships | is this address another site? | "loads from another site: the preview shows a placeholder and the export leaves it out" |
| Raw HTML `<img src>`, `srcset`, `<video poster>`, SVG `<image href>` | `scanHtml` | a render-time fetch attribute, to another site? | the same |
| `ping=`, `<form action>`, `formaction=` | `scanHtml` | a click-time fetch attribute? | "sends a request when clicked; the preview removes it" |
| `<script>`, `<iframe>`, an `on…=` handler, a `javascript:` link | `scanHtml` | a stripped tag, a handler, a script scheme? | "the preview strips this; it never runs" |
| A `style` or `<style>` with a web address, script, or `</style>` | `cssRefSpans` and the style tests | an address to another site, or a style that is script or ends early? | the web-address warning, or "ends the style early; the preview neutralizes it" |
| Markup `scanHtml` reports as `unsure` | `scanHtml` | (the reader's own fact) | "a browser may build this differently from the preview" |

Each rule lives in `lint-core.js` (HARD RULE #7), is a warning (D2), and gives a fix. The Studio shows
these warnings where it already shows lint: the Coach and the editor marks. The export dialog can run
the same lint on the source before it exports. Neither surface reads anything from the renderer.

**What the linter cannot see, and why that is acceptable.** Markup the ENGINE writes, such as a chart's
SVG or a plugin's drawing, is not in the source. The renderer still blocks anything unsafe in it,
because blocking never depended on the linter. Where a source construct produces it, the linter can
warn on the construct (a plugin that is not approved, `unknown-plugin`). What the linter cannot see, it
does not claim to.

### 4. A census gate, so the spine stays the only source of facts (D4)

A `build:check` rule fails on two things outside the sanctioned readers and the kernel:

- a private reader: a regex over `src=`, `href=`, `url(` or `background` applied to markup or a style;
- a private copy of a policy list: a literal set of fetch attributes, stripped tags or handlers.

Its allowlist fails on a stale entry, like HARD RULE #22's. Day one it lists two entries, each with
its reason: `lib/export/html-player.js` (the R4 migration left, `followups.d/2909-p4-…`) and lint-core's
Markdown image regexes (until the deck pipeline's P4). It changes what an existing gate finds and adds
no CI job or step.

## Cost, measured

Gzip sizes of each piece bundled alone (esbuild, minified, level 9; 2026-11-03):

| Piece | Gzip | In the engine bundle already? |
|---|---|---|
| `media-sources.js` (`isRemoteRef`) | 1.2 KB | **Yes** (`lattice-playground.js` carries it), so it is free for lint-core |
| `content-policy.js` (the table) | not built yet; lists of names, expected well under 1 KB | n/a |
| `scanHtml` (`html-ref-reader.js` + `html-ref.generated.js`) | 1.9 KB + 3.1 KB | No |
| `cssRefSpans` (`css-ref-reader.js` + `css-ref.generated.js`) | 1.4 KB + 2.5 KB | No |

`lintCoreGz` counts lint-core and its imports beyond the engine's own closure. It measured 123.5 KB
against its 124.3 KB ceiling on #3018, so 0.8 KB is left. The two readers come to about 8.9 KB bundled
alone, which does not fit (D5). S2 measures the real figure in the Studio build.

## Phasing

Each phase ships alone and reverts alone.

| Phase | What | Evidence it owes |
|---|---|---|
| **S0** | `content-policy.js`; `remote-ref.js` and the sanitizers import their lists from it | Every rendered and exported document byte-identical on the corpus; the scanner's fuzz in three engines unchanged |
| **S1** | Lint's Markdown-address rules (no new reader; `isRemoteRef` is free) | Each rule fires on a picked case; every hit on the 349 decks under `examples/` reviewed; lint time and `lintCoreGz` measured |
| **S2** | Lint's HTML and CSS rules, over `scanHtml` and `cssRefSpans` | The same, plus a differential: on seeded markup, the linter warns on exactly what the renderer blocks, judged by running both independently |
| **S3** | The census rule in `build:check` | Its failing arm: a planted regex reader, and a planted copy of a list, each fail the build |

S2's differential is the spine's acceptance test. It does not make the linter depend on the renderer.
It checks, offline, that the two consumers reach the same verdict from the same facts.

## Decisions for the owner

Answered by the owner on 2026-11-03:

- **D1. Where lint reads. Answered: the source.** "Linting works on sources."
- **D2. Severity. Answered: a warning, never a block.** The renderer blocks; the linter explains.
- **D4. The census rule. Answered: yes.** Under this model it also catches a private copy of a policy
  list, not only a private reader.

Re-asked, because the model changed under it:

- **D3. The sanitizers' strip list.** It was asked as "should the sanitizers report what they remove?".
  Under this model the renderer reports to no one, so the question becomes: *should the sanitizer's
  lists (stripped tags, stripped attributes, event handlers, script in styles) move into the shared
  table, so the linter can warn on them?* *Recommended: yes.* Without it, the linter warns about web
  addresses but not about a stripped `onerror=`, which is the case most likely to confuse an author.

Open:

- **D5. The lint-core byte budget for S2.** The HTML and CSS readers are about 8.9 KB gzipped bundled
  alone, against 0.8 KB of headroom. *Recommended:* ship S0 and S1 first (no new bytes), then in S2
  measure the real cost in the Studio build and raise the `lintCoreGz` ceiling by that amount, declared
  in `docs/route-budget.d/`. *Alternative:* hold S2 until the deck pipeline's model brings those readers
  into lint-core anyway. Loading them lazily is not offered: it would break lint-core's "synchronous,
  shared by CLI, `validate()` and browser" contract (HARD RULE #7).

## Not decided here

- The exact wording of each warning and fix. That is S1's and S2's, against real decks.
- The CLI export's reader, which is the 2909-p4 follow-up.
