- An Export-to-Marp bundle whose deck ends inside markup it leaves open (a `<title>`, an `<svg>`, or a
  `<style>`) now still loads the Lattice runtime in marp-cli; before, Mermaid, the charts and every
  runtime-built layout came out bare. The export also says when a deck leaves a `<title>` open, which
  turns the slides after it into text, and the bundle's own comments no longer show up as speaker notes.
