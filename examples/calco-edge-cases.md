---
marp: true
theme: indaco
paginate: true
header: "Lattice · Editable export edge cases"
---

<!-- _class: title -->

# What the editable export has to get right.

Pills, gradients, shadows, glass, wrapped code and a photo with a scrim. Open this as `.pptx` or `.odp` and try to move things.

---

<style>
.rowset { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 24px; }
.pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 999px; background: var(--surface-subtle, #eef2f7); border: 1px solid var(--border-subtle, #c9d3df); font-size: 18px; }
.pill i { width: 12px; height: 12px; border-radius: 50%; background: var(--accent-fill, #036); display: inline-block; }
.pill.ring i { background: transparent; border: 3px solid var(--accent-fill, #036); }
.pill.soft { box-shadow: 0 1px 2px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.18); }
</style>

## Pills are pills

<div class="rowset">
<span class="pill"><i></i>Solid dot</span>
<span class="pill ring"><i></i>Ring dot</span>
<span class="pill soft"><i></i>Two shadows, drawn as one</span>
</div>

Each pill is one rounded shape with its text and dot, and its dot is part of the pill, not a loose picture.

---

<style>
.g { width: 520px; height: 90px; border-radius: 14px; margin: 12px 0; display: flex; align-items: center; padding-left: 24px; font-size: 20px; color: #fff; box-sizing: border-box; }
</style>

## Gradients are gradients

<div class="g" style="background: linear-gradient(90deg, #e11d48, #2563eb)">Two stops, 90°</div>
<div class="g" style="background: linear-gradient(to bottom, #16a34a 0%, #facc15 50%, #dc2626 100%); color:#111">Three stops, top to bottom</div>
<div class="g" style="background: linear-gradient(135deg, rgba(37,99,235,0), #2563eb)">A fade from clear, 135°</div>

---

<style>
.stage { position: relative; height: 330px; background: linear-gradient(120deg, #0b3d66, #5fa8d3); border-radius: 18px; overflow: hidden; margin-top: 18px; }
.glass { position: absolute; left: 60px; top: 60px; width: 420px; height: 150px; border-radius: 16px; background: rgba(255,255,255,.28); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.5); padding: 22px; color: #fff; box-sizing: border-box; font-size: 22px; }
.tilt { position: absolute; left: 560px; top: 70px; width: 300px; height: 150px; border-radius: 14px; background: #fff; color: #123; padding: 22px; box-sizing: border-box; transform: rotate(-4deg); box-shadow: 0 10px 30px rgba(0,0,0,.35); font-size: 22px; }
</style>

## Frosted glass and a tilted card

<div class="stage">
<div class="glass">Frosted box: kept as its translucent fill, blur dropped.</div>
<div class="tilt">A rotated card stays a picture.</div>
</div>

---

<style>
.note { font-size: 22px; line-height: 1.7; max-width: 760px; }
.dash { margin-top: 22px; width: 560px; padding: 18px 24px; border: 2px dashed currentColor; border-radius: 10px; font-size: 20px; }
</style>

## Inline code, wrapped and not

<div class="note">Set <code>spectrum-trim: restrained</code> for a quiet rule, or <code>finish: atrium</code> for the wash. This long chip wraps across two lines when the column is narrow: <code>a-very-long-inline-code-token-that-needs-to-wrap-onto-a-second-line-in-this-narrow-box</code> and then the sentence ends.</div>

<div class="dash">A dashed border is not a native shape yet: it stays in the picture.</div>

---

<style>
.photo { position: relative; height: 420px; border-radius: 18px; overflow: hidden; margin-top: 16px; background: #234; }
.photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,.75), rgba(0,0,0,0) 60%); }
.photo .cap { position: absolute; left: 32px; bottom: 28px; z-index: 2; color: #fff; font-size: 30px; font-weight: 600; }
.photo .tag { position: absolute; left: 32px; top: 24px; z-index: 2; background: rgba(255,255,255,.9); color: #123; padding: 6px 14px; border-radius: 999px; font-size: 16px; }
</style>

## A photo with a scrim

<div class="photo"><img src="sample:photo-wide.jpg" alt="A wide sample photograph"><span class="tag">Pill over a photo</span><span class="cap">Caption text is live text on the photo</span></div>
