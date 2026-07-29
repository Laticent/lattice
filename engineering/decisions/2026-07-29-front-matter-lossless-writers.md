---
status: shipped
summary: #1254 made ONE front-matter key (`title:`) lossless and left 24 others on the whole-block rebuild, on the boundary "a control that OWNS the block may rebuild it; an edit the user reads as editing their document may not." That boundary does not survive contact with a real deck. Every key the Deck-setup drawer writes — `theme:`, `size:`, `header:`, `lang:` — is a key an author hand-writes, and the deck that carries them is the same deck carrying the YAML comment, the `_class:`, the `style: |` block and the `tags: [a, b]` sequence that `parseFm`'s grammar cannot model and `emitFm` therefore deleted. Setting a Header on such a deck erased the comment, dropped `_class:`, reduced `style: |` to the literal string `"|"` (deleting its CSS body), stringified the flow sequence, reordered the survivors, and converted CRLF to LF; on a deck whose leading `---` is a slide separator it deleted the swallowed slide outright. So all 27 flat-scalar call sites move to `writeFrontMatterLine` — 24 in StudioShell (the drawer controls; the card counted 23, missing a second `spectrum-card-edge` write), the two `class:` writes inside `mergeClassTokens`/`removeClassTokens`, and `embedFinishInMarkdown` on the share/export path — and `setFrontMatter` is DELETED rather than deprecated, because a destructive writer that stays exported is one autocomplete away from returning and its failure is silent. The export call site is the one that mattered most: the drawer damages your own copy, where Undo is a click away, while the export shipped a corrupted `.md` to someone else with nothing to surface it. The two nested-block writers (`setFrontMatterBlock`, `setFrontMatterAcronyms`) are deliberately out of scope and still rebuild — logged, not fixed here.
---

# Every flat front-matter write is a line splice

**Date:** 2026-07-29 · **Status:** shipped · **Area:** docs-site Studio
(`docs/src/components/studio/front-matter.ts`, `StudioShell.tsx`, `share-export.ts`)
· **Issue:** #1256 · **Generalizes:**
[2026-07-29-deck-title-front-matter-override.md](./2026-07-29-deck-title-front-matter-override.md)

## The boundary that didn't hold

#1254 built `writeFrontMatterLine` — a splice that rewrites one line and reads
nothing else — and used it for exactly one key. The reasoning it recorded was a
boundary:

> whole-block rebuild is "an acceptable cost for a control that OWNS the block
> (the Deck-setup toggles), and an unacceptable one for an edit the user reads as
> 'rename this deck'."

Two adversarial trio passes on that change had already dismantled the second half.
This card is about the first half, and it fails for a plainer reason: **no control
owns the block.** `theme:`, `size:`, `header:`, `lang:`, `paginate:` are not
drawer-private state. They are documented directives an author types by hand — and
a deck whose author hand-writes front matter is precisely the deck that also carries
a YAML comment, a `_class:`, a `style: |` block, and a `tags: [alpha, beta]`
sequence. "The drawer created this key, so the drawer may flatten everything around
it" reads as ownership only if you never look at what is around it.

## What the rebuild did

`setFrontMatter` never edited a line. It ran `parseFm` over the whole block, threw
away everything the grammar didn't model, and re-emitted the survivors. On the
acceptance deck from the card:

```markdown
---
# legal signed off on this footer
theme: indaco
_class: lead
style: |
  section.title h1 { color: red; }
tags: [alpha, beta]
---

# Q4
```

setting a **Header** produced:

```
---
theme: indaco
style: "|"
tags: "[alpha, beta]"
header: "Acme — Q3"
---
```

- the YAML comment — **gone**
- `_class: lead` — **gone** (the engine's directive grammar accepts a leading `_`;
  `parseFm`'s does not, so the key was invisible to the reader and deleted by the
  writer)
- `style: |` — its CSS body **deleted**, the scalar corrupted to the literal `"|"`
- `tags: [alpha, beta]` — stringified
- key order — rewritten, with the edited key pushed to the end

Two more, from the same root cause: setting **Size** on a CRLF (Windows-authored)
deck returned a mixed-EOL file, and on a deck whose leading `---` is a **slide
separator** — which `FM_RE` cannot distinguish from front matter — the swallowed
slide was deleted outright.

### The export path is the one that mattered

`embedFinishInMarkdown` (`share-export.ts`) called `setFrontMatter` when a deck
carried a saved deck-wide finish. Sharing such a deck handed the recipient a
**corrupted `.md`** — the same losses, outbound, silently.

That is a different severity from the rest, and it decided the ordering of the work.
A drawer control damages your own copy, in an editor showing you the source, with a
one-click Undo toast. The export damages an artifact you have already handed to
someone else: you don't see it, they can't recover it, and nothing surfaces it.

## What ships

**Every flat-scalar write goes through `writeFrontMatterLine`** — 27 call sites, not
the 24 the card counted:

| Where | Calls | Keys |
|---|---|---|
| `StudioShell.tsx` (Deck-setup controls) | 24 | `theme` ×2, `spectrum-card-edge` ×2, `color-mode`, `finish`, `mode`, `motion`, `motion-style`, `motion-speed`, `spectrum`, `spectrum-edge`, `spectrum-card`, `rule`, `eyebrow`, `headline`, `spectrum-trim`, `debug`, `lang`, `size`, `paginate`, `lift`, `header`, `footer` — 22 distinct keys |
| `front-matter.ts` (`mergeClassTokens` / `removeClassTokens`) | 2 | `class` |
| `share-export.ts` (`embedFinishInMarkdown`) | 1 | `finish` |

