---
status: proposed
summary: One action manifest per Lattice action generates the Studio chat's tools, the command palette, an MCP server's tools/list and a CLI JSON mode; pure kernels return typed edit ops instead of new text; one dispatcher and a host-adapter bridge carry those ops to the Studio, a file workspace or the desktop app, with confirmation, state sync and result formatting defined once.
---

# The action manifest and the bridge layer

**Asked (2026-11-17).** After the agent-readiness audit
(`2026-11-17-architect-tools-agent-readiness.md`), the owner asked whether the manifest structure
and the bridge layer had been designed. They had not. The owner then set the bar: **Lattice will
have an MCP server, and the design has to be scalable, sustainable and performant.** This note is
that design. It builds nothing.

**The answer in four lines.**

1. **Manifest.** Each action is one folder in `lib/actions/` holding a JSON manifest, a pure kernel
   and its tests. The build generates every surface from the manifests: the chat's tool list, the
   palette, the MCP `tools/list`, a CLI JSON mode, and the agent-facing docs.
2. **Kernels return ops, never text.** A kernel reads the deck and returns typed **ops** (move these
   slides, set this map entry), each carrying a fingerprint of what it expects to change. One
   applier in `lib/core` applies ops for every host. The ops are the "new edit kinds" the audit
   found missing (§3 there), generalized.
3. **The bridge is one dispatcher plus a small host interface.** The dispatcher validates, gates,
   runs the kernel and runs the check. A **host** (Studio chat, palette, MCP over files, MCP inside
   the desktop app, CLI) supplies four things: read state, commit ops, ask the person, format the
   result.
4. **The MCP server is two hosts, not one.** `lattice mcp` (stdio, in the npm package) works on
   deck files; the desktop app (Tauri, planned in this repo) serves MCP against the live Studio, so
   an outside agent's edit lands on the same review card the chat uses.

## 1. The constraints this design answers to

| Source | Constraint |
|---|---|
| Owner | Scalable, sustainable, performant; an MCP server will ship |
| MCP spec, revision 2026-07-28 (read from modelcontextprotocol.io on 2026-11-17) | **No protocol session**: state across calls travels as an explicit handle argument. `tools/list` **must not vary per connection** (it may vary by authorization) and **should** be in deterministic order for prompt caching, with `ttlMs` / `cacheScope`. A call that needs the person returns `InputRequiredResult` with an `elicitation/create` request and an opaque `requestState`; the client retries. Form elicitation is flat primitives only, and a client may not support it. Annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) are hints a client must not trust. Tool errors return `isError: true` with actionable text; `structuredContent` must match `outputSchema` when one is declared. Inside `oneOf`, keep branches to `required` only. Servers **must** validate inputs, rate-limit and sanitize outputs. |
| HARD RULE #1 | One kernel per behavior, shared by every path. The CLI cannot import `docs/src`, so shared kernels live in `lib/`. |
| HARD RULE #22 | Any markup or style a result carries into a rendered surface goes through the sanitizers. |
| `tools/manifest-schemas.js` | ajv is dev-only and may not be required from `lib/` (`checkAjvBoundary`). |
| Studio today | Every write goes through `setSource(updater, { label, origin })` (via `settingsWrite` in `StudioShell.tsx`): labeled, origin-tagged, undoable. Live sessions sync that source over Yjs. |
| Plugin architecture (`2026-09-13-plugin-architecture.md`) | Trust follows the delivery channel. Actions are first-party, in-tree. |
| Measured 2026-11-17 | 13 of the chat's 15 tool definitions (all but `render_slide` and `chart_from_data`) are 6,821 characters, about 1,705 tokens, about 130 tokens per tool. Every MCP client loads the whole `tools/list` into its model's context. |

## 2. The shape: three layers

```
 manifest (what an action is)        lib/actions/<id>/<id>.action.json
        │  build generates ↓
        ├─ chat tool list   ├─ palette entries   ├─ MCP tools/list   ├─ CLI --json   ├─ dist/docs/actions.pick.md
        │
 kernel (what it does, pure)         lib/actions/<id>/<id>.kernel.mjs   (DeckState, args) → Outcome { data, ops }
        │
 bridge                              lib/actions/dispatch.mjs  +  one adapter per host
        ├─ dispatcher: gate → validate → limits → kernel → check → commit → format
        └─ host adapter: state() · commit(changeset) · confirm(request) · format(result) · capabilities
```

