---
status: shipped
summary: "#1358 was filed as a transform-ORDERING defect: the deck-wide `class:` merge was believed to run after `applyAllToHtml`, so a slide naming its own `_class:` saw a stale class list. Instrumenting the real render refutes that — the merge happens at the markdown-it token stage and the class list is already complete when the first HTML-stage transform runs. The actual cause is one character class: a Lattice `<section>` carries `data-class=\"<raw _class: payload>\"` BEFORE `class=\"<resolved list>\"`, and an unguarded `/class=\"([^\"]*)\"/` matches leftmost, so it reads the directive payload and every token the engine added is invisible. Two transforms shipped that way — below-note promoted a paragraph on `class: no-note` + `_class: content`, and `wrapImageText` skipped the `.image-text` panel on `class: image` + `_class: dark`, the latter a silent divergence from the DOM path. `\\b` is not a guard: the `-`→`c` transition inside `data-class` is a word boundary. Fixed with one shared reader — the general `readAttr` plus a named `readClassAttr` wrapper, replacing a private duplicate in `lib/core/collections.js` — applied at all nine files that carried the idiom, plus a build:check gate keyed on the regex shape so it cannot grow back. Fixing the READ handed below-note's substring exclusion test the deck-wide register, which turned a latent footgun (`no-progress` matching the `progress` component) into a live regression; that is fixed here too rather than filed, per HARD RULE #18. All 257 corpus decks render byte-identical HTML."
builds-on: 2026-08-04-below-note-opt-out.md
---

# `data-class` shadows the resolved class list

## Symptom

On a deck declaring `class: no-note`, a slide that named its own `_class: content`
still had its trailing paragraph promoted to a `.below-note`. A slide naming no
class of its own behaved correctly. The token was in the final class attribute
either way:

```
slide1 | class=[content no-note form] | below-note= YES   ← wrong
slide2 | class=[no-note content form] | below-note= no    ← correct
```

## The filed cause, and why it is wrong

#1358 was filed — and recorded in `2026-08-04-below-note-opt-out.md` — as an
ORDERING defect: the deck-wide `class:` merge was believed to land *after*
`applyAllToHtml`, so every class-keyed transform read a stale list on exactly the
slides carrying their own `_class:`. The instrumentation behind that reading
printed `cls="content"` at the HTML-transform stage, which fit.

It does not survive a second look. `deckClassPropagate`
(`lib/integrations/markdown-it/plugins.js`) is a markdown-it **core ruler**: it
runs inside `md.render`, before a single character of HTML exists. Logging the
class attribute at `applyAllToHtml`'s entry shows it already merged:

```
[applyAllToHtml IN] slide1 class=[content no-note form]
[applyAllToHtml IN] slide2 class=[no-note content form]
```

The ordering was never wrong. **The original instrumentation was reading the
wrong attribute — by the same bug it was trying to measure.**

## The actual cause

A Lattice `<section>` carries the class information twice, and `data-class` comes
first:

```html
<section id="1" data-class="content" class="content no-note form" style="--class:content;">
                ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                the RAW `_class:`    the RESOLVED list — deck-wide `class:`
                directive payload,   tokens merged in, plus `form`, the default
                mirrored from        component, `finish-*`, `mode-*`, …
                marp-core
```

`data-class` is marp-core's contract (`APPLIED_DIRECTIVES` in
`lib/engine/directives.js` emits `data-<kebab>` + a `--<kebab>` custom property
for every applied directive), and it is emitted whenever a `class:` or `_class:`
directive exists anywhere in the deck. It is not wrong; it is just first.

So `/class="([^"]*)"/` — leftmost match wins — reads the raw directive payload.
Every token the engine ADDED is invisible to a transform reading it that way, and
it fails in the worst direction: a plausible class list that renders, on exactly
the slides that name their own `_class:`.

```js
const tag = '<section id="1" data-class="content" class="content no-note form" …>';
tag.match(/class="([^"]*)"/)[1]    // → 'content'              ← the bug
tag.match(/\bclass="([^"]*)"/)[1]  // → 'content'              ← `\b` is NOT a guard
tag.match(/\sclass="([^"]*)"/)[1]  // → 'content no-note form' ← correct
```

