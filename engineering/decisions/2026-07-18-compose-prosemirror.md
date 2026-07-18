---
status: in-progress
summary: Compose — a rich, calm editing MODE of the Studio editor pane (the "Quiet Page" design), rebuilt on ProseMirror as ONE continuous document (Option B) after an adversarial trio found the first Lexical version structurally unfit (lossy nested-list round-trip; corruption on selection; N stacked editors couldn't span slides). A DOM-less deck-model core (docs/src/lib/compose) round-trips a deck's markdown losslessly incl. the nested KPI/cards grammar; a quiet left-margin grammar gutter applies Lattice's registers to the caret's block. Both modes read/write the same source (HARD RULE #1). Slices 1–3 landed; hardening + the floating selection bar + a mobile pass pending.
---

# Compose — the rich-markdown editing mode, on ProseMirror

**Date:** 2026-07-18 · **Status:** in-progress (slices 1–3 landed; hardening + selection bar pending)
**Surface:** the docs-site Studio editor pane (`docs/src/components/studio`, `docs/src/lib/compose`)

## The problem

Markdown is a wall for the non-technical author (the literal "what is markdown?"
user). Compose is a second editing MODE of the Studio editor pane — a rich, calm
writing surface — beside the existing CodeMirror Markdown mode. Both read and write
the **same `source` string**, so the render engine keeps its single source of truth
(HARD RULE #1) and flipping modes never loses work.

## How we got here (so the next agent doesn't re-litigate it)

1. **Editing model.** We evaluated per-slide form-filling (rejected — "forms are an
   anti-pattern, we have AI now"), a per-slide WYSIWYG widget (rejected — "an
   absolute no-go"), and settled on: **rich-markdown text editing + toolbar-assisted
   assembly + AI-assisted refinement**, with the deck as **one continuous note**
   (Option B), not per-slide.
2. **First substrate — Lexical.** A working spike shipped, then an adversarial trio
   found it structurally unfit: the markdown round-trip **flattens nested lists**
   (KPI / cards / stats — most boardroom slide types, HARD RULE #5's card grammar),
   and it fired that lossy export on mere **selection** — read-only contact corrupting
   the deck. Its "one note" was really N stacked editors that could not do cross-slide
   select / copy / undo.
3. **The fork (mocked for the human pick).** A · stacked-containment (keep Lexical,
   prose-first); B · one true document; C · prose-only. Chosen: **B**, on
   **ProseMirror** — after proving (and this is the crux) that the round-trip loss was
   a *shortcut* (the generic `@lexical/markdown` transformer), **not** an ecosystem
   ceiling. ProseMirror's markdown-it layer round-trips nested lists losslessly; a
   custom contenteditable engine would be reinventing ProseMirror (HARD RULE #15).

## The architecture

Three layers, Cadenza-shaped at the bottom:

- **`lib/compose/deck-source.ts`** — pure deck split/join (front-matter + per-slide
  directives + prose), on the SHARED engine splitters, CRLF-normalized, fence-aware.
- **`lib/compose/deck-markdown.ts`** — the Lattice-configured ProseMirror markdown
  serializer (`-` bullets, HARD RULE #5) + slide-prose parse/serialize. The lossless
  round-trip lives here; it is DOM-less and framework-free (spin-off ready).
- **`lib/compose/deck-doc.ts`** — the ONE-document schema (`doc → slide+`, each slide
  carries its directives, front-matter on the doc) + `deckToDoc` / `docToDeck`.
- **`components/studio/ComposeView.tsx`** — the ProseMirror editor view, the Quiet
  Page chrome, and the `source` binding.

Because it is **one document**: selection / copy / undo span slides, and a stray
`---` typed in prose is just text — only the slide-node boundary makes a slide, so
boundaries can't be corrupted (the containment win of the stacked model, kept,
without its fragmentation).

## The design — the Quiet Page

The winner of the 5-way design competition (`calm`, 8.6), hardened toward 9.5. A
serif writing surface whose only chrome is a **quiet grammar gutter**: Lattice's
registers (H1 / H2 / Eyebrow / Key-insight / Below-note) as a faint left rail, LIT
for the block the caret is in, click-to-apply (the register transform). The empty
margin becomes the toolbar; restraint is the statement. Light + dark.

## Hardening (the adversarial trio's findings, folded)

A second trio (red-team · Munger inversion · independent checker) ran against the
ProseMirror engine. It confirmed the engine is safe as the current opt-in mode (default
is Markdown; no XSS / HARD RULE #22 path; no gate violated; front-matter, directives,
nesting, raw-HTML engine content, and empty slides all round-trip **with evidence**), and
surfaced four corruption/robustness vectors — all now fixed with tests:

- **Thematic-break slide split (was CRITICAL).** `***` / `___` / `- - -` (valid engine
  `<hr>` forms) serialized to a bare `---`, which is the deck's slide separator — the first
  Compose touch split the slide and dropped the next slide's `_class`. Fixed: the
  `horizontal_rule` serializer emits `***`, which `splitSlides`' `/\n-{3,}\n/` can never
  match (`deck-markdown.ts`; test in `deck-markdown.test.ts` + `deck-doc.test.ts`).
- **Edit-local emit (the master mitigation).** `docToDeck` re-serialized the WHOLE deck on
  every keystroke, so a lossy construct (a table, math, raw HTML — things the CommonMark
  parse layer doesn't model) on ANY slide degraded the moment you typed on ANOTHER slide.
  Fixed: `emitDeck` re-serializes only the slide whose ProseMirror node identity actually
  changed; every untouched slide re-emits its ORIGINAL bytes (`raw`, carried on the slide
  node) verbatim. A slide you never touch can no longer degrade, and a keystroke costs one
  slide's serialize, not the deck's (`deck-doc.ts`; tests in `deck-doc.test.ts`).
- **Lost external edit while focused.** The resync effect dropped an external `source`
  change (Inspector stamping `_class`, an AI apply, undo) that arrived while Compose held
  focus. Fixed: the change is PARKED and flushed on blur (`ComposeView.tsx`).
- **Sticky failure + register gaps.** A deck that failed to parse left Compose stuck in the
  textarea fallback for every later deck — reset on construct. The `note` register was
  add-only and unguarded — now toggles and is paragraph-scoped (`ComposeView.tsx`).

## Known limits (tracked)

- Raw HTML and Markdown tables round-trip **byte-safe** (the checker confirmed this), but
  render as literal text on the serif surface rather than as rich WYSIWYG — a fidelity gap,
  not corruption; edit-local emit keeps their bytes intact on untouched slides.
- Non-`_` HTML comments (speaker notes / captions) inside prose round-trip byte-stable but
  show as literal editable text — no dedicated hidden node yet.
- The grammar-gutter register read is a heuristic (position-blind): any blockquote reads as
  Key-insight, an em-dash paragraph as Below-note; Eyebrow vs Subtitle aren't distinguished.
  Labels only — it never corrupts source. First-class register attrs are future work.
- Blank "spacer" slides are dropped by the shared `splitSlides` (filters empty chunks).
- Mobile gutter + the floating selection bar are pending a visual pass.
- **HARD RULE #23:** the interactive editor surface (typing, focus/blur resync, list
  Enter/Tab, gutter clicks) needs verifying on the real built Studio in a browser — the lib
  round-trip tests are pure/headless and do not exercise `EditorView`.

## What replaced what

The Lexical surface (`ComposeSurface`, `compose-lexical`) and the `/proto/compose`
spike are deleted; all `@lexical/*` dependencies removed.