Nothing above the bridge knows which host it runs in. Nothing in a host knows how an action works.

## 3. The manifest

### 3.1 Where it lives

`lib/actions/<id>/` mirrors the component folders: `<id>.action.json` (the manifest),
`<id>.kernel.mjs` (the kernel), `<id>.test.mjs` (table tests generated from the manifest's
examples plus hand tests). A JSON manifest, not a JS object, because the build, the gates, the docs
generator and an outside reader all read it without running code, and because the existing
manifest families already work this way (`tools/manifest-schemas.js`).

### 3.2 Fields

| Field | Holds | Feeds |
|---|---|---|
| `id` | `snake_case` verb-noun, stable forever (`move_slides`) | every surface's name |
| `version` | semver; a breaking input or output change is a major | catalog hash, `list_changed` |
| `title` | a short human name | palette row, MCP `title` |
| `description` | what it does, **when to use it and when not**, in under 400 characters | chat, MCP, docs |
| `tier` | `read` · `draft` · `act` (the 11-06 tiers) | gates, annotations |
| `effects` | what it may change: `none`, or any of `deck.slides`, `deck.structure`, `deck.frontmatter`, `library`, `workspace`, `network` | annotations, confirm policy, audit |
| `destructive` | true when an effect removes or overwrites author content | `destructiveHint`, confirm policy |
| `idempotent` | true when repeating the same call changes nothing more | `idempotentHint` |
| `confirm` | `never` · `act` (ask in Review) · `always` (ask in every mode, never auto-approved) | dispatcher |
| `input` | JSON Schema 2020-12: `type: object`, `additionalProperties: false`, every property described | validation, every surface |
| `output` | JSON Schema for `data` | MCP `outputSchema`, tests |
| `errors` | each code it can return, with its meaning and its alternatives (`NESTED_KEY`, `STALE`, …) | #28's structured failures, docs |
| `limits` | per-call and per-session caps (`maxSlides`, `perTurn`), and the result size cap | dispatcher |
| `requires` | host capabilities it needs: `render`, `images`, `library`, `network` | availability per host |
| `hosts` | where it is offered: `chat`, `palette`, `mcp`, `cli` | generated lists |
| `toolset` | one group name (`deck`, `narration`, `lens`, `library`, `look`, `docs`) | MCP toolset filtering |
| `ui` | palette label, keywords, icon name, the form that collects arguments | palette |
| `examples` | `{ args, deck fixture, expected data or code }` | tests, docs, model guidance |

### 3.3 One example

```json
{
  "id": "set_front_matter_map",
  "version": "1.0.0",
  "title": "Set pronunciation entries",
  "description": "Add, change or remove entries in the acronyms or lexicon map: pronunciation fixes. Entries you do not name are kept. Use set_front_matter for single-line keys. Returns the whole map after the change.",
  "tier": "draft",
  "effects": ["deck.frontmatter"],
  "destructive": false,
  "idempotent": true,
  "confirm": "never",
  "input": {
    "type": "object",
    "additionalProperties": false,
    "required": ["deck", "map", "set"],
    "properties": {
      "deck": { "type": "string", "description": "The deck handle from open_deck or list_decks." },
      "changeset": { "type": "string", "description": "Optional. Stage into this changeset instead of the host's default." },
      "map": { "type": "string", "enum": ["acronyms", "lexicon"], "description": "Which map." },
      "set": { "type": "object", "additionalProperties": { "type": ["string", "null"] }, "description": "Term to spoken form; null removes it. A possessive or plural is its own term." }
    }
  },
  "output": { "type": "object", "required": ["map"], "properties": { "map": { "type": "object" } } },
  "errors": [
    { "code": "DUPLICATE_TERM", "meaning": "The same term appears twice in one call.", "alternatives": ["Send each term once."] },
    { "code": "STALE", "meaning": "The map changed since it was read.", "alternatives": ["Read the deck again, then retry."] }
  ],
  "limits": { "maxEntries": 50, "resultChars": 4000 },
  "requires": [],
  "hosts": ["chat", "palette", "mcp", "cli"],
  "toolset": "narration",
  "examples": [{ "args": { "map": "acronyms", "set": { "Derby": "Darby" } }, "deck": "fixtures/two-slides.md", "expect": { "map": { "Derby": "Darby" } } }]
}
```

