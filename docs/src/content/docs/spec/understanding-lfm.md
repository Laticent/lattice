---
title: Understanding LFM
description: Lattice-Flavored Markdown in plain words — what it is, the one big idea behind it, and the handful of things it adds to the Markdown you already write. No spec-reading required.
---

If you have ever written a README, a GitHub issue, or a note in Slack, you
have written Markdown. **LFM — Lattice-Flavored Markdown — is that same
Markdown, with a few small conventions Lattice understands.** You do not
learn a new language to use Lattice. You write Markdown, and Lattice reads a
little more into it than other tools do.

The name is borrowed on purpose. *GitHub-Flavored Markdown* (GFM) is what
lets you write a task list or a table on GitHub — plain Markdown, plus a few
extensions GitHub agreed to support. LFM is the same idea for slides:

> **LFM = the Markdown you know + a handful of slide conventions.**

This page is the gentle tour. When you want the exact, lawyer-proof rules,
they live in the [LFM 1.0 specification](/spec/lfm/) — but you do not need
them to start.

## The one big idea: your file still reads fine anywhere

Here is the rule that governs everything else, and it is worth holding onto:

**An LFM file is always a valid Markdown file.** Open it on GitHub, paste it
into Confluence, preview it in any editor — it reads cleanly, with nothing
broken and nothing weird showing through. Lattice turns it into a polished
deck; everywhere else it is just a tidy Markdown document.

We call this *graceful degradation*, and it is not a nice-to-have — it is the
whole point. It is why the extra conventions are things like HTML comments and
nested lists, never strange new punctuation. If a construct could break in a
plain Markdown viewer, it does not belong in LFM.

## The handful of things LFM adds

In everyday authoring there are really only three conventions to meet. None
of them require memorizing the spec.

### 1. Choosing a component

A slide picks its Lattice component with a one-line comment:

```markdown
<!-- @meta{layout=split-compare} -->
```

Because it is an HTML comment, it is **invisible everywhere else** — GitHub
simply doesn't show it. To Lattice, it says "lay this slide out as a
side-by-side comparison." You browse the available components in the
[component reference](/components/); the comment is how you pick one.

### 2. The card shape

Many components arrange content into cards — a title with a line or two beneath
it. You write that as a nested list, which reads as a perfectly ordinary
outline anywhere else:

```markdown
- Faster reviews
  - Decks render in seconds, in CI, with no design tool open
- One visual language
  - Every slide on a theme looks related, automatically
```

A plain Markdown viewer shows a normal bulleted outline. Lattice sees cards.

### 3. Status markers

When a slide tracks state — a checklist, a roadmap, a comparison of what's
done versus planned — LFM uses the task-list checkboxes you already know,
plus a couple more:

```markdown
- [x] Shipped
- [ ] Not started
- [/] In progress
- [-] Skipped
```

`[x]` and `[ ]` render as real checkboxes on GitHub; the other two degrade to
readable text. Lattice maps all four to the right visual state.

That is the working vocabulary. Everything else in LFM is ordinary Markdown:
headings, lists, links, tables, code, images.

## How far a tool can go: the three levels

You will see LFM described in terms of three *conformance levels*. In plain
terms they answer "how much of LFM does this tool understand?"

- **Level 0 — it's just Markdown.** Any Markdown viewer, with no idea Lattice
  exists, shows your file readably. *Every LFM document is at least this.*
- **Level 1 — it builds the slides.** The tool understands the component
  comments, the card shape, and the status markers, and produces real Lattice
  components. This is what the Lattice engine does.
- **Level 2 — it coaches you.** On top of that, the tool checks your document
  and tells you when something is valid Markdown but won't render the way you
  meant — with a clear message and, often, a one-click fix. That contract is
  the [Diagnostic Protocol](/spec/diagnostics/).

You never declare a level as an author. It's how *tools* advertise what they
support — useful to know exists, nothing to act on day to day.

## Where to go next

- **Just want to write decks?** The [authoring guide](/guides/authoring/) is
  the practical, example-first path — start there.
- **Want the precise, normative rules** (for implementing LFM, or settling an
  edge case)? Read the [LFM 1.0 specification](/spec/lfm/).
- **Building tooling** — an editor extension, a CI check, a PR bot? The
  [Diagnostic Protocol](/spec/diagnostics/) is the contract to implement.

LFM is small on purpose. The promise is that the file you write to make a
beautiful deck is the same file that reads cleanly everywhere a human might
open it — no lock-in, no surprises.
