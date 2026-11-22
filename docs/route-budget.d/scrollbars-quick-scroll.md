studio: +382
playground: +91
The jump-to-top / jump-to-bottom control mounts on the Studio's Compose, Source and reading panes and on the Playground's editor and preview; its 2.8KB chunk loads lazily on both routes, so what stays eager there is only the mount points. The rest of the Studio's growth is lib/wheel-sideways.ts (+637 gzip in its own chunk, partly offset by -326 in the shared React chunk), which the always-visible slide pills and slide map need so a mouse wheel scrolls them sideways (the owner's report while testing this PR).
Given back first: the Playground first imported the control eagerly (+2,830 bytes); lazy loading moved 2,749 of those out of startup.
