---
marp: true
size: 4k
theme: indaco
paginate: true
header: "Self-healing polymer · Poster walkthrough"
---

<!-- _class: title silent -->
<!-- tier: short -->

`Materials Symposium · Poster 214`

# A polymer that stitches its own cracks back together

Reversible bonds give a structural plastic that recovers 90% of its strength after fracture.

---

<!-- _class: content -->
<!-- tier: short -->

## We built a load-bearing plastic that heals a clean break in ten minutes at room temperature.

Most self-healing polymers are soft gels or need an oven to recover. Ours is a rigid, structural material that re-bonds across a fracture surface at room temperature — recovering 90% of its original strength without any external trigger.

---

<!-- _class: content -->
<!-- tier: standard -->

## The problem: structural plastics fail at invisible micro-cracks.

In load-bearing components, fracture starts as micro-cracks far below the surface, invisible until the part snaps. A material that closes those cracks as they form would extend service life dramatically — but the chemistry that allows healing usually makes the material too soft to bear load.

- Micro-cracks nucleate failure long before anything is visible.
- Healing chemistry and structural stiffness normally trade off.

---

<!-- _class: content -->
<!-- tier: short -->

## Our idea: two bond types — strong ones for strength, weak ones for healing.

We weave two networks into one polymer. Permanent covalent bonds carry the load and give the material its rigidity. Reversible hydrogen bonds break first under stress and re-form across a crack face — sacrificial bonds that heal while the strong network holds the shape.

---

<!-- _class: diagram -->
<!-- tier: short -->

## How the dual network absorbs a crack and closes it.

```mermaid
flowchart LR
  A["Intact dual network"] --> B{"Mechanical stress"}
  B --> C["Reversible bonds break first"]
  C --> D["Covalent network holds shape"]
  D --> E["Bonds re-form across crack"]
  E --> F["Strength recovered"]
```

---

<!-- _class: content -->
<!-- tier: standard -->

## The mechanism: sacrificial bonds dissipate energy, then reconnect.

When stress hits, the weak hydrogen bonds rupture and absorb the energy that would otherwise propagate a crack. Because the strong network keeps the two faces aligned, the weak bonds find their partners again and re-form. The damage becomes reversible rather than permanent.

- Weak bonds dissipate fracture energy as they break.
- The strong network keeps crack faces aligned for re-bonding.

---

<!-- _class: stats -->
<!-- tier: short -->

`Mechanical testing · n = 30 specimens`

## What the dual-network polymer recovers after a clean fracture.

`Tensile bars fractured, rejoined for 10 min at 23°C, then re-tested.`

1. 90%
   - strength recovered
2. 10 min
   - to heal at 23°C
3. 50×
   - heal cycles before fatigue
4. 38 MPa
   - tensile strength

---

<!-- _class: content -->
<!-- tier: full -->

## It heals many times over — not just once.

We fractured and healed the same specimen fifty times before recovery dropped below 80%. Each cycle re-forms the reversible bonds with little degradation of the permanent network. The material treats damage as routine, not terminal.

- Recovery stays above 80% through 50 fracture cycles.
- The covalent backbone survives repeated healing intact.

---

<!-- _class: content -->
<!-- tier: full -->

## The trade-off we are still negotiating: heat softens the healing bonds.

Above 60°C the reversible network loosens and the material creeps under sustained load. For room-temperature applications this is invisible, but high-temperature use needs a stronger reversible chemistry. That is the next dial to turn.

- Service ceiling is currently about 60°C.
- A higher-temperature reversible bond is the next target.

---

<!-- _class: content -->
<!-- tier: full -->

## Where this goes: components that report and repair their own fatigue.

We are blending the healing chemistry with a strain-responsive dye so a part changes color where it has healed — a visual fatigue log. The aim is structural components that both repair micro-damage and show their repair history at a glance.

- A strain-responsive dye marks healed regions.
- The part becomes its own maintenance record.

---

<!-- _class: closing -->
<!-- _paginate: false -->
<!-- _header: '' -->
<!-- _footer: '' -->
<!-- tier: short -->

## Build the weakness in on purpose, and the material learns to heal.

`Presenter · Priya Raghavan · poster 214 · find me at the session`
