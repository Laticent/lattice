---
group: Test & verify
---
Break what Segno promises, one defect at a time: 77 mutations over the LL(1) proof, the code generator, character sets, the notation reader, binding, the value readers and the spelling check, each run against Segno's whole suite (SEGNO_MUTATE=1 skips only the generated-file freshness check, so codegen mutants must die by behavior). Equivalent mutations are left out with a note. Fails on a survivor AND on a mutation that did not apply. On-demand (about fifteen minutes; a run that hangs past its deadline counts as caught).
