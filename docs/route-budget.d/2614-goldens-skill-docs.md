studio: +1
No code changed. This PR edits two design/skills/*.md files, which the Studio loads lazily
through import.meta.glob in agent-library.ts. Their new content hashes rename the lazy
chunks, and the eager entry that names them gzips one byte larger.