The card's enumeration listed 22 keys and counted 23 StudioShell calls; there are 24,
because `spectrum-card-edge` is written twice (the placement picker, and the Card-rail
control clearing it when the rail goes off) as well as `theme`. Adding the pre-existing
`title:` splice, StudioShell now holds 25 calls, all lossless.

The class-token helpers are in scope for the reason the card gives for the rest:
`class:` is a flat scalar, and the Section-rail switch that writes it is as much a
deck-scope control as the Size menu.

**`setFrontMatter` is deleted, not deprecated.** The card asked whether to retire it
once the callers moved, and the answer is yes, for a reason the migration itself
demonstrates: it survived #1254 precisely *because* it remained the obvious writer to
reach for. A deprecated-but-exported destructive writer is one autocomplete away from
coming back, and its failure mode is silent — the deck still renders, the author's
comment is just missing. Deleting it makes the regression a compile error. `parseFm`
and `emitFm` stay: the two nested-block writers genuinely re-emit a block.

## What is deliberately NOT fixed

`setFrontMatterBlock` and `setFrontMatterAcronyms` (the `lexicon:` / `acronyms:`
writers) still rebuild the whole block, so editing a deck's lexicon still normalizes
everything around it. The card scoped them out and this change respects that: they
need a nested-block *span* finder, which is a different piece of work with its own
edge cases, and folding it in would double a diff that is otherwise mechanical.

Stating the consequence rather than burying it: **on this branch, two of the Studio's
deck-scope controls remain destructive.** That is a pre-existing defect, off the path
of this change (HARD RULE #18), and it is logged as a follow-up rather than left
unrecorded — see the module header in `front-matter.ts`, which names the gap at the
place someone would otherwise assume the whole module is lossless.

## Behavior differences the migration introduces

The splice is not a drop-in for the rebuild in three observable ways; each is an
improvement, and each is stated so nobody reads a diff and calls it a regression.

| | Rebuild (was) | Splice (now) |
|---|---|---|
| **Key position** | the edited key was moved to the END of the block on every write | stays exactly where the author left it |
| **Duplicate key** | silently collapsed to one | the first is edited (the same one `getFrontMatter` reads); the second is left alone |
| **New key placement** | inserted after the flat keys, before any nested block | inserted on the last line before the closing `---`, i.e. after a nested block's children |

The third needs a note: a key at column 0 after an indented child dedents out of the
nested block, so `parseFm`, `frontMatterKeySpan` and `parseFinishOverride` all read it
back as a flat directive. It round-trips; it is only cosmetically different.

The key-position change makes one comment in `slide-size.ts` stale — it justified the
`/m` flag on the `size:` reader by "`setFrontMatter` pushes the last-edited key to the
end." The flag is still required (a hand-authored `size:` is rarely last), so the
comment was rewritten rather than the code.

## Verified

- `docs` unit suite green; `npm run lint` and `npm run build:check` green.
- **Mutation-tested, both directions**, since "everything still passes" is the
  expected result of a refactor and proves nothing on its own:

  | Mutation | Tests killed |
  |---|---|
  | restore `setFrontMatter` and route all 24 call sites back through it | **9** |
  | make `writeFrontMatterLine` itself a whole-block rebuild | **52** |

  The 9 span all three surfaces — the writer helpers, the export path, and four real
  drawer controls driven through the React shell — plus the two #1254 `title:` tests,
  which the same mutation regresses.
- **What each tier of test actually proves**, stated plainly: the 48 `it.each` cases
  in `front-matter.test.ts` pin the *writer* across every deck-scope key (they do not
  fail when a call site regresses — that is what the shell tests and the source scan
  are for). The four new `studio.controls.test.tsx` cases drive the real Size, deck
  theme, Header and Section-rail controls on a deck that has something to lose — the
  gap that made #1254's original control test vacuous was that it drove a deck with
  *no* front matter, the one input where a rebuild destroys nothing. A source scan
  asserts no `setFrontMatter(` remains anywhere in `docs/src`.
- **Driven on the real built Studio** (`astro build` + `astro preview` + real headless
  Chromium at 1440px), not only in jsdom. The acceptance deck was pasted into the real
  CodeMirror editor through its own paste handler, then **Deck setup → Marks → Header**
  was filled in and blurred — the real control, the real commit-on-blur. Nine checks
  against the resulting editor source, all passing: the YAML comment, `_class: lead`,
  `style: |` **and its indented CSS body**, and `tags: [alpha, beta]` all survive; the
  header really was written; `theme:` is still above `tags:` (no reorder); the deck body
  survives; and the file grew by **exactly one line**. The screenshot shows the intact
  block with `header: "Acme — Q3"` spliced in as line 8, and the header band rendering in
  the preview.

  **UNVERIFIED on the real surface, and stated rather than glossed:** only four controls
  were driven end-to-end (Header here; Size, deck theme and Section rail in jsdom). The
  other 20 call sites are covered by the source scan plus the writer's own tests — they are
  literally the same one-line call, but "same shape" is an argument, not an observation.
