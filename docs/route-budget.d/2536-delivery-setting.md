studio: +599
Settings ▸ Speech gains a Delivery menu: the field, its help text, and the three delivery names with their front-matter parse.
Given back first: the menu reads the names from the new lib/core/delivery-names.mjs instead of resolve-delivery.mjs, so the three delivery style files stay in the lazily loaded Present chunk (the first build added 1128 bytes).
Measured +535 against `main` at f52b0b9; declared with the same 64 B noise margin as 2508.
