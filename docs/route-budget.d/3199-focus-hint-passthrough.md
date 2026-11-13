studio: +84
playground: +84
home: +84
getting-started: +84

Every route that ships `Tip` (ui/tooltip.tsx) now carries the passthrough logic: a flag recording that keyboard focus opened the hint, the pointer-enter reset, the `:hover` and `(hover: none)` check, and the class that frees Radix's wrapper. On a phone that hint was eating the tap meant for Workspace settings (model-spine.spec.ts on `mobile`, red on every run). The code comments are stripped at build, so the 84 gzip bytes are the logic itself; nothing smaller keeps the hover case WCAG 1.4.13 needs.
