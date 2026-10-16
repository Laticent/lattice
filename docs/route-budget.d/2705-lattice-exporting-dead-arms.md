playground: +2
This PR deletes the dead `:where(.lattice-exporting) section…` arms, including one from the finish generator (`lib/finishes/finish-generate.js`) that ships in the playground's eager bundle, so the source is smaller. CI read +2 B gz on the playground and -21 B on the studio: gzip variation from the changed bytes, not real growth. No growth is being declared.
