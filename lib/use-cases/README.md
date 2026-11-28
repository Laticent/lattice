# `lib/use-cases/` — the actions a host offers

One folder per action. Today every one is a Studio chat tool; the same manifest is meant to feed the
command palette and an MCP server later. The design is
`engineering/decisions/2026-11-17-use-case-layer.md`; this file is how to work in the folder.

## What is here

| Path | What it is |
|---|---|
| `<id>/<id>.use-case.json` | The manifest: id, tier, effects, input schema, per-host wording, the chat's position and status labels |
| `use-case.schema.json` | What a manifest may hold. `npm run build:check` validates every manifest against it (`tools/manifest-schemas.js`) |
| `<id>/<id>.kernel.mjs` | A new use case's pure kernel: `(model, args) → Outcome` (use-case-layer.md §5.1). The 19 legacy tools have none yet |
| `<id>/<id>.validate.mjs` | GENERATED. The input's validator, compiled by ajv's standalone mode at build time (use-case-layer.md §7). It imports nothing, so no host ships ajv |
| `validators.generated.mjs` | GENERATED. Every validator, by id. The dispatcher refuses a use case with none |
| `dispatch.mjs` | The one path from "an action was asked for" to its result: look up, gate, parse, validate, run, check |

The build compiles the manifests (`tools/build-use-cases.js`, a `build.js` step) into two committed files
in `docs/src/components/studio/`: `chat-tools.generated.ts` (the definitions in the order the model sees
them, the labels, the runtime catalog) and `chat-tool-tiers.generated.ts` (the tiers alone, because the
chat panel's startup code reads them and must not carry every schema).

## Adding a use case

1. Make `<id>/<id>.use-case.json`. The id is `snake_case` verb-noun and never changes.
2. Write its kernel, `<id>/<id>.kernel.mjs`: pure, `(model, args) → Outcome`, running on the deck model
   (use-case-layer.md §5.1; until the slide spine lands, on the interim adapter §10 0b allows). The gate
   refuses a new use case without one. **Do not add a handler to `createToolbox`**: that closure is where
   the 19 legacy tools wait to become kernels, not a place for new work.
3. `npm run build`. The generated files change, the validator included; commit them with the manifest.
4. A new use case is not `legacy`, so `checkUseCaseManifests` holds it to the rules. Its input compiles as
   JSON Schema and uses only the keywords in `USE_CASE_INPUT_KEYWORDS`; every object is closed
   (`additionalProperties: false`) or a bounded map; every value has a type; every string, array and map
   has a size bound (no more than 100,000, 1,000 and 1,000); every property has a description of at most
   300 characters; each `describe` text is at most 1,200 characters.

A value the Studio computes at runtime is a placeholder, never a copy: `{{FIND_MAX_CHARS}}` inside a
string, `{{guides|join}}` for a list as text, `{{=MAX_VIEWS_PER_TURN}}` as a whole value, and
`"{{...finishes}}"` spread into an array. The names are `CHAT_VARS` in `tools/build-use-cases.js`. Those
four forms are the whole grammar (`test/unit/use-cases/generator.test.js` pins it); a fifth is a decision
for the design note, not an edit to the generator.

## Validation

The dispatcher runs the use case's validator on the parsed arguments before the handler, for every use case,
and refuses a call that does not fit with `BAD_ARGS` and the first failing field's JSON Pointer
(`/edits/0/slide must be integer`). A refused call never reaches the handler, so it never touches the deck.
The schema is the contract: if a tool should accept a shape, its schema says so, and the handler trusts what
reaches it.

- **A null in an optional field means it was left out.** The dispatcher drops it before validating
  (`dropNullOptionals`), so no schema has to say "or null". A null the schema allows, or in a required field,
  is kept.
- **A keyword whose value is a runtime placeholder** (`enum: ["{{...themes}}"]`,
  `maxItems: "{{=MAX_VIEWS_PER_TURN}}"`) is left out of the validator and stays the handler's check. Each
  validator's first lines name the keywords it left out. Descriptions are left out too.

`checkUseCaseValidators` (`tools/check-ownership.js`, run by `build:check`) holds that every manifest has its
validator, that none imports anything (ajv calls the `unicode: false` option that keeps it so deprecated), and
that the index lists exactly the manifests. The generator's own `--check` holds each one to its manifest.

## What the fields promise

`tier`, `effects` and `hosts` are read today: the mode gate, the deck-edit check and where a tool is
offered. `destructive`, `idempotent`, `confirm` and `toolset` are not read by anything yet. They were
set by hand when the tools moved and are **unverified until their consumer lands**: the MCP host's
annotations (§6.6) and §3.5's run-twice test must audit them first.

## Changing what the model sees

The tool definitions are the head of the chat's cached prompt. `chat-tools.golden.test.ts` holds every
combination of mode, pictures and Library byte for byte, and that every chat tool has a handler. A
deliberate change regenerates its fixture (`UPDATE_GOLDEN=1 npx vitest run
src/components/studio/chat-tools.golden.test.ts` in `docs/`). The fixture stores each combination as its
tool names and each definition once, pretty-printed, so a changed word is a one-line diff: read it as the
review of what the model will see differently.

## Legacy

The 19 tools that predate the manifests moved over with no model-visible change. They are `legacy: true`
and listed in `SANCTIONED_LEGACY_USE_CASES` (`tools/check-ownership.js`): their handler still lives in
`createToolbox`, and their schema keeps its old shape (unbounded strings, undescribed properties). A tool
leaves the list only when BOTH change: it has a kernel, and its schema meets the rules. The list only
shrinks, and tightening a schema changes what the model sees, which waits for #3208 item 34's replay of
real sessions.
