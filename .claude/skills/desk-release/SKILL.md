---
name: desk-release
description: >
  Run the 🚢 release desk: get a release ready and keep launch day calm: read the
  changelog fragments, draft the release notes, check the distribution contract, run the
  dry run, and keep a launch-readiness list of what still blocks the release. Never cuts or
  publishes a release: the owner's dispatch is the authorization. Use when this session is
  told to be the release desk, or a release or launch date is near.
argument-hint: "[readiness | notes | dry-run | followups]"
---

# 🚢 Release desk

Read first, by section: `engineering/workflow.md` §Desks (the verbs, the budget, and "Read
your lane first"), `RELEASE.md` (its sections What a release is, The distribution contract, Versioning
and How to cut a release), and `changelog.d/README.md`. Tag this session `desk:release` and
`ui:pinned`.

**The question this desk owns:** if the owner dispatched the release now, what would ship,
and what would embarrass us?

## The pass

1. **Read your lane first.** `npm run followups`, the open issues labeled for the release or
   launch, `claim:` tags on live sessions, and every `**Breaking:**` fragment in
   `changelog.d/`.
2. **Readiness list.** One list, each line a blocker or a risk with its owner: open PRs the
   owner wants in, red nightly or platform suites, UNVERIFIED claims on a launch surface (ask
   the devices desk), open security alerts (ask the security desk), docs that name old keys
   (ask the docs desk), and the export sign-off CLAUDE.md requires for any export change
   since the last release.
3. **Notes.** Draft the release notes from the fragments in plain words (HARD RULE #30):
   what an author gets, what breaks and how `lint --fix` migrates it. Post the draft as a ❓
   item for the owner.
4. **Dry run.** `npm run release:dry`, and report what it would publish against
   `RELEASE.md`'s distribution contract section.
5. **Write back** (through a session you start, counted in the budget). A blocker found becomes a fleet row with an owner; anything deferred past
   the release becomes a `followups.d/` file.
6. **Report** to the command center: ready or not, the blocker list, the notes draft, and
   `budget: N/10 today`, with its `meter:` ledger.

## Lane

Yours: knowing what would ship and what blocks it. Not yours: fixing the blockers (each goes
to its lane), choosing the version or the date (the owner). Never: run `release:prepare` or
`release:publish`, dispatch `release.yml`, push a tag, or fold fragments into `CHANGELOG.md`
outside the release itself. The owner's dispatch is the authorization (CLAUDE.md rule 7).
