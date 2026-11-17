---
status: proposed
summary: The use-case layer — every Lattice capability as one manifest plus a pure kernel, run through one dispatcher by hosts (the Studio chat first, then the palette and an MCP server) — so any agent reads a deck semantically and deterministically and changes it through typed ops the slide spine owns, with staging, confirmation and state sync defined once.
---

# The use-case layer

**Asked (2026-11-17).** After the agent-readiness audit
(`2026-11-17-architect-tools-agent-readiness.md`), the owner asked whether the manifest structure
and the bridge layer had been designed. They had not. The owner set the bar: **Lattice will have an
MCP server, and the design must be scalable, sustainable and performant.** A first draft went to the
adversarial trio (red team, Munger inversion, independent checker). Their findings, and four owner
decisions taken on them, shaped this version. It builds nothing.

**Settled with the owner (2026-11-17):**

| Question | Answer |
|---|---|
| Who is the first consumer | **The Studio chat.** Whatever it needs, it gets. The layer offers holistic capabilities: reading a deck *correctly*, with its structure, its semantics and deterministic answers, is what our tools give an agent that raw Markdown cannot |
| What the layer is called | **Use cases** (Clean Architecture's term), in `lib/use-cases/`. "Bridge" was refused because the repo already uses it (`lib/authoring/squadra/bridge.js`, and the Marp export) |
| What an edit does on the file host | **Stage, then submit.** Edits collect in a changeset; submitting runs the safeguards before anything is written |
| What comes before the edit ops | **The slide spine's design** (`followups.d/3287-p1-lente-slide-spine.md`). The ops are the spine's structural edits, not a second set |

**The answer in five lines.**

1. **Each capability is a use case:** a JSON manifest plus a pure kernel plus tests, in
   `lib/use-cases/<id>/`. The build generates every surface from the manifests.
2. **Reads are semantic.** A read use case answers from the engine's own model of the deck (slides,
   rendered pages, layouts, slots, word budgets, narration, lens membership), so every host gets the
   same structured, deterministic answer rather than text to re-parse.
3. **Writes are ops.** A kernel never returns new deck text. It returns typed ops (Fowler's
   **Command**), which the spine's applier applies atomically against a base revision (an
   **Optimistic Offline Lock**), grouped in a changeset (a **Unit of Work**).
4. **One dispatcher, many hosts.** The dispatcher gates, validates, runs and checks. A **host** (the
   Studio chat, the palette, `lattice mcp`) reads state, commits changesets, asks the person, and
   formats results. The Studio chat is built first.
5. **Hosts that write without a review card inherit the Studio's Auto safeguards**, and nothing a
   client can answer counts as the author's confirmation.

## 1. Constraints

| Source | Constraint |
|---|---|
| Owner | Scalable, sustainable, performant; the chat first; an MCP server will ship |
| MCP spec, revision 2026-07-28 (modelcontextprotocol.io, read 2026-11-17) | No protocol session: state across calls travels as an explicit handle. `tools/list` **must not** vary per connection or as a side effect of other requests (it may vary by authorization), **should** be in a deterministic order, and **must** carry `ttlMs` and `cacheScope`, as must `resources/read`. A call that needs the person returns `InputRequiredResult`; the server **must not** assume the client retries or fulfills the request, and a `requestState` that carries business logic **must** be integrity-protected. Form elicitation is flat primitives, and its approval controls are only a SHOULD for clients. Annotations are untrusted unless the server is trusted; omitted `destructiveHint` and `openWorldHint` default to true. `structuredContent` **must** match `outputSchema`; the result **should** also carry the serialized JSON as text. An unknown tool is a JSON-RPC error (-32602); a validation or business failure is `isError: true`. Servers **must** validate inputs, rate-limit and sanitize outputs. Inside `oneOf`, branches carry only `required` |
| Spec adoption | Deployed clients lag a new revision. The server must work at the revision clients actually speak; newer features (MRTR, `subscriptions/listen`) are enhancements, never requirements for safety |
| HARD RULE #1 | One kernel per behavior, shared by every path |
| HARD RULE #22 | Anything a result could carry into a rendered surface passes the sanitizers |
| `checkAjvBoundary` | ajv may not be required from `lib/` **or** `docs/src` |
| Studio today | Deck writes go through `setSource(updater, { label, origin })`; `settingsWrite` passes `origin: 'settings'`, and typing goes through `setSourceFromEditor`. Live sessions sync a `Y.Text`. `autoHold` (`chat-actions.ts`) is the Auto mode's safeguard: no stopped or unclean turn, no deck that moved, no live session, no deletes, no rewriting most of the deck |
| Measured (the checker, 2026-11-17) | The chat's 15 tool definitions are 8,675 characters, about 145 tokens per tool. An MCP form adds `title`, `outputSchema` and annotations |

