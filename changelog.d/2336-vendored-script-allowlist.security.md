- **Security: a component's sample slide may load only Lattice's own vendored scripts.** An
  empty `<script>` with any relative `src` used to pass the import gate; in the Studio that path
  resolves against the Studio's own origin. The gate (the Studio's Library import and
  `lattice packages add` alike) now allows only the vendored Mermaid, dagre and runtime builds
  and refuses any other script source. No shipped gallery or tracked deck is affected.
- **The CLI's offline render is now tested against a live proxy listener.** The resolver rule
  behind `--allow-remote`'s default also stops the browser reaching the proxy port at all, and
  a new integration arm fails if the rule is removed.
