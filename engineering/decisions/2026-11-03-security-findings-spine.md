---
status: proposed
summary: >
  The layers that enforce security (the web-reference scanner, the sanitizers, the code door) should
  also REPORT what they removed, as findings with a slide, a place and a reason, and every surface
  (lint:deck, the Studio's Coach and editor marks, the export dialog) should show those findings instead of deciding anything
  itself. The linter gets no security policy of its own; it renders the deck (3.9 ms median on 349
  decks, against its own 17.0 ms) and translates the render's findings into a fix. A census rule in
  build:check keeps private reference readers from coming back. Open for the owner: D1 to D4.
---

# Security findings: the layers that enforce also report, and every surface reads the same report

**Answer.** Lattice already has one place that decides what is unsafe and two walls that enforce it.
What it lacks is a way to TELL the author. Today a refused picture becomes a gray placeholder, a
stripped `onerror=` disappears without a word, and the linter says nothing, because it never sees
what the render removes. This note proposes one finding shape that the enforcing layers return
alongside their output, and has every surface show those findings rather than run a policy of its
own. The linter's job becomes explaining the render's verdict in the author's words, with a fix.

## Why this note exists

The owner asked, after Segno R4 (#3018): "what should the linter be doing to make sure things are
flagged as insecure, and more broadly, a shared spine that all use to ensure security is built in?"
R4 had just shown the cost of the other answer. Four consumers each kept a private reader of
markup or CSS, each disagreed with the browser in its own way, and a fifth
(`lib/export/html-player.js`) was found only because the inversion review went looking. A linter
with its own idea of "unsafe" would be a sixth.

## What exists today (read from the tree, 2026-11-03)

| Layer | Where | What it returns |
|---|---|---|
| **Read** the addresses in markup and CSS | `scanHtml`, `cssRefSpans` (Segno R2, R3) | Spans with offsets, and `unsure` spans with a reason |
| **Decide** what is refused | `lib/core/remote-ref.js` (`blockWebImages`, `blockWebCss`, `remoteRefsInHtml`) | The rewritten text, plus `blocked: [{ url, origin, kind }]`. No slide and no place in the source |
| **Enforce**, wall one: rewrite the markup | `sanitizeSlideHtml` (`lib/core/sanitize-slide-html.mjs`), `sanitizeStyleText` (`lib/core/sanitize-style-text.mjs`), `sanitize-diagram-svg.mjs` | The cleaned text only. What DOMPurify removed is not reported |
| **Enforce**, wall two: the browser | `lib/core/subresource-csp.mjs` (the content-security policy), sandboxed frames | Nothing to the author; a refusal shows in the browser console |
| **Plugins** | the code door (`lib/core/code-door-core.mjs`, `lib/packages/code-door-fence.mjs`) | A visible note in the slide (`data-package-error`) with the reason |
| **Gates** on our own code | HARD RULE #22's four checks in `tools/check-ownership.js` | A build failure naming the sink |

Who reads the scanner's `blocked` list now:
- the preview frame's policy (`docs/src/components/studio/present/stage-window.js`);
- the export's missing-picture warning (`share-export.ts`, `describeMissingMedia`);
- the Studio's web-image count (`web-images.ts`);
- the gallery gate, which turns `remoteRefsInHtml`'s findings into a refusal with a reason.

The linter (`lib/authoring/lint-core.js`) reads deck SOURCE only. No rule reads a web address,
a script, an event handler or a style break-out. The nearest are `unknown-plugin`,
`plugin-fence-attributes`, `shell-fence-is-script` and `author-script-defers`.

So the spine has four layers, and the fourth is the gap:

1. **Read**: one reader per language (done by R4, except the CLI export).
2. **Decide**: one policy table (`remote-ref.js`).
3. **Enforce**: two independent walls (sanitizers, then the browser's policy).
4. **Report**: tell the author what was removed, where, and how to fix it. **Missing**, except for
   the code door's note and the gallery gate's refusal.

## The axes

- **Where the linter's findings come from**: the deck source, or the rendered HTML.
- **Who decides**: each surface, or only the enforcing layers.
- **The shape of a finding**: free text per surface, or one record every surface reads.
- **What keeps it honest**: discipline, or a gate that fails when a private reader appears.

## Candidate moves

- **A. Lint the source.** Run `scanHtml` over raw HTML blocks in the Markdown and refuse what the
  policy refuses. Cheap, no render. But it misses everything the engine itself writes: a Markdown
  image `![](https://…)`, a `![bg](…)`, a video poster, a chart's own markup. It is also a second
  reading of the same policy at a different stage, which is the drift R4 removed.
- **B. Lint the render.** `lint:deck` renders the deck, runs the same policy the preview and the
  export run, and maps each finding back to its slide. One verdict everywhere. Costs a render.
- **C. Report from the enforcing layers, read everywhere.** B, and every enforcing layer returns
  findings in one shape, so the Studio's Coach, the export dialog and the linter show the
  same records.
- **D. Do nothing new.** Keep placeholders and the console. Authors keep learning about refusals
  by noticing a gray box.

**Recommended: C.** B is its first step.

## The design

### 1. One finding shape

Every enforcing layer returns its output and a `findings` array:

```js
{
  layer: 'remote-ref' | 'sanitize-html' | 'sanitize-style' | 'code-door',
  rule: 'web-image' | 'click-beacon' | 'script-stripped' | 'handler-stripped' | 'style-breakout' | 'unsure' | …,
  slide: 3,                // 1-based, from the section the span sits in
  at: { from: 812, to: 861 }, // offsets into the rendered slide, so a surface can point at it
  what: '<img src="https://example.com/a.png">', // the construct, shortened
  why: 'loads from another site; the preview shows a placeholder and the export leaves it out',
  fix: 'allow example.com in the export, or use a local picture',
}
```

- `remote-ref.js` already has `blocked` (url, origin, kind) and `scanHtml` spans with offsets; a
  finding adds the slide and the text.
- The sanitizers report what they removed. DOMPurify keeps a `removed` list after each call; the
  slide sanitizer copies it out. `sanitizeStyleText` reports each `</style>` it neutralized.
- The code door already writes a note; it also returns the same record.
- `rule` names are a closed table in one kernel, beside the policy, so a surface can group and
  translate them and a test can list them.

### 2. Every surface reads; none decides

| Surface | What it shows |
|---|---|
| `lint:deck` | One warning per finding, on the slide, with `fix`. It renders the deck to get them (D1) |
| The Studio | The same findings in the Coach ("check this deck") and as editor marks, where lint findings already show |
| The Webpage, PDF and PPTX exports | The existing completion warning, built from findings instead of its own count |
| The package gallery gate | Unchanged in behavior: it refuses on any finding, and now prints the record |

The policy stays in `remote-ref.js` and the sanitizers. A surface that wants to know "is this
safe" asks the layer and reads its findings; it never matches markup itself.

### 3. What the author is told

- a picture, font or stylesheet from another site;
- a link or form that sends a request when clicked (`ping`, `action`, `formaction`);
- script the sanitizer strips: `<script>`, an `on…=` handler, a `javascript:` link;
- a `<style>` that would end early (`</style>` inside it), which `sanitizeStyleText` neutralizes;
- markup the reader is unsure of (`unsure` spans), which may draw differently in a browser;
- a plugin that is not approved, or that the code door refused (the linter's `unknown-plugin`
  stays and reads the door's record).

### 4. A census gate, so private readers stay gone

A `build:check` rule fails when code outside `lib/core` reads addresses out of markup or CSS with
a pattern of its own: a regex over `src=`, `href=`, `url(` or `background` applied to markup or a
style, outside the sanctioned readers. It ships with an allowlist that fails on a stale entry, like
HARD RULE #22's four. Day one it lists `lib/export/html-player.js`, the one reader R4 has left, so
the rule starts green and the entry is removed by that migration. This adds a rule to an existing
gate; it adds no CI job or step.

## Cost, measured

On the 349 decks under `examples/`, warm, one machine (2026-11-03):

| Step | Median | 90th percentile |
|---|---|---|
| `lint:deck`'s own rules (`lintText`) | 17.0 ms | 23.3 ms |
| Rendering the deck (`createEngine().render`) | 3.9 ms | 12.1 ms |
| `blockWebImages` on the render | 0.5 ms | 1.9 ms |

So B adds about a quarter to the linter's time per deck. The Studio already renders and already
runs the scanner on every keystroke's preview, so it pays nothing new except carrying the records.

## Phasing

Each phase ships alone and reverts alone.

| Phase | What | Evidence it owes |
|---|---|---|
| **S0** | The finding shape and the `rule` table in one kernel; `remote-ref.js` returns findings beside `blocked` | Every current consumer's output byte-identical on the corpus; one test per rule |
| **S1** | `lint:deck` renders and reports the scanner's findings (warnings) | The 349 decks: findings listed and reviewed; time measured against the table above |
| **S2** | The sanitizers report what they removed | A seeded stream: every removal DOMPurify makes appears as a finding, and nothing else does |
| **S3** | The Studio's Coach and editor marks, and the export warning, read findings | The real Studio, three widths and WebKit; the export warning text before and after |
| **S4** | The census rule in `build:check` | Its failing arm: a planted regex reader in `docs/src` fails the build |

The CLI export's migration (`followups.d/2909-p4-…`) can land before or after; S4 lists it until then.

## Decisions for the owner

- **D1. Should `lint:deck` render the deck to get findings?** *Recommended: yes (B).* It is the
  only way the linter sees what the engine writes, and it costs about a quarter of the linter's
  time. The alternative, A, lints raw HTML in the source only: cheaper, but blind to Markdown
  images, `![bg]`, posters and charts, and a second reading of the policy.
- **D2. How severe is a security finding in `lint:deck`?** *Recommended: a warning, never a block.*
  The render already enforces; the finding explains. Decks keep HARD RULE #29's posture ("warns and
  never blocks"). The package gallery gate keeps refusing, as now.
- **D3. Do the sanitizers report what they remove (S2)?** *Recommended: yes.* Without it the
  author is told about web addresses but not about a stripped `onerror=`, which is the case most
  likely to confuse them. The cost is one array copied out per sanitize call.
- **D4. Add the census rule to `build:check` (S4)?** *Recommended: yes.* It is how
  `html-player.js` would have been found without a review. It changes what an existing gate finds,
  not what CI runs.

## Not decided here

- The exact wording of each `rule`'s `why` and `fix`. That is S1's work, against real decks.
- Whether a finding ever blocks a deck export. This note says no; a later note can argue otherwise.
- The CLI export's reader itself, which is the 2909-p4 follow-up.