## 2. The shape

```
 use case = manifest + kernel        lib/use-cases/<id>/<id>.use-case.json · <id>.kernel.mjs · <id>.test.mjs
        │  the build generates ↓
        ├─ chat tool definitions   ├─ palette entries (deck commands)   ├─ MCP tools/list   ├─ dist/docs/use-cases.pick.md
        │
 kernel (pure)                       (DeckModel, args) → Outcome { data, ops }
        │
 dispatcher                          lib/use-cases/dispatch.mjs: gate → validate → limits → kernel → check → stage/commit → format
        │
 hosts                               studio-chat (first) · palette · mcp-files (`lattice mcp`) · test host
        │
 spine                               the deck model and applyOps: slides, pages, ids, structural edits (its own design)
```

Clean Architecture's names for the parts: each use case's kernel is an **interactor**; the manifest's
input and output schemas are its **boundary**; each host is an **interface adapter**, and a host's
formatter is its **presenter**.

## 3. The manifest

### 3.1 What it owns, and what each host owns

The manifest owns **identity and contract**: id, tier, effects, input schema, output schema, errors,
limits, requirements. **Wording is per host**: the chat's descriptions speak of "the draft" and "the
turn", which are false over MCP. So `describe` holds a shared default plus optional per-host text
(`describe.chat`, `describe.mcp`), and each host's formatter writes its own result prose. The chat's
measured wording is never traded for a compromise.

### 3.2 Fields

| Field | Holds |
|---|---|
| `id` | `snake_case` verb-noun, stable forever. MCP tool names are plain (`move_slides`) |
| `title` | a short human name |
| `describe` | `{ default, chat?, mcp? }`: what it does, **when to use it and when not**. The gate caps each |
| `tier` | `read` · `draft` · `act` (the 11-06 tiers) |
| `effects` | `none`, or any of `deck.slides`, `deck.structure`, `deck.frontmatter`, `library`, `workspace`, `network` |
| `destructive` | true when any call may remove or overwrite author content (a map edit that can delete an entry is destructive) |
| `idempotent` | true only if a run-twice test shows no further change, in every host |
| `confirm` | `never` · `act` · `always` (never auto-approved, in any mode or host) |
| `humanGated` | metadata only a person may set through Lattice's own UI (lens approval); ops that would write it are refused for every other origin |
| `input` | JSON Schema 2020-12: `type: object`, `additionalProperties: false`, every property described, every string, array and map **size-bounded** |
| `output` | JSON Schema for `data`; the generator wraps it in the result envelope (§6.6) |
| `errors` | each code with its meaning and alternatives. The gate checks both directions: a code a kernel returns must be declared, and a declared code must be exercised by an example or a test |
| `limits` | per-call caps and per-scope counters, with the scope named (per turn, per server instance, per paired client) |
| `requires` | host capabilities: `render`, `images`, `library`, `network`, `dom` |
| `hosts` | where it is offered: `chat`, `palette`, `mcp` |
| `enumFrom` | named runtime vocabularies (`themes`, `finishes`, `guides`) the generator resolves at build time, so a manifest never duplicates `BUILTIN_PALETTES` |
| `toolset` | one group name (`read`, `deck`, `narration`, `lens`, `library`, `look`) |
| `examples` | `{ host, args, fixture, expect }`, validated against that host's projection of `input` |

