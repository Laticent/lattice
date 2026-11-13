studio: +170
playground: +40
home: +10
The editors' shared completion keys and the "No suggestions here" note load with the deck editor; the Studio also wires
the sample-art list and the catalog-loading signal ("Loading suggestions…") into its editor (CI against main: studio
+147, playground +32, home +6 bytes gzip).
Given back first: the TeX list, the plugin fence registry and the flowchart grammar all load on first use (the last
through the lint core the editors already load), which took this PR from +985 / +807 / +784 down to the figures above.
