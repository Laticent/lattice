# lib/transformers — the shared transformer registry

`registry.js` holds the ordered transformer list plus `applyAllToHtml`
(engine/emulator, string) and `applyAllToDom` (runtime, live DOM). Every
other file here is a thin registry-shaped adapter around a kernel that
lives elsewhere (`lib/core/` or a component folder) — the adapter wires; 
the kernel does the work.

Rationale: `engineering/decisions/2026-05-17-shared-transformer-registry.md`
and HARD RULE #1 (render paths share one source of truth).

**Gotchas:** ordering in the registry matters (e.g. `qr-general` must run
after `split-panels`). A transformer's `applyToHtml` and `applyToDom` must
agree — they are the same transform on two substrates. All of this ships
in the browser runtime bundle, so kernels must be pure.
