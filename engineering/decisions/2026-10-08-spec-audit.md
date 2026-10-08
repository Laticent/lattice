---
status: proposed
summary: Audit of every spec in the repo — what counts as one, the four parts each owes (document, schema, reference implementation, shared test cases), where each stands, two measured drifts, and a proposed order of work.
---

# Spec audit (2026-10-08)

**The answer.** Lattice has **eleven** contracts that another program could implement or produce,
and only **three** live in `spec/`. Only one, the LTT, has all four parts a spec owes: a versioned
document, a schema, a reference implementation, and shared test cases that any implementation
must pass. LTT is also the one spec filed as a library rather than as a spec. The two most
important specs have drifted from the code with nothing to catch it:

- **The Diagnostic Protocol** registers **13** rule IDs and calls the list frozen. The linter
  emits **125**, so 112 rule IDs exist only in code.
- **LFM 1.0** says its two front-matter keys (`finish:` and `logo:`) are "the complete
  LFM-added front-matter surface". The engine reads about two dozen deck-wide settings
  (`lib/base/base.registers.docs.md`). The spec does not mention the inline notation (pills,
  sparks, icons) or the `_lens` tag either.

This note proposes treating specs as their own category, beside libraries, with one contract
for all of them, and an order of work. The owner asked for it on 2026-10-08, after the library
audit (`2026-10-08-library-audit.md`) showed LTT to be a spec, not a library.

## 1. What counts as a spec

A **spec** is a contract written so that someone else could build a second implementation
without reading our code. It defines a file format, a syntax, or a protocol between two
programs. A **library** is code. The two often travel together: `@laticent/ltt` is the code
that implements the LTT spec. The difference matters because they owe different things. A
library owes a working, tested package. A spec owes a document a stranger can follow, and a way
to prove an implementation follows it.

The test for this audit: **would another program ever read or write this, or be read by us?** A
deck file, a plugin, a theme, an exported timing track: yes. An internal data structure that
never leaves one process: no.

## 2. The four parts a spec owes

| # | Part | What it is | Why |
|---|---|---|---|
| 1 | **A versioned document** | Prose in `spec/`, with a version, a status (draft / ratified), an owner, and a change log | It is what a second implementer reads. A decision note explains *why*; the spec says *what* |
| 2 | **A schema**, where the spec defines data | A JSON Schema, generated from the types where it can be | A machine can check a file without our code |
| 3 | **A reference implementation** | The code we name as correct, with its path | Disagreements between the document and the code get settled one way, on record |
| 4 | **Shared test cases** | Input files plus expected results, which every implementation, ours included, must pass | This is the only part that catches drift. Without it, the document and the code diverge quietly, as §4 shows |

Plus one gate: **a check that fails when the parts disagree.** LTT already has one: `npm run
build:check` fails when `ltt.schema.json` differs from the types it is generated from.

## 3. The inventory

Measured on `main` at `f3ad9f5c`. "Tests" means tests aimed at the contract itself, not tests
that merely use it.

| Spec | Defines | 1. Document | 2. Schema | 3. Implementation | 4. Shared test cases |
|---|---|---|---|---|---|
| **LFM** (Lattice-Flavored Markdown) | The deck format | `spec/LFM-1.0.md`, "1.0-draft (pre-ratification)" since 2026-06-13; published at `/spec/lfm/` | `dist/docs/grammar.json`, generated per component | the engine | ✗ none; `build-grammar.test.js` checks the generated grammar, not documents against the spec |
| **Diagnostic Protocol** | The shape of a lint finding, and the rule registry | `spec/diagnostics.md`, draft 1.0; published at `/spec/diagnostics/` | ✗ | `lib/authoring/lint-core.js` | ✗; nothing compares the registry with the linter (§4) |
| **LPM** (Lattice Plugin Model) | How a plugin and the host talk | `spec/LPM.md`, 0.5-draft; not published while a draft | `lib/plugins/plugin.schema.json` | the plugin host | our own plugin manifests are validated (`tools/manifest-schemas.js`) |
| **LTT** (Lattice Timing Track) | Word-timing files | `engineering/ltt.md`, outside `spec/`; not published on the site | `ltt.schema.json`, generated, gated | `@laticent/ltt` | ✓ `docs/src/lib/ltt/conformance/*.json` |
| **Theme contract** | The tokens a palette must supply | `design/theming.md`, prose, no version | `themes/theme.schema.json` | build + engine | partial: contract tests such as `accent-contract.test.js` |
| **Component manifest** | What a component declares | `design/design-system.md`, prose | `lib/components/manifest.schema.json` | build | our own manifests are validated in `build:check` |
| **Finish and motion manifests** | Data files for a finish or a motion | ✗ | `finish.schema.json`, `motion.schema.json` | engine | our own manifests are validated (`tools/manifest-schemas.js`) |
| **Forms** (frame / cell / tile) | How a slide is composed | `design/forms.md` | `lib/forms/schema/*.schema.json` | engine | `frame-conformance.test.js` (integration) |
| **Portable package shape** | One folder shape for themes, components, finishes, motion | a decision note only (`2026-09-23-portable-packages.md`) | per type, via the manifests above | build, CLI, Studio | ✗ |
| **`.lattice` project file** and **asset bundle** (`lattice-asset/1`) | What the Studio saves and reopens | ✗ code only (`docs/src/components/studio/lattice-file.ts`, `asset-bundle.ts`) | ✗ | Studio | Studio unit tests |
| **Segno inline notation** | What an author types inside backticks: pills, sparks, icons, values | Segno's README and `2026-09-28-segno-unified-inline-notation.md` | the grammar is data in Segno | `@laticent/segno` | Segno's own tests, including a fuzz test |

