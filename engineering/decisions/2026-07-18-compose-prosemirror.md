---
status: in-progress
summary: Compose — a rich, calm editing MODE of the Studio editor pane (the "Quiet Page" design), rebuilt on ProseMirror as ONE continuous document (Option B) after an adversarial trio found the first Lexical version structurally unfit (lossy nested-list round-trip; corruption on selection; N stacked editors couldn't span slides). A DOM-less deck-model core (docs/src/lib/compose) round-trips a deck's markdown losslessly incl. the nested KPI/cards grammar; a quiet left-margin grammar gutter applies Lattice's registers to the caret's block, and a floating bar over a text selection applies inline marks (Bold/Italic/Code). Both modes read/write the same source (HARD RULE #1). Slices 1–3 + hardening + the selection bar landed and verified on the real Studio; a deeper mobile polish pass is the remaining follow-up.
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

Inline formatting is the gutter's complement: a **floating selection bar** (Bold /
Italic / Code) rises over a non-empty text selection — portaled to `<body>` so it
clears the surface's `overflow:hidden` and `container-type` clipping — and flips below
the selection near the viewport top. The gutter owns BLOCK registers; the bar owns
INLINE marks, so the two never overlap. On **touch** the bar stands down entirely
(`canFloatBar` gates on `(hover:hover) and (pointer:fine)`): the OS selection menu
(Cut/Copy/Paste + Format B/I/U) owns formatting there — its Bold/Italic map to our marks,
Underline no-ops (the engine has no underline; it'd be off-model `<u>` HTML).

**Per-slide control bar.** Each slide is a ProseMirror NodeView carrying a control bar ON
its top divider line — collapse at the left edge, insert/delete centered, move up/down at
the right edge — shown only when the caret is inside that slide (a `cs-slide-active` node
decoration computed from the selection, so it works on touch without a hover). Structural
ops rebuild the doc from the SAME node instances — so every unmoved slide keeps its identity
and `emitDeck` re-emits its exact `raw` bytes (a locked table survives a reorder
byte-for-byte) — and carry a `slideOp` meta so the structural guard lets the intentional
count/lock change through. Collapse is view-only: it lives in a plugin as a node decoration
(NOT on the view instance, which a real click can make ProseMirror rebuild), so it maps
through edits and survives a nodeView recreation. The divider line spans the full slide
width and is painted with the deck's STRUCTURAL TRIM (`spectrum-trim:`, read from the
front-matter) — the same register that colors the rendered deck's `hr` rules and table
rails — so the Compose dividers preview the deck's chosen trim (off = accent hairline,
restrained/on = accent ramp; the exact `--spectrum` rainbow falls back to an accent ramp
since `--spectrum` isn't in the editor's token scope). The control icons are lucide,
matching the filmstrip (ArrowUpToLine/ArrowDownToLine move, Plus/Trash2, chevrons collapse).

**Palette + responsive.** All chrome is on the studio's real tokens (`--bg`, `--bg-alt`,
`--border`, `--text-body`, `--text-heading`, `--text-muted`, `--accent`, `--accent-soft`),
so it themes light+dark with the shell. (An earlier pass invented `--rule` / `--surface-*`
/ `--text-faint`, which don't exist in the Studio and silently fell back to light-only
colors — the cause of the invisible dark-mode divider, the muddy gutter gradient, and a
near-invisible selection bar; all rebound and the gradient removed.) On **mobile
(≤640px)** the left grammar rail becomes a thumb-reachable **bottom bar** (the cramped,
low-contrast left rail was the phone pain point); desktop/tablet keep the left rail.

## Hardening (two adversarial trios' findings, folded)

