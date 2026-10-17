# Pre-merge evidence card

The agent posts this on the PR, and in the chat, before asking a person to merge.

```text
Pre-merge: <PR title>
WHAT        <one line: what actually lands>
WHY         <one line: the problem it solves>
EVIDENCE    <what was run or measured, per key claim, and on which surface>
RISK        <what breaks if this is wrong> · revert: <how it is undone>
UNVERIFIED  <caveats that bear on this decision, or "none">
CONFIDENCE  <low | medium | high | very high>: <the axis that set the floor>
            raise it by: <the one thing that would raise it, or "nothing outstanding">
```

**Confidence is the lowest of five axes, never an average:**

| Axis | Ask |
|---|---|
| Evidence | Does every key claim carry proof from the real surface, or does one rest on a proxy? |
| Reach | If this is wrong, what breaks, and how far past the diff? |
| Reversibility | Is it a one-commit revert, or has something escaped (a release, a migration)? |
| Unknowns | Does any caveat bear on the core claim? |
| Independent review | Did the review this change needed actually run? |

- **very high**: reversible, contained, real-surface proof for every key claim, no caveat
  on the core claim, and the review it needed ran.
- **high**: the same, with caveats only on neighboring surfaces.
- **medium**: a key claim rests on a proxy, or real reach with no independent review, or a
  caveat touches the core claim.
- **low**: something material is unverified, expensive to undo, or a known defect ships.
