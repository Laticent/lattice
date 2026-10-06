studio: +551
The Studio's live lint is lint-core, and it now carries compare-prose's and cycle's measured line geometry (venueCapacity.rows), the note role and corner-tag reading in `rowsAt`, and glossary's eyebrow row measured on a 4k deck (+551 B gz against main df6e3f5, as CI measures it).
Given back first: five compare-prose registers that measure the same are baked as one register's key, not five copies, and the tag title stores no geometry.
