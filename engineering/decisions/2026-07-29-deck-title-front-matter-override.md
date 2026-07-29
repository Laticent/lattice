---
status: shipped
summary: The follow-up recorded by 2026-07-29-deck-title-is-its-heading, and proposed independently by two lenses of that change's adversarial trio — a `title:` front-matter override, precedence `title:` → first heading → creation label. The heading rule is right up to the point where a deck's shelf name and its cover are different facts ("Board pack — Q4 FY26 (final)" belongs in the switcher and the export filename, not in 90pt on the title slide); without an override the only way to name the deck was to write that name onto the slide. `resolveTitle(source)` becomes the one resolver, returning the raw winning title PLUS where it came from, and `titleFromSource` / `retitleSource` / the pre-paint mirror are all rebuilt on it, so every surface inherits the precedence with no per-call-site change. The load-bearing detail is that `from` is carried, not just the text: Rename edits WHATEVER DETERMINES the title (the `title:` line on an override deck, the heading otherwise) because rewriting the heading on an override deck would appear to do nothing, and display normalization differs between the two (markdown is stripped from a heading, which is rendered markdown, and never from a front-matter scalar, where the characters are literal). `title:` is not a new key — share-export already read it for the PNG/SVG image-set manifest and as a dead fallback for the exported HTML `<title>` — so this makes one existing directive authoritative rather than adding a second home for the name; the knock-on is that an override deck's exported HTML `<title>` now says the override where it used to say the heading. Hardened after the HARD RULE #25 adversarial trio, which moved the implementation: Rename SPLICES the `title:` line rather than routing through `setFrontMatter`, whose whole-block rebuild silently deleted YAML comments, `_`-prefixed keys, block scalars and flow sequences, reordered the survivors, and converted a CRLF block to LF (regressing a #1248 hardening); the heading path's `#` strip no longer applies to a front-matter scalar; the creation label can no longer be clobbered by a rename that wrote nothing; and the feature gained the control that CREATES an override — without it `title:` was reachable only by hand-writing YAML into a drawer whose purpose is front matter without the YAML.
---

# A deck's shelf name: the `title:` front-matter override

**Date:** 2026-07-29 · **Status:** shipped · **Area:** docs-site Studio
(`docs/src/components/studio/studio-store.ts`, `StudioShell.tsx`)

## Why, when the heading rule just shipped

[The heading rule](./2026-07-29-deck-title-is-its-heading.md) closed a real bug:
a deck stayed "Untitled deck" in the switcher no matter what you typed into it,
because its name lived in a stored label that nothing kept in step. Deriving the
name from the deck's own first heading deleted the second source of truth.

It also collapsed a distinction that turns out to be real. Two of that change's
three adversarial lenses independently proposed the override, and the reason they
gave is the reason it ships now: **a deck's shelf name and the words on its cover
are not always the same fact.**

> "Board pack — Q4 FY26 (final)" is the right name in the switcher, in ⌘K, and on
> the exported file. It is the wrong thing to set in 90pt across the title slide,
> which should say "Q4".

Under the heading rule the only way to get the first was to write it onto the
slide and accept the second. The override is the missing half.

## The rule

**Precedence: `title:` front matter → the first heading → the deck's creation
label.** One resolver owns it:

```ts
resolveTitle(source): { text: string; from: 'front-matter' | 'heading' } | null
```

