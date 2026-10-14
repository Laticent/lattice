---
status: proposed
summary: >
  A plugin brings inline syntax through `@kind{…}`, one form for every inline kind: the word after `@` names
  the kind the plugin declares (`@avatar{Ada Okafor}`), the built-in sigils stay as aliases (`!{…}` is
  `@avatar{…}`), a claim is data in the manifest and never a question put to plugin code, only the deck's
  listed plugins are asked, and a zip plugin's spans go through the fence door's consent, sandbox and
  placeholder. The `@` trigger also drives editor autocomplete and Compose's per-kind editors.
---

# The plugin inline door: `@kind{…}` (2026-10-14)

Status: proposed. The owner's decisions are in §3; nothing is built yet. Parent:
`2026-09-27-plugin-system.md` (the plugin contract; its 2026-10-13 progress entry said inline syntax was not a zip
plugin's to contribute, which this note reverses). Siblings: `2026-09-28-segno-unified-inline-notation.md` (the
notation, whose decision 11 was amended today to retire journey's `@`), `2026-09-29-inline-icons.md` §6a (the
inline-kind table), `2026-10-13-compose-inline-notation-editors.md` (the editors), and
`2026-10-14-chart-authoring-uniform-model.md` (#2686, which changes the same grammar; §8).

## 1. The answer

An author calls any inline kind the same way: `` `@kind{…}` `` in inline code, where `kind` names what is drawn.

```
`@avatar{Ada Okafor, hair=coily}`   a shipped plugin's kind; `!{Ada Okafor, hair=coily}` is its alias
`@icon{database, c3}`               `^{database, c3}`
`@spark{12 14 17, bar}`             `~{12 14 17, bar}`
`@gantt-bar{Design, 2}`             a zip plugin's kind, which has no alias
```

- **Claims are data.** A plugin declares its kinds in its manifest. The host decides which plugin owns a span from
  that data and the deck's `plugins:` line, before any plugin code runs.
- **Only listed plugins are asked.** A zip plugin's span draws only when the deck lists the plugin and the browser
  (or `lattice packages trust`) has approved its code. Otherwise a placeholder chip stands in its place.
- **One trigger for the tools.** `@` opens autocomplete in the editor, and Compose builds a panel for each kind
  from the kind's declared fields, as it does for pills and sparks.

## 2. What exists, and what was measured

A plugin can contribute three kinds of syntax today, each settled differently:

| Mechanism | How it claims | Who may add one | When two collide |
|---|---|---|---|
| A parser rule (math's `$`) | a trigger character | in-tree only | build error naming both (`checkSyntaxClaims`, `lib/plugins/resolve.js`) |
| A fence (```` ```gantt ````) | the fence name the author writes | zip plugins too, through the code door (phase E) | neither draws, the block stays code, one warning (`planFencePlugins`, `lib/packages/code-door-fence.mjs`) |
| An inline-code kind (`!{…}`) | one tag character, indexed by first character (`BY_LEAD`, `lib/core/inline-code-directives.js`) | in-tree only | build error (`checkInlineClaims`) |

The inline kind is not a parser rule. It is a row in the host's dispatch table, read from a code span, so markdown
has already finished with the text when a kind sees it. That is what makes it safe to open to zip plugins, where a
parser rule is not.

Segno's grammar allows three tag characters, `TAGS = '~^!'` (`docs/src/lib/segno/notation-grammar.ts`), and all three
are taken: sparks, icons, avatars. A tag character also stops a bare word from starting with it, which is why
`` `~/path` `` stays code. A character per plugin does not scale: every plugin anywhere would compete for the same
few characters.

Measured on 2026-10-14:

- **The repo's 3,358 markdown files hold 164,529 inline-code spans.** 1,643 start with `@` (journey's actors,
  since retired; npm scopes; decorators). 2 have the shape `@name{`. A bare `name{` shape occurs 30 times, every
  one CSS (`section{`, `li{`) or a font-name fragment.
- **The 276 example and gallery decks hold 6,834 inline-code spans** (25 a deck on average, 290 at most), and the
  built-in kinds draw 383 of them (5.6%).

## 3. Decisions (owner, 2026-10-14)

1. **Plugins may bring inline syntax.** Avatars and icons already are inline plugins in-tree, and a zip plugin gets
   the same door.
2. **Journey reads standard Segno.** Its `@actor` shortcut is retired (`{who=sales}` instead), so `@` has one
   meaning in inline code. (The host-side form of §4.1 would not have clashed with `@sales`, which has no `{`; the
   retirement is an authoring decision, not a technical one.)
   Shipped as its own commit on this branch, with a `journey-actor-shortcut` lint and autofix.
3. **`@` is the inline door.** It is the character that tells the editor's autocomplete and Compose that a kind
   is being written.
4. **The word after `@` is the KIND, not the plugin.** The avatars plugin declares the kind `avatar`, so the
   author writes `@avatar{…}`. A plugin that draws two things declares two kinds.
5. **The built-in sigils stay, as aliases.** `~{…}`, `^{…}` and `!{…}` keep working and mean `@spark{…}`,
   `@icon{…}` and `@avatar{…}`. Nothing an author has written changes.
6. **Claims are declared, not asked** (§5): the owner raised a handler model, in which every plugin is offered a
   span and one claims it. It is kept as a later, opt-in tier.

## 4. The model

### 4.1 The grammar: the host peels `@kind`, and Segno is unchanged

The first draft of this note added `@` to Segno's tag set and a `named` production to its grammar. Building it showed
a smaller way, which is what shipped: **the host recognizes `@kind` and hands Segno the plain `{…}` record.** Segno's
grammar, its generated parser and its published package do not change, and Segno still names no kind (its decision
13).

```
@kind{…}    kind = [a-z][a-z0-9-]*, the manifest's propertyNames pattern; `{` directly after it
```

- **It is already code today.** Segno reads `@avatar` as a bare word and then fails at `{`, and a span that fails to
  parse stays code. So `@kind{…}` changed no shipped deck before the host claimed it, and `` `@ada` ``,
  `` `@laticent/segno` `` and `` `@Override` `` still render exactly as they do now.
- **The `{` must follow the name directly.** `` `@avatar {Ada}` `` is code. The no-space rule keeps the kind name
  unambiguous, and it keeps a mention (`@ada`) from ever reading as a call.
- **No LL(1) question.** The host matches one anchored pattern (`NAMED_RE`, `lib/core/inline-code-directives.js`)
  before Segno runs, and Segno then reads an ordinary record. That also removes the overlap with #2686, which edits
  the grammar (§8).

### 4.2 One table, one more lead

The dispatch table (`inline-code-directives.js`) gains one lead, `@`. Its row reads the kind name, looks the kind
up, and hands the record to that kind:

- **An in-tree kind with an alias** (spark, icon, avatar) is called exactly as through its sigil. The row hands it
  `<sigil>{…}`, so no kind changes. `@icon{database}` and `^{database}` render byte-identically, which a test pins
  for every alias.
- **A zip plugin's kind** has no row the engine can run: its code runs only in the sandbox (§4.4). The engine leaves
  the span as `<code>`, and the door claims it after the render, as it claims a fence today.
- **An unknown kind** stays code. `lint:deck` warns (`unknown-inline-kind`), with a did-you-mean over the kinds the
  deck can use.

The escape is unchanged: `` `\@icon{database}` `` shows the literal text. Like every other kind, a backslash is
stripped only before a span that would dispatch, so `` `\@foo` `` keeps its backslash.

### 4.3 The manifest: what a kind declares

`contributes.inline.<kind>` already exists for in-tree plugins (`{ sigil }`). It changes as follows:

| Field | Today | Proposed |
|---|---|---|
| `sigil` | required, in-tree | optional, and in-tree only: a zip plugin gets no alias, because characters do not scale (§2) |
| `slot` | — | optional: the kind's fields as a Segno slot spec, the same data shape a component's `segno` block uses (`lib/core/segno-spec.js`). The host reads the record with it, so the plugin receives fields, not text, and lint, autocomplete and Compose know the kind's parameters without running its code |
| `placeholder` | fences only | also for inline kinds: `size` (`sm`, `md`, `lg`, `xl`), the avatar scale; default `sm`, one line of text |

A kind name follows the fence rules: lower-case letters, digits and hyphens. It is refused when it is a host kind
(`state`, `pill`, `spark`), a shipped plugin's kind (`icon`, `avatar`), or another listed plugin's.

### 4.4 The door for a zip plugin's kind

The fence door from phase E carries inline kinds with three changes. The flow is the same in the Studio
(`docs/src/lib/code-packages/door.ts`) and the CLI (`lattice.js`, `withInstalledPlugins`):

1. **Activation:** the deck lists the plugin (`activePluginNames`), and its code is approved for these bytes.
2. **Capture:** after the first render, the door finds every `<code>` whose text is `@<kind>{…}` for an active
   kind, outside slides a shipped pass rebuilds, as `claimedFences` does for fences. A `<code>` the engine stamped
   escaped (`data-lat-escaped`) is never claimed.
3. **Run:** the sandbox calls the plugin's `inline[kind](input)`, where `input` is `{ fields, text, id }`. `fields`
   is the record read by the kind's `slot`, or null when the kind declares none; `text` is the span as written; `id`
   is the namespaced id that `fenceId` builds.
4. **Splice:** the output is sanitized to PHRASING content (text, `<span>`, `<svg>` and its children; no block
   element, no `<style>`) and wrapped in `<span data-lattice-plugin="<plugin>" data-kind="<kind>">`. The splice
   happens where a fence's does, before the preview builder sanitizes the document, so it adds no new markup sink
   (HARD RULE #22). That is a claim for the trio to check against `checkPreviewHtmlSinks`, not a given.

Limits: inline spans and fences share one pool of claims per render (`MAX_FENCES_PER_PASS`, 400) and one output cap
(`FENCE_OUTPUT_MAX`). A span longer than a set cap (proposed 2,000 characters) stays code with a warning, as a fence
too long for its plugin does. The deck that holds the most spans, 290, holds them all in one pool. Only claimed spans
count, and the built-ins draw about 6% of spans.

**The placeholder.** A listed but unapproved plugin, or an installed plugin the deck does not list, shows an inline
chip: `<span data-lattice-plugin-off data-placement="chip" data-inline>`. It carries the plugin's mark and its name as
the accessible name, sized by `placeholder.size`, and never the author's text. It uses the same Nacre paint as the
fence placeholder (`lib/base/base.modifiers.css`). The consent strip (`CodePackagesNotice`) counts a plugin once,
whether the deck uses its fences, its kinds or both.

### 4.5 Lint, autocomplete and Compose

- **Lint** (`lib/authoring/lint-core.js`, HARD RULE #7) reads the kinds as data, as it reads `externalFences`. It
  adds `unknown-inline-kind` (a warning, with a did-you-mean) and validates a record against its kind's `slot` when
  one is declared. No plugin code runs in the linter.
- **Autocomplete** (`inlineCodeCompletions`): typing `` `@ `` offers every kind the deck can use, built-in and listed
  plugin alike. Each entry shows its alias where there is one, and its one-line description. After
  `` `@kind{ ``, it offers the slot's parameters, the way icon names are offered after `^{` today.
- **Compose:** a kind with a `slot` gets the panel Compose already builds from a Segno slot schema
  (`2026-10-13-compose-inline-notation-editors.md` §5, B1), with the same write-back that changes only the edited
  words. A kind without a slot gets a text field. Kinds join the Insert menu that Compose's phase 3 builds, when that
  menu exists. A plugin's OWN editor UI (its code, drawing controls) is out of scope: it would need a sandboxed UI
  surface, which nothing here designs.

## 5. Why declared claims, not a handler that asks every plugin

The owner raised the alternative: send each span to every plugin and let one claim it. Weighed against the numbers in
§2, it fails on four counts:

1. **No static answer.** An unapproved plugin cannot run, so the host cannot know whether it would claim a span.
   The placeholder and the consent strip need that answer without running code, and the same deck would render
   differently before and after approval.
2. **Volume.** About 94% of spans are ordinary code that no kind draws. A handler model puts each of them through the
   sandbox once per plugin, and the deck with the most spans (290) nearly fills a render's 400-claim pool by itself.
3. **Silent meaning changes.** Installing a plugin could change what an existing `` `npm install` `` means. A declared,
   named claim changes nothing the author did not write.
4. **Disclosure.** Every approved plugin would read every code span in the deck.

**Kept for later, opt-in:** a kind that claims spans with no `@` (a mention plugin turning `` `Ada Okafor` `` into a
chip). The plugin's manifest would say so, and only listed, approved plugins would be asked. Priority would be the
order of the deck's `plugins:` line, which the author can see and change. A cheap host prefilter would decide which
spans reach the sandbox, and the consent strip would say that the plugin reads every code span. It is not in this
door, and the manifest leaves room for it, because a new claim mode breaks no existing plugin.

## 6. Collisions

| Case | Result |
|---|---|
| Two in-tree plugins declare one kind or one sigil | build error naming both (`checkInlineClaims`, unchanged) |
| A zip plugin declares a host or shipped kind | the plugin is refused at import, by name |
| Two listed zip plugins declare one kind | neither draws it, its spans stay code, one warning names both (the fence rule) |
| A plugin's kind name is a hyphen-prefix of another's | allowed: unlike ids and classes, kind names are matched whole |

## 7. What changes in the spec and the contract

- **Segno:** no change (§4.1). The host owns the `@kind` prefix.
- **LPM** (`spec/LPM.md`): `contributes.inline` opens to zip plugins, with `slot` and `placeholder`, and `sigil`
  stays in-tree only. The plugin-system note's trust table (§4.10) moves `inline` from in-tree-only to the code door.
  This is a contract change, so it lands before phase G freezes LPM 1.0.
- **LFM:** the inline notation section names `@kind{…}` as the general form and the sigils as aliases.

## 8. Coordination with #2686

The chart-authoring note (#2686, merging) changes Segno's grammar: a `{> description}` production INSIDE a record.
Since §4.1 leaves Segno's grammar alone, the two do not meet in `notation-grammar.ts` at all. The record inside
`@kind{…}` is an ordinary Segno record, so it gets that production, and ISO numbers, for free once they land.

Its phase 2 also plans that a span in a declared data slot is read by that slot's schema, not as a pill. The journey
commit on this branch added a narrower, lint-only version (`componentReads`, `lib/core/segno-slots.js`). Phase 2 should
replace it rather than build beside it.

## 9. Build, and what proves it

One PR, the owner's choice, one commit per step, each leaving the tree green:

1. **The named form and the aliases.** The `@` row in the dispatch table, and the alias test: every shipped `~{…}`,
   `^{…}`, `!{…}` and pill span in the repo renders byte-identically in its `@kind{…}` spelling, on the markdown-it
   path and the DOM path. **Done** (§11).
2. **Lint and autocomplete.** `unknown-inline-kind`, every inline lint check reading the named form, and
   autocomplete after `@`. **Done** (§11). The manifest's `slot` and `placeholder` for inline kinds, the claim
   checks of §6 and slot validation move to step 3, because only a zip plugin's kind uses them.
3. **The door.** Capture, run, splice and placeholder for zip kinds, in the Studio and the CLI, with a test plugin
   in `docs/e2e/` and `test/integration/export/plugin-cli.test.js` (real Chromium), seen at 1440, 820 and 390.
4. **Compose.** A kind with a `slot` opens the generated panel.

Before the door commits, the adversarial trio (HARD RULE #25) reviews steps 3 and 4, because they open a code path to
untrusted plugins. The red team's brief includes the phrasing-content sanitizer and the shared claim pool.

## 10. Open

- The per-span length cap (2,000 characters proposed) and whether inline spans get their own share of the 400-claim
  pool, so a fence-heavy deck cannot starve them.
- Whether the alias spelling is the one autocomplete inserts for built-ins (shorter) or the `@` form (one rule to
  read). Proposed: insert the alias and show the `@` form beside it.

## 11. Progress

**2026-10-14 — step 1, the named form.** `lib/core/inline-code-directives.js` gains one row, led by `@`: it peels
`@kind` off with `NAMED_RE`, looks the kind up among the rows that have an alias (`ALIASES`: `spark` `~`, `icon` `^`,
`avatar` `!`, and `pill`, whose alias is the bare record), and asks that row with the alias text. So a kind needs no
code for its named form, and the two spellings cannot drift. A kind whose plugin is off resolves to nothing, as its
alias does, and `offPlugin` names the plugin. A name with no row (`@gantt-bar{…}`) stays `<code>` for the door to claim
in step 3.
- **Proved:** all 458 drawn alias spans in the repo's markdown render byte-identically in the named spelling, as an HTML
  string and as a DOM element, with the icon and avatar drawings loaded, so an SVG is compared and not two empty
  results (`test/unit/core/inline-code-table.test.js`). A full engine render of a deck written both ways is identical
  apart from the escaped span, which shows what each author typed.
- **Followed through:** `mark-off.mjs` marks an off kind's named spans, so the runtime leaves them as written;
  team-profile reads `@avatar{…}` as a portrait when the plugin did not draw it; `lint:deck`'s per-kind diagnostics
  (`spark-literal`, `pill-literal`, `icon-literal`, …) read a named span through its alias (`canonicalText`), so a
  broken `@icon{nope}` warns as `^{nope}` does.
- **The checker's pass** (maker-checker; it compared the old and new dispatcher over 167,264 spans under four
  admission sets, and only the 18 named-form spans differed). It found what the alias test could not:
  - **The data probes.** A browser surface fetches a data plugin's drawings only when the plugin's `detect` sees a
    use, and the icons and avatars probes knew only `^{` and `!{`. `@icon{…}` stayed code in the Playground, and a
    team-profile roster written with `@avatar{…}` waited for ever on data nobody fetched. Both probes now match
    `@icon{` and `@avatar{`, and a test holds every data plugin's probe to both spellings of its kinds.
  - **Lint advice in the author's spelling.** The `spark-too-big` resize returned a named spark unchanged (Segno
    cannot parse `@spark{…}`); it now resizes and keeps `@spark`. A `pill-literal` fix named the alias; it now
    names `@pill{…}`. `data-src` is replaced on the host element only, on both paths.
  - **Gaps, not regressions** (a named span never drew before): `mixed-spelling`, the crowded-pill and stray-bracket
    checks, completion, and Compose's object chips do not read the named form yet. Completion and Compose are steps
    2 and 4; the three lint checks join step 2.
- **Not yet:** autocomplete after `@`, the manifest's `slot` and `placeholder`, `unknown-inline-kind`, the door and
  Compose (steps 2 to 4).

**2026-10-14 — step 2, lint and autocomplete.**
- **Autocomplete.** lint-core's `inlineCodeCompletions` answers `@` and `@ic` with the kinds (`NAMED_KINDS`, exported
  by the dispatcher: name, plugin, alias), each labeled with what it draws and its alias, and takes an `external`
  list for step 3's zip kinds. Inside `@kind{` it answers what the alias would, so the two spellings cannot offer
  different words. The Studio's `inlineCodeCompletion` (`docs/src/components/studio/editor-complete.ts`) opens the
  kind menu after `` `@ ``, offers the starter sparks after `@spark{`, and reads `@icon{`, `@spark{` and `@pill{`
  wherever it read the sigil. `@` outside a code span opens nothing, so a mention in prose stays prose.
- **`unknown-inline-kind`** (a warning; `spec/diagnostics.md` §3.3). A span `@name{…}` whose name no kind has: the
  host's, a shipped plugin's, or a listed zip plugin's (`vocab.externalInlineKinds`, plugin name to kind names, which
  step 3 fills). The fix offers the nearest kind name.
- **The lint gaps the checker named are closed.** `mixed-spelling` reads `@icon{db}` as `^{db}` and shifts its fix
  past the longer prefix, and the crowded-pill and stray-bracket checks read the named form. Every one gives its
  advice in the author's spelling, through one helper (`viaAlias`).