Three observations:

- **The site already has a "Specification" section** (`/spec/lfm/`, `/spec/diagnostics/`),
  generated from `spec/` by `tools/build-spec-docs.js`, and `docs:spec:check` fails CI when the
  pages drift. So the projection pipeline exists. LTT just never joined it.
- **`spec/*.md` is licensed CC-BY-4.0** (`tools/build-spec-docs.js` header), apart from the
  code. A spec moved into `spec/` takes that license with it, which is the right license for a
  document we want others to implement.
- **Schema `$id`s use two domains**: `laticent.io/schema/…` for themes and
  `lattice.laticent.io/…` for the rest. This audit could not check whether either resolves (the
  sandbox's network policy refuses the host).

## 4. Two drifts, measured

### 4.1 The Diagnostic Protocol's "frozen" registry

`spec/diagnostics.md` §3 says the rule IDs are "frozen for LFM 1.x", that "new rules are added in
minor versions", and that "a rule is never silently removed". The registry lists **13** IDs.
`lib/authoring/lint-core.js` and its siblings emit **125** distinct rule IDs (counted by
`grep -oE "rule: *'…'"` over `lib/authoring/`). All 13 registered IDs are still emitted, so
nothing was removed. But 112 IDs were added without a minor version, and nothing checks the
registry against the code. A tool that relied on the registry, as §3 invites, would not know
that 90% of the findings exist.

### 4.2 LFM's front-matter surface

`spec/LFM-1.0.md` §2.3 lists `finish:` and `logo:` and says: "These two keys are the complete
LFM-added front-matter surface in 1.0." `lib/base/base.registers.docs.md` documents about two
dozen deck-wide settings an author can write today: `plugins:`, `preset:`, `mode:`, `fit:`,
`backdrop:`, `split:`, `stamp:` / `tone:`, `spectrum:`, `rule:`, `inline-code:`, `eyebrow:`,
`headline:`, `lift:`, `venue:`, `chart-finish:`, `cards:`, `tag:`, `spark:`, `corners:`,
`delivery:`, `greeting:` / `closing:`, and `pace:`. The spec also has no section on the inline
notation (pills, sparks, icons), the `_lens` tag, or plugins. A second implementer following
LFM 1.0 today would render a fraction of a real deck.

Neither drift is anyone's mistake in one PR. They are what happens to a spec with no shared test
cases: every feature lands in the code with tests of its own, and nothing asks the document to
keep up.

## 5. Recommendation

1. **Specs become a category beside libraries,** with the four parts in §2 as the bar, an owner
   per spec (LTT already names one), and the site's existing Specification section as their
   public home.
2. **Not every contract needs to be a public spec.** Proposed split, for the owner to confirm:
   - **Public specs** (an outside party implements them; they get CC-BY-4.0, a version and
     shared test cases): LFM, the Diagnostic Protocol, LPM, LTT.
   - **Internal contracts** (only our code reads them; a schema and our own tests are enough):
     the theme contract, the component, finish, motion and form manifests, the package shape,
     the `.lattice` file.
   - **Folded into LFM**: Segno's inline notation and the `_lens` tag. They are things an
     author writes in a deck, so they are LFM, with Segno as their reference implementation.
3. **LTT moves its document to `spec/LTT-1.0.md`** and joins the site's Specification section.
   `@laticent/ltt` stays as its reference implementation, and stays a published package because
   Cadenza and Vetrina import it. On the home page, its card moves from Libraries to a Specs
   group.

## 6. Proposed order of work

Each step is one PR (HARD RULE #17). They are ordered by what each one unblocks.

| # | Step | Why this order | Done when |
|---|---|---|---|
| 1 | **Close the registry drift.** A test that fails when `lint-core` emits a rule ID the registry does not list, or the registry lists one it no longer emits; then register the 112 IDs in a Diagnostic Protocol 1.1 | Smallest step, and it adds the first spec-level gate outside LTT | the test exists, its failing arm fails, and the registry matches |
| 2 | **Move LTT into `spec/`** and project it onto the site; the home page gets a Specs group | Gives the category its home, using the one spec that is already complete | `/spec/ltt/` is live, and `docs:spec:check` covers it |
| 3 | **Start LFM's shared test cases**: a folder of small decks, each with its expected structure (for example, the slide classes and slots it produces), run against the engine | LFM cannot be brought up to date safely until there is something to check the update against | a first set covers §2–§3 of the current spec |
| 4 | **LFM 1.1**: document the front-matter settings, the inline notation and the `_lens` tag, each with test cases | The big rewrite, made safe by step 3 | every documented setting has a test case |
| 5 | **A spec gate**: `spec/` entries declare their four parts in a header, and a check fails when one is missing or a path rots | Keeps the category honest once it exists | the check runs in `build:check` |

Step 5 adds a check to an existing gate (`build:check`), not a new CI job, so under CLAUDE.md's
second filter it does not change the CI contract. Steps 1 and 3 add tests. None of the five
needs a new workflow.

## 7. Open decisions for the owner

1. **The public / internal split** in §5.2. In particular: should the theme contract be public?
   It would let outside tools make Lattice palettes, but it would freeze token names that still
   move today.
2. **LFM's version.** LFM is still "1.0-draft (pre-ratification)". The options: ratify 1.0 as
   the small core it describes and add the rest as 1.1, or keep 1.0 a draft until it covers the
   real surface. Recommendation: the first, because a draft that never ratifies gives an outside
   implementer nothing stable.
3. **Who owns each spec.** LTT names the owner. The other three public specs name nobody.
