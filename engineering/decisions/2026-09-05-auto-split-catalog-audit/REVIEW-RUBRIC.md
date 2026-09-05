# Auto-split catalog audit — reviewer rubric

## What you are looking at
`.scratch/asaudit/sheets2/<component>.<size>__NN.png` — contact sheets, 8 rendered
pages per sheet, 4 across × 2 down, read LEFT-TO-RIGHT then down. Each page is
labeled at the bottom with `<component> · <variant>` on the left and its page
number on the right. A page number like `2.3` means "third page of the run that
began at authored slide 2" — that is auto-split's own numbering.

`<size>` is `portrait` (1080×1350) or `square` (1080×1080).

Every deck was authored at the component's `sweet` capacity — a normal author's
slide, not a stress fixture — and every deck passes `lint:deck` with zero errors
and zero warnings. So anything that looks wrong is the ENGINE's doing, not the
author's.

## The rule the engine claims to follow
A slide holding more than one structural element becomes:

    COVER  →  BODY (one element per page)  →  CLOSING

- the COVER hoists the heading and adds a lead-in naming the first member
- each BODY page holds exactly ONE member, repeats the heading with "(cont.)",
  and carries a pill pointing at the NEXT member
- the CLOSING page carries the slide's below-note / key insight / annotation
  together, at full size, alone
- a split page carries only the page number and the k-of-N dot rail — no deck
  header, no running footer
- components that never split ring or clip instead

## What to report, per component AND size
For each `<component>.<size>` you were given, report:

1. **Structure** — is there a cover? a closing page? do body pages carry a
   forward pointer? Is anything MISSING that the rule promises?
2. **Fit** — is any page CLIPPED (text cut at an edge), overflowing, or carrying
   an overflow ring?
3. **Emptiness** — estimate the worst body page's empty fraction (how much of
   the canvas carries nothing). Say which page.
4. **Repetition** — does chrome, a legend, a key, a caption or a suffix repeat
   on every page of a run when it only needs to be said once?
5. **Variant fidelity** — the SAME content is rendered once per declared
   variant. After the split, do the variants still look DIFFERENT from each
   other, or has the split erased what the variant was for? Name the variants
   that became indistinguishable from the default.
6. **Typography / hierarchy** — is the heading on a body or closing page set at
   a sensible size, or has it been demoted to body text? Is the member's own
   type scaled for the page it now owns, or still sized as if it were one of
   five?
7. **Verdict** — one of `clean` / `needs-refinement` / `broken`, plus a
   one-sentence reason.

## House rules for your report
- Be specific: name the page number and the variant.
- Do not speculate about code. Report what you SEE.
- Do not edit any file.
- Report only what you can point at. If you did not open a sheet, say so.

## Output format
A markdown section per `<component>.<size>` using the seven headings above,
then a final `## Worst offenders` list ranking the components you reviewed by
how badly the split output falls short.
