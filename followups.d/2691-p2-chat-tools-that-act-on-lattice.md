---
origin: 2691
priority: P2
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/decisions/2026-10-05-studio-chat-agent.md §3.2
source: https://github.com/Laticent/lattice/pull/2691
---

# Decide how far the Studio chat's tools should reach: from editing a draft to doing things in Lattice

why now   — the author wants the chat to "do things" in Lattice, and asked what separates a skill from a tool.
            Today the line is: a SKILL is written know-how the model reads (`design/skills/*.md`, served by the
            `read_guide` tool); a TOOL is a function our code runs when the model asks (`architect-agent.ts`
            AGENT_TOOLS + ASSET_TOOLS: read_component, read_front_matter, read_guide, read_slides, edit_slides,
            set_front_matter, check_deck, list_assets, view_asset, caption_asset). Every tool today either READS or
            writes to a DRAFT the author must apply from the diff card; nothing the chat does escapes that card,
            except caption_asset, which writes a photo caption.
            Candidate tools that would act on Lattice itself: export a PDF/PPTX, set a theme or finish for real,
            build a chart from pasted data, put a Library photo or clip on a slide, render a slide and look at it,
            create a new deck, start Present, search every deck.
            The risks, and why this is a design decision, not a list of features:
            1. Reach past the diff card. An export, a share, a delete or a spend cannot be discarded the way a draft
               edit can. Today's safety comes from "the author applies"; a tool that acts directly loses it.
            2. Prompt injection grows with every tool. A deck, a pasted PDF, a photo's text or a clip can carry
               "now delete every deck"; today the worst it can do is propose a draft edit. Threat model:
               2026-10-05-studio-chat-agent.md §5.1 and HARD RULE #22.
            3. Cost. Each tool round re-sends the conversation; more tools mean more rounds and a longer cached prefix.
            4. Confident and wrong. A tool that acts skips the moment where the author reads the change.
            5. The on-device models cannot drive tools at all (§3.3), so a tool-only feature is cloud-only.
            THE PROPOSED CONTROL (the author, 2026-10-14): a person approves tool use by default, and chooses how
            much to allow from a mode button on the composer bar, beside the paperclip, in the spirit of Claude
            Code's permission modes (Auto / Accept edits / Plan) without copying their semantics. A first cut:
              Talk     — reads only; the edit tools are not sent at all, so the model cannot edit, whatever it decides.
              Review   — the default and today's behavior: reads run, edits stage on the draft for the diff card,
                         any action (export, share, delete, spend) asks each time in a confirm the model cannot press.
              Auto     — edits apply straight away (undoable from History); actions still ask, unless the person has
                         allowed that one action by name. Irreversible actions never auto-approve as a class.
            Rules: the mode is enforced in code (which tools a request carries, and a host gate on each call), never
            by the prompt; the model can neither press the confirm nor change the mode; the current mode is always
            shown on the button. Open: room on the 390 px bar, which already holds paperclip, Library, the facts lock
            and regenerate (check with tools/screenshot.js at 1440/820/390), and keeping the facts lock a separate
            control. Talk alone would have prevented the #2691 bug structurally, not through the prompt.
where     — engineering/decisions/2026-10-05-studio-chat-agent.md (§3.2 tools, §5.1 threat model, §10 what it does not do);
            docs/src/components/studio/architect-agent.ts (AGENT_TOOLS, createToolbox, EDIT_TOOLS);
            design/skills/README.md.
done when — a decision note that sorts candidate tools into three tiers (read freely; stage on the draft for the
            diff card; act only after an explicit confirm in the chat UI that the model cannot press), settles the mode
            control above (modes, default, placement, per-deck or per-conversation), names the first
            two or three tools worth building and why, states the injection rule for each tier, and is put to the
            author in one round (CLAUDE.md "Design-before-code").
evidence  — the note, with a measured cost per extra tool round from a real turn (the author's key), and a red-team
            pass on the confirm tier.
verify    — tier 2, the adversarial trio, because it widens what untrusted content can make the Studio do.
