- **Fixed: a `~~~mermaid` fence now draws its diagram in the PDF, not five lines of source.**
  CommonMark fences with tildes as well as backticks, and the live preview always rendered
  either — but the CLI substituted only the backtick form, so a tilde fence rendered in the
  preview an author was writing in and printed as raw Mermaid in the file they sent.
- **Fixed: a diagram written under a bullet, or indented at all, now renders in the PDF.** The
  export recognized a fence only at the start of a line, while the preview (and CommonMark)
  accept up to three spaces — so an indented fence drew in the Studio and printed as source.
  An indented CLOSER was worse: the fence stayed open across slide separators and the
  substitution swallowed them, exporting a three-slide deck as one page. A substitution can no
  longer span a slide boundary at all.
- **Fixed: ```` ```mermaid js ```` and other multi-word fence tags now render.** Markdown takes
  the first word of a fence's info string as its language, so the preview drew these; the
  export required the tag to be exactly `mermaid` and printed the source.
- **Fixed: a Mermaid fence commented out is no longer rendered into your speaker notes.** A
  draft diagram left inside an HTML comment was substituted anyway, putting kilobytes of SVG
  markup into the `.notes` sidecar where the author had written a note.
- **Changed: fenced code is no longer read aloud, and prose that was wrongly swallowed now
  is.** The three fence trackers behind narration were backtick-only and closed on any
  fence-looking line, so a `~~~` block's source narrated while authored prose after a nested
  code sample was silently dropped. They share one reader now. No deck's narration changes;
  17 documentation files do, 12 of them by speaking prose that had been swallowed.
