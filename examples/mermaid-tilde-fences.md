---
marp: true
theme: indaco
paginate: true
header: "Lattice · Tilde fences"
meta: "Tilde fences · a ~~~mermaid block draws its diagram on both paths"
spectrum: duo
---

<!-- _class: title silent -->

`Mermaid · both fence characters`

# A tilde fence draws its diagram

CommonMark fences with backticks **or** tildes, and Markdown treats the two as the same thing. The live preview always did. The export did not — until this deck.

---

<!-- _class: content -->

## What was wrong, and where

The CLI substituted an SVG for a backtick fence and nothing else, so a tilde fence printed as **raw source** in the PDF.

The author could not see it coming: the preview they wrote in renders both. The next two slides are one diagram, written two ways.

> markdown-it emits `class="language-mermaid"` for either fence, and the runtime keys on that class.

---

<!-- _class: diagram -->

## A backtick fence.

```mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
  C -->|yes| D[Ship]
  C -->|no| E[Revise]
```

> The form every deck in this repo already uses.

---

<!-- _class: diagram -->

## A tilde fence.

~~~mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
  C -->|yes| D[Ship]
  C -->|no| E[Revise]
~~~

> Identical bytes on the slide. Before this change, this page printed five lines of Mermaid source.

---

<!-- _class: cards-stack -->

## One walker, and what it is allowed to move.

- Both callers read it
  - The CLI's substitution, and the narrator. Widen one alone and the voice cannot read the diagram.
- It walks lines, not a regex
  - A closer may outrun its opener; a fence inside a fence is a sample. A regex got both wrong.
- No deck's bytes moved
  - Across 1387 tracked files, three docs changed — each already substituting its own example.

<!-- _footer: "Rendered with `node lattice-emulator.js examples/mermaid-tilde-fences.md`" -->