`titleFromSource` (display), `retitleSource` (Rename's write), and the pre-paint
mirror are all rebuilt on top of it, so every surface that names a deck — the
switcher, the header, ⌘K, Share, the `.md` / `.pdf` / `.lattice` filenames, the
backup's per-deck filenames, `studio.astro`'s pre-hydration shell — inherits the
precedence without a single per-call-site change.

### Carrying `from` is the load-bearing part

Returning just the text would have been enough for display and wrong everywhere
else. Two behaviors depend on knowing *where* the title came from:

- **Rename edits whatever DETERMINES the title.** On a deck carrying `title:`,
  Rename rewrites the `title:` line and leaves the cover slide alone; on any other
  deck it rewrites the first heading, as before. Rewriting the heading on an
  override deck would appear to the author to do nothing at all — the switcher
  would not move, because the override still wins. The prompt also names its
  target ("this rewrites its `title:` front matter, not the cover slide"), so a
  deck whose shelf name is deliberately not its cover doesn't look like Rename is
  aimed at the slide. It never *creates* an override on a deck that had none:
  renaming a plain deck must not silently grow front matter.
- **Display normalization differs.** A heading is rendered markdown, so
  `# **Q4** Wrap` must list as "Q4 Wrap" — the strip is correct there. A
  front-matter title is a plain YAML scalar that nothing renders, so the same
  strip would eat the literal characters of a name the author typed, turning
  `Q4_final` into `Q4final`. The 60-char display cap still applies to both; the
  raw value is never capped, because Rename writes it back.

### The control that creates it

Rename edits whichever source the name already comes from, and deliberately never
grows front matter on a deck that has none. That rule is only coherent if something
*else* can create the override — and in the first cut, nothing could. Enumerating
every `setFrontMatter(…, key)` call in `docs/src` turns up 24 directives, and
`title` was the only one whose writer could not bring it into existence: `size`,
`header`, `footer`, `theme`, `finish`, `paginate`, `class`, `lang` and the rest all
have a control in the Deck-setup drawer. The sole entry point was hand-writing YAML
— in a drawer the authoring guide titles *"Deck setup (front matter without the
YAML)"*, and in Compose mode, where front matter is an invisible document attribute,
the key would not have been observable at all.

So the drawer's **Look** tab (the deck's *identity* — name, language, palette, size)
gains a **Deck name** row. It follows `setHeaderText`'s *shape* but deliberately NOT
its writer: it goes through `writeFrontMatterLine`, not `setFrontMatter`.

That distinction is the whole point, and the first cut got it wrong. Because Rename
never creates the key, **the first write to `title:` on any deck is always this
control** — so routing it through the whole-block rebuild meant the splice only ever
protected decks that had already been shredded once. All three lenses found it
independently; the checker demonstrated it on the real built Studio, where setting a
Deck name on a deck whose leading `---` is a slide separator deleted the cover slide
outright. `writeFrontMatterLine` splices when the key exists, inserts one line before
the closing `---` when it does not, and only falls back to building a block when the
deck has no front matter at all.

The field's copy matters too. Blank means "follows the cover heading", and the
placeholder says exactly that — an earlier cut used `e.g. ${derived}`, borrowed from
the Header row where it is correct (the band is *off*, so the value really is a
suggestion). Here the derived value is the name the deck already has, so offering it
as an example invites the user to type it in — which writes a redundant override and
freezes the name against the cover forever, regenerating the very bug #1248 fixed,
through the door built to make its successor usable.

### Not a new key

`title:` was already read by `share-export`, though more narrowly than the first
draft of this note claimed: the **PNG/SVG image-set** manifest reads it
(`share-export.ts:577`), and the exported HTML's `<title>` reads it as a fallback
behind the passed-in deck title (`:320`) that in practice never fired, since
`titleFromSource` always returns a non-empty string. The `.lattice` manifest never
read front matter at all — it takes the shell's `deckTitle` argument directly. The
**engine** does not consume the key either: `title` is absent from
`lib/engine/directives.js`'s `KNOWN_DIRECTIVES`, so no slide's rendering depends on
it. What this change does is make one existing, mostly-inert directive authoritative
rather than invent a second home for the name.

