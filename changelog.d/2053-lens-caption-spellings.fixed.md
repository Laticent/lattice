- **Breaking:** the `captions:` prune reads every spelling YAML allows, not just a bare header with
  flat `N: text` entries. Three forms shipped a withheld slide's caption verbatim into the
  recipient's envelope, with no warning and no script required:
  - a **quoted key** (`"4": "board only"`) failed the digits-only match and survived;
  - a **block scalar** (`2: |` with an indented body) had its key line dropped and its body kept —
    which then RE-PARENTED onto the previous surviving entry, so the withheld text was spoken over a
    kept slide;
  - an **inline flow map** (`captions: { 2: "…" }`) opened no block at all, so the whole map rode out
    untouched, into the envelope AND the manifest's `config` echo.
- The auto-glossary appendix is pruned to terms a recipient can actually see. `glossaryEntries` emits
  every registry entry with a definition and never asks whether the term appears in the deck, so a
  term named on one withheld slide had its definition printed on a page that ships. An entry now
  survives only if its term or its expansion appears in the projected body; the run reports what it
  cut, by name. `--lens full` and any non-reducing view prune nothing, so an author who defines a
  term they never spell out still gets their glossary row.