### 3.4 What the build generates from it

- the chat's tool definitions, ordered and filtered by mode (replacing `AGENT_TOOLS`, `ASSET_TOOLS`,
  `TOOL_TIERS`, `EDIT_TOOLS` / `READ_TOOLS` and the `run` switch: four hand lists today);
- the palette's entries (the palette's `run: () => void` closures become dispatches with arguments
  from the `ui` form);
- the MCP `tools/list` payload, in a fixed order, with annotations derived from `tier`, `effects`,
  `destructive` and `idempotent` (never hand-set, so they cannot drift);
- `lattice action <id> --json` for scripts and CI;
- `dist/docs/actions.pick.md` (one line per action, like `components.pick.md`) and
  `dist/docs/actions.json`, published to `dist-kits` beside the other agent catalogs. That is #3208
  item 26, "a generated list of its own tools", for free.

### 3.5 Gates (in `build:check`, no new CI job)

`checkActionManifests` in `tools/check-ownership.js` refuses a manifest that is not schema-valid; an
input schema without `additionalProperties: false` or with an undescribed property; a type
constraint inside a `oneOf` branch (the spec's rule); a description over the cap; an error code a
kernel returns but the manifest does not declare (found by running the examples); an example whose
args do not validate; and a whole MCP surface over the **token budget (§6)**. It also refuses a tool
list whose generated order changed without a version bump, so a reorder cannot silently cost every
client's prompt cache.

## 4. Kernels and ops

### 4.1 The kernel contract

```ts
type DeckState = { source: string; revision: string; outline: DeckIndex };  // outline: ids, parts, splitting
type Outcome =
  | { ok: true;  data: unknown; ops: Op[] }                 // reads return ops: []
  | { ok: false; code: string; message: string; alternatives?: string[] };
kernel(state: DeckState, args: Args, ctx: KernelCtx): Outcome | Promise<Outcome>;
```

A kernel is pure. It never writes, never touches the DOM, never calls the network. `ctx` carries
only what its manifest's `requires` names (a renderer, the Library index), injected by the host.
A kernel that needs something the host lacks is never offered there; if it is called anyway it
returns `UNAVAILABLE`.

### 4.2 Ops: the one edit vocabulary

| Op | Changes | Precondition it carries |
|---|---|---|
| `slide.replace` | one slide's text | fingerprint of that slide's current text |
| `slide.insert` | new slides after an anchor | fingerprint of the anchor slide |
| `slide.delete` | one slide | its fingerprint |
| `slide.move` / `slide.copy` | a range, by reference, to a position | fingerprints of the range and the anchor |
| `fm.set` | one single-line front-matter key | the key's current value |
| `fm.block` | one whole nested block (`acronyms:`, `lexicon:`, `lenses:`) | the block's current text |
| `asset.caption` | a Library caption (outside the deck) | the current caption |
| `deck.create` | a new deck (act) | none |

`applyOps(source, ops) → { source, results[] }` lives in `lib/core` and is the **only** writer of
deck text for every host: the review card, Auto, the file host and the desktop host. Each op is
applied only if its fingerprint still matches; otherwise that op returns `STALE` and the rest
continue, so a partial apply is reported per op, never guessed. Fingerprints address slides by
**content**, not by position, so a move or an author's interim edit elsewhere cannot send an op to
the wrong slide. The review card renders ops directly, which removes the draft-to-proposal fold
(`proposalFromDraft`) and with it the losses the audit reproduced.

**Why ops and not new source.** Returning a whole new deck makes every host diff it to find out what
changed, and that diff is where map edits and moves were lost. Ops say what changed, are small on
the wire (a move of ten slides is one op, not ten retyped bodies), can be checked per item, map onto
Yjs edits later, and are what an audit log (#3208 item 31) records.

### 4.3 What moves to `lib/`

The kernels the first actions need live in `docs/src` today: `deck-ops.ts`, the front-matter
writers in `docs/src/lib/front-matter.ts`, `docs/src/lib/lente/`, `docs/src/lib/deck-outline/`.
`lattice mcp` and `lattice action` run in Node from the npm package and cannot reach them. Each
moves to `lib/` (as `.mjs`, typed by JSDoc or a `.d.ts`) when the first action that needs it lands,
with the Studio importing it from there. The slide spine (`followups.d/3287-p1-lente-slide-spine.md`)
is the natural owner of the outline and the structural ops; this design assumes it lands in `lib/`
and does not depend on its internals.

## 5. The bridge

### 5.1 The dispatcher

`dispatch(host, id, args, call)` is the one entry point, in `lib/actions/dispatch.mjs`. In order:

1. **Look up** the manifest; unknown id → `UNKNOWN_ACTION`.
2. **Gate**: is this action offered in this host, in this mode, under this server's configuration?
   (The chat's `toolAllowed` becomes this step.)
3. **Validate** `args` against the input schema (§8 on how, without ajv at runtime).
4. **Limits**: per-call caps and per-session counters (`render_slide`'s three per turn becomes a
   manifest limit).
5. **Read state** from the host (`deck` handle, or the open deck in the Studio).
6. **Run the kernel.**
7. **Check**, for every `draft`-tier action, here and not in each case: lint, review and scoped fit on
   the deck with the ops applied. This fixes the hazard the inversion found, where a new case that
   forgot to reset the verdict inherited a clean one.
8. **Confirm** when `confirm` says so (§5.4).
9. **Commit**: hand the ops to the host (§5.3).
10. **Format** for the host (§5.6) and **record** the event (§5.5).

### 5.2 The host adapter

```ts
interface Host {
  id: 'studio-chat' | 'palette' | 'mcp-files' | 'mcp-desktop' | 'cli';
  capabilities: { render: boolean; images: boolean; library: boolean; network: boolean; confirm: 'ui' | 'elicitation' | 'none' };
  state(deck?: string): Promise<DeckState>;
  commit(change: Changeset): Promise<ChangeOutcome>;      // applied | staged | partial | refused, per op
  confirm(req: ConfirmRequest): Promise<'accept' | 'decline' | 'cancel' | 'unsupported'>;
  format(result: Result): unknown;                        // chat text, MCP CallToolResult, CLI JSON
  emit(event: ActionEvent): void;                         // outcome stream: audit, status, hub
}
```

### 5.3 Changesets: state across stateless calls

A **changeset** is ops plus the deck revision they were made against, under an opaque handle with
enough entropy, a stated lifetime and an owner. It is the one answer to "where does a draft live":

- **Studio chat:** one changeset per turn, which becomes today's review card. Reads during the turn
  see the deck with the changeset applied (read-your-writes), as the toolbox draft does now.
- **MCP:** a draft-tier call may name a `changeset` to stage into; reads that name it see it applied.
  `submit_changeset` (act) hands it to the host. Without a handle, the host's default applies (below).
  Per the spec, an unknown or expired handle is a tool error that says so.
- **Palette:** one changeset per command, committed at once (the person pressed the command).

| Host | State lives in | `commit` does | Confirm | Render | Default tiers |
|---|---|---|---|---|---|
| `studio-chat` | the open deck | Review: a card; Auto: apply with a History checkpoint (today's rules, `autoHold` included) | Studio UI | yes | by chat mode |
| `palette` | the open deck | apply through `setSource(…, { label, origin: 'palette' })` | Studio UI | yes | all |
| `mcp-desktop` | the live Studio deck (desktop app) | **always a review card in the Studio**, labeled with the client's name; never applied unseen | Studio UI, which the client cannot draw or press | yes | read, draft; act per action allowlist |
| `mcp-files` (`lattice mcp`) | `.md` files under one root folder | write atomically (temp file + rename) after re-checking every fingerprint against the file on disk; a `.lattice/history/` copy of the previous text first | MCP elicitation, if the client supports it | via the CLI's Chromium, when present | read, draft; act **off** unless named in `--allow` |
| `cli` (`lattice action`) | a file path | same as `mcp-files` | none: act needs `--yes` | same | read, draft |

### 5.4 Confirmation and trust

The 11-06 note made the confirm the one guard against injected text acting. Over MCP that guard is
weaker, because **a client can answer an elicitation automatically** and the server cannot tell.
So the policy is per host, not per protocol:

- **`mcp-desktop`:** the confirm is drawn by the Studio itself. The server returns an
  `InputRequiredResult` carrying only `requestState`; the client retries; the call completes once the
  person has answered in the Studio. The client never sees or presses that confirm.
- **`mcp-files`:** `confirm: act` actions ask through form elicitation (one boolean, the action
  described in the server's words, never the model's). `confirm: always` actions, and every action
  with a `network` effect, are **not offered at all** unless the person who started the server named
  them in `--allow`. A client without elicitation gets `CONFIRM_UNAVAILABLE` for anything that needs
  confirmation; nothing is ever auto-approved.
- `tools/list` is fixed for a server instance (its startup flags and, for a remote server later, the
  caller's authorization), which is what the spec allows. Modes like Talk/Review are a chat concept;
  over MCP the equivalent is the server's flags.

### 5.5 State sync: how everyone learns what happened

- **Revision:** a short hash of the deck text, returned by every call. Cheap (hashing a 50 KB deck is
  0.04 ms, measured with SHA-256 in Node on 2026-11-17) and comparable across hosts.
- **Per-op results** come back from `commit`, so a caller knows exactly which ops landed.
- **Events:** the dispatcher emits one event per call (who, which action, which deck, outcome,
  revision). The Studio publishes them on the Fuoco hub under the caller's origin (`chat`,
  `mcp:<client>`), so the slide rail and the chat can show "changed by Claude Desktop", and adds the
  small who-changed-what log the audit noted the hub lacks. The chat's present-state line (audit §5)
  is built from these events. An MCP client reads `lattice://deck/{id}/status` and can subscribe to
  `notifications/resources/updated` through `subscriptions/listen`.
- **The person's own edits** are events too (origin `author`), so an agent's next call learns the
  deck moved under it from the revision and the per-op `STALE` codes, never from a guess.

### 5.6 Results

One `Result` (`ok`, `code`, `data`, `revision`, per-op results, check verdict, `next_step`) is formatted
per host:

- **chat:** today's prose, generated from the Result. The wording changes only after the #34 replay
  shows it is no worse (audit §6).
- **MCP:** `structuredContent` matching `outputSchema`, plus one short text block summarizing it (the
  spec's backward-compatibility rule); a failure is `isError: true` with the code, the reason and the
  alternatives in the text. Honesty guidance such as "staged, not applied" is in the text every
  client sees, not in a side channel.
- **CLI:** the Result as JSON on stdout, exit 1 on `ok: false`.

Deck text inside any result is **data**: the formatter fences it and labels it, so a slide that says
"ignore your instructions" arrives as quoted content. Markup or CSS in a result passes the #22
sanitizers.

### 5.7 Docs and reference reads are resources, not tools

Reading a component doc, a guide or a front-matter key's documentation is not an action. Over MCP
these become **resource templates** (`lattice://component/{name}`, `lattice://guide/{topic}`,
`lattice://front-matter/{key}`), which a client loads only when it needs them, instead of three tools
in every request. The chat keeps them as tools (it has no resource channel), generated from the same
manifests with `hosts: ["chat"]`.

## 6. Scalability: the context budget

Every tool a client sees costs its model about 130 tokens on every request (measured above). 37
#3208 items would be roughly 5,000 tokens before any work starts, and they would grow. So:

- **Budget:** the default MCP surface stays under **6,000 tokens** (about 45 tools), enforced by the
  gate in §3.5 from the generated `tools/list` bytes.
- **Toolsets:** `lattice mcp --toolsets deck,narration` offers only those groups; the default is
  `deck` plus `docs` resources.
- **Resources for reading** (§5.7) take the docs tools out of the count.
- **Deterministic order and `ttlMs`** let clients and model providers cache the list.
- **Composite actions over chatty ones:** `move_slides` takes a range; `find_text` returns every match
  with its field and context in one call (#3208 items 6 and 25).

## 7. Performance

- **Kernels are pure and DOM-free**, so a read costs a parse, not a render. The outline is
  incremental (it re-reads only the changed region) and its lookups are logarithmic.
- **Render-bound actions are marked** (`requires: ["render"]`) and run only where a renderer is
  present; the file host reuses the CLI's Chromium and caps renders per session.
- **Results are capped and paged** (`limits.resultChars`, a cursor for long reads), so one call cannot
  flood a context window.
- **Validators are compiled at build time** (§8), not per call.
- **Measured before it ships (#19):** a bench scenario for dispatch overhead per call (target: under
  1 ms excluding the kernel, on a 50-slide deck) and for `applyOps` on a 10-op changeset.

## 8. Validation without ajv at runtime

ajv may not ship from `lib/`. Two ways to validate at runtime:

- **(A) Generate validators at build time.** ajv's standalone mode emits plain JavaScript per schema;
  the build writes them to `lib/actions/<id>/<id>.validate.mjs`. Cost to check: whether the emitted
  code imports anything from ajv's runtime for the keywords we use, and its size.
- **(B) A small validator for a restricted schema subset** (object, string, integer, boolean, enum,
  array, `required`, `additionalProperties: false`, min/max), with the gate refusing any manifest that
  uses a keyword outside it. Smaller, but it is a hand-written checker, which
  `tools/manifest-schemas.js` documents as the failure mode it replaced.

**Recommended: (A)**, if the measurement shows the emitted code is self-contained; otherwise (B) with
the subset enforced by the gate. This is measured in the first slice, not guessed here.

## 9. Security

- **Injection:** deck text, captions and file contents are data in every result (§5.6). Only the
  person's confirm, drawn by Lattice where possible, lets an act-tier action run (§5.4).
- **Files:** the file host confines every path to its root (no `..`, no symlinks out), writes
  atomically, and keeps the previous text.
- **Egress:** no action with a `network` effect ships before #3208's privacy boundary (#32) and the
  injection test set (#33) exist, as the issue already orders.
- **Rate limits** per session and per action (the spec's MUST), from `limits`.
- **Audit:** the event stream (§5.5) is the audit log #3208 item 31 asks for; the file host writes it
  to `.lattice/actions.log`.

## 10. Order of work

Each slice ships on its own and deletes what it replaces.

1. **Ops and `applyOps` in `lib/core`**, with fingerprints; the review card renders ops; delete
   `proposalFromDraft`. Covers the audit's §3 losses.
2. **The manifest format, the gate, the generators and the dispatcher**, with today's 15 chat tools
   converted. The chat's behavior and tool bytes stay the same (checked by diffing the generated list
   against today's), so this slice changes no model-visible text.
3. **Validators** (§8, measured).
4. **`set_front_matter_map`, `move_slides`, `preview_speech`** as the first new actions (the audit's
   order), each with its kernel moved to `lib/`.
5. **`lattice action <id> --json`** (the `cli` host): the cheapest real second host, which proves the
   bridge is host-agnostic before any MCP code.
6. **`lattice mcp`** (the `mcp-files` host): stdio, resources, toolsets, elicitation, the budget gate.
7. **The palette** moves onto dispatches.
8. **`mcp-desktop`**, when the desktop app exists.

## 11. Open, for the owner

- **The file host's default commit:** apply with a history copy (recommended: it matches how an
  agent edits code, and every change is reversible), or stage only until `submit_changeset`.
- **Tool names:** plain (`move_slides`) or prefixed (`lattice.move_slides`). The spec allows dots and
  tells aggregating clients to disambiguate. Recommended: plain, because the server name already
  scopes them and every prefix costs tokens on every call.
- **The validator route** (§8): decided by the slice-3 measurement unless the owner prefers (B).

## 12. What this note does not do

- It builds nothing and moves no code.
- It does not design the desktop app; it only fixes what its MCP host must do.
- It does not design a remote (HTTP) MCP server. Authorization, multi-user state and hosting are a
  separate decision; nothing here prevents one, because the dispatcher and kernels do not assume a
  transport.