**Knock-on worth naming:** for a deck that carries `title:`, the exported HTML's
`<title>` — and the export filename — now say the override where they previously
said the cover heading. That is the intended resolution of a nearly-dead key, but it
*is* a change in exported bytes for that population, so it was captured both ways
(reverting to `origin/main`, rebuilding, and exporting the same deck) and put in
front of the human. **That sign-off is outstanding at the time of writing** — the
QUALITY BAR makes it a hard stop, and this note does not claim it was given.

### Why the LFM spec is not amended

Spec §2.3 states that `finish:` and `logo:` are "the complete LFM-added front-matter
surface in 1.0". That claim is left standing, deliberately: `title:` is **application**
metadata, not a language extension. The engine renders nothing from it — it is not a
`KNOWN_DIRECTIVE`, it produces no `<section>` attribute, and a third-party LFM
implementer can ignore it entirely and still render a Lattice deck correctly. What
consumes it is the Studio (deck naming) and the export wrapper (filename, HTML
`<title>`), which are product surfaces rather than the document language. Amending a
versioned, CC-BY-published spec is a governance act with its own process (§10), and
spending it on a key the renderer ignores would widen the standard for no
implementer's benefit. §2.3 carries a one-line note that app-level metadata keys
exist outside the LFM surface, so the completeness claim cannot be read as "no other
key may appear in a Lattice deck's front matter."

## What the adversarial pass changed (HARD RULE #25)

The trio ran against the first cut. It found one root cause with four faces: the
front-matter write went through `setFrontMatter`, which does not edit a line — it
parses the whole block and re-emits it. Everything the grammar does not model was
deleted, and everything it did model was normalized.

