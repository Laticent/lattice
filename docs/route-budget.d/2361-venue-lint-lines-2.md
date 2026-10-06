studio: +551
playground: +1
The Studio's live lint is lint-core, and it now carries compare-prose's and cycle's measured line geometry (venueCapacity.rows), the note role and corner-tag reading in `rowsAt`, and glossary's eyebrow row measured on a 4k deck (+539 B gz against main as CI measures it; +551 measured locally against df6e3f5).
Given back first: five compare-prose registers that measure the same are baked as one register's key, not five copies, and the tag title stores no geometry.
The playground's +1 B is CI's measurement against main; the same build measured −1 B locally, so it is gzip variation on a route this PR does not change.
