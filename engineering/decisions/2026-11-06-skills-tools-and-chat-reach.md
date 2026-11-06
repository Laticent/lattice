---
status: in-progress
summary: One skill index from front matter (shipped) feeds the Studio chat, the agent kit and Claude Code; proposed next — the missing operate skills, an action registry with three safety tiers behind Talk/Review/Auto, a workspace-wide chat that can create decks, and Fuoco focus in the chat's grounding.
---

# Skills, tools and how far the Studio chat reaches

**Asked (2026-11-06).** The owner wants skills for every part of Lattice an agent could use,
behind an index an agent reads first to keep token cost down; a formal set of tools the
Studio chat can call to *do* things, starting with creating a deck, which the chat cannot do
today; and a chat that knows what is worth knowing through Fuoco.

**Settled with the owner in one round (2026-11-06):**

| Question | Answer |
|---|---|
| What ships first | This note **and** the skill index (§3) |
| How the chat relates to decks | **One chat for the workspace**: a conversation can create, open and switch decks; the open deck is its context |
| Default permission mode | **Review**: reads run, edits stage on the draft, real actions ask in a confirm the model cannot press. Talk and Auto are selectable |
| Who the skills serve | **All three readers from one source**: the Studio chat, external agents (agent kit), Claude Code in this repo |

This note answers most of `followups.d/2691-p2-chat-tools-that-act-on-lattice.md` (the tiers,
the mode control, the first tools). It does not close it: that card also asks for a measured
cost per tool round on a real turn and a red-team pass on the confirm tier, which wait for the
build (§7).

## 1. What the audit found

**Skills.** Nine hand-written skills in `design/skills/`, 2k–6k tokens each, about 38k in total.
Eight teach how to *make* something (deck, theme, component, chart kind, finish, lens, speaker
notes, component showcase); one (`cli.md`) operates on a finished deck. Before this change none
had front matter, and four separate lists named them and disagreed:

- `design/skills/README.md`: all nine.
- The Studio chat's `GUIDE_TOPICS` (`docs/src/components/studio/architect-agent.ts`): five.
- The agent kit's `skills/README.md` (`tools/build-agent-kit.mjs`, a hand-kept `LABEL` map):
  all nine, with labels written separately.
- The kit's generated `lattice-decks/SKILL.md`: the only file with real front matter, deck
  authoring only.

No test reconciled them, and no list said what a skill costs to read.

**What has no skill.** The jobs an agent does most on a deck that already exists:
editing and restructuring it, re-theming or restyling it, fixing lint and overflow findings,
picking a chart for some data, Mermaid diagrams, math, importing, an accessibility pass, and
using the Studio itself.

**Tools.** The Studio chat already calls tools on the cloud tier (OpenRouter, the user's own
key), with ten tools defined in `architect-agent.ts`. Every one reads, or stages an edit on a
draft of the **open** deck; the author applies that draft from one diff card. The chat cannot
create a deck because of three separate one-deck bindings:

1. no tool creates, opens or switches a deck;
2. applying writes over the open deck (`onApply` → `StudioShell.applyChatEdit`);
3. chat history and spend are keyed by deck id (`ArchitectChat.tsx`, `studio-store.ts`).

The verbs a tool would need already exist: `createDeck(title, source)` (`studio-store.ts`),
`openImportedDeck(text, title)` and `loadDeck` (`StudioShell.tsx`). `studio-commands.ts` lists 25
Studio commands for the palette and the lessons, but none takes arguments: `export-pdf` opens the
Share sheet, `import-deck` clicks a file input, and the theme is a prop, not a command.

**Fuoco.** The focus hub (`docs/src/lib/fuoco/hub.ts`) knows where the author is: slide, section,
page, caret line. The chat does not read it. The chat's awareness arrives through
`ChatGrounding` (`architect.ts`): lint and Coach findings, the scorecard, Mermaid errors, a draft
checker, the fit-render inputs. Overflow, contrast and render state have no channel out of where
they are computed; the typed event channel that would carry them is designed
(`2026-11-05-fuoco-event-channel.md` §9) and not built (`followups.d/3037-p1`…`p5`).

