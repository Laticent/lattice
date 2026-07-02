---
marp: true
theme: indaco
paginate: true
---

<style>
/* Lattice Studio — embedded finishes (self-contained: this deck keeps its surface
   finishes even where the saved finishes are not installed). Generated on export. */
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
  --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
  }
}
:where(.lattice-exporting) section.finish.finish-recede,
section.finish.finish-recede.lattice-exporting {
  --fin-wash:none;
  --fin-texture:repeating-linear-gradient(0deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px), repeating-linear-gradient(90deg, color-mix(in srgb, var(--accent) 6%, var(--bg)) 0 1px, transparent 1px 34px);
  --fin-edge:radial-gradient(78% 78% at 50% 50%, var(--bg) 62%, color-mix(in srgb, var(--ink, var(--accent)) 8%, var(--bg)) 100%);
  --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
}
section.finish.finish-beam {
  --fin-wash:linear-gradient(118deg, color-mix(in srgb, var(--accent) 15%, transparent) 0%, transparent 42%, color-mix(in srgb, var(--accent) 10%, transparent) 100%);
  --fin-texture:radial-gradient(color-mix(in srgb, var(--accent) 11%, transparent) 0 1.3px, transparent 1.7px);
  --fin-size:22px 22px, cover;
  --fin-repeat:repeat, no-repeat;
  --fin-mark:none;
  --fin-mark-text:"";
  --fin-edge:none;
  --fin-backdrop-mask: radial-gradient(ellipse 40% 40% at 74% 34%, transparent 42%, var(--bg) 96%);
  --fin-backdrop-mask-opaque: radial-gradient(ellipse 40% 40% at 74% 34%, transparent 70%, var(--bg) 70%);
}
@media print {
  section.finish.finish-beam {
  --fin-wash:linear-gradient(118deg, color-mix(in srgb, var(--accent) 12%, var(--bg)) 0%, var(--bg) 42%, color-mix(in srgb, var(--accent) 7%, var(--bg)) 100%);
  --fin-texture:radial-gradient(color-mix(in srgb, var(--accent) 8%, var(--bg)) 0 1.3px, transparent 1.7px);
  --fin-edge:none;
  --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
  }
}
:where(.lattice-exporting) section.finish.finish-beam,
section.finish.finish-beam.lattice-exporting {
  --fin-wash:linear-gradient(118deg, color-mix(in srgb, var(--accent) 12%, var(--bg)) 0%, var(--bg) 42%, color-mix(in srgb, var(--accent) 7%, var(--bg)) 100%);
  --fin-texture:radial-gradient(color-mix(in srgb, var(--accent) 8%, var(--bg)) 0 1.3px, transparent 1.7px);
  --fin-edge:none;
  --fin-backdrop-mask: var(--fin-backdrop-mask-opaque, none);
}
</style>

<!-- _class: statement finish finish-recede -->

`The fifth finish layer`

## Backdrop is a finish layer now.

The **recede** finish bakes a faint grid, a soft vignette, and a **backdrop clearance** — the grid reads at the margins and steps back behind the words, so the content sits on clean canvas.

---

<!-- _class: statement finish finish-recede -->

## The finish frames; the content stays clean.

The grid and vignette read at the edges. Where the body sits, the baked clearance recedes the finish — nothing competes with the message.

---

<!-- _class: statement finish finish-beam -->

`Spotlight — the inverse mask`

## Or reveal the finish in one window.

Clearance clears the center; **spotlight** does the opposite — it shows the finish in a single joystick-placed window and hides it everywhere else. Same mask, shaped the other way.

---

<!-- _class: kpi finish finish-recede -->

`Legible over a live finish`

- 61%
  - faster to skim
- 3x
  - less visual noise
- AA
  - contrast held

---

<!-- _class: code finish finish-recede -->

`One map overrides any baked layer`

```yaml
finish: finish-recede
finish-override:
  backdrop:
    strength: 0.4       # dim the whole finish
    clearance: off      # or turn the baked clearance off…
    spotlight: 74 34 40 # …and reveal one window instead (x y radius)
  texture:
    intensity: 4        # any layer is overridable
```

The Fabricate designer bakes the backdrop into the finish; `finish-override:` deep-merges over it and regenerates the finish CSS — in the Studio preview and every export.

---

<!-- _class: statement finish finish-recede -->

`the fifth finish layer — strength · clearance · spotlight`

## Restraint, baked in.

Tune the backdrop in Fabricate; override it per deck with one `finish-override:` map.
