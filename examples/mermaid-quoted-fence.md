---
marp: true
theme: indaco
paginate: true
header: "Lattice · mermaid in a quote"
---

<!-- _class: title silent -->

# A diagram inside a quote

`Diagram · quoted fences`

A Mermaid fence under `>` draws at its natural size, in the Studio and in the CLI's file alike.

---

# A quoted diagram between two paragraphs

The paragraph above the quote.

> ```mermaid
> flowchart LR
>   Draft --> Review --> Publish
> ```

The paragraph below it stays on the slide.

Another paragraph, so the slide has prose under the figure.

---

# A quote with words around its diagram

> The team signs off in three steps:
>
> ```mermaid
> flowchart LR
>   Plan --> Build --> Ship
> ```
>
> Each step has one owner.

---

# A diagram under a list item

- First point, with its diagram:

  ```mermaid
  flowchart LR
    Idea --> Draft --> Review
  ```

- Second point.

---

# A two-step quote

> ```mermaid
> flowchart LR
>   Green --> Merged
> ```

Short diagrams stay short: the height follows the drawing, not a fixed box.

---

# What changed

- A quoted or list-nested figure sizes like the CLI's baked one
- The paragraphs after it stay on the slide
- The Studio's file and the CLI's file match byte for byte
