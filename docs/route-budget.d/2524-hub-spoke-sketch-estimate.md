studio: +560
The Studio's live lint carries hub-spoke's text model (lib/core/hub-spoke-model.js), which
now holds a measured per-character advance table for the sketch face (95 entries plus a
few marks) and the word-cut check, replacing one flat 0.66em constant. The lint and the
renderer must bill the same widths, so the table ships wherever the model does.