| Found | Was | Now |
|---|---|---|
| Rename converted a CRLF (Windows-authored) block to LF, leaving a mixed-EOL file | `emitFm` joins with `\n` | the `title:` line is **spliced**; `\r` is outside the span, so line endings are untouched — the same discipline `lineEnd` gave the heading path in #1248 |
| Rename deleted YAML comments, `_class:` / `_paginate:` (the engine accepts a leading `_`; `parseFm`'s key grammar does not), `style: \|` block scalars and their indented lines, and stringified flow sequences (`tags: [a, b]`) | whole-block rebuild | nothing outside the one line is read, let alone rewritten |
| Rename re-quoted *other* keys, rewriting `header: The "Q4" pack` to `header: "The \"Q4\" pack"` | whole-block rebuild | other keys are never re-emitted. **Correction:** the first pass reported this as corrupting the *rendered* header; the second pass rendered both through the real engine and they are identical — markdown-it's backslash handling undoes the YAML escaping. The harm is to the author's source text, not to the slide |
| Rename could delete an entire slide: on a deck whose leading `---` is a slide separator, `FM_RE` swallows slide 1, a body line shaped `title: x` resolves as the title, and the rebuild discarded the rest | whole-block rebuild | the splice replaces one line, so the worst case is a wrong line edited, not content destroyed |
| a duplicate `title:` key silently vanished | rebuild emits one | the first is spliced (the same one the reader read); the second is left alone |
| `#1 Priority` was stored as `1 Priority`, the toast claimed the un-stripped name, and the no-op guard never converged | the heading path's `^#+` strip applied to both | the strip is heading-only; `storedTitleFor` gives the toast and the guard the value actually written |
| renaming to a bare `#` clobbered the deck's write-once creation label | the fallback fired whenever `retitleSource` returned null | the fallback is gated on the deck having *no* title source at all |
| the feature had no way to be turned on | Rename never creates the key, and nothing else wrote it | the Deck-setup **Deck name** row (above) |
| the pre-paint mirror's test hand-fed the resolver to the store, so reverting the production wiring killed no tests | a vacuous assertion | the shell test types an override into the real editor and asserts what the debounced save mirrored |

A **reader/writer agreement** test now pins the one failure this design could not
survive: `frontMatterKeySpan` (the writer's line finder) mirrors `parseFm` (the
reader's grammar), and if they ever diverge, Rename would rewrite a different line
than the one the title was read from.

## Edges that decide behavior

| Case | Behavior | Why |
|---|---|---|
| `title:` with an empty or whitespace value | ignored; falls through to the heading | a stray key must not blank a deck that has a perfectly good heading |
| a title with `"` or `\` | round-trips losslessly through the shared quote/escape and back | without a real round-trip the backslashes compound on every rename (`front-matter.ts` documents this) |
| a multi-line title | flattened to one line | in a heading a newline injects markdown (including a `---` slide break); in front matter it breaks out of the block entirely |
| `title:` nested under a **bare** header (e.g. `finish-override:`) | not seen as the deck title | `parseFm` captures such blocks verbatim and never flattens their children into scalars |
| `title:` **indented** (under a non-bare key, or as the continuation of a `header: >` folded scalar) | not a directive: it names nothing and is never written to | the first pass accepted it, reasoning that the writer must follow `parseFm`'s trimmed-line match. The red team showed where that leads — the continuation of a folded scalar became both the deck's name AND Rename's write target, rewriting the author's `header:` value. A real top-level directive sits at column 0, and both halves now require it |
| a duplicate `title:` | the first wins on read, and is the line rewritten; the second is left untouched | matching `getFrontMatter`'s `.find` |
| a deck with neither override nor heading | Rename falls back to the stored label | unchanged from the heading rule |
| the built-in decks | unaffected — none carries `title:` | the drift test pinning each built-in's declared title to its heading still holds |

## Verified

Driven on the **real built Studio** (`astro build` + `astro preview` + real
Chromium), not a harness. Ten scripted checks, all passing — the four distinct
behaviors they cover:

- the switcher pill reads the override while the rendered cover slide still reads
  `Q4`;
- a **reload** paints the override in the pre-hydration shell (no flash of the
  cover heading it was set to replace);
- Rename's prompt names the front matter and prefills the **raw** override; the
  saved source afterward carries the rewritten `title:` with `# Q4` untouched;
- a deck with **no** override still renames its heading, and grows no front matter.

Screenshotted at 1440 / 820 / 390. The export change was captured **both ways** —
`origin/main` rebuilt and exported the same deck as `q4.html` / `<title>Q4`, this
branch as `board-pack-q4-fy26-final.html` / `<title>Board pack — Q4 FY26 (final)` —
in light and dark.

Every assertion added here is **mutation-tested**; each of these kills tests, so
none passes vacuously:

Measured by running `npx vitest run src/components/studio/studio-store.test.ts
src/components/studio/studio.controls.test.tsx` (112 tests) against each mutation in
turn, restoring between:

| Mutation | Tests killed |
|---|---|
| drop the precedence (ignore the override) | 17 |
| drop the empty-value guard | 1 |
| apply the markdown strip to both paths | 1 |
| delete the front-matter write branch | 10 |
| revert the splice to a whole-block `setFrontMatter` | 10 |
| revert the pre-paint mirror to `headingText` | 5 |
| route the Deck-name control back through `setFrontMatter` | 2 |
| accept an indented `title:` as a directive again | 2 |
| revert the display cap to a raw `.slice` | 1 |

An earlier draft of this table printed 6 / 1 / 1 / 3 for the first four rows. Those
were the FIRST commit's numbers, carried into a note describing a later commit that
had added nine more tests; the checker caught it. The error was conservative — more
kills than claimed — so "none passes vacuously" held, but the printed numbers did
not. The last three rows exist because the trio found the original mirror test
**vacuous** (it hand-fed the resolver's output to the store, so reverting the
production wiring killed nothing) and the original control test **vacuous in the same
way** (it drove a deck with no front matter, the one input where a whole-block
rebuild has nothing to destroy).

**Known, pre-existing, NOT from this change:** at 820px the switcher pill is
squeezed to zero width by the crowded header (#1249) — visible in the 820
screenshot, and unrelated to title length (a 2-char title collapses identically,
measured in the prior change).
