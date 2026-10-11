---
group: Build & bundle
---
Bundle the caption SPEECH PROJECTION (dompurify + lib/core/sanitize-slide-html.mjs + lib/transformers/prose-projection.mjs) as an injectable IIFE string, for the CLI export to evaluate inside the Chromium it already has open. Replaces three jsdom windows per `--captions` run; jsdom is a devDependency, so that path threw in a published install.