## 2. The model: know-how, actions, awareness

Three things make a chat agent good at a product, and each has one source:

| | What it is | One source | Read by |
|---|---|---|---|
| **Skill** | Written know-how the model reads before a job | `design/skills/*.md` + front matter | Studio `read_guide`, agent kit, `.claude/skills/` |
| **Tool** | A function our code runs when the model asks | An action registry (§4), each action with a schema and a tier | Studio chat tools; later a CLI JSON mode or an MCP server |
| **Awareness** | Facts about the author's current state, sent with each turn | Fuoco: the focus record now, its event facts later (§6) | `ChatGrounding` |

The rule that keeps cost down is the same for all three: **the model sees an index of one line
per item, and pays for the body only when it asks.** The components already work this way
(`components.pick.md`, `read_component`). Skills now do too (§3). Tools will (§4). Awareness
sends only what changed since the last turn (§6).

## 3. Shipped: one skill index from front matter

Each skill opens with:

```yaml
---
name: deck
description: "Use when writing a whole deck from a blank file: …"
kind: make            # make | operate
studio: true          # does the Studio chat's read_guide offer it?
---
```

The description is double-quoted because Claude Code and most agent harnesses parse this block
as YAML, where an unquoted `a: b` is an error (`test/unit/tools/skill-index.test.js` parses every
block with `js-yaml`).

`tools/skill-index.js` reads the blocks and writes every index, so no reader keeps its own list:

- `design/skills/index.json`: the Studio chat builds `GUIDE_TOPICS` from the rows marked
  `studio: true`; `agent-library.ts` serves every skill by name and strips its front matter
  before the model reads it.
- The table in `design/skills/README.md`, between generated markers, grouped by `kind`, with a
  read cost per skill (bytes / 4).
- `.claude/skills/lattice-<name>/SKILL.md`: a thin pointer per skill, so Claude Code in this repo
  picks a skill from its description without opening the body. Verified on this session's own
  harness: all nine appeared in its skill list as soon as the files were written.
- The agent kit's `skills/README.md` now takes its rows from the same reader (`readSkills()`)
  instead of its own `LABEL` map.

`npm run build:check` runs `tools/skill-index.js --check`, which fails on a skill with missing
or invalid front matter and on any stale index.

**Measured.** The Studio chat's cached system prefix grows by about 370 characters (about 95
tokens): the guide list went from 697 to about 1,070 characters because the descriptions now
come from the skills. The same five skills are offered as before; `component`,
`chart-component`, `component-showcase` and `cli` are `studio: false`, because the Studio chat
cannot create a component or run a terminal.

## 4. An action registry with three tiers (built for the chat; the palette is not on it yet)

Grow `studio-commands.ts` from a list of UI verbs into **actions**: an id, a label, a JSON
schema for arguments, a **tier**, and a `run(args)` that does the work without opening a UI.
The palette, the lessons and the chat all read the same list; the chat's tool list is generated
from it, filtered by the current mode. A later CLI JSON mode or MCP server can read it too.

| Tier | What it may do | Undo | Examples |
|---|---|---|---|
| **read** | Read the deck, the library, docs, findings | nothing to undo | today's `read_*`, `check_deck`, `list_assets`, `render_slide` |
| **draft** | Change a draft the author applies from the diff card | discard the card | `edit_slides`, `set_front_matter`, `set_theme`, `set_finish`, `chart_from_data` |
| **act** | Change something outside the draft | varies; some cannot be undone | `create_deck`, `open_deck`, `export`, `share`, `delete_deck` |

**Modes** (from 2691-p2, owner-confirmed default):

- **Talk**: only read tools are sent. The model cannot edit whatever it decides.
- **Review** (default): read runs; draft stages for the diff card; every act asks in a confirm
  drawn by the Studio, which the model cannot press.
- **Auto**: draft applies straight away, undoable from History; act still asks, unless the
  author allowed that one action by name. Irreversible actions (`delete_deck`, `share`) never
  auto-approve.

