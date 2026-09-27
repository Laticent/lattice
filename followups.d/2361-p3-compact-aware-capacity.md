---
origin: 2361
priority: P3
recorded: 2026-09-27
---

# A capacity budget that knows `compact` — q-and-a's fifth pair clips silently without it

why now   — found by the checker on PR #2399. Since `compact` only tightens spacing, q-and-a holds
            4 pairs bare and 5 with `compact` (measured). Its manifest is sweet 4 / soft 5 / hard 5,
            so a BARE five-pair slide clips (`⚠ OVERFLOW`, "Content clipped") while `lint:deck`
            says nothing. Setting soft 4 does not fix it: the crowd rule cannot see `compact`, so
            it would also warn on the five-pair `compact` slide that fits (examples/q-and-a.md,
            which the corpus lint gate requires to be clean). Not caused by #2399: under the old
            5/6 budget a bare five-pair slide was silent too.
where     — lib/authoring/lint-core.js, the capacity loop (`capacity-crowd` / `capacity-overflow`);
            the manifest `capacity` shape in lib/components/manifest.schema.json (e.g. an optional
            `withCompact` hard, or `compact` read as raising `hard` by a measured amount);
            q-and-a and cards-stack manifests.
done when — a bare five-pair q-and-a slide gets a finding pointing at `compact` or a split, and a
            five-pair `compact` slide stays silent; both pinned by a unit test.
evidence  — the two renders (bare clips, compact fits) and the lint output for each.
verify    — tier 1 checker: it changes the shared lint kernel (#7).
