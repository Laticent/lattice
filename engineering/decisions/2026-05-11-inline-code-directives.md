---
status: in-progress
summary: Inline-code directives — the PILL half shipped 2026-09-04 as `{LABEL}:shape:c4` (the bracket-geometry map it proposed is superseded, measured); `$var` and `icon:` still unbuilt
---

# Lattice — namespaced inline-code directives (icons, vars, …)

> **Status.** Design landed in conversation on 2026-05-11; all five
> open questions resolved on 2026-05-15 (see **Resolved decisions**
> below). Nothing implemented yet. This note is the handoff for a
> future session to pick up and ship. When implementation lands, fold
> the canonical rules into `engineering/templates.md` and delete
> this note.
>
> **Revision 2026-06-08 — icon source.** The icon directive's delivery
> was changed from a hard-locked **Font Awesome webfont** to a
> **pluggable icon source defaulting to Lucide inline SVG** (single
> `icon:` namespace). See **Icons — pluggable source (Lucide default)**
> below; it supersedes the former "Font Awesome — prefix per style"
> section and resolved-decision #3. Rationale: the docs site adopted
> Lucide the same day, so a Lucide-backed `icon:` gives ONE icon
> vocabulary across the docs site and the decks; inline SVG matches the
> engine's existing palette-blind `--mark-*` model (recolour via
> `currentColor` / `--cat-*`) where a webfont sits outside it; and
> Lucide's ISC licence needs no attribution (FA Free is CC BY 4.0) and
> no vendored font dir / Pro-tier probe. FA is not dropped as an idea —
> it becomes one selectable backend behind the resolver, not the lock.
> The $-var and bracket-pill grammar below is **unchanged**. (Note: the
> "pill" work in #88 / `lib/transformers/pill-tag.js` is the unrelated
> trailing-`code` metadata-pill fix, NOT this bracket-shape grammar —
> that grammar is still unbuilt.)

