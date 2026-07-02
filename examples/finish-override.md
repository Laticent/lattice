---
marp: true
theme: indaco
paginate: true
class: finish finish-recede
---

<style>
/* Lattice Studio — embedded finish (self-contained: this deck keeps its surface
   finish even where the saved finish is not installed). Generated on export. */
section.finish.finish-recede {
  --fin-wash:none;
  --fin-texture:repeating-linear-gradient(0deg, color-mix(in srgb, var(--accent) 9%, transparent) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 9%, transparent) 0 1px, transparent 1px 34px);
  --fin-size:auto, auto, auto;
  --fin-repeat:repeat, repeat, no-repeat;
  --fin-mark:none;
  --fin-mark-text:"";
  --fin-edge:radial-gradient(78% 78% at 50% 50%, transparent 60%, color-mix(in srgb, var(--ink, var(--accent)) 10%, transparent) 100%);
  --fin-edge-position:center;
  --fin-edge-size:cover;
  --fin-backdrop-mask: var(--backdrop-clear-mask);
  --fin-backdrop-mask-opaque: var(--backdrop-clear-mask-opaque);
}
@media print {
  section.finish.finish-recede {
  --fin-wash:none;
  --fin-texture:repeating-linear-gradient(0deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px);
  --fin-edge:radial-gradient(78% 78% at 50% 50%, var(--bg) 62%, color-mix(in srgb, var(--ink, var(--accent)) 8%, var(--bg)) 100%);
  }
}
:where(.lattice-exporting) section.finish.finish-recede,
section.finish.finish-recede.lattice-exporting {
  --fin-wash:none;
  --fin-texture:repeating-linear-gradient(0deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px);
  --fin-edge:radial-gradient(78% 78% at 50% 50%, var(--bg) 62%, color-mix(in srgb, var(--ink, var(--accent)) 8%, var(--bg)) 100%);
}
</style>

<!-- _class: statement -->

`The fifth finish layer`

## Backdrop is a finish layer now.

The **recede** finish bakes a faint grid, a soft vignette, and a **backdrop clearance** — the grid reads at the margins and steps back behind the words, so the content sits on clean canvas.

---

<!-- _class: statement -->

## The finish frames; the content stays clean.

The grid and vignette read at the edges. Where the body sits, the baked clearance recedes the finish — nothing competes with the message.

---

<!-- _class: kpi -->

`Legible over a live finish`

- 61%
  - faster to skim
- 3x
  - less visual noise
- AA
  - contrast held

---

<!-- _class: code -->

`One map overrides any baked layer`

```yaml
finish: finish-recede
finish-override:
  backdrop:
    strength: 0.4     # dim the whole finish
    clearance: off    # or turn the baked clearance back off
  texture:
    intensity: 4      # any layer is overridable
```

The Fabricate designer bakes the backdrop into the finish; `finish-override:` deep-merges over it and regenerates the finish CSS — in the Studio preview and every export.

---

<!-- _class: statement -->

`the fifth finish layer — strength · clearance`

## Restraint, baked in.

Tune the backdrop in Fabricate; override it per deck with one `finish-override:` map.