The palette's form and icon (`ui`) and a per-use-case `version` were cut: neither has a consumer yet,
and MCP has no tool versioning.

### 3.3 Example

```json
{
  "id": "set_front_matter_map",
  "title": "Set pronunciation entries",
  "describe": {
    "default": "Add, change or remove entries in the acronyms or lexicon map: pronunciation fixes. Entries you do not name are kept. Returns the whole map after the change.",
    "chat": "Stage pronunciation fixes on the draft. Entries you do not name are kept. Use set_front_matter for single-line keys."
  },
  "tier": "draft",
  "effects": ["deck.frontmatter"],
  "destructive": true,
  "idempotent": true,
  "confirm": "never",
  "input": {
    "type": "object",
    "additionalProperties": false,
    "required": ["deck", "map", "set"],
    "properties": {
      "deck": { "type": "string", "maxLength": 200, "description": "The deck handle (MCP). The chat host fills it with the open deck and leaves it out of its schema." },
      "changeset": { "type": "string", "maxLength": 64, "description": "Stage into this changeset (MCP). The chat host uses its turn's changeset and leaves it out." },
      "map": { "type": "string", "enum": ["acronyms", "lexicon"], "description": "Which map." },
      "set": {
        "type": "object", "maxProperties": 50, "propertyNames": { "maxLength": 100 },
        "additionalProperties": {
          "anyOf": [
            { "type": "string", "maxLength": 200 },
            { "type": "null" },
            { "type": "object", "additionalProperties": false, "required": ["expansion"], "properties": { "expansion": { "type": "string", "maxLength": 200, "description": "The spoken form." }, "definition": { "type": "string", "maxLength": 400, "description": "Optional glossary text (acronyms only)." } } }
          ]
        },
        "description": "Term to spoken form, or an acronym entry with a definition. null removes it. A possessive or plural is its own term."
      },
      "summary": { "type": "string", "maxLength": 300, "description": "One sentence to the author." }
    }
  },
  "output": { "type": "object", "required": ["map"], "properties": { "map": { "type": "object" } } },
  "errors": [
    { "code": "INVALID_TERM", "meaning": "A term has characters the map cannot hold (the acronym grammar refuses an apostrophe), or a lexicon entry is an object (lexicon entries are spoken forms only).", "alternatives": ["Use the lexicon map for that term.", "Send the lexicon entry as a string."] },
    { "code": "CASE_DUPLICATE", "meaning": "Two terms differ only in case.", "alternatives": ["Send each term once, in the case the slide uses."] },
    { "code": "STALE", "meaning": "The map changed since it was read.", "alternatives": ["Read the deck again, then retry."] }
  ],
  "limits": { "resultChars": 4000 },
  "requires": [],
  "hosts": ["chat", "palette", "mcp"],
  "toolset": "narration",
  "examples": [{ "host": "mcp", "args": { "deck": "decks/q3.md", "map": "lexicon", "set": { "Derby": "Darby" } }, "fixture": "test/fixtures/use-cases/two-slides.md", "expect": { "map": { "Derby": "Darby" } } }]
}
```

The fixture is added with the first slice. A kernel builds maps on `Object.create(null)`, so a term such as `__proto__` or `hasOwnProperty` is
data. A term the writer would drop is an error, never a silent omission.

### 3.4 What the build generates

- the chat's tool definitions (replacing `AGENT_TOOLS`, `ASSET_TOOLS`, `TOOL_TIERS`, `EDIT_TOOLS` /
  `READ_TOOLS` and the `run` switch, five hand lists today);
