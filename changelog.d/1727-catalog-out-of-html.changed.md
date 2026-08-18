- The Studio's component catalog is served as a static asset
  (`/studio/component-catalog.json`) and fetched after hydration, instead of being
  serialized into the page's island props. The Studio HTML document drops from
  **433KB to 188KB raw (−56%)**, and ~180KB of JSON no longer parses before the app
  can hydrate. The component NAME list stays inlined (~1KB) so the editor's inline
  validation is correct from the first frame, and a failed fetch now retries with
  backoff rather than leaving the Add-slide gallery silently empty for the session.