The mode is enforced in code twice: by which tools a request carries, and by a host check on
every call. The prompt never enforces it, and no tool can change the mode.

**The first tools, in order:**

1. **`create_deck(title, markdown)`** (act). Calls the existing `openImportedDeck`, which
   normalizes line endings and creates and opens the deck. In Review the confirm shows the title
   and the outline (slide headings) before anything is written. This is the owner's missing
   capability and the smallest act-tier tool, so it proves the confirm.
2. **`set_theme(name)` / `set_finish(name)`** (draft). Front-matter edits with an enum schema
   from `BUILTIN_PALETTES` and the finish catalog, so the model cannot invent a theme.
3. **`render_slide(n)`** (read). Returns a raster of one slide so the model can look, which
   removes the PURPOSE line "you cannot see the slides". Cost is one image per call; cap it per
   turn like `view_asset`.
4. **`chart_from_data(rows, intent)`** (draft). Picks the chart kind from the chart docs and
   writes the slide.

**Injection rule per tier.** Deck text, pasted documents, photos and captions are data, never
instructions (`2026-10-05-studio-chat-agent.md` §5.1, HARD RULE #22). A read tool can only leak
into the reply. A draft tool can only propose, and the author reads the diff. An act tool is the
one place injected text can do harm, so every act call is confirmed by the author in Review,
the confirm shows what will happen in the author's words rather than the model's summary, and
`create_deck`'s Markdown passes the same import path and sanitizers a pasted file does.

### 4.1 As built in PR #3049, and what the adversarial trio changed

- **The registry is the chat's, not yet the palette's.** `docs/src/components/studio/chat-actions.ts`
  tiers every chat tool (`TOOL_TIERS`); `toolsForMode` decides what a request carries and
  `toolAllowed` is the host gate in `createToolbox.run`. A tool with no tier is refused in every
  mode, and the gate reads own keys only (`constructor` is not a tool). Moving `studio-commands.ts`
  onto the same list, so the palette and the chat share verbs, is still open.
- **`create_deck` queues; the author creates.** The tool stores a `ChatAction` (title, Markdown,
  outline, slide count, checker error count); `ActionConfirm` draws the confirm; only the author's
  press calls `openImportedDeck`, the Studio's import funnel and line-ending boundary.
- **The trio's findings, all fixed in the same change.** The red team found Stop did not stop
  Auto, injected text could delete every slide in Auto, Auto could overwrite a slide the author
  edited mid-turn, and the confirm could be spoofed with a heading hidden in a comment or a
  right-to-left title. The inversion pass found Talk and Auto ignored on the one-shot path and Auto
  one press from the default and persisted. The checker found partial applies reported as applied
  and a weak e2e. The fixes:
  - **Auto applies only what `autoHold` clears**: an agent turn (`via: 'agent'`) that finished and
    left a clean draft (`clean`), not stopped, on a deck unchanged since send, outside a live
    session, deleting nothing and changing at most half the slides (minimum two). Anything else
    stays a Review card with the reason. The checkpoint is written with `saveCheckpointDurably`
    BEFORE the edit applies (`StudioShell.applyChatEditAuto`), and an applied turn keeps a
    read-only "What Auto changed" card.
  - **Auto lasts one visit**: the button cycles Review → Talk → Auto, and a reload returns to
    Review. Talk and Review are remembered (`lattice-studio-chatmode`).
  - **The one-shot path honors Talk** (no edit card, a Talk line in its prompt) and its replies
    carry `via: 'oneshot'`, which Auto never applies.
  - **The confirm shows what a reader would see**: `visibleTitle` strips format characters and needs
    a visible word; `outlineTitle` ignores headings inside comments and code fences; the card shows
    the true slide count and the checker's error count.

## 5. One chat for the workspace: what shipped is smaller than planned

The conversation moves from per-deck to per-workspace. Each turn names the open deck as its
context; `create_deck` and `open_deck` change that context and the next turn follows it. What
has to change:

- **History**: from `lattice-studio-chat-<deckId>` to a workspace conversation list, each message
  stamped with the deck it was about. Migrate the per-deck histories once, read-only.
- **Spend**: `getSpendDeck` keys by deck; it becomes per conversation, still attributed per deck.
- **Apply**: `onApply(next)` gains the target deck id, so a draft can never land on a deck that
  was switched away from mid-turn. Applying a draft to a deck that is no longer open is refused.
- **Prompt**: `PURPOSE` says "your purpose is this deck"; it becomes "the author's decks, with
  the open one in front of you".

**What shipped instead (PR #3049).** History stays per deck. After "Create and open", the new
deck's chat starts with one line pointing back to the deck the conversation happened on, and the
action's Markdown is dropped from the stored card. A first cut copied the whole thread to the new
deck; the trio showed that carried the old deck's pending edits (Apply then spliced them into the
new deck), doubled storage, and would leave duplicates for the workspace migration above to undo.
The full workspace conversation (one list, messages stamped by deck, spend per conversation, apply
with a target deck id) is still the plan, and is recorded in `followups.d/`.

## 6. Proposed: awareness through Fuoco, in two steps

**Step 1 (no new channel) — shipped in PR #3049.** When the author sends a message, the shell reads `hub.get()` once
and adds `focus: { slide, section, caretLine }` to `ChatGrounding`. This is read once per send,
never subscribed, so the chat never re-renders on caret moves. It costs about 30 tokens a turn,
in the dynamic tail that is not cached. It lets "fix this slide" mean the slide the author is
on. As built: `ChatGrounding.focus` is a function (`StudioShell.readChatFocus`) that the agent
calls once in `agentSystemParts`; `deckBrief` prints `The author is on slide N ("title"), caret
on the line "…"`, JSON-quoted like all deck text, and drops a slide number outside the deck.
The hub's `unitIndex` and `deckSlides` agree on slide numbers (`chat-focus.test.ts`). The
on-device one-shot path does not carry it.

**Step 2 (after `3037-p1`, `p4`, `p5`).** At send time, read the last value of the event facts
the chat should know (`fit.overflow`, `lint.changed`, `coach.photo-contrast`, `doc.changed` with
its origin), and send **only what changed since the previous turn**, one line each ("slide 4 now
overflows", "you edited slide 7 by hand since my last reply"). Proactive messages, where the
chat speaks first, stay out of scope: a chat that interrupts costs a turn the author did not ask
for.

## 7. Order, and what each step owes

| # | Slice | Owes |
|---|---|---|
| 1 | Skill index | **Shipped** in this PR |
| 2 | The missing skills: `edit-deck`, `restyle-deck`, `fix-findings`, `chart-from-data`, `diagram`, `math`, `import`, `accessibility-review`, `studio` — **shipped in this PR** | Each is `kind: operate` where it acts on an existing deck; written to the same nine-part shape; `studio: true` where the chat can do the job |
| 3 | Fuoco focus in grounding (§6 step 1) | **Shipped** in this PR |
| 4 | Action registry + modes + `create_deck` (§4, §5) — **shipped in this PR** except the palette sharing the registry and the workspace history | The adversarial trio on the act tier (HARD RULE #25: it widens what untrusted content can make the Studio do); a measured cost per tool round from a real turn; screenshots of the mode button at 1440 / 820 / 390 |
| 5 | `set_theme`, `set_finish`, `render_slide`, `chart_from_data` | Per tool: schema, tier, a test that Talk cannot call it |
| 6 | Event-backed awareness (§6 step 2) | Waits for `3037-p1`/`p4`/`p5` |

What is still open is recorded in `followups.d/` so a fresh session can pick it up.

## 8. What this does not do

- It does not add an MCP server or a CLI JSON mode. The registry is shaped so either can read it
  later; neither has a consumer today.
- It does not give on-device models tools. They cannot drive tools
  (`2026-10-05-studio-chat-agent.md` §3.3), so every act-tier feature is cloud-only, and Talk is
  the only mode on device.
- It does not merge `design/skill.md`, `AGENTS.md`, `deck.md` and the kit's `writing-a-deck.md`,
  which overlap. Slice 2 should decide which one the others point at.