- palette entries for the **deck-editing** commands: 8 of `studio-commands.ts`'s 30 ids (`fix-all`,
  `format-code`, `slide-duplicate`, `slide-move-before`, `slide-move-after`, `slide-hide`,
  `slide-show`, `slide-delete`). The other 22 are UI verbs (`present`, `focus`, `library`,
  `slide-settings`, …) with no kernel, and stay as they are;
- the MCP `tools/list`, sorted by id, with all four annotations emitted explicitly per host (§6.6);
- `dist/docs/use-cases.pick.md` and `use-cases.json`, published to `dist-kits` beside the other agent
  catalogs. That is #3208 item 26, the assistant's generated list of its own tools.

### 3.5 Gates (in `build:check`)

`checkUseCaseManifests` in `tools/check-ownership.js` refuses an invalid manifest, an unbounded or
undescribed input property, a type constraint inside a `oneOf` branch (deliberately `oneOf` only:
§3.3's `anyOf` of types is sound because each branch is self-contained), an over-long description, an
error code declared but never exercised (or returned but never declared), an example that fails its
host's projection, and an `idempotent: true` that fails a run-twice test. A fixture test also asserts that no
example's ops write a `humanGated` field; the real enforcement is at runtime, in the applier (§5.2). It **reports** the generated default MCP toolset's size on every build; the cap
is a review threshold, not a blocking gate, because a byte gate rewards cutting the "when not to use
it" text that matters most.

**The chat's 15 existing tools enter under a sanctioned legacy list** that the gate holds to
shrinking. Converting them changes no model-visible byte; bringing one up to the gate's rules is a
model-visible change and waits for #3208 item 34's replay of real sessions.

## 4. Reads are semantic

The owner's point: reading Markdown is not the capability; reading it **correctly** is. A model that
parses `---`, `<!-- _class -->` and `split: headings` itself gets slide numbers wrong (the audit's
`say:` reproduction), misses notes and say lines (#3208 item 6), and counts words differently from
the linter (item 24). So the read use cases answer from the engine's own model, the one the renderer,
the linter and the narration already share:

| Use case | Returns | #3208 item |
|---|---|---|
| `read_outline` | every written slide and rendered page: id, layout, heading, section, word count per element against its layout's budget, note and say-line length, lens membership, hidden flag. Compact modes: headings only, notes only, say lines only | 7, 24, 25 |
| `read_slides` | exact text of a range, with its ids, so an edit can cite them | 25 |
| `find_text` | every match by slide, field (title, body, note, say line, alt text, eyebrow, front matter) and context | 6, 25 |
| `check_deck` | lint, review, fit and diagram findings, per slide and element | today's tool |
| `preview_speech` | what the voice reads, which substitutions fired, which hard terms matched nothing; labeled approximate without a render | 3 |
| `estimate_talk_time` | minutes per slide and in total, from the deck's pace | 8 |
| `read_component`, `read_guide`, `read_front_matter` | the docs (MCP resources, §6.7) | today's tools |

Each is deterministic: the same deck text gives the same bytes, so answers can be cached by revision
and compared across hosts.

## 5. Kernels, the spine, and ops

### 5.1 The kernel contract

```ts
kernel(model: DeckModel, args: Args, ctx: KernelCtx): Outcome | Promise<Outcome>
type Outcome =
  | { ok: true;  data: unknown; ops: Op[] }               // reads return ops: []
  | { ok: false; code: string; message: string; alternatives?: string[] };
```

A kernel is pure: no writes, no DOM, no network. `ctx` carries only what `requires` names. A kernel
whose requirement the host lacks is not offered there; called anyway, it returns `UNAVAILABLE`.

### 5.2 The spine owns the deck model and the ops

**`DeckModel` and `applyOps` belong to the slide spine**, whose design comes first. This note fixes
only what the use-case layer needs from it:

- **Addressing (a requirement to the spine, not a decision for it).** A slide is addressed by the spine's id when the host has one; otherwise by a
  fingerprint (SHA-256, at least 128 bits, over a documented normalization of the written block) plus
  its ordinal among equal fingerprints. Duplicate slides that cannot be told apart return
  `AMBIGUOUS`, never a guess. Whether the unit is the written block with a part index for its
  rendered pages, or the page itself, is the spine's fork; what this layer requires is that an op can
  name either one unambiguously. An insert may anchor to `null`, meaning first.
- **Ops** (Commands), in two groups. **Spine ops**, which the spine's `applyOps` owns:
  `slide.replace`, `slide.insert`, `slide.delete`, `slide.move`, `slide.copy`. **Use-case-layer ops**,
  which the dispatcher applies after the spine's: `fm.set`, `fm.block` (front matter),
  `asset.caption` (a Library write, outside the deck) and `deck.create`.
- **Atomic by default.** A changeset applies whole or not at all. A later op is evaluated against the
  result of the earlier ones, in order, and that is the documented rule.
- **Index-keyed fix-ups belong to the applier.** Renumbering `say:` entries, carrying lens tags, and
  anything else keyed by position happens inside `applyOps`, never in a kernel's ops. A move and its
  renumbering cannot land apart.
- **Human-gated fields are refused.** No op may add or change `approved:` in `lenses:`: the
  approval hash is unkeyed, so a writer of deck text could otherwise mint an approved lens (the red
  team reproduced it). That includes `deck.create`, whose whole Markdown may carry a `lenses:` block,
  so the applier parses full deck text, not only `fm.*` ops. Approving a lens is a `confirm: always`
  use case offered only in the Studio.
- **The check runs on what was committed**, never on a draft that only partly landed.

The review card renders ops directly, which retires the draft-to-proposal fold (`proposalFromDraft`)
and the losses the audit reproduced.

### 5.3 Where kernels live

Ad-hoc Studio modules a kernel needs (`docs/src/lib/front-matter.ts`) move to `lib/`. `deck-ops.ts`
moves as part of the spine, which gathers it.
Workspace libraries (`@laticent/lente`, `@laticent/fuoco`, and the spine wherever it lands) are reached
as `@laticent/*` dependencies, the way `lib/` already reaches `@laticent/markup` and `@laticent/segno`.

## 6. The dispatcher and the hosts

### 6.1 The dispatcher

`dispatch(host, id, args, call)`, in `lib/use-cases/dispatch.mjs`:

1. **Look up** the use case by own key (`Object.hasOwn`, as `toolAllowed` does).
2. **Gate** on host, mode and the server's flags.
3. **Validate** `args` against the host's projection of `input` (§7).
4. **Limits**, each counter with a named scope.
5. **Read** the deck model from the host.
6. **Run** the kernel.
7. **Check** every `draft` result: lint and review on every call (pure and cheap); fit, which needs a
   render, on demand or at submit, and reported as "not run" where the host cannot render.
8. **Stage** the ops into the changeset, or **commit** them under the host's policy (§6.3).
9. **Confirm** when the use case or the policy requires it (§6.4).
10. **Format** for the host and **emit** one event.

### 6.2 The host interface

```ts
interface Host {
  id: 'studio-chat' | 'palette' | 'mcp-files' | 'test';
  capabilities: { render: boolean; images: boolean; library: boolean; network: boolean; confirm: 'studio-ui' | 'url' | 'form' | 'none' };
  model(deck?: string): Promise<DeckModel>;
  stage(change: Changeset): Promise<StageOutcome>;
  commit(change: Changeset): Promise<ChangeOutcome>;     // applied | held (and why) | refused, per op group
  confirm(req: ConfirmRequest): Promise<'accept' | 'decline' | 'cancel' | 'unavailable'>;
  format(result: Result): unknown;
  emit(event: UseCaseEvent): void;
}
```

### 6.3 Hosts and their commit policy

| Host | State | Commit | Confirm | Render |
|---|---|---|---|---|
| **`studio-chat`** (first) | the open deck | Review: a card. Auto: apply with a History checkpoint when `autoHold` allows, else a card | the Studio UI | yes |
| **`palette`** | the open deck | apply through `setSource(…, { origin: 'palette' })`; the person pressed it | the Studio UI | yes |
| **`mcp-files`** (`lattice mcp`) | `.md` files under one root | **stage, then submit**: draft calls stage into a changeset; `submit_changeset` writes it only if its check is clean (no lint or review errors; fit run, or reported "not run"), it holds no `slide.delete` and no op from a `destructive: true` use case, at most `max(2, ⌈n/2⌉)` slides are replaced, inserted, moved or copied, and the deck is unchanged on disk since the base revision. Otherwise it is held until a person confirms (§6.4). These are `autoHold`'s rules extended to the new op kinds; its `aborted`, `via` and `live` rules describe a chat turn and have no file-host equivalent | §6.4 | via the CLI's Chromium, without `--allow-remote` |
| **`test`** | fixtures | apply in memory | scripted | stubbed |

The test host proves the dispatcher is host-agnostic before any MCP code. A public `lattice
use-case --json` command waits until someone asks for it, because its output would become a contract.

**The desktop app's MCP host** is not designed here; the app does not exist. Appendix A lists what it
must meet.

### 6.4 Confirmation and trust

**Nothing a client can answer counts as the author's confirmation for a destructive use case or a
held changeset.** A non-destructive `confirm: act` use case may accept a form answer, which a client
can give itself; that is the one exception, and it is stated, not implied. In order of preference on
`mcp-files`:

1. **A page Lattice opens itself.** `lattice mcp` serves a one-time confirm page on `127.0.0.1` and
   opens it in the default browser with a one-time token that is **never sent to the client**. The
   page accepts approval only with that token. A URL-mode elicitation (or, without one, the tool
   result) only tells the person to look for the page, and carries no token. The spec requires a
   compliant client to open elicitation URLs where neither it nor the model can read or press them;
   a hostile client is not compliant, and a coding agent with a shell could post to a URL it was
   given, which is why the token never travels through the client. This also meets the spec's rule
   that the server verifies who opens the page.
2. **Form elicitation**, only for non-destructive `confirm: act` use cases: one boolean, no
   `default` (or `default: false`), every interpolated string passed through `visibleTitle` /
   `outlineTitle` as the 11-06 confirm does.
3. Otherwise `CONFIRM_UNAVAILABLE`. Nothing is auto-approved. A client older than revision
   2026-07-28 (no `InputRequiredResult`) gets `CONFIRM_UNAVAILABLE` for every held changeset; only
   changesets that pass §6.3's checks are written for it.

`confirm: always` use cases and any `network` effect are not offered at all unless the person who
started the server named them in `--allow`, and **`--allow` offers a use case; it never approves one.**

Every `requestState` the server issues is HMAC-protected with a per-process key, bound to the tool
name, a digest of the arguments, the staged ops and the base revision, given a TTL, and **consumed
once**: a retry after approval returns the cached result. What commits is the stored, confirmed
changeset, never a re-run of the kernel with whatever the retry sent.

### 6.5 Changesets

A changeset handle is random (128 bits), bound to its deck, base revision, the server process that
issued it, and an expiry stated in `stage`'s description. A mismatch on any of them is an error.
Handles never appear in events, logs or status resources. Ops per changeset and open changesets per
server are capped.

### 6.6 Results

One `Result`, formatted per host:

- **Envelope.** `{ ok, code?, revision, data, ops: per-op-group outcomes, check, next_step }`. The
  generated MCP `outputSchema` wraps the manifest's `output` in this envelope, so `structuredContent`
  always matches.
- **MCP.** `structuredContent`, plus a text block with the serialized JSON (the spec's SHOULD) and one
  summary line. `isError: true` for validation and business errors; JSON-RPC -32602 for an unknown or
  unoffered tool. Annotations per host, all four explicit: `readOnlyHint = tier is read`,
  `destructiveHint = destructive`, `idempotentHint = idempotent`, `openWorldHint = effects includes
  network`.
- **Chat.** Today's prose, from the Result. Wording changes wait for the item-34 replay.
- **Deck text is data.** It travels only as JSON-escaped strings, never inside a Markdown fence a
  longer backtick run could close. No use case returns an HTML or CSS resource. The MCP formatter joins
  the #22 sink family in `tools/check-ownership.js`, or its exemption is recorded with the reason.

### 6.7 Docs are resources

`read_component`, `read_guide` and `read_front_matter` become MCP resource templates
(`lattice://component/{name}`, `lattice://guide/{topic}`, `lattice://front-matter/{key}`) with caching
hints (a MUST on `resources/list`, `resources/templates/list` and `resources/read`), loaded only when
needed. The chat keeps them as tools. Deck status is
`lattice://deck/{id}/status` with `ttlMs: 0`, `cacheScope: "private"`, and its update notifications
are debounced.

## 7. Validation without ajv at runtime

The build generates one validator per use case with ajv's standalone mode, using `unicode: false`
so string-length checks emit no `require("ajv/dist/runtime/ucs2length")`, and writes it to
`lib/use-cases/<id>/<id>.validate.mjs`. `checkAjvBoundary` then sees no ajv import.

**Measured on §3.3's input schema (ajv 8.20.0, 2026-11-17):** with default options the standalone
code is 10,309 bytes and imports `ajv/dist/runtime/ucs2length`; with `unicode: false` it is 10,248
bytes and imports nothing from ajv. With it, `maxLength` counts UTF-16 code units rather than
characters, so limits are set with headroom. But ajv 8.20 prints `unicode` as **deprecated**, so this route
can break on an upgrade. The gate therefore also fails any generated validator that imports from
ajv, and the fallback is a restricted keyword subset the gate enforces. Ten kilobytes per use case is
unminified; the first slice measures what it costs gzipped in the Studio's route budget.

## 8. The file host's safety

- **Confinement:** `realpath` and per-component `O_NOFOLLOW` (`openat2` with `RESOLVE_BENEATH` where
  the platform has it). A `.lattice` that is a symlink is refused; it is created with mode `0700`.
  Windows drive, UNC and `\\?\` paths, alternate streams and device names are refused.
- **The walk** skips `.lattice/`, follows no symlinks, and is capped by count and depth.
- **History** files are content-addressed, not `.md`, created with `O_EXCL`, kept under a retention
  cap, and `.lattice/` gets a `.gitignore` when first created. History holds text the author deleted,
  and the docs say so.
- **Writes:** compare inode, mtime and size immediately before the rename and retry once; hold a lock
  file per root; preserve the deck's line endings and BOM (the host is a markdown ingest under
  `2026-08-04-line-endings-lf-boundaries.md`, entered in `SANCTIONED_EOL_BOUNDARIES`); a symlinked deck
  is written through to its target only if the target is inside the root.
- **Input:** a stdio frame size cap before parsing.
- **Library captions** written over MCP are staged like deck edits and marked agent-written, so a
  later reader quotes them as agent text.

## 9. Scalability and performance

- **Context:** a tool costs a client about 145 tokens. The default toolset is `read` plus the docs
  resources; editing toolsets are opt-in per server (`--toolsets deck,narration`). Sorted by id with
  caching hints, so clients and providers can cache the list.
- **Composite use cases** (`find_text` returns every match at once; `move_slides` takes a range) keep
  calls few.
- **Cost per call:** kernels are DOM-free; the spine's outline re-reads only what changed; a revision
  hash of a 50 KB deck costs 0.04 ms (measured); validators are compiled at build time; fit renders
  run on demand.
- **Measured before it ships (HARD RULE #19):** a bench scenario for dispatch overhead and for
  `applyOps` on a ten-op changeset over a 50-slide deck.

## 10. Order of work

0. **The spine's design note** (`followups.d/3287-p1-lente-slide-spine.md`): the deck model,
   addressing and `applyOps` (§5.2).

   0b. **The spine slices that ship `DeckModel` and `applyOps`.** Until they land, steps 1–3 run on an
   interim `DeckModel` adapter over today's slide splitting (`deckSlides`, `buildDeckIndex`), which
   the spine then replaces.
1. **Manifests, the generator, the dispatcher and the test host**, with the chat's 15 tools under the
   legacy list and no model-visible change. Step 1 validates with build-time ajv in tests only; the
   generated validators replace it in step 2.
2. **Validators** (§7, measured).
3. **Semantic read use cases for the chat** (§4).
4. **Ops on the spine** (after 0b): the card renders ops; `proposalFromDraft` is deleted.
5. **New edit use cases for the chat**: `set_front_matter_map`, `move_slides`.
6. **`lattice mcp`**: the read toolset and the docs resources first, then the editing toolsets with
   staging, confirmation and the file-host safety of §8.
7. **The palette's deck-editing commands.**

## 11. What this note does not do

- It builds nothing and settles nothing the spine owns.
- It does not design the desktop app's host (Appendix A) or a remote HTTP server; authorization and
  multi-user state are their own decision, and nothing here assumes a transport.

## Appendix A. What a future desktop MCP host must meet

- **Transport:** localhost Streamable HTTP bound to `127.0.0.1`, with `Origin` validation (the spec's
  MUST against DNS rebinding), and a per-client **pairing token** issued in the Studio.
- **Identity:** cards and events carry the paired identity, passed through `visibleTitle` and prefixed
  "External client:"; `clientInfo.name` is never trusted.
- **Commit:** a draft or act call returns `staged` at once; the outcome arrives on the status
  resource. No call is held open waiting for a person.
- **Approval:** only the local author may approve; a live-session guest may not approve on the host's
  machine.

## Appendix B. How the trio changed the first draft

The first draft (commit bfdbe07, "the action manifest and the bridge layer") went to a red team, a
Munger inversion and an independent checker.

- **Changed:** per-host wording (inversion); semantic reads as the core (owner, answering the
  inversion's "oracle" alternative); ops owned by the spine, atomic, with index-keyed fix-ups in the
  applier and `AMBIGUOUS` for duplicates (all three); stage-then-submit with the `autoHold` predicates
  on the file host (red team, owner); a confirm no client can answer, signed single-use `requestState`
  (red team, checker); `humanGated` lens approval (red team, reproduced); file-host confinement,
  history and write safety (red team, reproduced); explicit per-host annotations and the result
  envelope as `outputSchema` (checker); the legacy list for the chat's tools (checker, inversion);
  `@laticent/*` packages for workspace libraries (checker, inversion); `unicode: false` validators
  (checker, measured); the token budget made a report, not a gate (inversion); the desktop host moved
  to Appendix A and the public CLI host cut (inversion); the corrected 145-token figure and the
  example manifest that now passes its own gate (checker).
- **A second checker on the rewrite (commit 032ebad)** found nine wording faults and no design fault,
  all fixed: §6.4's rule now names its one stated exception; the confirm page carries a token the
  client never sees; §6.3's submit check now includes a clean check and counts moves, copies and
  destructive use cases; §10 schedules the spine's implementation (0b); §5.2 splits spine ops from
  this layer's ops and states addressing as a requirement to the spine; older clients get
  `CONFIRM_UNAVAILABLE`; the example bounds its term length and requires an expansion; §7 notes that
  lengths count UTF-16 units.
- **Kept against a finding:** a JSON manifest rather than a TypeScript record (inversion). The MCP
  server and the generated docs read it without running code, and per-host wording plus `enumFrom`
  answer the runtime-list objection.
