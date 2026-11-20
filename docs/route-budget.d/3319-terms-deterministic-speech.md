studio: +561
playground: +561
home: +561
Cadenza, the speech engine Present and the Studio's read-aloud run in the browser, grew by what this PR teaches the voice: the acronyms with one meaning across the five exemplar segments, the dotted abbreviations (e.g., i.e., a.m., Ph.D.), the stated-plural list, and the rules that keep an abbreviation's period from being spoken as a full stop and a declared phrase like "Oct. Tenth" in one cue. Given back first: the ambiguous-acronym table, which only the command-line linter reads, moved out of Cadenza to lib/authoring/ambiguous-terms.js; it measured 0 bytes of this chunk, so the 561 are the speech rules themselves.
