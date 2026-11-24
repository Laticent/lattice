---
marp: true
theme: indaco
paginate: true
header: "Lattice · logo-wall"
---

<!-- _class: title silent -->

# A logo wall paints once, already packed.

`logo-wall · first paint in the Studio`

In the editing preview, a wall stays hidden until its marks are measured, so it never shows the plain grid first and then jumps into rows.

---

<!-- _class: content -->

## The preview used to paint the grid for one frame first.

The Studio packs a wall in the live preview: it measures each mark, then sets the rows. While it measures, the wall is hidden.

- The runtime marks a wall as measuring when its pass runs, which can be a frame after the slide's markup lands.
- In that frame, the unpacked grid painted, then jumped into packed rows.
- Now the preview also hides a wall the runtime has not reached yet. Exports are unchanged: they wait for the measure and carry no such rule.

---

<!-- _class: logo-wall -->

`Four shapes`

## Wordmarks, a badge and a crest arrive packed.

- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Spire](sample:logo-spire.svg)
- ![Acme](sample:logo-acme.svg)

---

<!-- _class: logo-wall -->

`With captions`

## Captions arrive with their marks, never before them.

- ![Acme](sample:logo-acme.svg)
  - Acme
  - `{Series B}`
- ![Globex](sample:logo-globex.svg)
  - Globex
- ![Vantage](sample:logo-vantage.svg)
  - Vantage
  - `{Seed}`
- ![Umbra](sample:logo-umbra.svg)
- ![Meridian](sample:logo-meridian.svg)
- ![Helios](sample:logo-helios.svg)

---

<!-- _class: logo-wall dense -->

`Dense`

## A long roster waits for every mark, then paints in one pass.

- ![Acme](sample:logo-acme.svg)
- ![Cobalt](sample:logo-cobalt.svg)
- ![Globex](sample:logo-globex.svg)
- ![Helios](sample:logo-helios.svg)
- ![Initech](sample:logo-initech.svg)
- ![Keystone](sample:logo-keystone.svg)
- ![Lumen](sample:logo-lumen.svg)
- ![Meridian](sample:logo-meridian.svg)
- ![Northwind](sample:logo-northwind.svg)
- ![Pinnacle](sample:logo-pinnacle.svg)
- ![Quanta](sample:logo-quanta.svg)
- ![Sable](sample:logo-sable.svg)

---

<!-- _class: logo-wall color -->

`Color`

## Brand colors keep their marks, and the wall still paints once.

- ![Spire](sample:logo-spire.svg)
- ![Lumen](sample:logo-lumen.svg)
- ![Quanta](sample:logo-quanta.svg)
- ![Sable](sample:logo-sable.svg)
- ![Northwind](sample:logo-northwind.svg)
- ![Cobalt](sample:logo-cobalt.svg)

---

<!-- _class: content -->

## A wall the packer never takes is never hidden.

The rule hides only the walls the runtime will stamp: a list that opens the stage and holds marks.

- A wall that opens with a lede paragraph keeps the equal-cell grid, and it shows at once.
- A wall whose marks never load still appears at the cap, as the grid.
- Every export, PDF, PowerPoint and webpage, renders as before.
