# Office schemas for the conformance checks

`ISO-IEC29500-4_2016/` (the ISO/IEC 29500-4:2016 transitional XSDs for PresentationML and the parts it imports) and `mce/` (Markup
Compatibility) are the schemas published with the Office Open XML standard. `lib/export/office-conformance.js` validates every slide,
layout, master, notes part, `presentation.xml` and theme of an exported `.pptx` against `pml.xsd` with `xmllint --nonet`, so nothing
here is fetched at run time. Copied unchanged from the schema set the pptx skill ships; replace the directories wholesale to update.