Two trios (red-team · Munger inversion · independent checker) ran against the ProseMirror
engine. Both confirmed it is safe as the opt-in mode (default is Markdown; no XSS / HARD
RULE #22 path; no gate violated; front-matter, directives, nesting, raw-HTML engine
content, and empty slides all round-trip **with evidence**). Findings, all fixed with tests
and verified on the real built Studio (HARD RULE #23):

- **Thematic-break slide split (was CRITICAL).** `***` / `___` / `- - -` (valid engine
  `<hr>` forms) serialized to a bare `---`, the deck's slide separator — the first Compose
  touch split the slide and dropped the next slide's `_class`. Fixed: the `horizontal_rule`
  serializer emits `***`, which `splitSlides`' `/\n-{3,}\n/` can never match.
- **Count-change corruption + accidental slide merge (was CRITICAL — 2nd trio, three
  independent reproductions).** Backspace at a slide start (`joinBackward`), Delete at its
  end, or a cross-slide selection-delete merged two slides into one, **silently dropping the
  merged-away slide's `_class`**; and because the slide count changed, the old positional
  `emitDeck` fell through to a whole-deck lossy reserialize that **flattened untouched table/
  HTML slides elsewhere**. Two fixes: (1) `emitDeck` reuse is now keyed on node IDENTITY via
  a `Map`, not position — an untouched slide stays byte-exact through ANY count change; (2) a
  `filterTransaction` structural guard blocks any transaction that changes the slide count,
  so an accidental merge/split can't happen (`deck-doc.ts`, `ComposeView.tsx`; tests in
  `deck-doc.test.ts`).
- **Editing a rich slide flattens it (was HIGH).** Edit-local emit only protects UNTOUCHED
  slides; directly editing a slide that carries a construct Compose can't round-trip (a
  table, block HTML, strikethrough, tasklist, footnote) reserialized it lossily. Fixed: such
  slides are detected (`hasLossyConstruct`) and marked `locked` — the structural guard blocks
  edits to them (identity never changes → always emits `raw`), and they render dimmed with an
  "edit in Markdown" badge. So every Compose slide is either fully-editable prose (lossless
  round-trip) or a byte-immutable locked slide.
- **Edit-local emit (the master mitigation).** `docToDeck` re-serialized the WHOLE deck on
  every keystroke; now `emitDeck` re-serializes only the slide whose node identity changed,
  and every untouched slide re-emits its ORIGINAL `raw` bytes verbatim.
- **Resync race (was HIGH — 2nd trio).** An external `source` change arriving while Compose
  held focus was parked and flushed on blur — but if the user kept typing after the park, the
  stale snapshot replayed over their edits on blur. Fixed: a local edit clears the pending
  park (favor the actively-typing author); the dead lossy-serializer dedupe guard was removed.
- **Selection-bar throw could swallow a keystroke's emit (was LOW).** `computeSelBar`'s
  `coordsAtPos` now runs LAST and guarded, so it can never abort the transaction before the
  edit is emitted.
- **Sticky failure + register gaps + note register.** Parse failure no longer sticks across
  decks; the `note` register toggles and is paragraph-scoped.

## Known limits (tracked)

- Slides with a table / block HTML / strikethrough / tasklist / footnote are **locked
  read-only** in Compose (edited in Markdown mode) — a deliberate guard, not a bug. Inline
  math (`$a_1$`) is NOT yet detected as lossy, so a slide with only inline math is editable
  and its `_`/`*` could be reflowed on a direct edit — a residual gap; model math (and the
  other locked constructs) as real schema nodes to make them editable-and-lossless.
- Non-`_` HTML comments (speaker notes / captions) inside prose round-trip byte-stable but
  show as literal editable text — no dedicated hidden node yet.
- The grammar-gutter register read is a heuristic (position-blind): any blockquote reads as
  Key-insight, an em-dash paragraph as Below-note; Eyebrow vs Subtitle aren't distinguished.
  Labels only — it never corrupts source. First-class register attrs are future work.
- Blank "spacer" slides are dropped by the shared `splitSlides` (filters empty chunks).
- **HARD RULE #23:** the interactive editor surface (typing, focus/blur resync, list
  Enter/Tab, gutter clicks) needs verifying on the real built Studio in a browser — the lib
  round-trip tests are pure/headless and do not exercise `EditorView`.

## What replaced what

The Lexical surface (`ComposeSurface`, `compose-lexical`) and the `/proto/compose`
spike are deleted; all `@lexical/*` dependencies removed.
