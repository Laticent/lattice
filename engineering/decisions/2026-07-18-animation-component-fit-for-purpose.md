---
status: proposed
summary: The Stage-5 `scene` component ships as a faithful MIRROR of the adaptive `image` layout — a deliberately strong BASELINE, not the end state. Vision (owner): animation is sometimes the LEAD (the motion IS the argument) and sometimes the SUPPORTING ACTOR (motion reinforces a point owned by other content); a fit-for-purpose animation component must resolve prominence by that ROLE, not only by the poster's aspect the way image does. Assessed failure points of the image-mirror baseline: (1) it resolves by SHAPE, not ROLE; (2) it is designed around a STILL with motion deferred to hydration, so playback/scrub/loop/hero-frame are not first-class; (3) it inherits image's weak cover-photo compositions (spotlight/statement) that don't fit contained motion; (4) it has no attention/"weight" model to modulate a quiet ambient loop vs a dominant demonstration; (5) it is SOVEREIGN (owns the whole canvas), so a true supporting-actor mode — animation embedded ALONGSIDE substantial content — does not exist yet. Backlog: design a fit-for-purpose animation component (or role-modes) with lead/supporting as the organizing axis, motion as a first-class layout citizen, and a non-sovereign embeddable mode. Baseline stands and merges; this is roadmap, not immediate rework.
companion:
  - ./2026-07-18-anima-motion-faculty-modes.md
  - ./2026-07-17-anima-animation-library.md
---

# The animation component — from image-mirror baseline to fit-for-purpose

**Date:** 2026-07-18
**Status:** Backlog / vision (no rework scheduled; the Stage-5 baseline ships as-is)
**Follows:** `2026-07-18-anima-motion-faculty-modes.md` §5–6.1 (the Stage-5 `scene`
host component, shipped as a mirror of the adaptive `image` layout).

---

## 1. Why this note exists

Stage 5 shipped `scene` as a **faithful mirror of the `image` component** — its
composition auto-resolves from the poster's aspect, it keys on the same
`data-img-composition` attribute, it reuses image's aspect brain. That was the right
call for a first cut: `image` is our best-audited component, so mirroring it gave us a
boardroom-quality **baseline** fast, with a known-good visual contract.

But a mirror of `image` is, by construction, a component designed for **a still
rectangle whose only unknown is its shape**. Animation is not that. This note records
the owner's vision for where the animation component must go, and an honest assessment
of where the image-mirror baseline falls short — so the next iteration is designed for
what animation actually is, not for what a photo is.

**The baseline is fine as a starting point. It is not the end result.**

## 2. The vision — animation as LEAD or SUPPORTING ACTOR

The organizing insight (owner):

> The animation is sometimes the **lead** and sometimes the **supporting actor**.

- **Lead.** The motion *is* the argument — a mechanism you must rotate to read, a
  process that assembles in order, a quantity bound to live data. It should dominate the
  canvas, be motion-forward, and reduce everything else to a caption.
- **Supporting actor.** The motion *reinforces* a point that other content owns — a
  small self-drawing diagram beside a data table, an ambient loop next to the paragraph
  it illustrates. It should be secondary: sized down, quiet, embedded alongside real
  content, never competing with the thing it supports.

These are two different jobs. A fit-for-purpose animation component must let the author
declare (or the engine resolve) **which role the motion is playing**, and lay out
accordingly. That axis — role — is the missing dimension.

## 3. Failure-point assessment of the image-mirror baseline

Where mirroring `image` falls short *for animation specifically*:

1. **It resolves by SHAPE, not by ROLE.** `image`'s entire premise is "resolve the
   composition from the asset's aspect," because a photo's shape is all you know. An
   animation's decisive variable is not its shape but its **role** (lead vs supporting),
   which is orthogonal to aspect: a wide poster could be a dominant hero *or* a quiet
   ambient strip. The baseline picks `spotlight` because the poster is wide, not because
   the animation is the hero — it can't tell the difference.

2. **It is designed around a STILL; motion is deferred.** The component frames a poster;
   the actual animation is Stage-6 hydration bolted onto that frame. So the compositions
   know nothing about **playback, scrub, loop, timing, or the still→motion transition**,
   and nothing about choosing the hero frame. A fit-for-purpose component designs the
   motion-forward experience *and* the print-still fallback together — the still is the
   fallback, not the primary design target.

3. **It inherits weak, photo-shaped compositions.** The Stage-5 adversarial trio already
   flagged `spotlight`/`statement` as compromised over contained line-art — they exist to
   *complete the image mirror*, not because a lead or supporting animation needs them. A
   purpose-built set would drop or redesign them.

4. **It has no attention / "weight" model.** Motion grabs attention in a way a still does
   not. A quiet ambient supporting loop and a dominant lead demonstration need different
   sizes, motion intensity, autoplay/loop behavior, and different degrees of "permission
   to distract" from surrounding content. The baseline modulates none of this.

5. **It is SOVEREIGN — so a true supporting-actor mode does not exist.** `scene` is
   registered as a chrome-exempt sovereign frame: it *owns the whole canvas*. That is
   correct for the **lead** case and wrong for the **supporting** case by definition — a
   supporting actor lives *alongside* substantial content (text, a table, a chart), not
   instead of it. The role axis (lead/supporting) therefore maps onto a frame-stage axis
   (**sovereign** vs **canvas/flow-embedded**). The baseline only has the sovereign half.

## 4. The backlog item

**Design a fit-for-purpose animation component** (or a set of role-modes on one component),
organized around lead-vs-supporting rather than aspect-driven compositions. In scope for
that design:

- **Role as the primary axis.** Author declares the role (or the engine infers it from
  context); the layout follows from role first, aspect second.
- **A non-sovereign, embeddable mode** for the supporting actor — animation sized and
  placed *within* a slide that other content owns, not a full-canvas takeover.
- **Motion as a first-class layout citizen** — playback affordance, scrub/replay/loop
  behavior, the still↔motion transition, and hero-frame selection designed into the
  compositions, with the print still as an explicit fallback.
- **An attention/weight model** — how prominent, how insistent, how much the motion may
  compete with its neighbors, keyed off role.
- **Reconcile with the Motion faculty MODES** (`2026-07-18-anima-motion-faculty-modes.md`):
  authoring mode (Director/Rig) is orthogonal to *presentation* role (lead/supporting);
  the component design must name how they compose.

Non-goals for the baseline PR: none of the above blocks Stage 5. The `scene` baseline is a
sound, gate-clean, boardroom-quality starting point and should merge. This note is the
durable record that it is a **starting point**, and the direction the next iteration takes.

## 5. Relationships

- **Baseline:** `2026-07-18-anima-motion-faculty-modes.md` §5–6.1 — the Stage-5 `scene`
  component this note critiques and extends.
- **Authoring modes:** same doc §3.1 — Director / Rig modes are how you *build* a scene;
  lead/supporting is how the built scene *presents*. Orthogonal, must compose.
- **Reference component:** `lib/components/imagery/image/` — the adaptive layout scene
  mirrors; the baseline's strengths (and the photo-shaped assumptions it inherits) come
  from here.
