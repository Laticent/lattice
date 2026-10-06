studio: +1024
playground: +1
The Studio's live lint carries the new `trail-budget` warning: two measured tables of how long a
word an `authority-chain trail` column holds, per venue and tier count, in the label face and the
`sketch` hand face, and the message that names the word. CI measured the Studio at +975 and +982
bytes on two runs of the same lint-core, so the line declares 1024 to cover that drift rather
than one run's number. The Playground loads lint-core outside its eager bundle and moves by a
byte either way. Nothing to give back: the tables are the measurement, and without them the
warning would guess.