**`\b` is not a guard, and that is the subtle half.** The transition between `-`
and `c` in `data-class` is a word boundary, so `\bclass="` matches it happily. Five
occurrences across four files carried `\bclass="`; two of them
(`lib/engine/index.js`, `lattice-emulator.js`) were correct only by the accident of
a greedy `[^>]*` backtracking to the rightmost match — which would have silently
inverted the moment any attribute after `class` contained the substring `class="`.

## What it broke

Two shipped transforms, from one root cause:

| Transform | Deck | Read | Effect |
|---|---|---|---|
| `below-note.applyToHtml` | `class: no-note` + `_class: content` | `data-class="content"` — no `no-note` in it | the opt-out silently did nothing; the conclusion rendered as a footnote |
| `bg-image.wrapImageText` | `class: image` + `_class: dark` | `data-class="dark"` — no `image` in it | no `.image-text` panel, so the image composition had nothing to place — and the DOM path, which reads `className`, built it, so the two render paths disagreed |

The second is the one that matters for the shape of the fix. A regression test
written for `no-note` would not have found it, and it violates HARD RULE #1 (the
render paths share one source of truth) in the quietest possible way: the kernel
*is* shared, and only the string path's reader was wrong.

## The fix

One reader, in `lib/core/section-walk.js` — the module that already owned "walk sections,
hand each one its class". `mapSections` reads through it, so every transform on the shared
walker inherits the correct answer.