> **AMENDMENT 2026-09-04 — the pill grammar shipped, and the BRACKET MAP BELOW IS
> SUPERSEDED.** Pills are `` `{LABEL}:shape:c4:lg` `` — one brace pair, with the shape
> as a MODIFIER WORD rather than encoded in bracket geometry. Everything else in the
> pill design survives intact: the eight shape names, the ordinal color slots, the size
> axis, order-free modifiers, and "no default shape without an explicit marker".
>
> **Why the geometry had to go.** The map below assigns meaning to `[X]`, `(X)`, `{X}`,
> `((X))`, `[[X]]`. Measured against all **12,493** single-backtick spans in this repo,
> it captures **147** that their authors meant literally:
>
> - **118** are decks and docs QUOTING our own state markers — `[x]` `[-]` `[ ]` `[/]`.
>   (The functional markers are bare at a bullet's start and were never at risk; it is
>   the slides TEACHING the syntax that break. `checklist.gallery.md:107` says "`[?]`
>   renders as literal text" — which under this map would have rendered as a pill.)
> - **29** are ordinary code prose: `[data-mark]`, `{ ok, scene }`,
>   `(slides, registry, lensId)`, `(0,2,2)`.
>
> This note ruled out `:` `@` `#` `!` as sigils for exactly this reason — "inline code
> routinely starts with `:root`, `@media`" — and never ran the same test on brackets,
> which are the most loaded characters in a repo whose decks are about code. A single
> `{…}` pair plus one guard (the label must be trimmed and comma-free, which is already
> the pill word budget in `lib/authoring/prose-budgets.js`) measures **zero** collisions
> repo-wide. Resolved decision #6 is therefore satisfied more honestly than the map
> satisfied it: the brace IS the dispatch marker, and nothing accidental reaches it.
>
> **Also corrected:** the color slots are `:c1`–`:c12` onto `--cat-N-fill` /
> `--cat-N-mark`, not `:c1`–`:c8` onto `--cat-blue`…`--cat-mauve`. HARD RULE #11 retired
> those per-hue names for the role-based set after this note was written, and there are
> twelve of them. The note's ordinal INSTINCT was right and the engine went further.
>
> **Shipped:** `lib/core/inline-pills.js` (kernel, HARD RULE #1), the `inlinePills`
> markdown-it plugin, `transformInlinePills` in `lib/runtime`, the `.lat-pill[data-shape]`
> CSS in `base.modifiers.css` (reusing the existing `--pill-*` tokens), a
> `pill-shape-crowded` coaching rule, `examples/inline-pills.md`, and docs in
> `base.docs.md`. **Still unbuilt: `$var` interpolation and the `icon:` namespace** —
> those sections below stand as written.

## What's already done

- **Branch `claude/fix-emoji-rendering-WO4vI`** ships the unicode-emoji
  fix (commit `2e01112`): Marp Core was rewriting unicode emoji to
  `<img class="emoji">` and the `section img { display:block }`
  catch-all forced them onto their own line. The carve-out
  `section img:not(.emoji)` plus an `img.emoji { display:inline-block;
  height:1em }` rule restored inline rendering. Emoji font fallbacks
  (Apple/Segoe/Noto) were appended to every `--font-*` stack so the
  lattice-emulator path (raw unicode, no twemoji rewrite) also gets
  predictable inline metrics.
- See `engineering/gotchas.md → "Marp Core wraps emoji in
  <img class='emoji'>"` for the full root cause + mitigation.

## What this note proposes

A canonical, extensible vocabulary for **inline code** (`` ` ``…`` ` ``,
NOT triple-backtick fenced blocks) so authors can drop in icons,
variables, kbd chords, badges, etc. without colliding with the
existing positional semantics that already overload inline code
(eyebrow, subtitle, card actor pill, see
`engineering/templates.md`).

### The shape

Three complementary forms inside a single backtick pair, dispatched
by the leading character of the code text:

| Form | Meaning | Example | Renders to |
|---|---|---|---|
| `` `$name` `` | Variable interpolation from front-matter `vars:` | `` `$client` `` | text "Acme Corp" |
| `` `prefix:value` `` | Namespaced directive | `` `icon:rocket` `` | inline `<svg class="lat-icon">` (Lucide artwork) |
| `` `(X)` / `[X]` / `[X>` / `((X))` … `` | Bracket-shape pill (Mermaid-inspired) — see below | `` `(LIVE)` `` | `<span class="pill" data-shape="…">LIVE</span>` |
| `` `literal` `` (anything else) | Plain inline code, unchanged | `` `getUserId()` `` | `<code>getUserId()</code>` |

Detection rule (in order): the `<code>` token's text is a directive iff
- starts with `$` and matches `^\$[A-Za-z_][\w.]*$` → variable
- starts with a registered bracket opener and the brackets balance → pill
- matches `^[a-z]+:[^\s]+$` → namespaced
- otherwise → literal

Modifiers (e.g. color, size) are appended with `:` *after* the value
(`` `(LIVE):c3:lg` ``). Namespace-form directives don't take modifiers
(greedy-first-colon makes the value side own all subsequent `:`).
Bracket-form does, because the closing delimiter gives the parser a
clean handoff point.

### Why this shape (decisions already made)

- **`$` is the only sigil.** Variables are the only directive that
  repeats often enough (10–50× per deck) that single-char terseness
  pays for itself. One-off icons / pills are infrequent; the cost of a
  cheatsheet outweighs the saved keystrokes.
- **Sigils `:` `@` `#` `!` are forbidden.** Lattice ships
  CSS-themed decks where inline code routinely starts with `:root`,
  `@media`, `#header`, `!important`. A sigil scheme on those chars
  would misfire constantly and there's no clean escape per-occurrence.
- **`prefix:value` for the long tail.** Self-documenting in source
  (a code reviewer can tell what `` `kbd:Cmd+P` `` does without a
  cheatsheet), avoids the CSS collision problem because the namespace
  is `[a-z]+` and the value follows a `:`.
- **Plain inline code keeps working.** The "no prefix, no `$`" case is
  literal — authors don't need to learn the system to write
  `` `getUserId()` ``. This is the escape hatch.
- **Fenced ` ``` ` blocks are out of scope.** They stay as
  syntax-highlighted code blocks. Repurposing them would break the
  gallery.

### Icons — pluggable source (Lucide default)

> Supersedes the former "Font Awesome — prefix per style" section
> (revision 2026-06-08). Single `icon:` namespace; the icon **set** is a
> resolver detail, not part of the author-facing syntax.

One namespace — `` `icon:<name>` `` — emits an inline `<svg>`, not a
font glyph. The name is resolved through a pluggable **icon source**
(`lib/icons.js`); the default source is **Lucide** (https://lucide.dev,
ISC). So an author who Googles a Lucide icon types the name they see.

| Directive          | Emits                                                  |
| ------------------ | ------------------------------------------------------ |
| `` `icon:rocket` ``| `<svg class="lat-icon" data-icon="rocket">…</svg>`     |
| `` `icon:github` ``| `<svg class="lat-icon" data-icon="github">…</svg>`     |
| `` `icon:check:c2` `` | same + slot-2 colour (mods reuse the pill `:c1`–`:c8`) |

**Inline SVG, not a webfont.** This mirrors the engine's existing
`--mark-*` technique (`lib/base/base.tokens.css`): the SVG inherits
text colour via `stroke="currentColor"` and can opt into a categorical
slot with the same `:c1`–`:c8` modifiers the pills use (mapping to
`--cat-*`). Vector, PDF-safe, no runtime JS, no network — and unlike a
webfont it lives *inside* the palette-blind model instead of beside it.
`:sm`/`:md`/`:lg` set the box via an `--icon-size-*` token (or the icon
just inherits `1em`).

**Pluggable source — the resolver.** `lib/icons.js` exposes
`resolve(name) → svgBody | null` behind a small source interface, so
the icon set is swappable without touching the parser, the three render
paths, or any deck:

- **Lucide (default).** Read raw SVGs from the `lucide-static` package
  at build (or vendor the subset actually referenced — keeps the
  tarball lean). Bundled into the emitted output so there is no runtime
  fetch.
- **Other sets are additive.** A future source (Heroicons, Tabler, or
  even **Font Awesome** as an SVG/webfont backend) registers under the
  same interface. FA is therefore not abandoned — it is one selectable
  backend, not the lock-in. Selection is build-level config
  (`lattice.config` / env), never per-deck front-matter, so a deck
  authored against `icon:rocket` renders under whatever source the
  build blesses.

**Unknown icon name → warn + leave literal.** `` `icon:zzz` `` (name not
in the active source) emits a build-time stderr warning naming the
offending slides and falls through to literal `<code>icon:zzz</code>`
(same policy as an unknown prefix, resolved-decision #5). No silent
empty, no guessing. The linter reads the active source's name set from
`lib/icons.js` to flag typos before render.

### Pill shapes — Mermaid-inspired bracket grammar

> **SUPERSEDED 2026-09-04** by the amendment at the top of this note — the shape NAMES
> and both modifier axes below shipped, the bracket geometry did not. Kept as written
> because the measurement that replaced it is only legible against it.

Pills get their own grammar because shape is a visual axis the
`prefix:value` form can't express terselys. The bracket grammar is
adopted from Mermaid flowchart shape syntax, so authors who write
flowcharts in this codebase already know it.

#### Shape map

Only the subset that makes visual sense as an inline pill — Mermaid's
diagram-only shapes (cylinder, trapezoid, parallelogram) are out.

| Source | Mermaid name | Lattice pill shape | data-shape |
|---|---|---|---|
| `` `[X]` `` | rectangle | tag (sharp) | `tag` |
| `` `(X)` `` | rounded rect | chip | `chip` |
| `` `([X])` `` | stadium | pill (default capsule) | `pill` |
| `` `((X))` `` | circle | circular badge | `circle` |
| `` `[X>` `` | asymmetric | chevron, right-pointing | `chevron-right` |
| `` `<X]` `` | (no Mermaid match) | chevron, left-pointing | `chevron-left` |
| `` `{X}` `` | rhombus | diamond | `diamond` |
| `` `[[X]]` `` | subroutine | bordered tag (double stroke) | `tag-bordered` |

Detection: a small explicit opener→closer table (not a "match any
bracket" regex), so `` `[X)` `` and other mismatched pairs are
**literal**, not a parse error. Lookup order: longest opener first
(`((` before `(`, `[[` before `[`, `([` before `[`) so the parser
doesn't backtrack.

#### Color modifier — ordinal slot, not color name

Lattice's 8 categorical tokens are stable engine identifiers — but
the *actual rendered colors* are theme-dependent and the token names
are not honest color claims. Survey (`themes/*.css`):

- `--cat-blue` is sky blue on `indaco`, **deep red** on `burgundy`,
  **green** on `carbone`, **olive** on `mustard`, **mauve** on
  `magnolia`, **gray** on `onyx`.
- Same pattern for every other `--cat-*` token across the 12 light
  palettes (each dark variant `@import`s its light sibling).

A modifier API named `:blue` would lie to authors writing portable
decks. So the pill color modifier is **ordinal**: `:c1` through `:c8`
map 1:1 to the categorical token order, with no color promise.

| Modifier | Token |
|---|---|
| `:c1` | `var(--cat-blue)` |
| `:c2` | `var(--cat-green)` |
| `:c3` | `var(--cat-purple)` |
| `:c4` | `var(--cat-orange)` |
| `:c5` | `var(--cat-teal)` |
| `:c6` | `var(--cat-rose)` |
| `:c7` | `var(--cat-slate)` |
| `:c8` | `var(--cat-mauve)` |

(The underlying tokens stay named `--cat-blue`...`--cat-mauve` — that
rename is out of scope. The modifier API translates.)

No modifier = default pill (whatever the current `.pill` rule paints,
typically `--accent`). Authors who want explicit categorical
contrast pick a slot.

Text-on-color contrast comes for free: the existing categorical
contrast policy in `lattice.css:61-78` derives `--cat-<name>-deep`
variants per theme for AA-passing text-on-color. Pill CSS consumes
those automatically — no per-modifier contrast math.

#### Size modifier (axis 2)

```
:sm  :md (default)  :lg
```

Maps to `--pill-size-*` tokens (to be defined in `lattice.css`).
Modifier order is free — `` `[BETA]:c4:lg` `` and `` `[BETA]:lg:c4` ``
parse identically because the parser sorts modifiers by which axis
they belong to (color vs size).

#### Worked examples

```
`(LIVE)`              → default pill, no opinion (current .pill look)
`(LIVE):c2`           → pill, slot-2 color
`[BETA]`              → sharp tag
`[BETA]:c6:lg`        → tag, slot-6, large
`[STEP 2>`            → chevron right, default
`[STEP 2>:c1`         → chevron right, slot-1
`((1)):c5`            → circle "1", slot-5
`{DECIDE}:c3`         → diamond, slot-3
`[[CRITICAL]]:c6`     → bordered tag, slot-6
```

#### HTML output shape

```html
<span class="pill" data-shape="tag" data-c="c4" data-size="lg">BETA</span>
```

CSS in `lattice.css` consumes `data-shape` for geometry and `data-c`
for color (`.pill[data-c="c4"] { --pill-bg: var(--cat-orange); }`).
No inline styles needed; themes can repaint by overriding `--cat-*`.

#### What this lets us delete

The earlier-proposed `pill:`, `tag:`, `kbd:` *as pill prefixes* go
away — pills are bracket-form only. `kbd:` stays as a separate
namespace directive (`<kbd>` is structurally different from a pill;
it carries semantic meaning, not visual variant).

### Resolved decisions

Locked 2026-05-15. Each entry names the call, the rationale that won
the argument, and the rejected alternatives.

1. **Variable syntax: bare `` `$client` ``.** Not braced
   `` `${client}` ``. Bare mirrors the `prefix:value` family
   (sigil-then-text, no delimiter overhead); pill brackets in this
   grammar already encode visual shape, so braces around a variable
   name would carry no information and look like a pill that isn't
   one. Composition (`` `${a} report` ``) is explicitly out of scope —
   one backtick = one directive — so the only argument for braces
   evaporates. Dotted paths still work bare: the regex
   `/^\$([A-Za-z_][\w.]*)$/` already accepts `$client.name`.

2. **Escape for literal `prefix:value`: CommonMark double-backtick.**
   `` ``var:--brand`` `` (double backticks) skips directive
   preprocessing because the rule runs only on single-backtick
   `code_inline` tokens with `markup === '` '`. Validated against
   markdown-it's AST — the marker count is preserved on the token.
   Authors documenting CSS or shell syntax that contains a colon get
   a clean escape per-occurrence.

3. **Icons: pluggable source, Lucide default, inline SVG.**
   *(Revised 2026-06-08 — supersedes the original "Font Awesome,
   webfont" call.)* A single `icon:<name>` namespace resolves through
   `lib/icons.js` to an inline `<svg>`. The default source is Lucide
   (ISC); other sets — including Font Awesome as a backend — register
   behind the same `resolve(name)` interface, selected at build level,
   never per-deck. Inline SVG (not a webfont) so icons recolour via
   `currentColor` / the `:c1`–`:c8` slots like pills, matching the
   engine's `--mark-*` model. See **Icons — pluggable source (Lucide
   default)** above. Rejected the FA-webfont lock because it sat outside
   the palette-blind model, split the icon vocabulary from the docs
   site (which adopted Lucide), and carried CC BY 4.0 attribution + a
   vendored-font / Pro-probe apparatus Lucide doesn't need.

4. **Missing-var behaviour: loud `??name??` + stderr warning.**
   `` `$undefined` `` renders as `??undefined??` in the slide body
   (high-contrast, impossible to miss in author review) AND emits a
   warning on stderr at build (so CI can gate on it). Rejected
   alternatives: silent empty (failures vanish until a customer
   notices); literal passthrough (looks like intentional copy at a
   glance). Same instinct as throwing over returning `undefined` —
   the build is the only review pass before the deck ships, so
   failures must be impossible to miss.

5. **Unknown prefix behaviour: warn + leave literal.**
   `` `xyz:foo` `` (no registered handler) emits a build-time warning
   on stderr and falls through to literal `<code>xyz:foo</code>`.
   Additive but discoverable — adding a new namespace later never
   breaks existing decks, and typos in known prefixes get caught.
   Never throw; never silently drop.

6. **Plain inline code stays literal; dispatch requires a marker.**
   `` `LIVE` `` renders as `<code>LIVE</code>`. Interpretation only
   fires when the token's leading character is a recognised dispatch
   marker: `$` (variable), a registered bracket opener (pill), or a
   `prefix:` run (namespace). This preserves the literal-code escape
   hatch for `` `getUserId()` ``, `` `:root` ``, etc. Corollary:
   there is no "default pill" shape — every pill requires an explicit
   bracket. If you want a pill, you write the brackets.

### Initial directive registry

Ship with:

- `$name` → front-matter variable interpolation (bare, dotted paths
  allowed, missing → loud `??name??` + stderr warning).
- `icon:<name>` → inline SVG via the pluggable source in `lib/icons.js`
  (default: Lucide, ISC). Unknown name → warn + leave literal.
- Bracket-shape pills with `:c1`–`:c8` colour slots and
  `:sm`/`:md`/`:lg` sizes (full grammar above).

Stretch namespace prefixes: `kbd:` (`<kbd>` chords). Can land
incrementally in a follow-up PR.

## Implementation plan

### Architecture (the three-renderer rule)

Per `CLAUDE.md`: any authoring transform must land in all three render
paths or they drift. For inline-code directives:

1. **`marp.config.js`** — register a `markdown-it` rule that walks
   `code_inline` tokens after parse and rewrites matching ones into
   `html_inline` tokens (or a custom token type). Cheapest path —
   runs once during parse, no DOM walk. Covers marp-cli build AND
   marp-vscode preview (both go through the same engine).
2. **`lattice-emulator.js`** — emulator doesn't run markdown-it the
   same way (see header at `lattice-emulator.js:2167` "not running
   through marp-core"). Add the same transform to its inline pipeline.
   Look at how `liftSlotLabel` / `chartFamily` / `splitPanelCounter`
   are mirrored across renderers (each has a sibling-implementations
   header comment) for the established pattern.
3. **`lattice-runtime.js`** — DOM-walk fallback for marp-vscode
   preview cases where the parse-time rule can't reach (e.g. content
   injected by a later transform). May not be needed if (1) covers
   the preview path; verify before adding.

### Suggested file layout

- **`lib/inline-directives.js`** — single source of truth: regex,
  registry of handlers (`{ icon: renderIcon, var: renderVar, ... }`),
  pure functions taking `(text, ctx)` and returning HTML strings.
  No DOM, no markdown-it dependency — same shape as
  `lib/chart-family.js`. Unit-testable in isolation.
- **`lib/icons.js`** — the pluggable icon source. Exposes
  `resolve(name) → svgBody | null` and the active source's name set,
  behind a small source interface so the set is swappable without
  touching the parser or render paths. Default source reads Lucide
  artwork from `lucide-static` (or a vendored subset). Consumed by
  `lib/inline-directives.js` (the `icon:` handler) and `lattice-lint`
  (unknown-name warnings). A future source (Heroicons / Tabler / FA)
  registers here; selection is build-level config, not per-deck.
- **`marp.config.js`** plugin → calls `lib/inline-directives.js` from
  inside a markdown-it rule.
- **`lattice-emulator.js`** → calls the same lib from its inline
  transform pass.
- **Icon artwork** comes from `lucide-static` (committed dep) or a
  vendored subset under `assets/icons/`; the referenced SVGs are
  inlined into the emitted output at build — no runtime fetch, no
  webfont, no font `@import`.

### Reference parser (drop-in starting point)

Hand-rolled single-pass dispatcher. The grammar has no recursion
(directives can't nest inside backticks), so this is both the simplest
and fastest shape. ~40 lines, no PEG, no parser combinators.

```js
// lib/inline-directives.js — pure function, no DOM, no markdown-it.
// Input: text content of a code_inline token (what's between the backticks).
// Output: { kind, … } describing the directive, or null = "leave literal".

// Longest opener first; first match wins. ~8 entries, linear scan = ~30 char compares worst case.
const BRACKETS = [
  ['([', '])',  'pill'           ],
  ['((', '))',  'circle'         ],
  ['[[', ']]',  'tag-bordered'   ],
  ['[',  '>',   'chevron-right'  ],
  ['<',  ']',   'chevron-left'   ],
  ['[',  ']',   'tag'            ],
  ['(',  ')',   'chip'           ],
  ['{',  '}',   'diamond'        ],
];

const VAR_RE = /^\$([A-Za-z_][\w.]*)$/;
const NS_RE  = /^([a-z]+):(.+)$/;

function parse(text) {
  // 1) variable — first-char dispatch, O(1) reject
  if (text.charCodeAt(0) === 0x24 /* $ */) {
    const m = VAR_RE.exec(text);
    return m ? { kind: 'var', name: m[1] } : null;
  }

  // 2) bracket pill — first-char dispatch, small lookup table
  const c0 = text[0];
  if (c0 === '[' || c0 === '(' || c0 === '{' || c0 === '<') {
    for (const [open, close, shape] of BRACKETS) {
      if (!text.startsWith(open)) continue;
      const closeIdx = text.indexOf(close, open.length);
      if (closeIdx < open.length) continue;
      const tail = text.slice(closeIdx + close.length);
      if (tail && tail[0] !== ':') continue;       // tail must be empty or start with :
      const value = text.slice(open.length, closeIdx);
      if (!value) continue;
      const mods = tail ? tail.slice(1).split(':') : [];
      return { kind: 'pill', shape, value, mods };
    }
  }

  // 3) namespace prefix — single anchored regex, no backtracking
  const ns = NS_RE.exec(text);
  if (ns) return { kind: 'prefix', prefix: ns[1], value: ns[2] };

  // 4) literal — caller leaves the <code> alone
  return null;
}
```

Properties to preserve in the implementation:

- **O(n) single pass.** No backtracking, no recursion. `n` is the
  code-token text length, typically 5–30 chars.
- **First-char dispatch routes to disjoint branches** ($, brackets,
  lowercase letters). Literal text falls through without allocating.
- **No allocation on the literal path.** Return `null`; the
  markdown-it ruler leaves the token untouched — no new tokens, no
  string churn.
- **Two anchored regexes total.** Both linear, no alternation.

For a 70-page deck with ~500 inline-code tokens, total parse cost is
well under a millisecond per render. Dominant cost on preview
re-render remains mermaid and the marp pipeline — directive parsing
is dust.

**Approaches to resist:**

- PEG / parser combinators. Overkill — no recursive structure here.
- One mega-regex with alternation + capture groups. Slower and harder
  to read than the dispatch above.
- Memoization. Tokens are unique enough per deck that cache hit rate
  isn't worth the map.

Handler dispatch (separate from parsing) is a plain object keyed by
`kind` and (for `kind: 'prefix'`) by `prefix`:

```js
const PREFIX_HANDLERS = {
  icon: (value, mods) => renderIcon(value, mods),   // resolves via lib/icons.js → inline <svg>
  kbd: (value, mods) => renderKbdChord(value),
  // …
};

const PILL_COLORS = ['c1','c2','c3','c4','c5','c6','c7','c8']; // → --cat-*
const PILL_SIZES  = ['sm','md','lg'];

function render(parsed, ctx) {
  switch (parsed.kind) {
    case 'var':    return ctx.vars[parsed.name] ?? `??${parsed.name}??`;
    case 'pill':   return renderPill(parsed.shape, parsed.value, parsed.mods);
    case 'prefix': {
      const h = PREFIX_HANDLERS[parsed.prefix];
      return h ? h(parsed.value) : null;  // null = warn + leave literal
    }
  }
}
```

Pill mod resolution sorts mods into axes (color = `c[1-8]`, size =
`sm|md|lg`) so `:c4:lg` and `:lg:c4` produce identical output.

### Tests to add

- `test/unit/inline-directives.test.js` — pure-function tests for
  `lib/inline-directives.js`: regex matching, var resolution,
  unknown prefix, escape via double backticks, edge cases
  (`` `$` ``, `` `:` ``, empty value).
- Cross-renderer parity assertion in `test/integration` — same input
  produces the same icon/var output through emulator and marp-cli.
- Gallery slide demonstrating each directive (probably one new slide
  in `examples/gallery.md` under a new "Inline directives" section).
  Don't forget to commit the rebuilt PDF in the same commit per
  `CLAUDE.md` ("When committing gallery edits, keep the deck and its
  rebuilt PDF in the same commit.").

### Performance — already analysed

Discussed in the originating conversation: a `markdown-it` `code_inline`
ruler is microseconds per render (markdown-it dispatches by token
type; we touch only `code_inline` tokens). The current cost of a
preview re-render is dominated by mermaid + the marp render itself.
Don't add a `MutationObserver` — the gotchas file already documents
self-trigger loops at line 480. Stay inside the existing render-pass
shape.

## Branch + handoff

- Start fresh from `main` (not from `claude/fix-emoji-rendering-WO4vI`,
  which is scoped to the emoji bugfix).
- Suggested branch: `feat/inline-directives` or `feat/icon-vars`.
- First PR: scaffold `lib/inline-directives.js` + `lib/icons.js` (Lucide
  source) + the markdown-it ruler in `marp.config.js` + `$` (vars), the
  `icon:` namespace (inline SVG via the resolver), and bracket-shape
  pills with `:c1`–`:c8` + `:sm`/`:lg`. Unit tests + one gallery slide
  demonstrating each. Hold `kbd:` for a follow-up PR to keep the diff
  small.

All five open questions are resolved (see **Resolved decisions**
above). No human input required before coding starts.
