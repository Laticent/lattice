- **Fixed: Mermaid labels fit their boxes on a plain slide.** A flowchart, class, state, ER,
  mindmap, kanban, requirement or block diagram on a slide with no `_class` clipped its labels
  to their first few letters, because the slide's paragraph rule restyled Mermaid's label text
  at the body size (about 21px) inside a box Mermaid had sized for its own 14px. In a `--read` or `--player` article the same labels ran past the right
  edge of their boxes. Labels now keep the size Mermaid measured them at, on the slide, in
  the PDF and in every article export. Diagrams on `_class: diagram` slides were never
  affected.
