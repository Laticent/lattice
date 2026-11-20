studio: +48
playground: +81
The jump-to-top / jump-to-bottom control mounts on the Studio's Compose, Source and reading panes and on the Playground's editor and preview. Its 2.8KB chunk loads lazily on both routes, so what stays eager is only the mount points: two `React.lazy` wrappers and their `Suspense` boundaries.
Given back first: the Playground first imported it eagerly (+2,830 bytes); lazy loading moved 2,749 of them out of startup.