The general form is `readAttr(tag, name)`; `readClassAttr(tag)` is the named wrapper that
carries the teaching. That split is the review's finding, and it is worth stating why:
`lib/core/collections.js` had a **private, already-correct `readAttr`** long before #1358,
so a class-only second reader was a duplicate of it (HARD RULE #15). `collections` now
imports the shared one and its own copy is gone. The engine stamps `data-<kebab>` for every
applied directive (`APPLIED_DIRECTIVES`, `lib/engine/directives.js`), so `data-header`,
`data-build` and `data-footer` shadow their bare forms exactly the same way — the general
function is what the next one of those should use.

`(?:^|\s)` rather than a `(?<!…)` lookbehind, deliberately: this module is bundled for the
browser playground, and an open tag's attributes are always whitespace-separated, so the
cheap guard is also the complete one. The `^` alternative is load-bearing rather than
symmetry — see `mergeClass` below.

**Nine files carried the idiom.** Two were live bugs (above); the other seven were latent —
`\b`-guarded reads on section tags, or unguarded reads on `<td>` / `<div>` / `<span>` tags
that happen not to carry a `data-class` today. All nine are fixed, because the point of a
defect class is that you close it rather than trim it:

- `lib/core/below-note.js` · `lib/core/bg-image.js` — the two live bugs
- `lib/core/image-dimensions.js` — `\bclass=` on a section tag (a `.test()` with a required
  token, so correct today by a different route than the two below; a refactor to a capture
  would have broken it)
- `lib/engine/index.js` · `lattice-emulator.js` — `\bclass=` + a greedy `[^>]*`, correct only
  because backtracking lands on the rightmost match
- `lib/core/collections.js` · `lib/core/carousel.js` ·
  `lib/components/chart/roadmap/roadmap.transform.js` ·
  `docs/src/lib/single-slide-render.ts`

`lib/core/section-walk.js` is NOT in that list — `mapSections` was already `\s`-guarded on
`main`. It changed because it is where the shared reader now lives.

**Five occurrences across four files spelled it `\bclass="`**, which is the subtlest form:
`lib/engine/index.js`, `lattice-emulator.js` (twice), `lib/core/image-dimensions.js`, and
`docs/src/lib/single-slide-render.ts`.

`collections.mergeClass` deserves its own note, because it is the WRITE direction of the
same defect and it bit twice. It both read and wrote unguarded, so on a tag carrying a
`data-class` it would have merged the new token *into the data attribute* — a class that
never lands, on an element that looks right in the source. And the first cut of the fix
guarded only on `\s`, which misses a BARE attribute string (`class="a"`, no leading space):
the guarded read failed, the append branch ran, and it emitted a **duplicate `class`
attribute**, of which a browser keeps the first and silently drops the merged token. No
caller reaches that today, which is exactly why it needed a test and not a comment.

## The regression this change created, and had to fix

`below-note`'s layout exclusion is a SUBSTRING test — `EXCLUDED.some(x => cls.includes(x))`
— and `EXCLUDED` contains `progress`, the chart component. The universal chrome vocabulary
contains `no-progress`, which hides the progress rail and says nothing about layout. So
`'content no-progress form'.includes('progress')` is `true`.

Before this change that was harmless *here*, because below-note read `data-class` — the raw
per-slide payload, which never carries a deck-wide token. **Fixing the read handed the
substring test the entire deck-wide register**, and a deck declaring `class: no-progress`
lost below-note promotion on every slide that named its own `_class:`. The Studio's own
"Hide rail" switch writes exactly that front matter, so the reachable path is one click.

That is a pre-existing fragility tipped into failure by this change, which under HARD RULE
#18 makes it this change's to fix rather than to file. The fix is narrow: **no `EXCLUDED`
entry begins with `no-`, so a `no-*` suppression token can never legitimately name a
layout**, and it is withheld from the substring arm. Nothing else moves.

It deliberately does NOT make the layout list token-exact, which is the real fix: that
flips 28 committed sections, three of them in decks HARD RULE #8 isolates, and needs a
design ruling on `compare-code` ⊃ `code` and `pull-quote` ⊃ `quote`. That is #1363.

Found by the red team, which is the whole argument for running one.

## Why it also gets a gate

Nothing pinned the behavior, and nothing stopped the idiom. Both halves ship:

- **`test/unit/engine/deck-class-visibility.test.js`** — the missing behavioral pin. Layer 3
  (`readClassAttr` on a hand-written tag) and layers 1–2 (the attribute contract) are
  documentation pins that pass on `main`'s tag bytes; **the regression tests are the last
  two**, and they assert a *difference* — a `no-note` deck beside a control — so a passing
  assertion cannot be an absence. Reverting only the two fixed kernels to `75b3e1b6` fails
  exactly those two.
- **`checkClassAttrReads`** (`tools/check-ownership.js`, via `build:check`) — the structural
  half, budget 0, empty allowlist. Keyed on a class-attribute match followed by a CAPTURE
  CONSTRUCT, which is a regex shape and never literal markup, so the repo's many
  `<div class="…">` template strings cannot false-positive. Run against the pre-fix tree it
  flags **all seven** latent files (15 occurrences across 9 files, minus the two live bugs).

**Its first cut was leaky, and an adversarial review walked straight through it** — which is
worth recording, because a ratchet that passes the bug is worse than no ratchet when a
decision doc cites its existence as the reason the idiom cannot grow back. It missed
`[^"]+` (one character), `(.*?)`, `([\w -]*)`, and the `class\s*=\s*"` spelling that
`lib/transformers/pill-tag.js` actually ships; and it ACCEPTED `\s*class=` and `\s?class=`
— zero-width quantifiers, i.e. no guard at all, and the likeliest thing to write after being
told "add a leading `\s`" — while REJECTING `(?:^|\s)class=` and `(?<!-)class=`, both
strictly correct. A `$` that bound to only the last alternative of the guard alternation was
the mechanical cause of half of it. All eleven spellings and all twelve correct guards are
now fixtures in `test/unit/cli/check-ownership.test.js`.

The comment skip is spans, not lines. The line-based first cut skipped any line whose
leading text began `*`, which the continuation of a multi-line expression also does — so a
live matcher could be parked past the gate after `  * factor;`. Spans are anchored at line
start, so a `/*` inside a string literal cannot open a bogus span that swallows real code.
Prose still gets to write the bad pattern down, which this file and `readClassAttr`'s
docblock both need in order to explain it.

Its coverage boundary, in two parts, because the first cut stated only one of them:

- **SPELLING** — this catches regex reads. `split('class="')`, a `new RegExp` built from a
  VARIABLE, and a DOM `getAttribute` are all out of reach.
- **SCOPE** — `lib`, `docs/src`, `docs/scripts`, `tools` and the root emulator, at
  `.js/.ts/.tsx/.mjs/.cjs/.astro`. `test/**` is excluded (tests assert payloads, not render
  behavior) and so is generated `dist/**`. Adding `docs/scripts` and `.astro` found one more
  real site, `docs/scripts/check-studio-shell.mjs`.

The load-bearing guarantee is `readClassAttr` being the one reader; the gate is the ratchet
that keeps new code pointed at it.

## The other half of the defect class, logged not fixed

This change closed the **write/read-the-wrong-attribute** half. There is a mirror half it
did not touch, and saying "the defect class is closed" without naming it would be an
overstatement: four consumers treat `data-class` as the slide's class IDENTITY, and it is
structurally incapable of carrying what they want — it never contains the deck-wide `class:`
register, `form`, the `content` default, `finish-*` or `mode-*`.

- `tools/check-chart-fit.js` and `tools/check-render-nature.js` select `section[data-class]`,
  which silently skips every slide whose deck declares no `class:` and which names no
  `_class:` — i.e. every default `content` slide.
- `docs/src/playground/player-core.generated.js`'s `componentOf` falls back
  `data-class || class` and takes token[0], so `_class: dark roadmap` reports `dark`.

Off-path of this change (HARD RULE #18), and the gate is explicitly blind to `getAttribute`.
Tracked as **#1368**.

## Blast radius, measured

Every class-keyed transform in the registry was in scope, and several build wrappers that a
later pass never unbuilds — so the check is a full render, not a unit test.

All 257 decks in the corpus (`examples/`, `exemplars/`, the component and design galleries,
`test/integration/baseline-decks/`) render **byte-identical HTML** before and after. What
that covers and what it does not, stated so a reader can check it:

```bash
# render every corpus deck through lib/engine at both revisions and compare
node -e "
const {render}=require('./lib/engine');const fs=require('fs'),path=require('path');
const walk=(d,o=[])=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,e.name);
  if(e.isDirectory()){if(!/node_modules|\.git|\.scratch|dist/.test(f))walk(f,o)} else if(/\.md\$/.test(e.name))o.push(f)}return o};
const decks=[...walk('examples'),...walk('exemplars'),
  ...walk('lib/components').filter(f=>/\.gallery\.md\$/.test(f)),
  ...walk('design').filter(f=>/\.gallery\.md\$/.test(f)),
  ...walk('test/integration/baseline-decks')].sort();
const out={}; for(const d of decks){try{out[d]=String(render(fs.readFileSync(d,'utf8'),{}).html||'')}catch(e){out[d]='ERR '+e.message}}
fs.writeFileSync(process.argv[1],JSON.stringify(out));" /tmp/corpus.json
```

- **Covered by that:** every site the string render path executes — `below-note`, `bg-image`,
  `mapSections`, `collections`, `roadmap`, `lib/engine/index.js`.
- **NOT covered by it:** `lattice-emulator.js` and `image-dimensions.js` (the PDF binary, not
  `render()`), the two `carousel.js` split sites (reached only through the measured overflow
  solver), and `docs/src/lib/single-slide-render.ts` (docs-site TypeScript). Those are covered
  instead by `npm run overflow:check` — 257 real emulator renders through Chromium, which
  returned exactly the committed baseline — by `test/unit/core/carousel.test.js` (104 tests,
  and it caught a real error in the first cut of the carousel edit), and by the integration
  tier. The docs-site module is exercised by neither; its change is a `\b`→`\s` on a counting
  regex where `data-class` tokens are always a subset of `class`, so it flips no boolean.

The fix changes only the combinations no committed deck uses, which is exactly the profile of
a bug that hid this long.

## Consequences for what #1359 recorded

`2026-08-04-below-note-opt-out.md` §"The deck-wide form has a caveat" states a
mechanism that is not real, and derives an author-facing rule from it — *"put the
token on the slide when the slide names its own `_class:`"*. Both are retracted;
`class: no-note` now reaches every slide. The note carries a correction pointer
rather than a rewrite: it is a dated record of what was believed, and the belief is
part of what it teaches.

`lib/runtime/index.js`'s hoist of `applyCachedDeckClass()` above the transform pass
is **not** affected and stays. The DOM path's deck-class application genuinely is
asynchronous, so there the ordering argument holds on its own terms; it is the
string path that never had an ordering problem.

## The lesson worth keeping

A correct instrument can still be pointed at the wrong thing. The measurement that
established the ordering theory read `data-class` — the same mistake it was
measuring — and printed a result that agreed with the theory. When a diagnosis and
its evidence share an implementation, they can only confirm each other. The
cross-check that broke the tie cost one line: log the attribute at the boundary in
question and compare it to the final output.
