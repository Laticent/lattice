---
marp: true
theme: indaco
size: 16:9
paginate: true
header: "Lattice · Palette audit"
footer: "13 themes · every token tier"
style: |
  section.blank { padding: 32px 40px; }
  section.blank h2 { margin: 0 0 8px; font-size: 22px; }
  section.blank .meta { font-size: 11px; font-weight: 400; opacity: 0.7; }
  section.blank .audit { padding: 16px; border-radius: 8px; height: 100%; box-sizing: border-box; }
  section.blank .row { display: flex; align-items: center; gap: 4px; margin: 6px 0; flex-wrap: nowrap; }
  section.blank .lbl { width: 110px; flex-shrink: 0; font-size: 10px; font-family: var(--font-mono, monospace); opacity: 0.85; }
  section.blank .sw {
    display: inline-block; width: 78px; height: 38px;
    padding: 3px 5px; box-sizing: border-box;
    font-size: 8px; line-height: 1.1; font-family: var(--font-mono, monospace);
    border: 1px solid rgba(0,0,0,0.12); border-radius: 2px;
    flex-shrink: 0; overflow: hidden;
  }
  section.blank .sw b { font-weight: 600; }
  section.blank .gap { width: 14px; flex-shrink: 0; }

  section.blank .prop { padding: 14px 18px; height: 100%; box-sizing: border-box; border-radius: 6px; }
  section.blank .head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 8px; }
  section.blank .head h2 { font-size: 18px; margin: 0; flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
  section.blank .head .rank {
    display: inline-block; font-size: 13px; font-weight: 700;
    background: rgba(0,0,0,0.12); padding: 2px 8px; border-radius: 999px;
    letter-spacing: 0.02em;
  }
  section.blank .head .score {
    font-size: 22px; font-weight: 700; margin-left: auto;
    font-family: var(--font-mono, monospace); letter-spacing: -0.01em;
  }
  section.blank .head .score-unit { font-size: 11px; font-weight: 400; opacity: 0.55; margin-left: 2px; }
  section.blank .scores { font-size: 9px; line-height: 1.4; font-family: var(--font-mono, monospace); opacity: 0.85; }
  section.blank .scores b { font-weight: 600; }
  section.blank .tier { margin: 6px 0; }
  section.blank .tier-lbl { font-size: 9px; font-family: var(--font-mono, monospace); opacity: 0.7; margin-bottom: 2px; letter-spacing: 0.04em; }
  section.blank .tier .row { display: flex; gap: 4px; margin: 2px 0; flex-wrap: nowrap; }
  section.blank .tier .sw {
    flex: 1 1 0; height: 50px; min-width: 0;
    padding: 4px 6px; box-sizing: border-box;
    font-size: 9px; line-height: 1.15; font-family: var(--font-mono, monospace);
    border-radius: 2px; overflow: hidden;
  }
  section.blank .tier .sw i { font-style: normal; opacity: 0.7; font-size: 8px; }


  section.blank .prop { padding: 14px 18px; height: 100%; box-sizing: border-box; border-radius: 6px; }
  section.blank .head { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 8px; }
  section.blank .head h2 { font-size: 18px; margin: 0; flex-shrink: 0; }
  section.blank .scores { font-size: 9px; line-height: 1.4; font-family: var(--font-mono, monospace); opacity: 0.85; }
  section.blank .scores b { font-weight: 600; }
  section.blank .tier { margin: 6px 0; }
  section.blank .tier-lbl { font-size: 9px; font-family: var(--font-mono, monospace); opacity: 0.7; margin-bottom: 2px; letter-spacing: 0.04em; }
  section.blank .tier .row { display: flex; gap: 4px; margin: 2px 0; flex-wrap: nowrap; }
  section.blank .tier .sw {
    flex: 1 1 0; height: 50px; min-width: 0;
    padding: 4px 6px; box-sizing: border-box;
    font-size: 9px; line-height: 1.15; font-family: var(--font-mono, monospace);
    border-radius: 2px; overflow: hidden;
  }
  section.blank .tier .sw i { font-style: normal; opacity: 0.7; font-size: 8px; }

---

<!-- _class: title -->

# Palette audit
## every token tier, every theme

Each slide hardcodes the resolved hex values for one palette so the swatches show *that* palette regardless of the deck's active theme.

> **⚠️ The `--cat-*` categorical proposals here are SUPERSEDED (2026-07-16, #1022).** They were
> scored under the retired "pale L≈87 / deep L≈32, fixed non-flipping ink" model; the shipped
> categorical cycle is now the **three-layer contrast contract** (`engineering/decisions/2026-07-15-categorical-token-contract.md`,
> gated by `checkCatContrast`). **Do not copy these `--cat-*` values into a new theme** — copy a
> shipped three-layer block (indaco / cuoio) and re-hue it. The chart-palette scoring here is
> unaffected and remains valid.

---

<!-- _class: blank -->

<div class="audit" style="background:#FFFFFF;color:#000">

## indaco  <span class="meta">bg #FFFFFF · accent #006FA8 · text-heading #0A1628</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#BCD5EC;color:#000"><b>band-1</b><br>#BCD5EC</span><span class="sw" style="background:#C1E4D5;color:#000"><b>band-2</b><br>#C1E4D5</span><span class="sw" style="background:#D1C5DC;color:#000"><b>band-3</b><br>#D1C5DC</span><span class="sw" style="background:#EDD1B8;color:#000"><b>band-4</b><br>#EDD1B8</span><span class="sw" style="background:#BCE3E1;color:#000"><b>band-5</b><br>#BCE3E1</span><span class="sw" style="background:#E6C1C8;color:#000"><b>band-6</b><br>#E6C1C8</span><span class="sw" style="background:#EBE2B8;color:#000"><b>band-7</b><br>#EBE2B8</span><span class="sw" style="background:#E7BEBE;color:#000"><b>band-8</b><br>#E7BEBE</span><span class="sw" style="background:#C8CFDA;color:#000"><b>band-9</b><br>#C8CFDA</span><span class="sw" style="background:#C0D5C6;color:#000"><b>band-10</b><br>#C0D5C6</span><span class="sw" style="background:#D9C7DC;color:#000"><b>band-11</b><br>#D9C7DC</span><span class="sw" style="background:#DAC8D1;color:#000"><b>band-12</b><br>#DAC8D1</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#5C9DD3;color:#FFF"><b>cat-blue</b><br>#5C9DD3</span><span class="sw" style="background:#6FB89A;color:#FFF"><b>cat-green</b><br>#6FB89A</span><span class="sw" style="background:#8E7BAF;color:#FFF"><b>cat-purple</b><br>#8E7BAF</span><span class="sw" style="background:#D4A271;color:#FFF"><b>cat-orange</b><br>#D4A271</span><span class="sw" style="background:#6BBDB8;color:#FFF"><b>cat-teal</b><br>#6BBDB8</span><span class="sw" style="background:#C57E8B;color:#FFF"><b>cat-rose</b><br>#C57E8B</span><span class="sw" style="background:#9AA8B8;color:#FFF"><b>cat-slate</b><br>#9AA8B8</span><span class="sw" style="background:#B8939F;color:#FFF"><b>cat-mauve</b><br>#B8939F</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#006FA8;color:#FFF"><b>chart-1</b><br>#006FA8</span><span class="sw" style="background:#C45D27;color:#FFF"><b>chart-2</b><br>#C45D27</span><span class="sw" style="background:#1FA694;color:#FFF"><b>chart-3</b><br>#1FA694</span><span class="sw" style="background:#B8438C;color:#FFF"><b>chart-4</b><br>#B8438C</span><span class="sw" style="background:#C8A82E;color:#FFF"><b>chart-5</b><br>#C8A82E</span><span class="sw" style="background:#3F4A60;color:#FFF"><b>chart-6</b><br>#3F4A60</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#BCD5EC;color:#000"><b>Q1 fill</b><br>#BCD5EC</span><span class="sw" style="background:#C1E4D5;color:#000"><b>Q2 fill</b><br>#C1E4D5</span><span class="sw" style="background:#EBE2B8;color:#000"><b>Q3 fill</b><br>#EBE2B8</span><span class="sw" style="background:#D1C5DC;color:#000"><b>Q4 fill</b><br>#D1C5DC</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F5E6D8;color:#000"><b>state-active</b><br>#F5E6D8</span><span class="sw" style="background:#E0E4EA;color:#000"><b>state-done</b><br>#E0E4EA</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F6C700;color:#000"><b>state-today</b><br>#F6C700</span><span class="sw" style="background:#E0E4EA;color:#000"><b>state-grid</b><br>#E0E4EA</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#1F4A6E;color:#FFF"><b>stroke</b><br>#1F4A6E</span><span class="sw" style="background:#1A1A1A;color:#FFF"><b>line</b><br>#1A1A1A</span><span class="sw" style="background:#BD5000;color:#FFF"><b>accent-warm</b><br>#BD5000</span><div class="gap"></div><span class="sw" style="background:#FFFBE6;color:#000"><b>note-bg</b><br>#FFFBE6</span><span class="sw" style="background:#F6C700;color:#000"><b>note-stroke</b><br>#F6C700</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#FAF7F2;color:#000">

## cuoio  <span class="meta">bg #FAF7F2 · accent #7A5A10 · text-heading #1E1A15</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#E6DAC8;color:#000"><b>band-1</b><br>#E6DAC8</span><span class="sw" style="background:#D5CCE1;color:#000"><b>band-2</b><br>#D5CCE1</span><span class="sw" style="background:#E1CCD9;color:#000"><b>band-3</b><br>#E1CCD9</span><span class="sw" style="background:#EBDBC1;color:#000"><b>band-4</b><br>#EBDBC1</span><span class="sw" style="background:#D1C5B3;color:#000"><b>band-5</b><br>#D1C5B3</span><span class="sw" style="background:#C7D9DC;color:#000"><b>band-6</b><br>#C7D9DC</span><span class="sw" style="background:#EDD5B8;color:#000"><b>band-7</b><br>#EDD5B8</span><span class="sw" style="background:#E3C5C5;color:#000"><b>band-8</b><br>#E3C5C5</span><span class="sw" style="background:#D7D0C6;color:#000"><b>band-9</b><br>#D7D0C6</span><span class="sw" style="background:#D2DCBD;color:#000"><b>band-10</b><br>#D2DCBD</span><span class="sw" style="background:#D2CAE1;color:#000"><b>band-11</b><br>#D2CAE1</span><span class="sw" style="background:#DDD1BD;color:#000"><b>band-12</b><br>#DDD1BD</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#7A5A10;color:#FFF"><b>cat-blue</b><br>#7A5A10</span><span class="sw" style="background:#4F4770;color:#FFF"><b>cat-green</b><br>#4F4770</span><span class="sw" style="background:#76394C;color:#FFF"><b>cat-purple</b><br>#76394C</span><span class="sw" style="background:#8A6822;color:#FFF"><b>cat-orange</b><br>#8A6822</span><span class="sw" style="background:#1F6B7C;color:#FFF"><b>cat-teal</b><br>#1F6B7C</span><span class="sw" style="background:#45734A;color:#FFF"><b>cat-rose</b><br>#45734A</span><span class="sw" style="background:#7A6B59;color:#FFF"><b>cat-slate</b><br>#7A6B59</span><span class="sw" style="background:#6E4558;color:#FFF"><b>cat-mauve</b><br>#6E4558</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#7A5A10;color:#FFF"><b>chart-1</b><br>#7A5A10</span><span class="sw" style="background:#1F6B7C;color:#FFF"><b>chart-2</b><br>#1F6B7C</span><span class="sw" style="background:#B8553A;color:#FFF"><b>chart-3</b><br>#B8553A</span><span class="sw" style="background:#45734A;color:#FFF"><b>chart-4</b><br>#45734A</span><span class="sw" style="background:#8A5E73;color:#FFF"><b>chart-5</b><br>#8A5E73</span><span class="sw" style="background:#1E1A15;color:#FFF"><b>chart-6</b><br>#1E1A15</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#E6DAC8;color:#000"><b>Q1 fill</b><br>#E6DAC8</span><span class="sw" style="background:#D5CCE1;color:#000"><b>Q2 fill</b><br>#D5CCE1</span><span class="sw" style="background:#E1CCD9;color:#000"><b>Q3 fill</b><br>#E1CCD9</span><span class="sw" style="background:#EBDBC1;color:#000"><b>Q4 fill</b><br>#EBDBC1</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#EBDBC1;color:#000"><b>state-active</b><br>#EBDBC1</span><span class="sw" style="background:#E0D8CC;color:#000"><b>state-done</b><br>#E0D8CC</span><span class="sw" style="background:#9B1C1C;color:#FFF"><b>state-critical</b><br>#9B1C1C</span><span class="sw" style="background:#7A5A10;color:#FFF"><b>state-today</b><br>#7A5A10</span><span class="sw" style="background:#E0D8CC;color:#000"><b>state-grid</b><br>#E0D8CC</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#8B7E6D;color:#FFF"><b>stroke</b><br>#8B7E6D</span><span class="sw" style="background:#6B5D4F;color:#FFF"><b>line</b><br>#6B5D4F</span><span class="sw" style="background:#7A5A10;color:#FFF"><b>accent-warm</b><br>#7A5A10</span><div class="gap"></div><span class="sw" style="background:#F5EFE0;color:#000"><b>note-bg</b><br>#F5EFE0</span><span class="sw" style="background:#7A5A10;color:#FFF"><b>note-stroke</b><br>#7A5A10</span><span class="sw" style="background:#9B1C1C;color:#FFF"><b>error-bg</b><br>#9B1C1C</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#F5EFD8;color:#000">

## mustard  <span class="meta">bg #F5EFD8 · accent #8C6A18 · text-heading #2A1A06</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#E8D580;color:#000"><b>band-1</b><br>#E8D580</span><span class="sw" style="background:#D8E5D5;color:#000"><b>band-2</b><br>#D8E5D5</span><span class="sw" style="background:#F0D8CC;color:#000"><b>band-3</b><br>#F0D8CC</span><span class="sw" style="background:#F5E5A8;color:#000"><b>band-4</b><br>#F5E5A8</span><span class="sw" style="background:#F0E5C8;color:#000"><b>band-5</b><br>#F0E5C8</span><span class="sw" style="background:#F0E8C0;color:#000"><b>band-6</b><br>#F0E8C0</span><span class="sw" style="background:#F0E8D0;color:#000"><b>band-7</b><br>#F0E8D0</span><span class="sw" style="background:#EDD5C8;color:#000"><b>band-8</b><br>#EDD5C8</span><span class="sw" style="background:#E0D8C5;color:#000"><b>band-9</b><br>#E0D8C5</span><span class="sw" style="background:#D8E0CC;color:#000"><b>band-10</b><br>#D8E0CC</span><span class="sw" style="background:#E5E0C8;color:#000"><b>band-11</b><br>#E5E0C8</span><span class="sw" style="background:#E8D580;color:#000"><b>band-12</b><br>#E8D580</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#786010;color:#FFF"><b>cat-blue</b><br>#786010</span><span class="sw" style="background:#385848;color:#FFF"><b>cat-green</b><br>#385848</span><span class="sw" style="background:#804838;color:#FFF"><b>cat-purple</b><br>#804838</span><span class="sw" style="background:#906818;color:#FFF"><b>cat-orange</b><br>#906818</span><span class="sw" style="background:#305848;color:#FFF"><b>cat-teal</b><br>#305848</span><span class="sw" style="background:#581A10;color:#FFF"><b>cat-rose</b><br>#581A10</span><span class="sw" style="background:#685040;color:#FFF"><b>cat-slate</b><br>#685040</span><span class="sw" style="background:#6E4558;color:#FFF"><b>cat-mauve</b><br>#6E4558</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#8C6A18;color:#FFF"><b>chart-1</b><br>#8C6A18</span><span class="sw" style="background:#6E2A1F;color:#FFF"><b>chart-2</b><br>#6E2A1F</span><span class="sw" style="background:#1F6B7C;color:#FFF"><b>chart-3</b><br>#1F6B7C</span><span class="sw" style="background:#4D5E8A;color:#FFF"><b>chart-4</b><br>#4D5E8A</span><span class="sw" style="background:#6B7530;color:#FFF"><b>chart-5</b><br>#6B7530</span><span class="sw" style="background:#0F0A03;color:#FFF"><b>chart-6</b><br>#0F0A03</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#E8D580;color:#000"><b>Q1 fill</b><br>#E8D580</span><span class="sw" style="background:#D8E5D5;color:#000"><b>Q2 fill</b><br>#D8E5D5</span><span class="sw" style="background:#F0D8CC;color:#000"><b>Q3 fill</b><br>#F0D8CC</span><span class="sw" style="background:#F5E5A8;color:#000"><b>Q4 fill</b><br>#F5E5A8</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F5E5A8;color:#000"><b>state-active</b><br>#F5E5A8</span><span class="sw" style="background:#E0D8C5;color:#000"><b>state-done</b><br>#E0D8C5</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F0E8D0;color:#000"><b>state-today</b><br>#F0E8D0</span><span class="sw" style="background:#D5C896;color:#000"><b>state-grid</b><br>#D5C896</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#3D2D14;color:#FFF"><b>stroke</b><br>#3D2D14</span><span class="sw" style="background:#2A1A06;color:#FFF"><b>line</b><br>#2A1A06</span><span class="sw" style="background:#6E2A1F;color:#FFF"><b>accent-warm</b><br>#6E2A1F</span><div class="gap"></div><span class="sw" style="background:#F0E8D0;color:#000"><b>note-bg</b><br>#F0E8D0</span><span class="sw" style="background:#2A1A06;color:#FFF"><b>note-stroke</b><br>#2A1A06</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#F8F2E5;color:#000">

## laguna  <span class="meta">bg #F8F2E5 · accent #006D77 · text-heading #0E2F33</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#D2E8EA;color:#000"><b>band-1</b><br>#D2E8EA</span><span class="sw" style="background:#F4DBD0;color:#000"><b>band-2</b><br>#F4DBD0</span><span class="sw" style="background:#ADCED2;color:#000"><b>band-3</b><br>#ADCED2</span><span class="sw" style="background:#E5C0AE;color:#000"><b>band-4</b><br>#E5C0AE</span><span class="sw" style="background:#CBE0E0;color:#000"><b>band-5</b><br>#CBE0E0</span><span class="sw" style="background:#F8E8D8;color:#000"><b>band-6</b><br>#F8E8D8</span><span class="sw" style="background:#F2E5C0;color:#000"><b>band-7</b><br>#F2E5C0</span><span class="sw" style="background:#F5D8CC;color:#000"><b>band-8</b><br>#F5D8CC</span><span class="sw" style="background:#D8E5E8;color:#000"><b>band-9</b><br>#D8E5E8</span><span class="sw" style="background:#D8E0D5;color:#000"><b>band-10</b><br>#D8E0D5</span><span class="sw" style="background:#DCE6E8;color:#000"><b>band-11</b><br>#DCE6E8</span><span class="sw" style="background:#D2E8EA;color:#000"><b>band-12</b><br>#D2E8EA</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#286870;color:#FFF"><b>cat-blue</b><br>#286870</span><span class="sw" style="background:#A85E40;color:#FFF"><b>cat-green</b><br>#A85E40</span><span class="sw" style="background:#7A8430;color:#FFF"><b>cat-purple</b><br>#7A8430</span><span class="sw" style="background:#A07810;color:#FFF"><b>cat-orange</b><br>#A07810</span><span class="sw" style="background:#387860;color:#FFF"><b>cat-teal</b><br>#387860</span><span class="sw" style="background:#A07860;color:#FFF"><b>cat-rose</b><br>#A07860</span><span class="sw" style="background:#3A6070;color:#FFF"><b>cat-slate</b><br>#3A6070</span><span class="sw" style="background:#807060;color:#FFF"><b>cat-mauve</b><br>#807060</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#006D77;color:#FFF"><b>chart-1</b><br>#006D77</span><span class="sw" style="background:#E29578;color:#FFF"><b>chart-2</b><br>#E29578</span><span class="sw" style="background:#C49526;color:#FFF"><b>chart-3</b><br>#C49526</span><span class="sw" style="background:#2D4D6B;color:#FFF"><b>chart-4</b><br>#2D4D6B</span><span class="sw" style="background:#7A8F7E;color:#FFF"><b>chart-5</b><br>#7A8F7E</span><span class="sw" style="background:#04181B;color:#FFF"><b>chart-6</b><br>#04181B</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#D2E8EA;color:#000"><b>Q1 fill</b><br>#D2E8EA</span><span class="sw" style="background:#F4DBD0;color:#000"><b>Q2 fill</b><br>#F4DBD0</span><span class="sw" style="background:#F2E5C0;color:#000"><b>Q3 fill</b><br>#F2E5C0</span><span class="sw" style="background:#ADCED2;color:#000"><b>Q4 fill</b><br>#ADCED2</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#E5C0AE;color:#000"><b>state-active</b><br>#E5C0AE</span><span class="sw" style="background:#D8E5E8;color:#000"><b>state-done</b><br>#D8E5E8</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F2E5C0;color:#000"><b>state-today</b><br>#F2E5C0</span><span class="sw" style="background:#DBCFB2;color:#000"><b>state-grid</b><br>#DBCFB2</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#0F2D31;color:#FFF"><b>stroke</b><br>#0F2D31</span><span class="sw" style="background:#0E2F33;color:#FFF"><b>line</b><br>#0E2F33</span><span class="sw" style="background:#E29578;color:#FFF"><b>accent-warm</b><br>#E29578</span><div class="gap"></div><span class="sw" style="background:#F2E5C0;color:#000"><b>note-bg</b><br>#F2E5C0</span><span class="sw" style="background:#0E2F33;color:#FFF"><b>note-stroke</b><br>#0E2F33</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#F8F2E5;color:#000">

## burgundy  <span class="meta">bg #F8F2E5 · accent #742532 · text-heading #2A1015</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#EAD4D8;color:#000"><b>band-1</b><br>#EAD4D8</span><span class="sw" style="background:#F0E2CE;color:#000"><b>band-2</b><br>#F0E2CE</span><span class="sw" style="background:#D2B5BD;color:#FFF"><b>band-3</b><br>#D2B5BD</span><span class="sw" style="background:#E2CAA8;color:#000"><b>band-4</b><br>#E2CAA8</span><span class="sw" style="background:#D5E0E5;color:#000"><b>band-5</b><br>#D5E0E5</span><span class="sw" style="background:#F0D4D8;color:#000"><b>band-6</b><br>#F0D4D8</span><span class="sw" style="background:#F0E8C8;color:#000"><b>band-7</b><br>#F0E8C8</span><span class="sw" style="background:#F0CCCC;color:#000"><b>band-8</b><br>#F0CCCC</span><span class="sw" style="background:#E0D5D8;color:#000"><b>band-9</b><br>#E0D5D8</span><span class="sw" style="background:#D8E0D5;color:#000"><b>band-10</b><br>#D8E0D5</span><span class="sw" style="background:#E5D0E8;color:#000"><b>band-11</b><br>#E5D0E8</span><span class="sw" style="background:#EAD4D8;color:#000"><b>band-12</b><br>#EAD4D8</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#7A2230;color:#FFF"><b>cat-blue</b><br>#7A2230</span><span class="sw" style="background:#8A6E38;color:#FFF"><b>cat-green</b><br>#8A6E38</span><span class="sw" style="background:#582888;color:#FFF"><b>cat-purple</b><br>#582888</span><span class="sw" style="background:#804838;color:#FFF"><b>cat-orange</b><br>#804838</span><span class="sw" style="background:#385878;color:#FFF"><b>cat-teal</b><br>#385878</span><span class="sw" style="background:#4A6B3A;color:#FFF"><b>cat-rose</b><br>#4A6B3A</span><span class="sw" style="background:#585070;color:#FFF"><b>cat-slate</b><br>#585070</span><span class="sw" style="background:#6E4558;color:#FFF"><b>cat-mauve</b><br>#6E4558</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#742532;color:#FFF"><b>chart-1</b><br>#742532</span><span class="sw" style="background:#B8995E;color:#FFF"><b>chart-2</b><br>#B8995E</span><span class="sw" style="background:#1F5C50;color:#FFF"><b>chart-3</b><br>#1F5C50</span><span class="sw" style="background:#7B4F9C;color:#FFF"><b>chart-4</b><br>#7B4F9C</span><span class="sw" style="background:#8FA070;color:#FFF"><b>chart-5</b><br>#8FA070</span><span class="sw" style="background:#3F2D14;color:#FFF"><b>chart-6</b><br>#3F2D14</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#EAD4D8;color:#000"><b>Q1 fill</b><br>#EAD4D8</span><span class="sw" style="background:#F0E2CE;color:#000"><b>Q2 fill</b><br>#F0E2CE</span><span class="sw" style="background:#D5E0E5;color:#000"><b>Q3 fill</b><br>#D5E0E5</span><span class="sw" style="background:#D2B5BD;color:#FFF"><b>Q4 fill</b><br>#D2B5BD</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#E2CAA8;color:#000"><b>state-active</b><br>#E2CAA8</span><span class="sw" style="background:#E0D5D8;color:#000"><b>state-done</b><br>#E0D5D8</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F0E8C8;color:#000"><b>state-today</b><br>#F0E8C8</span><span class="sw" style="background:#DBCEAE;color:#000"><b>state-grid</b><br>#DBCEAE</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#48202A;color:#FFF"><b>stroke</b><br>#48202A</span><span class="sw" style="background:#2A1015;color:#FFF"><b>line</b><br>#2A1015</span><span class="sw" style="background:#B8995E;color:#FFF"><b>accent-warm</b><br>#B8995E</span><div class="gap"></div><span class="sw" style="background:#F0E8C8;color:#000"><b>note-bg</b><br>#F0E8C8</span><span class="sw" style="background:#2A1015;color:#FFF"><b>note-stroke</b><br>#2A1015</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#FAF8FC;color:#000">

## crepuscolo  <span class="meta">bg #FAF8FC · accent #5B3D8C · text-heading #150F22</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#E5DEEB;color:#000"><b>band-1</b><br>#E5DEEB</span><span class="sw" style="background:#DDEAE5;color:#000"><b>band-2</b><br>#DDEAE5</span><span class="sw" style="background:#C8B8D2;color:#FFF"><b>band-3</b><br>#C8B8D2</span><span class="sw" style="background:#F5E8C8;color:#000"><b>band-4</b><br>#F5E8C8</span><span class="sw" style="background:#D8EEF3;color:#000"><b>band-5</b><br>#D8EEF3</span><span class="sw" style="background:#EDE3E8;color:#000"><b>band-6</b><br>#EDE3E8</span><span class="sw" style="background:#F3EDD0;color:#000"><b>band-7</b><br>#F3EDD0</span><span class="sw" style="background:#F3DDE0;color:#000"><b>band-8</b><br>#F3DDE0</span><span class="sw" style="background:#D8D5E5;color:#000"><b>band-9</b><br>#D8D5E5</span><span class="sw" style="background:#DDE9E6;color:#000"><b>band-10</b><br>#DDE9E6</span><span class="sw" style="background:#E0D8EC;color:#000"><b>band-11</b><br>#E0D8EC</span><span class="sw" style="background:#E5DEEB;color:#000"><b>band-12</b><br>#E5DEEB</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#7B5B9E;color:#FFF"><b>cat-blue</b><br>#7B5B9E</span><span class="sw" style="background:#5C7848;color:#FFF"><b>cat-green</b><br>#5C7848</span><span class="sw" style="background:#9C7810;color:#FFF"><b>cat-purple</b><br>#9C7810</span><span class="sw" style="background:#A45840;color:#FFF"><b>cat-orange</b><br>#A45840</span><span class="sw" style="background:#3E7A8A;color:#FFF"><b>cat-teal</b><br>#3E7A8A</span><span class="sw" style="background:#8E6070;color:#FFF"><b>cat-rose</b><br>#8E6070</span><span class="sw" style="background:#6A5880;color:#FFF"><b>cat-slate</b><br>#6A5880</span><span class="sw" style="background:#876B5A;color:#FFF"><b>cat-mauve</b><br>#876B5A</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#5B3D8C;color:#FFF"><b>chart-1</b><br>#5B3D8C</span><span class="sw" style="background:#C49526;color:#FFF"><b>chart-2</b><br>#C49526</span><span class="sw" style="background:#1B7B92;color:#FFF"><b>chart-3</b><br>#1B7B92</span><span class="sw" style="background:#C66045;color:#FFF"><b>chart-4</b><br>#C66045</span><span class="sw" style="background:#8E7A93;color:#FFF"><b>chart-5</b><br>#8E7A93</span><span class="sw" style="background:#150F22;color:#FFF"><b>chart-6</b><br>#150F22</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#E5DEEB;color:#000"><b>Q1 fill</b><br>#E5DEEB</span><span class="sw" style="background:#DDEAE5;color:#000"><b>Q2 fill</b><br>#DDEAE5</span><span class="sw" style="background:#F3EDD0;color:#000"><b>Q3 fill</b><br>#F3EDD0</span><span class="sw" style="background:#C8B8D2;color:#FFF"><b>Q4 fill</b><br>#C8B8D2</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F5E8C8;color:#000"><b>state-active</b><br>#F5E8C8</span><span class="sw" style="background:#D8D5E5;color:#000"><b>state-done</b><br>#D8D5E5</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F3EDD0;color:#000"><b>state-today</b><br>#F3EDD0</span><span class="sw" style="background:#DCD4E8;color:#000"><b>state-grid</b><br>#DCD4E8</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#3F2A5C;color:#FFF"><b>stroke</b><br>#3F2A5C</span><span class="sw" style="background:#150F22;color:#FFF"><b>line</b><br>#150F22</span><span class="sw" style="background:#BD5000;color:#FFF"><b>accent-warm</b><br>#BD5000</span><div class="gap"></div><span class="sw" style="background:#F3EDD0;color:#000"><b>note-bg</b><br>#F3EDD0</span><span class="sw" style="background:#150F22;color:#FFF"><b>note-stroke</b><br>#150F22</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#F2F5F7;color:#000">

## brina  <span class="meta">bg #F2F5F7 · accent #3D6A82 · text-heading #1A2330</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#DAE6EE;color:#000"><b>band-1</b><br>#DAE6EE</span><span class="sw" style="background:#F2E5D5;color:#000"><b>band-2</b><br>#F2E5D5</span><span class="sw" style="background:#E8E0EE;color:#000"><b>band-3</b><br>#E8E0EE</span><span class="sw" style="background:#E5EAF0;color:#000"><b>band-4</b><br>#E5EAF0</span><span class="sw" style="background:#D0E5E8;color:#000"><b>band-5</b><br>#D0E5E8</span><span class="sw" style="background:#B5CDDA;color:#000"><b>band-6</b><br>#B5CDDA</span><span class="sw" style="background:#F0ECD5;color:#000"><b>band-7</b><br>#F0ECD5</span><span class="sw" style="background:#F0DDE0;color:#000"><b>band-8</b><br>#F0DDE0</span><span class="sw" style="background:#D8E0EA;color:#000"><b>band-9</b><br>#D8E0EA</span><span class="sw" style="background:#D5E5E8;color:#000"><b>band-10</b><br>#D5E5E8</span><span class="sw" style="background:#E0D8EC;color:#000"><b>band-11</b><br>#E0D8EC</span><span class="sw" style="background:#DAE6EE;color:#000"><b>band-12</b><br>#DAE6EE</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#3E687C;color:#FFF"><b>cat-blue</b><br>#3E687C</span><span class="sw" style="background:#8A6E48;color:#FFF"><b>cat-green</b><br>#8A6E48</span><span class="sw" style="background:#5A6080;color:#FFF"><b>cat-purple</b><br>#5A6080</span><span class="sw" style="background:#8B354C;color:#FFF"><b>cat-orange</b><br>#8B354C</span><span class="sw" style="background:#3A7888;color:#FFF"><b>cat-teal</b><br>#3A7888</span><span class="sw" style="background:#7E7390;color:#FFF"><b>cat-rose</b><br>#7E7390</span><span class="sw" style="background:#506080;color:#FFF"><b>cat-slate</b><br>#506080</span><span class="sw" style="background:#707080;color:#FFF"><b>cat-mauve</b><br>#707080</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#3D6A82;color:#FFF"><b>chart-1</b><br>#3D6A82</span><span class="sw" style="background:#B5895E;color:#FFF"><b>chart-2</b><br>#B5895E</span><span class="sw" style="background:#4D958F;color:#FFF"><b>chart-3</b><br>#4D958F</span><span class="sw" style="background:#8B354C;color:#FFF"><b>chart-4</b><br>#8B354C</span><span class="sw" style="background:#7E7390;color:#FFF"><b>chart-5</b><br>#7E7390</span><span class="sw" style="background:#0C141C;color:#FFF"><b>chart-6</b><br>#0C141C</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#DAE6EE;color:#000"><b>Q1 fill</b><br>#DAE6EE</span><span class="sw" style="background:#F2E5D5;color:#000"><b>Q2 fill</b><br>#F2E5D5</span><span class="sw" style="background:#E8E0EE;color:#000"><b>Q3 fill</b><br>#E8E0EE</span><span class="sw" style="background:#E5EAF0;color:#000"><b>Q4 fill</b><br>#E5EAF0</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F2E5D5;color:#000"><b>state-active</b><br>#F2E5D5</span><span class="sw" style="background:#D8E0EA;color:#000"><b>state-done</b><br>#D8E0EA</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F0ECD5;color:#000"><b>state-today</b><br>#F0ECD5</span><span class="sw" style="background:#D2DBE2;color:#000"><b>state-grid</b><br>#D2DBE2</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#1E2A38;color:#FFF"><b>stroke</b><br>#1E2A38</span><span class="sw" style="background:#1A2330;color:#FFF"><b>line</b><br>#1A2330</span><span class="sw" style="background:#BD5000;color:#FFF"><b>accent-warm</b><br>#BD5000</span><div class="gap"></div><span class="sw" style="background:#F0ECD5;color:#000"><b>note-bg</b><br>#F0ECD5</span><span class="sw" style="background:#1A2330;color:#FFF"><b>note-stroke</b><br>#1A2330</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#FCF8F5;color:#000">

## magnolia  <span class="meta">bg #FCF8F5 · accent #A04A55 · text-heading #1F0A0F</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#F5DDD8;color:#000"><b>band-1</b><br>#F5DDD8</span><span class="sw" style="background:#EFD5C9;color:#000"><b>band-2</b><br>#EFD5C9</span><span class="sw" style="background:#D8E8DC;color:#000"><b>band-3</b><br>#D8E8DC</span><span class="sw" style="background:#F0DBBF;color:#000"><b>band-4</b><br>#F0DBBF</span><span class="sw" style="background:#E5BFB8;color:#000"><b>band-5</b><br>#E5BFB8</span><span class="sw" style="background:#DCBAA8;color:#FFF"><b>band-6</b><br>#DCBAA8</span><span class="sw" style="background:#F5EDCC;color:#000"><b>band-7</b><br>#F5EDCC</span><span class="sw" style="background:#F2D2D0;color:#000"><b>band-8</b><br>#F2D2D0</span><span class="sw" style="background:#E0D8E0;color:#000"><b>band-9</b><br>#E0D8E0</span><span class="sw" style="background:#D5E5D8;color:#000"><b>band-10</b><br>#D5E5D8</span><span class="sw" style="background:#EAD8E5;color:#000"><b>band-11</b><br>#EAD8E5</span><span class="sw" style="background:#F5DDD8;color:#000"><b>band-12</b><br>#F5DDD8</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#A06070;color:#FFF"><b>cat-blue</b><br>#A06070</span><span class="sw" style="background:#B85D5D;color:#FFF"><b>cat-green</b><br>#B85D5D</span><span class="sw" style="background:#587848;color:#FFF"><b>cat-purple</b><br>#587848</span><span class="sw" style="background:#9C6E40;color:#FFF"><b>cat-orange</b><br>#9C6E40</span><span class="sw" style="background:#487A68;color:#FFF"><b>cat-teal</b><br>#487A68</span><span class="sw" style="background:#805880;color:#FFF"><b>cat-rose</b><br>#805880</span><span class="sw" style="background:#6A7880;color:#FFF"><b>cat-slate</b><br>#6A7880</span><span class="sw" style="background:#886070;color:#FFF"><b>cat-mauve</b><br>#886070</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#A04A55;color:#FFF"><b>chart-1</b><br>#A04A55</span><span class="sw" style="background:#758C6E;color:#FFF"><b>chart-2</b><br>#758C6E</span><span class="sw" style="background:#4A8590;color:#FFF"><b>chart-3</b><br>#4A8590</span><span class="sw" style="background:#C49526;color:#FFF"><b>chart-4</b><br>#C49526</span><span class="sw" style="background:#8B6E8C;color:#FFF"><b>chart-5</b><br>#8B6E8C</span><span class="sw" style="background:#1F0A0F;color:#FFF"><b>chart-6</b><br>#1F0A0F</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#F5DDD8;color:#000"><b>Q1 fill</b><br>#F5DDD8</span><span class="sw" style="background:#EFD5C9;color:#000"><b>Q2 fill</b><br>#EFD5C9</span><span class="sw" style="background:#D8E8DC;color:#000"><b>Q3 fill</b><br>#D8E8DC</span><span class="sw" style="background:#F0DBBF;color:#000"><b>Q4 fill</b><br>#F0DBBF</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F0DBBF;color:#000"><b>state-active</b><br>#F0DBBF</span><span class="sw" style="background:#E0D8E0;color:#000"><b>state-done</b><br>#E0D8E0</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F5EDCC;color:#000"><b>state-today</b><br>#F5EDCC</span><span class="sw" style="background:#E8D2CD;color:#000"><b>state-grid</b><br>#E8D2CD</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#5A2530;color:#FFF"><b>stroke</b><br>#5A2530</span><span class="sw" style="background:#1F0A0F;color:#FFF"><b>line</b><br>#1F0A0F</span><span class="sw" style="background:#BD5000;color:#FFF"><b>accent-warm</b><br>#BD5000</span><div class="gap"></div><span class="sw" style="background:#F5EDCC;color:#000"><b>note-bg</b><br>#F5EDCC</span><span class="sw" style="background:#1F0A0F;color:#FFF"><b>note-stroke</b><br>#1F0A0F</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#F0EDE6;color:#000">

## atelier  <span class="meta">bg #F0EDE6 · accent #1A1A18 · text-heading #1A1A18</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#E5E0D2;color:#000"><b>band-1</b><br>#E5E0D2</span><span class="sw" style="background:#E8D8B0;color:#000"><b>band-2</b><br>#E8D8B0</span><span class="sw" style="background:#D5DDD5;color:#000"><b>band-3</b><br>#D5DDD5</span><span class="sw" style="background:#DBD5C0;color:#000"><b>band-4</b><br>#DBD5C0</span><span class="sw" style="background:#C5BFA5;color:#FFF"><b>band-5</b><br>#C5BFA5</span><span class="sw" style="background:#EDE0D8;color:#000"><b>band-6</b><br>#EDE0D8</span><span class="sw" style="background:#E8E0B8;color:#000"><b>band-7</b><br>#E8E0B8</span><span class="sw" style="background:#EDD8CC;color:#000"><b>band-8</b><br>#EDD8CC</span><span class="sw" style="background:#D5D5CC;color:#000"><b>band-9</b><br>#D5D5CC</span><span class="sw" style="background:#D8DDD0;color:#000"><b>band-10</b><br>#D8DDD0</span><span class="sw" style="background:#E0D8E5;color:#000"><b>band-11</b><br>#E0D8E5</span><span class="sw" style="background:#E5E0D2;color:#000"><b>band-12</b><br>#E5E0D2</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#5A5048;color:#FFF"><b>cat-blue</b><br>#5A5048</span><span class="sw" style="background:#906838;color:#FFF"><b>cat-green</b><br>#906838</span><span class="sw" style="background:#706860;color:#FFF"><b>cat-purple</b><br>#706860</span><span class="sw" style="background:#A08860;color:#FFF"><b>cat-orange</b><br>#A08860</span><span class="sw" style="background:#807870;color:#FFF"><b>cat-teal</b><br>#807870</span><span class="sw" style="background:#908078;color:#FFF"><b>cat-rose</b><br>#908078</span><span class="sw" style="background:#585048;color:#FFF"><b>cat-slate</b><br>#585048</span><span class="sw" style="background:#908878;color:#FFF"><b>cat-mauve</b><br>#908878</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#1A1A18;color:#FFF"><b>chart-1</b><br>#1A1A18</span><span class="sw" style="background:#6B4F28;color:#FFF"><b>chart-2</b><br>#6B4F28</span><span class="sw" style="background:#4D6B7C;color:#FFF"><b>chart-3</b><br>#4D6B7C</span><span class="sw" style="background:#8B5A6B;color:#FFF"><b>chart-4</b><br>#8B5A6B</span><span class="sw" style="background:#6E7B5C;color:#FFF"><b>chart-5</b><br>#6E7B5C</span><span class="sw" style="background:#4F4838;color:#FFF"><b>chart-6</b><br>#4F4838</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#E5E0D2;color:#000"><b>Q1 fill</b><br>#E5E0D2</span><span class="sw" style="background:#E8D8B0;color:#000"><b>Q2 fill</b><br>#E8D8B0</span><span class="sw" style="background:#D5DDD5;color:#000"><b>Q3 fill</b><br>#D5DDD5</span><span class="sw" style="background:#DBD5C0;color:#000"><b>Q4 fill</b><br>#DBD5C0</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#E8D8B0;color:#000"><b>state-active</b><br>#E8D8B0</span><span class="sw" style="background:#D5D5CC;color:#000"><b>state-done</b><br>#D5D5CC</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#E8E0B8;color:#000"><b>state-today</b><br>#E8E0B8</span><span class="sw" style="background:#C8C0A8;color:#FFF"><b>state-grid</b><br>#C8C0A8</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#38332A;color:#FFF"><b>stroke</b><br>#38332A</span><span class="sw" style="background:#1A1A18;color:#FFF"><b>line</b><br>#1A1A18</span><span class="sw" style="background:#6B4F28;color:#FFF"><b>accent-warm</b><br>#6B4F28</span><div class="gap"></div><span class="sw" style="background:#E8E0B8;color:#000"><b>note-bg</b><br>#E8E0B8</span><span class="sw" style="background:#1A1A18;color:#FFF"><b>note-stroke</b><br>#1A1A18</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#FAFAF9;color:#000">

## ardesia  <span class="meta">bg #FAFAF9 · accent #1F1F1F · text-heading #0A0A0A</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#E8E8E7;color:#000"><b>band-1</b><br>#E8E8E7</span><span class="sw" style="background:#F0E8D0;color:#000"><b>band-2</b><br>#F0E8D0</span><span class="sw" style="background:#D8E0E0;color:#000"><b>band-3</b><br>#D8E0E0</span><span class="sw" style="background:#DCDCDB;color:#000"><b>band-4</b><br>#DCDCDB</span><span class="sw" style="background:#C8C8C5;color:#000"><b>band-5</b><br>#C8C8C5</span><span class="sw" style="background:#EDE5E2;color:#000"><b>band-6</b><br>#EDE5E2</span><span class="sw" style="background:#F0EDD5;color:#000"><b>band-7</b><br>#F0EDD5</span><span class="sw" style="background:#EEE0DC;color:#000"><b>band-8</b><br>#EEE0DC</span><span class="sw" style="background:#DCDCDB;color:#000"><b>band-9</b><br>#DCDCDB</span><span class="sw" style="background:#D8E0D8;color:#000"><b>band-10</b><br>#D8E0D8</span><span class="sw" style="background:#E5E0EC;color:#000"><b>band-11</b><br>#E5E0EC</span><span class="sw" style="background:#E8E8E7;color:#000"><b>band-12</b><br>#E8E8E7</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#4E4E48;color:#FFF"><b>cat-blue</b><br>#4E4E48</span><span class="sw" style="background:#A8946A;color:#FFF"><b>cat-green</b><br>#A8946A</span><span class="sw" style="background:#787870;color:#FFF"><b>cat-purple</b><br>#787870</span><span class="sw" style="background:#343430;color:#FFF"><b>cat-orange</b><br>#343430</span><span class="sw" style="background:#626260;color:#FFF"><b>cat-teal</b><br>#626260</span><span class="sw" style="background:#9A9A92;color:#FFF"><b>cat-rose</b><br>#9A9A92</span><span class="sw" style="background:#525250;color:#FFF"><b>cat-slate</b><br>#525250</span><span class="sw" style="background:#8A8A80;color:#FFF"><b>cat-mauve</b><br>#8A8A80</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#1F1F1F;color:#FFF"><b>chart-1</b><br>#1F1F1F</span><span class="sw" style="background:#C8B89A;color:#FFF"><b>chart-2</b><br>#C8B89A</span><span class="sw" style="background:#4A6B82;color:#FFF"><b>chart-3</b><br>#4A6B82</span><span class="sw" style="background:#8A5560;color:#FFF"><b>chart-4</b><br>#8A5560</span><span class="sw" style="background:#6B7E5E;color:#FFF"><b>chart-5</b><br>#6B7E5E</span><span class="sw" style="background:#525250;color:#FFF"><b>chart-6</b><br>#525250</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#E8E8E7;color:#000"><b>Q1 fill</b><br>#E8E8E7</span><span class="sw" style="background:#F0E8D0;color:#000"><b>Q2 fill</b><br>#F0E8D0</span><span class="sw" style="background:#D8E0E0;color:#000"><b>Q3 fill</b><br>#D8E0E0</span><span class="sw" style="background:#DCDCDB;color:#000"><b>Q4 fill</b><br>#DCDCDB</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#F0E8D0;color:#000"><b>state-active</b><br>#F0E8D0</span><span class="sw" style="background:#DCDCDB;color:#000"><b>state-done</b><br>#DCDCDB</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F0EDD5;color:#000"><b>state-today</b><br>#F0EDD5</span><span class="sw" style="background:#DCDCDB;color:#000"><b>state-grid</b><br>#DCDCDB</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#2A2A2A;color:#FFF"><b>stroke</b><br>#2A2A2A</span><span class="sw" style="background:#0A0A0A;color:#FFF"><b>line</b><br>#0A0A0A</span><span class="sw" style="background:#C8B89A;color:#FFF"><b>accent-warm</b><br>#C8B89A</span><div class="gap"></div><span class="sw" style="background:#F0EDD5;color:#000"><b>note-bg</b><br>#F0EDD5</span><span class="sw" style="background:#0A0A0A;color:#FFF"><b>note-stroke</b><br>#0A0A0A</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#B8B8B5;color:#FFF">

## concrete  <span class="meta">bg #B8B8B5 · accent #0F0F0E · text-heading #0F0F0E</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#D5D5D2;color:#000"><b>band-1</b><br>#D5D5D2</span><span class="sw" style="background:#E8D8D0;color:#000"><b>band-2</b><br>#E8D8D0</span><span class="sw" style="background:#D8D5E0;color:#000"><b>band-3</b><br>#D8D5E0</span><span class="sw" style="background:#ECECE8;color:#000"><b>band-4</b><br>#ECECE8</span><span class="sw" style="background:#CCCCCA;color:#000"><b>band-5</b><br>#CCCCCA</span><span class="sw" style="background:#E8D8D5;color:#000"><b>band-6</b><br>#E8D8D5</span><span class="sw" style="background:#E8E5D8;color:#000"><b>band-7</b><br>#E8E5D8</span><span class="sw" style="background:#E5D0D0;color:#000"><b>band-8</b><br>#E5D0D0</span><span class="sw" style="background:#D5D5CE;color:#000"><b>band-9</b><br>#D5D5CE</span><span class="sw" style="background:#D8DDD5;color:#000"><b>band-10</b><br>#D8DDD5</span><span class="sw" style="background:#B5B5B0;color:#FFF"><b>band-11</b><br>#B5B5B0</span><span class="sw" style="background:#D5D5D2;color:#000"><b>band-12</b><br>#D5D5D2</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#585856;color:#FFF"><b>cat-blue</b><br>#585856</span><span class="sw" style="background:#921E1E;color:#FFF"><b>cat-green</b><br>#921E1E</span><span class="sw" style="background:#787876;color:#FFF"><b>cat-purple</b><br>#787876</span><span class="sw" style="background:#404040;color:#FFF"><b>cat-orange</b><br>#404040</span><span class="sw" style="background:#686866;color:#FFF"><b>cat-teal</b><br>#686866</span><span class="sw" style="background:#9E9E9C;color:#FFF"><b>cat-rose</b><br>#9E9E9C</span><span class="sw" style="background:#505050;color:#FFF"><b>cat-slate</b><br>#505050</span><span class="sw" style="background:#8A8A88;color:#FFF"><b>cat-mauve</b><br>#8A8A88</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#0F0F0E;color:#FFF"><b>chart-1</b><br>#0F0F0E</span><span class="sw" style="background:#A82828;color:#FFF"><b>chart-2</b><br>#A82828</span><span class="sw" style="background:#4D6B7C;color:#FFF"><b>chart-3</b><br>#4D6B7C</span><span class="sw" style="background:#6B7530;color:#FFF"><b>chart-4</b><br>#6B7530</span><span class="sw" style="background:#585855;color:#FFF"><b>chart-5</b><br>#585855</span><span class="sw" style="background:#989895;color:#FFF"><b>chart-6</b><br>#989895</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#D5D5D2;color:#000"><b>Q1 fill</b><br>#D5D5D2</span><span class="sw" style="background:#E8D8D0;color:#000"><b>Q2 fill</b><br>#E8D8D0</span><span class="sw" style="background:#D8D5E0;color:#000"><b>Q3 fill</b><br>#D8D5E0</span><span class="sw" style="background:#ECECE8;color:#000"><b>Q4 fill</b><br>#ECECE8</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#E8D8D0;color:#000"><b>state-active</b><br>#E8D8D0</span><span class="sw" style="background:#D5D5CE;color:#000"><b>state-done</b><br>#D5D5CE</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#E8E5D8;color:#000"><b>state-today</b><br>#E8E5D8</span><span class="sw" style="background:#80807C;color:#FFF"><b>state-grid</b><br>#80807C</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#2A2A28;color:#FFF"><b>stroke</b><br>#2A2A28</span><span class="sw" style="background:#0F0F0E;color:#FFF"><b>line</b><br>#0F0F0E</span><span class="sw" style="background:#A82828;color:#FFF"><b>accent-warm</b><br>#A82828</span><div class="gap"></div><span class="sw" style="background:#E8E5D8;color:#000"><b>note-bg</b><br>#E8E5D8</span><span class="sw" style="background:#0F0F0E;color:#FFF"><b>note-stroke</b><br>#0F0F0E</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#FFFFFF;color:#000">

## onyx  <span class="meta">bg #FFFFFF · accent #000000 · text-heading #000000</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#F5F5F5;color:#000"><b>band-1</b><br>#F5F5F5</span><span class="sw" style="background:#FAEAE8;color:#000"><b>band-2</b><br>#FAEAE8</span><span class="sw" style="background:#C0C0C0;color:#FFF"><b>band-3</b><br>#C0C0C0</span><span class="sw" style="background:#D9D9D9;color:#000"><b>band-4</b><br>#D9D9D9</span><span class="sw" style="background:#EBEBEB;color:#000"><b>band-5</b><br>#EBEBEB</span><span class="sw" style="background:#F5EEEE;color:#000"><b>band-6</b><br>#F5EEEE</span><span class="sw" style="background:#F5F5EE;color:#000"><b>band-7</b><br>#F5F5EE</span><span class="sw" style="background:#F5E5E5;color:#000"><b>band-8</b><br>#F5E5E5</span><span class="sw" style="background:#E8E8E8;color:#000"><b>band-9</b><br>#E8E8E8</span><span class="sw" style="background:#F0F0EB;color:#000"><b>band-10</b><br>#F0F0EB</span><span class="sw" style="background:#F0F0F5;color:#000"><b>band-11</b><br>#F0F0F5</span><span class="sw" style="background:#F5F5F5;color:#000"><b>band-12</b><br>#F5F5F5</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#5A5A5A;color:#FFF"><b>cat-blue</b><br>#5A5A5A</span><span class="sw" style="background:#8A8A8A;color:#FFF"><b>cat-green</b><br>#8A8A8A</span><span class="sw" style="background:#C71F2D;color:#FFF"><b>cat-purple</b><br>#C71F2D</span><span class="sw" style="background:#424242;color:#FFF"><b>cat-orange</b><br>#424242</span><span class="sw" style="background:#707070;color:#FFF"><b>cat-teal</b><br>#707070</span><span class="sw" style="background:#A8A8A8;color:#FFF"><b>cat-rose</b><br>#A8A8A8</span><span class="sw" style="background:#606060;color:#FFF"><b>cat-slate</b><br>#606060</span><span class="sw" style="background:#9A9A9A;color:#FFF"><b>cat-mauve</b><br>#9A9A9A</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#000000;color:#FFF"><b>chart-1</b><br>#000000</span><span class="sw" style="background:#C71F2D;color:#FFF"><b>chart-2</b><br>#C71F2D</span><span class="sw" style="background:#4E5C8A;color:#FFF"><b>chart-3</b><br>#4E5C8A</span><span class="sw" style="background:#6B7044;color:#FFF"><b>chart-4</b><br>#6B7044</span><span class="sw" style="background:#8C8C8C;color:#FFF"><b>chart-5</b><br>#8C8C8C</span><span class="sw" style="background:#404040;color:#FFF"><b>chart-6</b><br>#404040</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#F5F5F5;color:#000"><b>Q1 fill</b><br>#F5F5F5</span><span class="sw" style="background:#FAEAE8;color:#000"><b>Q2 fill</b><br>#FAEAE8</span><span class="sw" style="background:#C0C0C0;color:#FFF"><b>Q3 fill</b><br>#C0C0C0</span><span class="sw" style="background:#D9D9D9;color:#000"><b>Q4 fill</b><br>#D9D9D9</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#FAEAE8;color:#000"><b>state-active</b><br>#FAEAE8</span><span class="sw" style="background:#E8E8E8;color:#000"><b>state-done</b><br>#E8E8E8</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#F5F5EE;color:#000"><b>state-today</b><br>#F5F5EE</span><span class="sw" style="background:#1A1A1A;color:#FFF"><b>state-grid</b><br>#1A1A1A</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#000000;color:#FFF"><b>stroke</b><br>#000000</span><span class="sw" style="background:#000000;color:#FFF"><b>line</b><br>#000000</span><span class="sw" style="background:#C71F2D;color:#FFF"><b>accent-warm</b><br>#C71F2D</span><div class="gap"></div><span class="sw" style="background:#F5F5EE;color:#000"><b>note-bg</b><br>#F5F5EE</span><span class="sw" style="background:#000000;color:#FFF"><b>note-stroke</b><br>#000000</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>

---

<!-- _class: blank -->

<div class="audit" style="background:#1A1A1C;color:#FFF">

## carbone  <span class="meta">bg #1A1A1C · accent #7DE38A · text-heading #F5F5F2</span>

<div class="row"><div class="lbl">band-1..12</div><span class="sw" style="background:#2A2A2E;color:#FFF"><b>band-1</b><br>#2A2A2E</span><span class="sw" style="background:#2C3D2F;color:#FFF"><b>band-2</b><br>#2C3D2F</span><span class="sw" style="background:#2E2A38;color:#FFF"><b>band-3</b><br>#2E2A38</span><span class="sw" style="background:#382E22;color:#FFF"><b>band-4</b><br>#382E22</span><span class="sw" style="background:#223328;color:#FFF"><b>band-5</b><br>#223328</span><span class="sw" style="background:#342830;color:#FFF"><b>band-6</b><br>#342830</span><span class="sw" style="background:#35332A;color:#FFF"><b>band-7</b><br>#35332A</span><span class="sw" style="background:#38282A;color:#FFF"><b>band-8</b><br>#38282A</span><span class="sw" style="background:#2A2E38;color:#FFF"><b>band-9</b><br>#2A2E38</span><span class="sw" style="background:#253328;color:#FFF"><b>band-10</b><br>#253328</span><span class="sw" style="background:#2C2838;color:#FFF"><b>band-11</b><br>#2C2838</span><span class="sw" style="background:#2A2A2E;color:#FFF"><b>band-12</b><br>#2A2A2E</span></div>
<div class="row"><div class="lbl">cat-* (8)</div><span class="sw" style="background:#4A9C56;color:#FFF"><b>cat-blue</b><br>#4A9C56</span><span class="sw" style="background:#9A7820;color:#FFF"><b>cat-green</b><br>#9A7820</span><span class="sw" style="background:#3E8898;color:#FFF"><b>cat-purple</b><br>#3E8898</span><span class="sw" style="background:#8E4870;color:#FFF"><b>cat-orange</b><br>#8E4870</span><span class="sw" style="background:#5DAF68;color:#FFF"><b>cat-teal</b><br>#5DAF68</span><span class="sw" style="background:#707878;color:#FFF"><b>cat-rose</b><br>#707878</span><span class="sw" style="background:#585E6A;color:#FFF"><b>cat-slate</b><br>#585E6A</span><span class="sw" style="background:#808080;color:#FFF"><b>cat-mauve</b><br>#808080</span></div>
<div class="row"><div class="lbl">chart-1..6</div><span class="sw" style="background:#7DE38A;color:#000"><b>chart-1</b><br>#7DE38A</span><span class="sw" style="background:#FFD166;color:#000"><b>chart-2</b><br>#FFD166</span><span class="sw" style="background:#5BCBDD;color:#FFF"><b>chart-3</b><br>#5BCBDD</span><span class="sw" style="background:#F277B8;color:#FFF"><b>chart-4</b><br>#F277B8</span><span class="sw" style="background:#DCDCD7;color:#000"><b>chart-5</b><br>#DCDCD7</span><span class="sw" style="background:#757A82;color:#FFF"><b>chart-6</b><br>#757A82</span></div>
<div class="row"><div class="lbl">quadrant fills</div><span class="sw" style="background:#2A2A2E;color:#FFF"><b>Q1 fill</b><br>#2A2A2E</span><span class="sw" style="background:#2C3D2F;color:#FFF"><b>Q2 fill</b><br>#2C3D2F</span><span class="sw" style="background:#35332A;color:#FFF"><b>Q3 fill</b><br>#35332A</span><span class="sw" style="background:#2E2A38;color:#FFF"><b>Q4 fill</b><br>#2E2A38</span></div>
<div class="row"><div class="lbl">gantt state</div><span class="sw" style="background:#382E22;color:#FFF"><b>state-active</b><br>#382E22</span><span class="sw" style="background:#2A2E38;color:#FFF"><b>state-done</b><br>#2A2E38</span><span class="sw" style="background:#C20000;color:#FFF"><b>state-critical</b><br>#C20000</span><span class="sw" style="background:#35332A;color:#FFF"><b>state-today</b><br>#35332A</span><span class="sw" style="background:#3A3A3F;color:#FFF"><b>state-grid</b><br>#3A3A3F</span></div>
<div class="row"><div class="lbl">structural</div><span class="sw" style="background:#7DE38A;color:#000"><b>stroke</b><br>#7DE38A</span><span class="sw" style="background:#F5F5F2;color:#000"><b>line</b><br>#F5F5F2</span><span class="sw" style="background:#FFD166;color:#000"><b>accent-warm</b><br>#FFD166</span><div class="gap"></div><span class="sw" style="background:#35332A;color:#FFF"><b>note-bg</b><br>#35332A</span><span class="sw" style="background:#F5F5F2;color:#000"><b>note-stroke</b><br>#F5F5F2</span><span class="sw" style="background:#C20000;color:#FFF"><b>error-bg</b><br>#C20000</span></div>

</div>


---

<!-- _class: title -->

# Palette proposals
## 5 strategies × 13 themes = 65 candidates

Each slide: 12 paired slots (hue shared between light + dark variants).
Light = pale fill + dark text contract (AA target 4.5:1 on theme text-heading).
Dark = deep fill + white text contract (AA target 4.5:1 on white).

Scores below each header report AA-text pass count, graphical-on-canvas
pass count, min adjacency hue spread among the first 6 (higher = first 6
more distinct), brand affinity (lower = closer to brand hue), and hue
coverage (higher = wider palette).

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2>indaco · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E7D5E3;color:#000"><b>L3</b><br>#E7D5E3<br><i>13.0:1</i></span><span class="sw" style="background:#D8D5E7;color:#000"><b>L4</b><br>#D8D5E7<br><i>12.6:1</i></span><span class="sw" style="background:#DAE7D5;color:#000"><b>L5</b><br>#DAE7D5<br><i>14.1:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L6</b><br>#E7E3D5<br><i>14.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1D6E6;color:#000"><b>L7</b><br>#E1D6E6<br><i>12.9:1</i></span><span class="sw" style="background:#D6E6E4;color:#000"><b>L8</b><br>#D6E6E4<br><i>14.1:1</i></span><span class="sw" style="background:#D6D7E6;color:#000"><b>L9</b><br>#D6D7E6<br><i>12.7:1</i></span><span class="sw" style="background:#E6DDD6;color:#000"><b>L10</b><br>#E6DDD6<br><i>13.5:1</i></span><span class="sw" style="background:#E6D6DD;color:#000"><b>L11</b><br>#E6D6DD<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6D9;color:#000"><b>L12</b><br>#D6E6D9<br><i>14.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#863275;color:#FFF"><b>D3</b><br>#863275<br><i>7.7:1</i></span><span class="sw" style="background:#423286;color:#FFF"><b>D4</b><br>#423286<br><i>10.3:1</i></span><span class="sw" style="background:#498230;color:#FFF"><b>D5</b><br>#498230<br><i>4.6:1</i></span><span class="sw" style="background:#867432;color:#FFF"><b>D6</b><br>#867432<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A3880;color:#FFF"><b>D7</b><br>#6A3880<br><i>8.4:1</i></span><span class="sw" style="background:#388076;color:#FFF"><b>D8</b><br>#388076<br><i>4.6:1</i></span><span class="sw" style="background:#383C80;color:#FFF"><b>D9</b><br>#383C80<br><i>9.9:1</i></span><span class="sw" style="background:#805838;color:#FFF"><b>D10</b><br>#805838<br><i>6.2:1</i></span><span class="sw" style="background:#803859;color:#FFF"><b>D11</b><br>#803859<br><i>8.0:1</i></span><span class="sw" style="background:#388046;color:#FFF"><b>D12</b><br>#388046<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2>indaco · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E7E6D5;color:#000"><b>L3</b><br>#E7E6D5<br><i>14.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L4</b><br>#D5D6E7<br><i>12.6:1</i></span><span class="sw" style="background:#D5E7E6;color:#000"><b>L5</b><br>#D5E7E6<br><i>14.2:1</i></span><span class="sw" style="background:#E7DDD5;color:#000"><b>L6</b><br>#E7DDD5<br><i>13.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DDD6E6;color:#000"><b>L7</b><br>#DDD6E6<br><i>12.8:1</i></span><span class="sw" style="background:#E6D6DF;color:#000"><b>L8</b><br>#E6D6DF<br><i>13.0:1</i></span><span class="sw" style="background:#DFE6D6;color:#000"><b>L9</b><br>#DFE6D6<br><i>14.2:1</i></span><span class="sw" style="background:#D6E6DD;color:#000"><b>L10</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#E5D6E6;color:#000"><b>L11</b><br>#E5D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#D7E6D6;color:#000"><b>L12</b><br>#D7E6D6<br><i>14.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D3</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D4</b><br>#323686<br><i>10.5:1</i></span><span class="sw" style="background:#30827E;color:#FFF"><b>D5</b><br>#30827E<br><i>4.5:1</i></span><span class="sw" style="background:#865832;color:#FFF"><b>D6</b><br>#865832<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#583880;color:#FFF"><b>D7</b><br>#583880<br><i>9.2:1</i></span><span class="sw" style="background:#80385F;color:#FFF"><b>D8</b><br>#80385F<br><i>7.9:1</i></span><span class="sw" style="background:#5F8038;color:#FFF"><b>D9</b><br>#5F8038<br><i>4.5:1</i></span><span class="sw" style="background:#388058;color:#FFF"><b>D10</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#7C3880;color:#FFF"><b>D11</b><br>#7C3880<br><i>7.7:1</i></span><span class="sw" style="background:#3C8038;color:#FFF"><b>D12</b><br>#3C8038<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2>indaco · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E6D5E7;color:#000"><b>L3</b><br>#E6D5E7<br><i>13.0:1</i></span><span class="sw" style="background:#D6E7D5;color:#000"><b>L4</b><br>#D6E7D5<br><i>14.0:1</i></span><span class="sw" style="background:#E7E6D5;color:#000"><b>L5</b><br>#E7E6D5<br><i>14.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L6</b><br>#D5D6E7<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6DBE6;color:#000"><b>L7</b><br>#D6DBE6<br><i>13.1:1</i></span><span class="sw" style="background:#E6D9D6;color:#000"><b>L8</b><br>#E6D9D6<br><i>13.2:1</i></span><span class="sw" style="background:#E1D6E6;color:#000"><b>L9</b><br>#E1D6E6<br><i>12.9:1</i></span><span class="sw" style="background:#D6E6D9;color:#000"><b>L10</b><br>#D6E6D9<br><i>14.0:1</i></span><span class="sw" style="background:#E3E6D6;color:#000"><b>L11</b><br>#E3E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#D9D6E6;color:#000"><b>L12</b><br>#D9D6E6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#823286;color:#FFF"><b>D3</b><br>#823286<br><i>7.6:1</i></span><span class="sw" style="background:#368632;color:#FFF"><b>D4</b><br>#368632<br><i>4.6:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D5</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D6</b><br>#323686<br><i>10.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#384D80;color:#FFF"><b>D7</b><br>#384D80<br><i>8.3:1</i></span><span class="sw" style="background:#804638;color:#FFF"><b>D8</b><br>#804638<br><i>7.4:1</i></span><span class="sw" style="background:#6A3880;color:#FFF"><b>D9</b><br>#6A3880<br><i>8.4:1</i></span><span class="sw" style="background:#388046;color:#FFF"><b>D10</b><br>#388046<br><i>4.8:1</i></span><span class="sw" style="background:#6E7C36;color:#FFF"><b>D11</b><br>#6E7C36<br><i>4.6:1</i></span><span class="sw" style="background:#463880;color:#FFF"><b>D12</b><br>#463880<br><i>9.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2>indaco · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L2</b><br>#D5D6E7<br><i>12.6:1</i></span><span class="sw" style="background:#DDD5E7;color:#000"><b>L3</b><br>#DDD5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E6D5E7;color:#000"><b>L4</b><br>#E6D5E7<br><i>13.0:1</i></span><span class="sw" style="background:#E7D5DF;color:#000"><b>L5</b><br>#E7D5DF<br><i>12.9:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L6</b><br>#E7D5D6<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6DDD6;color:#000"><b>L7</b><br>#E6DDD6<br><i>13.5:1</i></span><span class="sw" style="background:#E6E5D6;color:#000"><b>L8</b><br>#E6E5D6<br><i>14.3:1</i></span><span class="sw" style="background:#DFE6D6;color:#000"><b>L9</b><br>#DFE6D6<br><i>14.2:1</i></span><span class="sw" style="background:#D7E6D6;color:#000"><b>L10</b><br>#D7E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6DD;color:#000"><b>L11</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6E5;color:#000"><b>L12</b><br>#D6E6E5<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D2</b><br>#323686<br><i>10.5:1</i></span><span class="sw" style="background:#583286;color:#FFF"><b>D3</b><br>#583286<br><i>9.5:1</i></span><span class="sw" style="background:#823286;color:#FFF"><b>D4</b><br>#823286<br><i>7.6:1</i></span><span class="sw" style="background:#863260;color:#FFF"><b>D5</b><br>#863260<br><i>8.0:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D6</b><br>#863236<br><i>8.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#805838;color:#FFF"><b>D7</b><br>#805838<br><i>6.2:1</i></span><span class="sw" style="background:#7C7936;color:#FFF"><b>D8</b><br>#7C7936<br><i>4.5:1</i></span><span class="sw" style="background:#5F8038;color:#FFF"><b>D9</b><br>#5F8038<br><i>4.5:1</i></span><span class="sw" style="background:#3C8038;color:#FFF"><b>D10</b><br>#3C8038<br><i>4.8:1</i></span><span class="sw" style="background:#388058;color:#FFF"><b>D11</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#38807C;color:#FFF"><b>D12</b><br>#38807C<br><i>4.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2>indaco · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#D5D9E7;color:#000"><b>L2</b><br>#D5D9E7<br><i>12.9:1</i></span><span class="sw" style="background:#D5E5E7;color:#000"><b>L3</b><br>#D5E5E7<br><i>14.0:1</i></span><span class="sw" style="background:#D7D5E7;color:#000"><b>L4</b><br>#D7D5E7<br><i>12.6:1</i></span><span class="sw" style="background:#D5E7E3;color:#000"><b>L5</b><br>#D5E7E3<br><i>14.1:1</i></span><span class="sw" style="background:#DDD5E7;color:#000"><b>L6</b><br>#DDD5E7<br><i>12.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6DD;color:#000"><b>L7</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#D6DBE6;color:#000"><b>L8</b><br>#D6DBE6<br><i>13.1:1</i></span><span class="sw" style="background:#D6E3E6;color:#000"><b>L9</b><br>#D6E3E6<br><i>13.8:1</i></span><span class="sw" style="background:#D6D7E6;color:#000"><b>L10</b><br>#D6D7E6<br><i>12.7:1</i></span><span class="sw" style="background:#D6E6E5;color:#000"><b>L11</b><br>#D6E6E5<br><i>14.1:1</i></span><span class="sw" style="background:#D6DFE6;color:#000"><b>L12</b><br>#D6DFE6<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#324486;color:#FFF"><b>D2</b><br>#324486<br><i>9.1:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D3</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D4</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#308271;color:#FFF"><b>D5</b><br>#308271<br><i>4.6:1</i></span><span class="sw" style="background:#583286;color:#FFF"><b>D6</b><br>#583286<br><i>9.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#388058;color:#FFF"><b>D7</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#384D80;color:#FFF"><b>D8</b><br>#384D80<br><i>8.3:1</i></span><span class="sw" style="background:#387180;color:#FFF"><b>D9</b><br>#387180<br><i>5.5:1</i></span><span class="sw" style="background:#383C80;color:#FFF"><b>D10</b><br>#383C80<br><i>9.9:1</i></span><span class="sw" style="background:#38807C;color:#FFF"><b>D11</b><br>#38807C<br><i>4.6:1</i></span><span class="sw" style="background:#385F80;color:#FFF"><b>D12</b><br>#385F80<br><i>6.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2>cuoio · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6DC;color:#000"><b>L3</b><br>#D5E6DC<br><i>13.3:1</i></span><span class="sw" style="background:#E0E6D5;color:#000"><b>L4</b><br>#E0E6D5<br><i>13.6:1</i></span><span class="sw" style="background:#E4D5E6;color:#000"><b>L5</b><br>#E4D5E6<br><i>12.3:1</i></span><span class="sw" style="background:#D5D6E6;color:#000"><b>L6</b><br>#D5D6E6<br><i>12.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9E5D7;color:#000"><b>L7</b><br>#D9E5D7<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7D7;color:#000"><b>L8</b><br>#E5D7D7<br><i>12.4:1</i></span><span class="sw" style="background:#E3E5D7;color:#000"><b>L9</b><br>#E3E5D7<br><i>13.6:1</i></span><span class="sw" style="background:#D7DCE5;color:#000"><b>L10</b><br>#D7DCE5<br><i>12.6:1</i></span><span class="sw" style="background:#D7E5E1;color:#000"><b>L11</b><br>#D7E5E1<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E0;color:#000"><b>L12</b><br>#E5D7E0<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#328651;color:#FFF"><b>D3</b><br>#328651<br><i>4.5:1</i></span><span class="sw" style="background:#617F2F;color:#FFF"><b>D4</b><br>#617F2F<br><i>4.6:1</i></span><span class="sw" style="background:#7B3286;color:#FFF"><b>D5</b><br>#7B3286<br><i>7.9:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D6</b><br>#323686<br><i>10.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#428038;color:#FFF"><b>D7</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#803A38;color:#FFF"><b>D8</b><br>#803A38<br><i>8.1:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D10</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#38806A;color:#FFF"><b>D11</b><br>#38806A<br><i>4.7:1</i></span><span class="sw" style="background:#803865;color:#FFF"><b>D12</b><br>#803865<br><i>7.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2>cuoio · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D7D5E6;color:#000"><b>L3</b><br>#D7D5E6<br><i>12.0:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L4</b><br>#E4E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#E6D7D5;color:#000"><b>L5</b><br>#E6D7D5<br><i>12.4:1</i></span><span class="sw" style="background:#D5DCE6;color:#000"><b>L6</b><br>#D5DCE6<br><i>12.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCE5D7;color:#000"><b>L7</b><br>#DCE5D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E5E0;color:#000"><b>L8</b><br>#D7E5E0<br><i>13.3:1</i></span><span class="sw" style="background:#E0D7E5;color:#000"><b>L9</b><br>#E0D7E5<br><i>12.4:1</i></span><span class="sw" style="background:#E5D7DC;color:#000"><b>L10</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#D7E5D8;color:#000"><b>L11</b><br>#D7E5D8<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E3;color:#000"><b>L12</b><br>#E5D7E3<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D3</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D4</b><br>#727B2D<br><i>4.6:1</i></span><span class="sw" style="background:#863B32;color:#FFF"><b>D5</b><br>#863B32<br><i>7.8:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D6</b><br>#325286<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#538038;color:#FFF"><b>D7</b><br>#538038<br><i>4.7:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D8</b><br>#388064<br><i>4.7:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D9</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#803853;color:#FFF"><b>D10</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D11</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D12</b><br>#803877<br><i>7.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2>cuoio · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6D7;color:#000"><b>L3</b><br>#D5E6D7<br><i>13.3:1</i></span><span class="sw" style="background:#E6D5E4;color:#000"><b>L4</b><br>#E6D5E4<br><i>12.4:1</i></span><span class="sw" style="background:#D7D5E6;color:#000"><b>L5</b><br>#D7D5E6<br><i>12.0:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L6</b><br>#E4E6D5<br><i>13.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5E3D7;color:#000"><b>L7</b><br>#E5E3D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E0E5;color:#000"><b>L8</b><br>#D7E0E5<br><i>12.9:1</i></span><span class="sw" style="background:#D9E5D7;color:#000"><b>L9</b><br>#D9E5D7<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E0;color:#000"><b>L10</b><br>#E5D7E0<br><i>12.5:1</i></span><span class="sw" style="background:#DCD7E5;color:#000"><b>L11</b><br>#DCD7E5<br><i>12.3:1</i></span><span class="sw" style="background:#E0E5D7;color:#000"><b>L12</b><br>#E0E5D7<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#32863B;color:#FFF"><b>D3</b><br>#32863B<br><i>4.6:1</i></span><span class="sw" style="background:#86327C;color:#FFF"><b>D4</b><br>#86327C<br><i>7.6:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D5</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D6</b><br>#727B2D<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#807638;color:#FFF"><b>D7</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#386580;color:#FFF"><b>D8</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D9</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#803865;color:#FFF"><b>D10</b><br>#803865<br><i>7.9:1</i></span><span class="sw" style="background:#523880;color:#FFF"><b>D11</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#637C36;color:#FFF"><b>D12</b><br>#637C36<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2>cuoio · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L2</b><br>#E4E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#DCE6D5;color:#000"><b>L3</b><br>#DCE6D5<br><i>13.4:1</i></span><span class="sw" style="background:#D5E6D7;color:#000"><b>L4</b><br>#D5E6D7<br><i>13.3:1</i></span><span class="sw" style="background:#D5E6E0;color:#000"><b>L5</b><br>#D5E6E0<br><i>13.4:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L6</b><br>#D5E4E6<br><i>13.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7DCE5;color:#000"><b>L7</b><br>#D7DCE5<br><i>12.6:1</i></span><span class="sw" style="background:#D8D7E5;color:#000"><b>L8</b><br>#D8D7E5<br><i>12.2:1</i></span><span class="sw" style="background:#E0D7E5;color:#000"><b>L9</b><br>#E0D7E5<br><i>12.4:1</i></span><span class="sw" style="background:#E5D7E3;color:#000"><b>L10</b><br>#E5D7E3<br><i>12.5:1</i></span><span class="sw" style="background:#E5D7DC;color:#000"><b>L11</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#E5D8D7;color:#000"><b>L12</b><br>#E5D8D7<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D2</b><br>#727B2D<br><i>4.6:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D3</b><br>#508230<br><i>4.6:1</i></span><span class="sw" style="background:#32863B;color:#FFF"><b>D4</b><br>#32863B<br><i>4.6:1</i></span><span class="sw" style="background:#308263;color:#FFF"><b>D5</b><br>#308263<br><i>4.7:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D6</b><br>#327C86<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#385380;color:#FFF"><b>D7</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#403880;color:#FFF"><b>D8</b><br>#403880<br><i>10.0:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D9</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D10</b><br>#803877<br><i>7.6:1</i></span><span class="sw" style="background:#803853;color:#FFF"><b>D11</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D12</b><br>#804038<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2>cuoio · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#E6DAD5;color:#000"><b>L3</b><br>#E6DAD5<br><i>12.6:1</i></span><span class="sw" style="background:#E2E6D5;color:#000"><b>L4</b><br>#E2E6D5<br><i>13.6:1</i></span><span class="sw" style="background:#E6D5D6;color:#000"><b>L5</b><br>#E6D5D6<br><i>12.2:1</i></span><span class="sw" style="background:#DCE6D5;color:#000"><b>L6</b><br>#DCE6D5<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DC;color:#000"><b>L7</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#E5E3D7;color:#000"><b>L8</b><br>#E5E3D7<br><i>13.4:1</i></span><span class="sw" style="background:#E5DCD7;color:#000"><b>L9</b><br>#E5DCD7<br><i>12.8:1</i></span><span class="sw" style="background:#E3E5D7;color:#000"><b>L10</b><br>#E3E5D7<br><i>13.6:1</i></span><span class="sw" style="background:#E5D8D7;color:#000"><b>L11</b><br>#E5D8D7<br><i>12.5:1</i></span><span class="sw" style="background:#E5E0D7;color:#000"><b>L12</b><br>#E5E0D7<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D2</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#864A32;color:#FFF"><b>D3</b><br>#864A32<br><i>6.9:1</i></span><span class="sw" style="background:#687F2F;color:#FFF"><b>D4</b><br>#687F2F<br><i>4.5:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D5</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D6</b><br>#508230<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#803853;color:#FFF"><b>D7</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#807638;color:#FFF"><b>D8</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#805238;color:#FFF"><b>D9</b><br>#805238<br><i>6.6:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D10</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D11</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#806438;color:#FFF"><b>D12</b><br>#806438<br><i>5.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2>mustard · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D5E7DE;color:#000"><b>L3</b><br>#D5E7DE<br><i>14.2:1</i></span><span class="sw" style="background:#DEE7D5;color:#000"><b>L4</b><br>#DEE7D5<br><i>14.3:1</i></span><span class="sw" style="background:#E7D5E7;color:#000"><b>L5</b><br>#E7D5E7<br><i>13.1:1</i></span><span class="sw" style="background:#D6D5E7;color:#000"><b>L6</b><br>#D6D5E7<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6D6;color:#000"><b>L7</b><br>#D6E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D9D6;color:#000"><b>L8</b><br>#E6D9D6<br><i>13.2:1</i></span><span class="sw" style="background:#E2E6D6;color:#000"><b>L9</b><br>#E2E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#D6DAE6;color:#000"><b>L10</b><br>#D6DAE6<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6E3;color:#000"><b>L11</b><br>#D6E6E3<br><i>14.1:1</i></span><span class="sw" style="background:#E6D6DE;color:#000"><b>L12</b><br>#E6D6DE<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#268354;color:#FFF"><b>D3</b><br>#268354<br><i>4.7:1</i></span><span class="sw" style="background:#548326;color:#FFF"><b>D4</b><br>#548326<br><i>4.5:1</i></span><span class="sw" style="background:#8E298E;color:#FFF"><b>D5</b><br>#8E298E<br><i>7.3:1</i></span><span class="sw" style="background:#32298E;color:#FFF"><b>D6</b><br>#32298E<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#318731;color:#FFF"><b>D7</b><br>#318731<br><i>4.5:1</i></span><span class="sw" style="background:#873F31;color:#FFF"><b>D8</b><br>#873F31<br><i>7.5:1</i></span><span class="sw" style="background:#687C2D;color:#FFF"><b>D9</b><br>#687C2D<br><i>4.7:1</i></span><span class="sw" style="background:#314687;color:#FFF"><b>D10</b><br>#314687<br><i>8.9:1</i></span><span class="sw" style="background:#2F8375;color:#FFF"><b>D11</b><br>#2F8375<br><i>4.5:1</i></span><span class="sw" style="background:#87315C;color:#FFF"><b>D12</b><br>#87315C<br><i>8.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2>mustard · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D9D5E7;color:#000"><b>L3</b><br>#D9D5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L4</b><br>#E2E7D5<br><i>14.4:1</i></span><span class="sw" style="background:#E7D9D5;color:#000"><b>L5</b><br>#E7D9D5<br><i>13.3:1</i></span><span class="sw" style="background:#D5D9E7;color:#000"><b>L6</b><br>#D5D9E7<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DAE6D6;color:#000"><b>L7</b><br>#DAE6D6<br><i>14.1:1</i></span><span class="sw" style="background:#D6E6E2;color:#000"><b>L8</b><br>#D6E6E2<br><i>14.1:1</i></span><span class="sw" style="background:#E2D6E6;color:#000"><b>L9</b><br>#E2D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D6DA;color:#000"><b>L10</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6DA;color:#000"><b>L11</b><br>#D6E6DA<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L12</b><br>#E6D6E2<br><i>13.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#42298E;color:#FFF"><b>D3</b><br>#42298E<br><i>10.8:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D4</b><br>#687F25<br><i>4.5:1</i></span><span class="sw" style="background:#8E4229;color:#FFF"><b>D5</b><br>#8E4229<br><i>7.1:1</i></span><span class="sw" style="background:#29428E;color:#FFF"><b>D6</b><br>#29428E<br><i>9.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#44832F;color:#FFF"><b>D7</b><br>#44832F<br><i>4.6:1</i></span><span class="sw" style="background:#2F836E;color:#FFF"><b>D8</b><br>#2F836E<br><i>4.6:1</i></span><span class="sw" style="background:#713187;color:#FFF"><b>D9</b><br>#713187<br><i>8.4:1</i></span><span class="sw" style="background:#873146;color:#FFF"><b>D10</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#2F8344;color:#FFF"><b>D11</b><br>#2F8344<br><i>4.7:1</i></span><span class="sw" style="background:#873171;color:#FFF"><b>D12</b><br>#873171<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2>mustard · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D5E7D9;color:#000"><b>L3</b><br>#D5E7D9<br><i>14.1:1</i></span><span class="sw" style="background:#E7D5E2;color:#000"><b>L4</b><br>#E7D5E2<br><i>13.0:1</i></span><span class="sw" style="background:#D9D5E7;color:#000"><b>L5</b><br>#D9D5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L6</b><br>#E2E7D5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6E6D6;color:#000"><b>L7</b><br>#E6E6D6<br><i>14.4:1</i></span><span class="sw" style="background:#D6DEE6;color:#000"><b>L8</b><br>#D6DEE6<br><i>13.4:1</i></span><span class="sw" style="background:#D6E6D6;color:#000"><b>L9</b><br>#D6E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6DE;color:#000"><b>L10</b><br>#E6D6DE<br><i>13.0:1</i></span><span class="sw" style="background:#DED6E6;color:#000"><b>L11</b><br>#DED6E6<br><i>12.9:1</i></span><span class="sw" style="background:#DEE6D6;color:#000"><b>L12</b><br>#DEE6D6<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#27873F;color:#FFF"><b>D3</b><br>#27873F<br><i>4.5:1</i></span><span class="sw" style="background:#8E2975;color:#FFF"><b>D4</b><br>#8E2975<br><i>7.7:1</i></span><span class="sw" style="background:#42298E;color:#FFF"><b>D5</b><br>#42298E<br><i>10.8:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D6</b><br>#687F25<br><i>4.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#78782B;color:#FFF"><b>D7</b><br>#78782B<br><i>4.6:1</i></span><span class="sw" style="background:#315C87;color:#FFF"><b>D8</b><br>#315C87<br><i>7.0:1</i></span><span class="sw" style="background:#318731;color:#FFF"><b>D9</b><br>#318731<br><i>4.5:1</i></span><span class="sw" style="background:#87315C;color:#FFF"><b>D10</b><br>#87315C<br><i>8.0:1</i></span><span class="sw" style="background:#5C3187;color:#FFF"><b>D11</b><br>#5C3187<br><i>9.4:1</i></span><span class="sw" style="background:#577F2E;color:#FFF"><b>D12</b><br>#577F2E<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2>mustard · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L2</b><br>#E2E7D5<br><i>14.4:1</i></span><span class="sw" style="background:#D9E7D5;color:#000"><b>L3</b><br>#D9E7D5<br><i>14.2:1</i></span><span class="sw" style="background:#D5E7D9;color:#000"><b>L4</b><br>#D5E7D9<br><i>14.1:1</i></span><span class="sw" style="background:#D5E7E2;color:#000"><b>L5</b><br>#D5E7E2<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L6</b><br>#D5E2E7<br><i>13.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6DAE6;color:#000"><b>L7</b><br>#D6DAE6<br><i>13.0:1</i></span><span class="sw" style="background:#DAD6E6;color:#000"><b>L8</b><br>#DAD6E6<br><i>12.8:1</i></span><span class="sw" style="background:#E2D6E6;color:#000"><b>L9</b><br>#E2D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L10</b><br>#E6D6E2<br><i>13.1:1</i></span><span class="sw" style="background:#E6D6DA;color:#000"><b>L11</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#E6DAD6;color:#000"><b>L12</b><br>#E6DAD6<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D2</b><br>#687F25<br><i>4.5:1</i></span><span class="sw" style="background:#3D8326;color:#FFF"><b>D3</b><br>#3D8326<br><i>4.7:1</i></span><span class="sw" style="background:#27873F;color:#FFF"><b>D4</b><br>#27873F<br><i>4.5:1</i></span><span class="sw" style="background:#26836B;color:#FFF"><b>D5</b><br>#26836B<br><i>4.6:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D6</b><br>#29758E<br><i>5.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#314687;color:#FFF"><b>D7</b><br>#314687<br><i>8.9:1</i></span><span class="sw" style="background:#463187;color:#FFF"><b>D8</b><br>#463187<br><i>10.2:1</i></span><span class="sw" style="background:#713187;color:#FFF"><b>D9</b><br>#713187<br><i>8.4:1</i></span><span class="sw" style="background:#873171;color:#FFF"><b>D10</b><br>#873171<br><i>7.8:1</i></span><span class="sw" style="background:#873146;color:#FFF"><b>D11</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#874631;color:#FFF"><b>D12</b><br>#874631<br><i>7.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2>mustard · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#E5E7D5;color:#000"><b>L2</b><br>#E5E7D5<br><i>14.5:1</i></span><span class="sw" style="background:#E7DCD5;color:#000"><b>L3</b><br>#E7DCD5<br><i>13.5:1</i></span><span class="sw" style="background:#DFE7D5;color:#000"><b>L4</b><br>#DFE7D5<br><i>14.3:1</i></span><span class="sw" style="background:#E7D6D5;color:#000"><b>L5</b><br>#E7D6D5<br><i>13.0:1</i></span><span class="sw" style="background:#D9E7D5;color:#000"><b>L6</b><br>#D9E7D5<br><i>14.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D6DA;color:#000"><b>L7</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#E6E6D6;color:#000"><b>L8</b><br>#E6E6D6<br><i>14.4:1</i></span><span class="sw" style="background:#E6DED6;color:#000"><b>L9</b><br>#E6DED6<br><i>13.7:1</i></span><span class="sw" style="background:#E2E6D6;color:#000"><b>L10</b><br>#E2E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#E6DAD6;color:#000"><b>L11</b><br>#E6DAD6<br><i>13.3:1</i></span><span class="sw" style="background:#E6E2D6;color:#000"><b>L12</b><br>#E6E2D6<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#737B23;color:#FFF"><b>D2</b><br>#737B23<br><i>4.6:1</i></span><span class="sw" style="background:#8E5329;color:#FFF"><b>D3</b><br>#8E5329<br><i>6.1:1</i></span><span class="sw" style="background:#597F25;color:#FFF"><b>D4</b><br>#597F25<br><i>4.7:1</i></span><span class="sw" style="background:#8E3229;color:#FFF"><b>D5</b><br>#8E3229<br><i>8.0:1</i></span><span class="sw" style="background:#3D8326;color:#FFF"><b>D6</b><br>#3D8326<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#873146;color:#FFF"><b>D7</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#78782B;color:#FFF"><b>D8</b><br>#78782B<br><i>4.6:1</i></span><span class="sw" style="background:#875C31;color:#FFF"><b>D9</b><br>#875C31<br><i>5.8:1</i></span><span class="sw" style="background:#687C2D;color:#FFF"><b>D10</b><br>#687C2D<br><i>4.7:1</i></span><span class="sw" style="background:#874631;color:#FFF"><b>D11</b><br>#874631<br><i>7.1:1</i></span><span class="sw" style="background:#877131;color:#FFF"><b>D12</b><br>#877131<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2>laguna · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E5D4E8;color:#000"><b>L3</b><br>#E5D4E8<br><i>11.7:1</i></span><span class="sw" style="background:#D4D7E8;color:#000"><b>L4</b><br>#D4D7E8<br><i>11.5:1</i></span><span class="sw" style="background:#E0E8D4;color:#000"><b>L5</b><br>#E0E8D4<br><i>13.1:1</i></span><span class="sw" style="background:#E8DDD4;color:#000"><b>L6</b><br>#E8DDD4<br><i>12.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCD6E6;color:#000"><b>L7</b><br>#DCD6E6<br><i>11.6:1</i></span><span class="sw" style="background:#D6E6DE;color:#000"><b>L8</b><br>#D6E6DE<br><i>12.8:1</i></span><span class="sw" style="background:#D6DCE6;color:#000"><b>L9</b><br>#D6DCE6<br><i>12.0:1</i></span><span class="sw" style="background:#E6D8D6;color:#000"><b>L10</b><br>#E6D8D6<br><i>11.9:1</i></span><span class="sw" style="background:#E6D6E3;color:#000"><b>L11</b><br>#E6D6E3<br><i>11.9:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L12</b><br>#D8E6D6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#7B3286;color:#FFF"><b>D3</b><br>#7B3286<br><i>7.9:1</i></span><span class="sw" style="background:#323D86;color:#FFF"><b>D4</b><br>#323D86<br><i>9.8:1</i></span><span class="sw" style="background:#617F2F;color:#FFF"><b>D5</b><br>#617F2F<br><i>4.6:1</i></span><span class="sw" style="background:#865832;color:#FFF"><b>D6</b><br>#865832<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#523880;color:#FFF"><b>D7</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#38805E;color:#FFF"><b>D8</b><br>#38805E<br><i>4.8:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D9</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D10</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#803871;color:#FFF"><b>D11</b><br>#803871<br><i>7.7:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D12</b><br>#428038<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2>laguna · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E8E0D4;color:#000"><b>L3</b><br>#E8E0D4<br><i>12.6:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L4</b><br>#D4DCE8<br><i>11.9:1</i></span><span class="sw" style="background:#D4E8E0;color:#000"><b>L5</b><br>#D4E8E0<br><i>12.9:1</i></span><span class="sw" style="background:#E8D6D4;color:#000"><b>L6</b><br>#E8D6D4<br><i>11.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D8D6E6;color:#000"><b>L7</b><br>#D8D6E6<br><i>11.5:1</i></span><span class="sw" style="background:#E6D6E4;color:#000"><b>L8</b><br>#E6D6E4<br><i>11.9:1</i></span><span class="sw" style="background:#E4E6D6;color:#000"><b>L9</b><br>#E4E6D6<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6D8;color:#000"><b>L10</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#E0D6E6;color:#000"><b>L11</b><br>#E0D6E6<br><i>11.7:1</i></span><span class="sw" style="background:#DCE6D6;color:#000"><b>L12</b><br>#DCE6D6<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#866632;color:#FFF"><b>D3</b><br>#866632<br><i>5.3:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D4</b><br>#325286<br><i>7.8:1</i></span><span class="sw" style="background:#308263;color:#FFF"><b>D5</b><br>#308263<br><i>4.7:1</i></span><span class="sw" style="background:#863B32;color:#FFF"><b>D6</b><br>#863B32<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#403880;color:#FFF"><b>D7</b><br>#403880<br><i>10.0:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D8</b><br>#803877<br><i>7.6:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D10</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D11</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#538038;color:#FFF"><b>D12</b><br>#538038<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2>laguna · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E0D4E8;color:#000"><b>L3</b><br>#E0D4E8<br><i>11.6:1</i></span><span class="sw" style="background:#DCE8D4;color:#000"><b>L4</b><br>#DCE8D4<br><i>13.0:1</i></span><span class="sw" style="background:#E8E0D4;color:#000"><b>L5</b><br>#E8E0D4<br><i>12.6:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L6</b><br>#D4DCE8<br><i>11.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E0E6;color:#000"><b>L7</b><br>#D6E0E6<br><i>12.3:1</i></span><span class="sw" style="background:#E6D6D8;color:#000"><b>L8</b><br>#E6D6D8<br><i>11.8:1</i></span><span class="sw" style="background:#DCD6E6;color:#000"><b>L9</b><br>#DCD6E6<br><i>11.6:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L10</b><br>#D8E6D6<br><i>12.7:1</i></span><span class="sw" style="background:#E6E4D6;color:#000"><b>L11</b><br>#E6E4D6<br><i>12.9:1</i></span><span class="sw" style="background:#D6D8E6;color:#000"><b>L12</b><br>#D6D8E6<br><i>11.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#663286;color:#FFF"><b>D3</b><br>#663286<br><i>8.9:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D4</b><br>#508230<br><i>4.6:1</i></span><span class="sw" style="background:#866632;color:#FFF"><b>D5</b><br>#866632<br><i>5.3:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D6</b><br>#325286<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#386580;color:#FFF"><b>D7</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#803842;color:#FFF"><b>D8</b><br>#803842<br><i>8.2:1</i></span><span class="sw" style="background:#523880;color:#FFF"><b>D9</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D10</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#807638;color:#FFF"><b>D11</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#384280;color:#FFF"><b>D12</b><br>#384280<br><i>9.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2>laguna · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L2</b><br>#D4DCE8<br><i>11.9:1</i></span><span class="sw" style="background:#D6D4E8;color:#000"><b>L3</b><br>#D6D4E8<br><i>11.4:1</i></span><span class="sw" style="background:#E0D4E8;color:#000"><b>L4</b><br>#E0D4E8<br><i>11.6:1</i></span><span class="sw" style="background:#E8D4E5;color:#000"><b>L5</b><br>#E8D4E5<br><i>11.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L6</b><br>#E8D4DC<br><i>11.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D8D6;color:#000"><b>L7</b><br>#E6D8D6<br><i>11.9:1</i></span><span class="sw" style="background:#E6E0D6;color:#000"><b>L8</b><br>#E6E0D6<br><i>12.6:1</i></span><span class="sw" style="background:#E4E6D6;color:#000"><b>L9</b><br>#E4E6D6<br><i>13.0:1</i></span><span class="sw" style="background:#DCE6D6;color:#000"><b>L10</b><br>#DCE6D6<br><i>12.8:1</i></span><span class="sw" style="background:#D6E6D8;color:#000"><b>L11</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#D6E6E0;color:#000"><b>L12</b><br>#D6E6E0<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D2</b><br>#325286<br><i>7.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D3</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#663286;color:#FFF"><b>D4</b><br>#663286<br><i>8.9:1</i></span><span class="sw" style="background:#86327C;color:#FFF"><b>D5</b><br>#86327C<br><i>7.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D6</b><br>#863252<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#804038;color:#FFF"><b>D7</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#806438;color:#FFF"><b>D8</b><br>#806438<br><i>5.5:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#538038;color:#FFF"><b>D10</b><br>#538038<br><i>4.7:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D11</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D12</b><br>#388064<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2>laguna · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#D4DFE8;color:#000"><b>L2</b><br>#D4DFE8<br><i>12.2:1</i></span><span class="sw" style="background:#D4E8E3;color:#000"><b>L3</b><br>#D4E8E3<br><i>12.9:1</i></span><span class="sw" style="background:#D4D8E8;color:#000"><b>L4</b><br>#D4D8E8<br><i>11.6:1</i></span><span class="sw" style="background:#D4E8DD;color:#000"><b>L5</b><br>#D4E8DD<br><i>12.9:1</i></span><span class="sw" style="background:#D6D4E8;color:#000"><b>L6</b><br>#D6D4E8<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6D8;color:#000"><b>L7</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#D6E0E6;color:#000"><b>L8</b><br>#D6E0E6<br><i>12.3:1</i></span><span class="sw" style="background:#D6E6E4;color:#000"><b>L9</b><br>#D6E6E4<br><i>12.8:1</i></span><span class="sw" style="background:#D6DCE6;color:#000"><b>L10</b><br>#D6DCE6<br><i>12.0:1</i></span><span class="sw" style="background:#D6E6E0;color:#000"><b>L11</b><br>#D6E6E0<br><i>12.8:1</i></span><span class="sw" style="background:#D6E4E6;color:#000"><b>L12</b><br>#D6E4E6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#326086;color:#FFF"><b>D2</b><br>#326086<br><i>6.7:1</i></span><span class="sw" style="background:#308271;color:#FFF"><b>D3</b><br>#308271<br><i>4.6:1</i></span><span class="sw" style="background:#324486;color:#FFF"><b>D4</b><br>#324486<br><i>9.1:1</i></span><span class="sw" style="background:#308255;color:#FFF"><b>D5</b><br>#308255<br><i>4.7:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D6</b><br>#3B3286<br><i>10.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#388040;color:#FFF"><b>D7</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#386580;color:#FFF"><b>D8</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#388076;color:#FFF"><b>D9</b><br>#388076<br><i>4.6:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D10</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D11</b><br>#388064<br><i>4.7:1</i></span><span class="sw" style="background:#387780;color:#FFF"><b>D12</b><br>#387780<br><i>5.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2>burgundy · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#DDE7D5;color:#000"><b>L3</b><br>#DDE7D5<br><i>14.9:1</i></span><span class="sw" style="background:#E7DFD5;color:#000"><b>L4</b><br>#E7DFD5<br><i>14.4:1</i></span><span class="sw" style="background:#D6D5E7;color:#000"><b>L5</b><br>#D6D5E7<br><i>13.1:1</i></span><span class="sw" style="background:#D5E5E7;color:#000"><b>L6</b><br>#D5E5E7<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5E6D6;color:#000"><b>L7</b><br>#E5E6D6<br><i>15.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L8</b><br>#E6D6E2<br><i>13.6:1</i></span><span class="sw" style="background:#E6DBD6;color:#000"><b>L9</b><br>#E6DBD6<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6E3;color:#000"><b>L10</b><br>#D6E6E3<br><i>14.7:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L11</b><br>#D8E6D6<br><i>14.6:1</i></span><span class="sw" style="background:#DFD6E6;color:#000"><b>L12</b><br>#DFD6E6<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#52832B;color:#FFF"><b>D3</b><br>#52832B<br><i>4.5:1</i></span><span class="sw" style="background:#8A602D;color:#FFF"><b>D4</b><br>#8A602D<br><i>5.5:1</i></span><span class="sw" style="background:#322D8A;color:#FFF"><b>D5</b><br>#322D8A<br><i>11.2:1</i></span><span class="sw" style="background:#2D7E8A;color:#FFF"><b>D6</b><br>#2D7E8A<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#757830;color:#FFF"><b>D7</b><br>#757830<br><i>4.7:1</i></span><span class="sw" style="background:#833472;color:#FFF"><b>D8</b><br>#833472<br><i>7.8:1</i></span><span class="sw" style="background:#834C34;color:#FFF"><b>D9</b><br>#834C34<br><i>6.9:1</i></span><span class="sw" style="background:#348373;color:#FFF"><b>D10</b><br>#348373<br><i>4.5:1</i></span><span class="sw" style="background:#3E8334;color:#FFF"><b>D11</b><br>#3E8334<br><i>4.7:1</i></span><span class="sw" style="background:#603483;color:#FFF"><b>D12</b><br>#603483<br><i>9.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2>burgundy · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L3</b><br>#D5E2E7<br><i>14.3:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L4</b><br>#E7DAD5<br><i>13.9:1</i></span><span class="sw" style="background:#E7D5E2;color:#000"><b>L5</b><br>#E7D5E2<br><i>13.5:1</i></span><span class="sw" style="background:#D5E7E3;color:#000"><b>L6</b><br>#D5E7E3<br><i>14.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6E3D6;color:#000"><b>L7</b><br>#E6E3D6<br><i>14.7:1</i></span><span class="sw" style="background:#D9E6D6;color:#000"><b>L8</b><br>#D9E6D6<br><i>14.6:1</i></span><span class="sw" style="background:#D6D9E6;color:#000"><b>L9</b><br>#D6D9E6<br><i>13.5:1</i></span><span class="sw" style="background:#E3D6E6;color:#000"><b>L10</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E1E6D6;color:#000"><b>L11</b><br>#E1E6D6<br><i>14.9:1</i></span><span class="sw" style="background:#DBD6E6;color:#000"><b>L12</b><br>#DBD6E6<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#2D6E8A;color:#FFF"><b>D3</b><br>#2D6E8A<br><i>5.7:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D4</b><br>#8A492D<br><i>6.8:1</i></span><span class="sw" style="background:#8A2D6E;color:#FFF"><b>D5</b><br>#8A2D6E<br><i>7.8:1</i></span><span class="sw" style="background:#2B8371;color:#FFF"><b>D6</b><br>#2B8371<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#837334;color:#FFF"><b>D7</b><br>#837334<br><i>4.7:1</i></span><span class="sw" style="background:#448334;color:#FFF"><b>D8</b><br>#448334<br><i>4.6:1</i></span><span class="sw" style="background:#344483;color:#FFF"><b>D9</b><br>#344483<br><i>9.1:1</i></span><span class="sw" style="background:#733483;color:#FFF"><b>D10</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#667C32;color:#FFF"><b>D11</b><br>#667C32<br><i>4.7:1</i></span><span class="sw" style="background:#4C3483;color:#FFF"><b>D12</b><br>#4C3483<br><i>9.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2>burgundy · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L3</b><br>#E2E7D5<br><i>15.0:1</i></span><span class="sw" style="background:#DAD5E7;color:#000"><b>L4</b><br>#DAD5E7<br><i>13.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L5</b><br>#D5E2E7<br><i>14.3:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L6</b><br>#E7DAD5<br><i>13.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D7D6;color:#000"><b>L7</b><br>#E6D7D6<br><i>13.6:1</i></span><span class="sw" style="background:#D6E6DF;color:#000"><b>L8</b><br>#D6E6DF<br><i>14.7:1</i></span><span class="sw" style="background:#E5E6D6;color:#000"><b>L9</b><br>#E5E6D6<br><i>15.0:1</i></span><span class="sw" style="background:#DFD6E6;color:#000"><b>L10</b><br>#DFD6E6<br><i>13.4:1</i></span><span class="sw" style="background:#D6DDE6;color:#000"><b>L11</b><br>#D6DDE6<br><i>13.8:1</i></span><span class="sw" style="background:#E6DFD6;color:#000"><b>L12</b><br>#E6DFD6<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#657F2A;color:#FFF"><b>D3</b><br>#657F2A<br><i>4.5:1</i></span><span class="sw" style="background:#492D8A;color:#FFF"><b>D4</b><br>#492D8A<br><i>10.4:1</i></span><span class="sw" style="background:#2D6E8A;color:#FFF"><b>D5</b><br>#2D6E8A<br><i>5.7:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D6</b><br>#8A492D<br><i>6.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#833834;color:#FFF"><b>D7</b><br>#833834<br><i>8.1:1</i></span><span class="sw" style="background:#348360;color:#FFF"><b>D8</b><br>#348360<br><i>4.6:1</i></span><span class="sw" style="background:#757830;color:#FFF"><b>D9</b><br>#757830<br><i>4.7:1</i></span><span class="sw" style="background:#603483;color:#FFF"><b>D10</b><br>#603483<br><i>9.1:1</i></span><span class="sw" style="background:#345883;color:#FFF"><b>D11</b><br>#345883<br><i>7.3:1</i></span><span class="sw" style="background:#836034;color:#FFF"><b>D12</b><br>#836034<br><i>5.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2>burgundy · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L2</b><br>#E7DAD5<br><i>13.9:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L3</b><br>#E7E3D5<br><i>14.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L4</b><br>#E2E7D5<br><i>15.0:1</i></span><span class="sw" style="background:#D8E7D5;color:#000"><b>L5</b><br>#D8E7D5<br><i>14.7:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L6</b><br>#D5E7DA<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6E3;color:#000"><b>L7</b><br>#D6E6E3<br><i>14.7:1</i></span><span class="sw" style="background:#D6E1E6;color:#000"><b>L8</b><br>#D6E1E6<br><i>14.2:1</i></span><span class="sw" style="background:#D6D9E6;color:#000"><b>L9</b><br>#D6D9E6<br><i>13.5:1</i></span><span class="sw" style="background:#DBD6E6;color:#000"><b>L10</b><br>#DBD6E6<br><i>13.3:1</i></span><span class="sw" style="background:#E3D6E6;color:#000"><b>L11</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6E1;color:#000"><b>L12</b><br>#E6D6E1<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D2</b><br>#8A492D<br><i>6.8:1</i></span><span class="sw" style="background:#86742C;color:#FFF"><b>D3</b><br>#86742C<br><i>4.6:1</i></span><span class="sw" style="background:#657F2A;color:#FFF"><b>D4</b><br>#657F2A<br><i>4.5:1</i></span><span class="sw" style="background:#3E862C;color:#FFF"><b>D5</b><br>#3E862C<br><i>4.5:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D6</b><br>#2C8647<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#348373;color:#FFF"><b>D7</b><br>#348373<br><i>4.5:1</i></span><span class="sw" style="background:#346C83;color:#FFF"><b>D8</b><br>#346C83<br><i>5.8:1</i></span><span class="sw" style="background:#344483;color:#FFF"><b>D9</b><br>#344483<br><i>9.1:1</i></span><span class="sw" style="background:#4C3483;color:#FFF"><b>D10</b><br>#4C3483<br><i>9.9:1</i></span><span class="sw" style="background:#733483;color:#FFF"><b>D11</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#83346C;color:#FFF"><b>D12</b><br>#83346C<br><i>7.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2>burgundy · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D7D5;color:#000"><b>L2</b><br>#E7D7D5<br><i>13.6:1</i></span><span class="sw" style="background:#E7D5DE;color:#000"><b>L3</b><br>#E7D5DE<br><i>13.5:1</i></span><span class="sw" style="background:#E7DDD5;color:#000"><b>L4</b><br>#E7DDD5<br><i>14.2:1</i></span><span class="sw" style="background:#E7D5E5;color:#000"><b>L5</b><br>#E7D5E5<br><i>13.6:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L6</b><br>#E7E3D5<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3D6E6;color:#000"><b>L7</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D7D6;color:#000"><b>L8</b><br>#E6D7D6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6DD;color:#000"><b>L9</b><br>#E6D6DD<br><i>13.6:1</i></span><span class="sw" style="background:#E6DBD6;color:#000"><b>L10</b><br>#E6DBD6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6E1;color:#000"><b>L11</b><br>#E6D6E1<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6D9;color:#000"><b>L12</b><br>#E6D6D9<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#8A3A2D;color:#FFF"><b>D2</b><br>#8A3A2D<br><i>7.7:1</i></span><span class="sw" style="background:#8A2D5F;color:#FFF"><b>D3</b><br>#8A2D5F<br><i>8.0:1</i></span><span class="sw" style="background:#8A592D;color:#FFF"><b>D4</b><br>#8A592D<br><i>5.9:1</i></span><span class="sw" style="background:#8A2D7E;color:#FFF"><b>D5</b><br>#8A2D7E<br><i>7.6:1</i></span><span class="sw" style="background:#86742C;color:#FFF"><b>D6</b><br>#86742C<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#733483;color:#FFF"><b>D7</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#833834;color:#FFF"><b>D8</b><br>#833834<br><i>8.1:1</i></span><span class="sw" style="background:#833458;color:#FFF"><b>D9</b><br>#833458<br><i>8.1:1</i></span><span class="sw" style="background:#834C34;color:#FFF"><b>D10</b><br>#834C34<br><i>6.9:1</i></span><span class="sw" style="background:#83346C;color:#FFF"><b>D11</b><br>#83346C<br><i>7.9:1</i></span><span class="sw" style="background:#833444;color:#FFF"><b>D12</b><br>#833444<br><i>8.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2>crepuscolo · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#E6DAD5;color:#000"><b>L3</b><br>#E6DAD5<br><i>13.7:1</i></span><span class="sw" style="background:#E6D5E2;color:#000"><b>L4</b><br>#E6D5E2<br><i>13.3:1</i></span><span class="sw" style="background:#D5E6E2;color:#000"><b>L5</b><br>#D5E6E2<br><i>14.5:1</i></span><span class="sw" style="background:#D8E6D5;color:#000"><b>L6</b><br>#D8E6D5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DA;color:#000"><b>L7</b><br>#E5D7DA<br><i>13.4:1</i></span><span class="sw" style="background:#D7D8E5;color:#000"><b>L8</b><br>#D7D8E5<br><i>13.2:1</i></span><span class="sw" style="background:#E5D7E5;color:#000"><b>L9</b><br>#E5D7E5<br><i>13.5:1</i></span><span class="sw" style="background:#DEE5D7;color:#000"><b>L10</b><br>#DEE5D7<br><i>14.5:1</i></span><span class="sw" style="background:#E5DFD7;color:#000"><b>L11</b><br>#E5DFD7<br><i>14.1:1</i></span><span class="sw" style="background:#D7E1E5;color:#000"><b>L12</b><br>#D7E1E5<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#824936;color:#FFF"><b>D3</b><br>#824936<br><i>7.1:1</i></span><span class="sw" style="background:#82366F;color:#FFF"><b>D4</b><br>#82366F<br><i>7.8:1</i></span><span class="sw" style="background:#36826F;color:#FFF"><b>D5</b><br>#36826F<br><i>4.6:1</i></span><span class="sw" style="background:#428236;color:#FFF"><b>D6</b><br>#428236<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#7C3C4C;color:#FFF"><b>D7</b><br>#7C3C4C<br><i>8.1:1</i></span><span class="sw" style="background:#3C417C;color:#FFF"><b>D8</b><br>#3C417C<br><i>9.4:1</i></span><span class="sw" style="background:#7C3C7C;color:#FFF"><b>D9</b><br>#7C3C7C<br><i>7.5:1</i></span><span class="sw" style="background:#5C7C3C;color:#FFF"><b>D10</b><br>#5C7C3C<br><i>4.8:1</i></span><span class="sw" style="background:#7C613C;color:#FFF"><b>D11</b><br>#7C613C<br><i>5.8:1</i></span><span class="sw" style="background:#3C6C7C;color:#FFF"><b>D12</b><br>#3C6C7C<br><i>5.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2>crepuscolo · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#D5E6D5;color:#000"><b>L3</b><br>#D5E6D5<br><i>14.3:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L4</b><br>#E6D5E6<br><i>13.4:1</i></span><span class="sw" style="background:#D5D5E6;color:#000"><b>L5</b><br>#D5D5E6<br><i>12.9:1</i></span><span class="sw" style="background:#DEE6D5;color:#000"><b>L6</b><br>#DEE6D5<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DE;color:#000"><b>L7</b><br>#E5D7DE<br><i>13.4:1</i></span><span class="sw" style="background:#E5DED7;color:#000"><b>L8</b><br>#E5DED7<br><i>14.0:1</i></span><span class="sw" style="background:#D7E5DE;color:#000"><b>L9</b><br>#D7E5DE<br><i>14.4:1</i></span><span class="sw" style="background:#D7DEE5;color:#000"><b>L10</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#E5D7D7;color:#000"><b>L11</b><br>#E5D7D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E5E5;color:#000"><b>L12</b><br>#D7E5E5<br><i>14.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#368236;color:#FFF"><b>D3</b><br>#368236<br><i>4.8:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D4</b><br>#823682<br><i>7.5:1</i></span><span class="sw" style="background:#363682;color:#FFF"><b>D5</b><br>#363682<br><i>10.5:1</i></span><span class="sw" style="background:#597E34;color:#FFF"><b>D6</b><br>#597E34<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#7C3C5C;color:#FFF"><b>D7</b><br>#7C3C5C<br><i>7.9:1</i></span><span class="sw" style="background:#7C5C3C;color:#FFF"><b>D8</b><br>#7C5C3C<br><i>6.1:1</i></span><span class="sw" style="background:#3C7C5C;color:#FFF"><b>D9</b><br>#3C7C5C<br><i>5.0:1</i></span><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D10</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#7C3C3C;color:#FFF"><b>D11</b><br>#7C3C3C<br><i>8.2:1</i></span><span class="sw" style="background:#3C7C7C;color:#FFF"><b>D12</b><br>#3C7C7C<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2>crepuscolo · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#E6D5D5;color:#000"><b>L3</b><br>#E6D5D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6E6;color:#000"><b>L4</b><br>#D5E6E6<br><i>14.5:1</i></span><span class="sw" style="background:#D5E6D5;color:#000"><b>L5</b><br>#D5E6D5<br><i>14.3:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L6</b><br>#E6D5E6<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1D7E5;color:#000"><b>L7</b><br>#E1D7E5<br><i>13.4:1</i></span><span class="sw" style="background:#E1E5D7;color:#000"><b>L8</b><br>#E1E5D7<br><i>14.6:1</i></span><span class="sw" style="background:#E5D7DA;color:#000"><b>L9</b><br>#E5D7DA<br><i>13.4:1</i></span><span class="sw" style="background:#D7E1E5;color:#000"><b>L10</b><br>#D7E1E5<br><i>14.1:1</i></span><span class="sw" style="background:#D7E5DA;color:#000"><b>L11</b><br>#D7E5DA<br><i>14.3:1</i></span><span class="sw" style="background:#E5D7E1;color:#000"><b>L12</b><br>#E5D7E1<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#823636;color:#FFF"><b>D3</b><br>#823636<br><i>8.3:1</i></span><span class="sw" style="background:#347E7E;color:#FFF"><b>D4</b><br>#347E7E<br><i>4.7:1</i></span><span class="sw" style="background:#368236;color:#FFF"><b>D5</b><br>#368236<br><i>4.8:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D6</b><br>#823682<br><i>7.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6C3C7C;color:#FFF"><b>D7</b><br>#6C3C7C<br><i>8.2:1</i></span><span class="sw" style="background:#6C7C3C;color:#FFF"><b>D8</b><br>#6C7C3C<br><i>4.6:1</i></span><span class="sw" style="background:#7C3C4C;color:#FFF"><b>D9</b><br>#7C3C4C<br><i>8.1:1</i></span><span class="sw" style="background:#3C6C7C;color:#FFF"><b>D10</b><br>#3C6C7C<br><i>5.8:1</i></span><span class="sw" style="background:#3C7C4C;color:#FFF"><b>D11</b><br>#3C7C4C<br><i>5.0:1</i></span><span class="sw" style="background:#7C3C6C;color:#FFF"><b>D12</b><br>#7C3C6C<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2>crepuscolo · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L2</b><br>#E6D5E6<br><i>13.4:1</i></span><span class="sw" style="background:#E6D5DE;color:#000"><b>L3</b><br>#E6D5DE<br><i>13.3:1</i></span><span class="sw" style="background:#E6D5D5;color:#000"><b>L4</b><br>#E6D5D5<br><i>13.2:1</i></span><span class="sw" style="background:#E6DED5;color:#000"><b>L5</b><br>#E6DED5<br><i>14.0:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L6</b><br>#E6E6D5<br><i>14.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEE5D7;color:#000"><b>L7</b><br>#DEE5D7<br><i>14.5:1</i></span><span class="sw" style="background:#D7E5D7;color:#000"><b>L8</b><br>#D7E5D7<br><i>14.3:1</i></span><span class="sw" style="background:#D7E5DE;color:#000"><b>L9</b><br>#D7E5DE<br><i>14.4:1</i></span><span class="sw" style="background:#D7E5E5;color:#000"><b>L10</b><br>#D7E5E5<br><i>14.4:1</i></span><span class="sw" style="background:#D7DEE5;color:#000"><b>L11</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#D7D7E5;color:#000"><b>L12</b><br>#D7D7E5<br><i>13.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D2</b><br>#823682<br><i>7.5:1</i></span><span class="sw" style="background:#82365C;color:#FFF"><b>D3</b><br>#82365C<br><i>8.0:1</i></span><span class="sw" style="background:#823636;color:#FFF"><b>D4</b><br>#823636<br><i>8.3:1</i></span><span class="sw" style="background:#825C36;color:#FFF"><b>D5</b><br>#825C36<br><i>5.9:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D6</b><br>#777731<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5C7C3C;color:#FFF"><b>D7</b><br>#5C7C3C<br><i>4.8:1</i></span><span class="sw" style="background:#3C7C3C;color:#FFF"><b>D8</b><br>#3C7C3C<br><i>5.1:1</i></span><span class="sw" style="background:#3C7C5C;color:#FFF"><b>D9</b><br>#3C7C5C<br><i>5.0:1</i></span><span class="sw" style="background:#3C7C7C;color:#FFF"><b>D10</b><br>#3C7C7C<br><i>4.8:1</i></span><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D11</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#3C3C7C;color:#FFF"><b>D12</b><br>#3C3C7C<br><i>9.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2>crepuscolo · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E4D5E6;color:#000"><b>L2</b><br>#E4D5E6<br><i>13.3:1</i></span><span class="sw" style="background:#D8D5E6;color:#000"><b>L3</b><br>#D8D5E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D5E4;color:#000"><b>L4</b><br>#E6D5E4<br><i>13.4:1</i></span><span class="sw" style="background:#D5D8E6;color:#000"><b>L5</b><br>#D5D8E6<br><i>13.2:1</i></span><span class="sw" style="background:#E6D5DE;color:#000"><b>L6</b><br>#E6D5DE<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7DEE5;color:#000"><b>L7</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#E1D7E5;color:#000"><b>L8</b><br>#E1D7E5<br><i>13.4:1</i></span><span class="sw" style="background:#DAD7E5;color:#000"><b>L9</b><br>#DAD7E5<br><i>13.2:1</i></span><span class="sw" style="background:#E5D7E5;color:#000"><b>L10</b><br>#E5D7E5<br><i>13.5:1</i></span><span class="sw" style="background:#D7D7E5;color:#000"><b>L11</b><br>#D7D7E5<br><i>13.1:1</i></span><span class="sw" style="background:#DED7E5;color:#000"><b>L12</b><br>#DED7E5<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#753682;color:#FFF"><b>D2</b><br>#753682<br><i>8.1:1</i></span><span class="sw" style="background:#423682;color:#FFF"><b>D3</b><br>#423682<br><i>10.1:1</i></span><span class="sw" style="background:#823675;color:#FFF"><b>D4</b><br>#823675<br><i>7.7:1</i></span><span class="sw" style="background:#364282;color:#FFF"><b>D5</b><br>#364282<br><i>9.3:1</i></span><span class="sw" style="background:#82365C;color:#FFF"><b>D6</b><br>#82365C<br><i>8.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D7</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#6C3C7C;color:#FFF"><b>D8</b><br>#6C3C7C<br><i>8.2:1</i></span><span class="sw" style="background:#4C3C7C;color:#FFF"><b>D9</b><br>#4C3C7C<br><i>9.4:1</i></span><span class="sw" style="background:#7C3C7C;color:#FFF"><b>D10</b><br>#7C3C7C<br><i>7.5:1</i></span><span class="sw" style="background:#3C3C7C;color:#FFF"><b>D11</b><br>#3C3C7C<br><i>9.9:1</i></span><span class="sw" style="background:#5C3C7C;color:#FFF"><b>D12</b><br>#5C3C7C<br><i>8.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2>brina · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8E3;color:#000"><b>L3</b><br>#E3D8E3<br><i>11.5:1</i></span><span class="sw" style="background:#D9D8E3;color:#000"><b>L4</b><br>#D9D8E3<br><i>11.2:1</i></span><span class="sw" style="background:#DDE3D8;color:#000"><b>L5</b><br>#DDE3D8<br><i>12.1:1</i></span><span class="sw" style="background:#E3DFD8;color:#000"><b>L6</b><br>#E3DFD8<br><i>11.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DED9E3;color:#000"><b>L7</b><br>#DED9E3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3E0;color:#000"><b>L8</b><br>#D9E3E0<br><i>12.1:1</i></span><span class="sw" style="background:#D9DBE3;color:#000"><b>L9</b><br>#D9DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#E3DCD9;color:#000"><b>L10</b><br>#E3DCD9<br><i>11.7:1</i></span><span class="sw" style="background:#E3D9DF;color:#000"><b>L11</b><br>#E3D9DF<br><i>11.5:1</i></span><span class="sw" style="background:#D9E3DA;color:#000"><b>L12</b><br>#D9E3DA<br><i>12.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#793E76;color:#FFF"><b>D3</b><br>#793E76<br><i>7.6:1</i></span><span class="sw" style="background:#413E79;color:#FFF"><b>D4</b><br>#413E79<br><i>9.6:1</i></span><span class="sw" style="background:#59793E;color:#FFF"><b>D5</b><br>#59793E<br><i>5.0:1</i></span><span class="sw" style="background:#79643E;color:#FFF"><b>D6</b><br>#79643E<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5E4375;color:#FFF"><b>D7</b><br>#5E4375<br><i>8.3:1</i></span><span class="sw" style="background:#437567;color:#FFF"><b>D8</b><br>#437567<br><i>5.3:1</i></span><span class="sw" style="background:#434D75;color:#FFF"><b>D9</b><br>#434D75<br><i>8.2:1</i></span><span class="sw" style="background:#755243;color:#FFF"><b>D10</b><br>#755243<br><i>6.9:1</i></span><span class="sw" style="background:#754362;color:#FFF"><b>D11</b><br>#754362<br><i>7.7:1</i></span><span class="sw" style="background:#437545;color:#FFF"><b>D12</b><br>#437545<br><i>5.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2>brina · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E3E1D8;color:#000"><b>L3</b><br>#E3E1D8<br><i>12.1:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L4</b><br>#D8DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#D8E3E1;color:#000"><b>L5</b><br>#D8E3E1<br><i>12.1:1</i></span><span class="sw" style="background:#E3DCD8;color:#000"><b>L6</b><br>#E3DCD8<br><i>11.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCD9E3;color:#000"><b>L7</b><br>#DCD9E3<br><i>11.4:1</i></span><span class="sw" style="background:#E3D9E0;color:#000"><b>L8</b><br>#E3D9E0<br><i>11.5:1</i></span><span class="sw" style="background:#E0E3D9;color:#000"><b>L9</b><br>#E0E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#D9E3DC;color:#000"><b>L10</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#E1D9E3;color:#000"><b>L11</b><br>#E1D9E3<br><i>11.5:1</i></span><span class="sw" style="background:#DBE3D9;color:#000"><b>L12</b><br>#DBE3D9<br><i>12.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#796E3E;color:#FFF"><b>D3</b><br>#796E3E<br><i>5.1:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D4</b><br>#3E4A79<br><i>8.5:1</i></span><span class="sw" style="background:#3E796E;color:#FFF"><b>D5</b><br>#3E796E<br><i>5.0:1</i></span><span class="sw" style="background:#79503E;color:#FFF"><b>D6</b><br>#79503E<br><i>6.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#524375;color:#FFF"><b>D7</b><br>#524375<br><i>8.7:1</i></span><span class="sw" style="background:#754366;color:#FFF"><b>D8</b><br>#754366<br><i>7.6:1</i></span><span class="sw" style="background:#667543;color:#FFF"><b>D9</b><br>#667543<br><i>5.0:1</i></span><span class="sw" style="background:#437552;color:#FFF"><b>D10</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#6B4375;color:#FFF"><b>D11</b><br>#6B4375<br><i>7.8:1</i></span><span class="sw" style="background:#4D7543;color:#FFF"><b>D12</b><br>#4D7543<br><i>5.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2>brina · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E1D8E3;color:#000"><b>L3</b><br>#E1D8E3<br><i>11.4:1</i></span><span class="sw" style="background:#DBE3D8;color:#000"><b>L4</b><br>#DBE3D8<br><i>12.1:1</i></span><span class="sw" style="background:#E3E1D8;color:#000"><b>L5</b><br>#E3E1D8<br><i>12.1:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L6</b><br>#D8DBE3<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9DDE3;color:#000"><b>L7</b><br>#D9DDE3<br><i>11.6:1</i></span><span class="sw" style="background:#E3DAD9;color:#000"><b>L8</b><br>#E3DAD9<br><i>11.5:1</i></span><span class="sw" style="background:#DED9E3;color:#000"><b>L9</b><br>#DED9E3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3DA;color:#000"><b>L10</b><br>#D9E3DA<br><i>12.0:1</i></span><span class="sw" style="background:#E2E3D9;color:#000"><b>L11</b><br>#E2E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#DAD9E3;color:#000"><b>L12</b><br>#DAD9E3<br><i>11.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#6E3E79;color:#FFF"><b>D3</b><br>#6E3E79<br><i>8.0:1</i></span><span class="sw" style="background:#4A793E;color:#FFF"><b>D4</b><br>#4A793E<br><i>5.1:1</i></span><span class="sw" style="background:#796E3E;color:#FFF"><b>D5</b><br>#796E3E<br><i>5.1:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D6</b><br>#3E4A79<br><i>8.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#435975;color:#FFF"><b>D7</b><br>#435975<br><i>7.2:1</i></span><span class="sw" style="background:#754543;color:#FFF"><b>D8</b><br>#754543<br><i>7.8:1</i></span><span class="sw" style="background:#5E4375;color:#FFF"><b>D9</b><br>#5E4375<br><i>8.3:1</i></span><span class="sw" style="background:#437545;color:#FFF"><b>D10</b><br>#437545<br><i>5.4:1</i></span><span class="sw" style="background:#727543;color:#FFF"><b>D11</b><br>#727543<br><i>4.8:1</i></span><span class="sw" style="background:#454375;color:#FFF"><b>D12</b><br>#454375<br><i>9.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2>brina · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L2</b><br>#D8DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#DCD8E3;color:#000"><b>L3</b><br>#DCD8E3<br><i>11.3:1</i></span><span class="sw" style="background:#E1D8E3;color:#000"><b>L4</b><br>#E1D8E3<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8E0;color:#000"><b>L5</b><br>#E3D8E0<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L6</b><br>#E3D8DB<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3DCD9;color:#000"><b>L7</b><br>#E3DCD9<br><i>11.7:1</i></span><span class="sw" style="background:#E3E1D9;color:#000"><b>L8</b><br>#E3E1D9<br><i>12.1:1</i></span><span class="sw" style="background:#E0E3D9;color:#000"><b>L9</b><br>#E0E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#DBE3D9;color:#000"><b>L10</b><br>#DBE3D9<br><i>12.1:1</i></span><span class="sw" style="background:#D9E3DC;color:#000"><b>L11</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#D9E3E1;color:#000"><b>L12</b><br>#D9E3E1<br><i>12.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D2</b><br>#3E4A79<br><i>8.5:1</i></span><span class="sw" style="background:#503E79;color:#FFF"><b>D3</b><br>#503E79<br><i>9.1:1</i></span><span class="sw" style="background:#6E3E79;color:#FFF"><b>D4</b><br>#6E3E79<br><i>8.0:1</i></span><span class="sw" style="background:#793E68;color:#FFF"><b>D5</b><br>#793E68<br><i>7.8:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D6</b><br>#793E4A<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#755243;color:#FFF"><b>D7</b><br>#755243<br><i>6.9:1</i></span><span class="sw" style="background:#756B43;color:#FFF"><b>D8</b><br>#756B43<br><i>5.3:1</i></span><span class="sw" style="background:#667543;color:#FFF"><b>D9</b><br>#667543<br><i>5.0:1</i></span><span class="sw" style="background:#4D7543;color:#FFF"><b>D10</b><br>#4D7543<br><i>5.3:1</i></span><span class="sw" style="background:#437552;color:#FFF"><b>D11</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#43756B;color:#FFF"><b>D12</b><br>#43756B<br><i>5.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2>brina · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#D8DCE3;color:#000"><b>L2</b><br>#D8DCE3<br><i>11.5:1</i></span><span class="sw" style="background:#D8E3E3;color:#000"><b>L3</b><br>#D8E3E3<br><i>12.1:1</i></span><span class="sw" style="background:#D8D9E3;color:#000"><b>L4</b><br>#D8D9E3<br><i>11.3:1</i></span><span class="sw" style="background:#D8E3DF;color:#000"><b>L5</b><br>#D8E3DF<br><i>12.0:1</i></span><span class="sw" style="background:#DCD8E3;color:#000"><b>L6</b><br>#DCD8E3<br><i>11.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9E3DC;color:#000"><b>L7</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#D9DDE3;color:#000"><b>L8</b><br>#D9DDE3<br><i>11.6:1</i></span><span class="sw" style="background:#D9E2E3;color:#000"><b>L9</b><br>#D9E2E3<br><i>12.0:1</i></span><span class="sw" style="background:#D9DBE3;color:#000"><b>L10</b><br>#D9DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3E1;color:#000"><b>L11</b><br>#D9E3E1<br><i>12.1:1</i></span><span class="sw" style="background:#D9E0E3;color:#000"><b>L12</b><br>#D9E0E3<br><i>11.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#3E5479;color:#FFF"><b>D2</b><br>#3E5479<br><i>7.6:1</i></span><span class="sw" style="background:#3E7977;color:#FFF"><b>D3</b><br>#3E7977<br><i>5.0:1</i></span><span class="sw" style="background:#3E4079;color:#FFF"><b>D4</b><br>#3E4079<br><i>9.5:1</i></span><span class="sw" style="background:#3E7964;color:#FFF"><b>D5</b><br>#3E7964<br><i>5.1:1</i></span><span class="sw" style="background:#503E79;color:#FFF"><b>D6</b><br>#503E79<br><i>9.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#437552;color:#FFF"><b>D7</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#435975;color:#FFF"><b>D8</b><br>#435975<br><i>7.2:1</i></span><span class="sw" style="background:#437275;color:#FFF"><b>D9</b><br>#437275<br><i>5.4:1</i></span><span class="sw" style="background:#434D75;color:#FFF"><b>D10</b><br>#434D75<br><i>8.2:1</i></span><span class="sw" style="background:#43756B;color:#FFF"><b>D11</b><br>#43756B<br><i>5.3:1</i></span><span class="sw" style="background:#436675;color:#FFF"><b>D12</b><br>#436675<br><i>6.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2>magnolia · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#DDE5D6;color:#000"><b>L3</b><br>#DDE5D6<br><i>14.7:1</i></span><span class="sw" style="background:#E5DFD6;color:#000"><b>L4</b><br>#E5DFD6<br><i>14.3:1</i></span><span class="sw" style="background:#D7D6E5;color:#000"><b>L5</b><br>#D7D6E5<br><i>13.2:1</i></span><span class="sw" style="background:#D6E3E5;color:#000"><b>L6</b><br>#D6E3E5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3E4D7;color:#000"><b>L7</b><br>#E3E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#E4D7E1;color:#000"><b>L8</b><br>#E4D7E1<br><i>13.6:1</i></span><span class="sw" style="background:#E4DCD7;color:#000"><b>L9</b><br>#E4DCD7<br><i>14.0:1</i></span><span class="sw" style="background:#D7E4E2;color:#000"><b>L10</b><br>#D7E4E2<br><i>14.5:1</i></span><span class="sw" style="background:#D8E4D7;color:#000"><b>L11</b><br>#D8E4D7<br><i>14.4:1</i></span><span class="sw" style="background:#DFD7E4;color:#000"><b>L12</b><br>#DFD7E4<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#567E3A;color:#FFF"><b>D3</b><br>#567E3A<br><i>4.7:1</i></span><span class="sw" style="background:#7E613A;color:#FFF"><b>D4</b><br>#7E613A<br><i>5.7:1</i></span><span class="sw" style="background:#403A7E;color:#FFF"><b>D5</b><br>#403A7E<br><i>9.9:1</i></span><span class="sw" style="background:#3A727E;color:#FFF"><b>D6</b><br>#3A727E<br><i>5.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#74783F;color:#FFF"><b>D7</b><br>#74783F<br><i>4.7:1</i></span><span class="sw" style="background:#783F6A;color:#FFF"><b>D8</b><br>#783F6A<br><i>7.7:1</i></span><span class="sw" style="background:#78523F;color:#FFF"><b>D9</b><br>#78523F<br><i>6.8:1</i></span><span class="sw" style="background:#3F786F;color:#FFF"><b>D10</b><br>#3F786F<br><i>5.1:1</i></span><span class="sw" style="background:#44783F;color:#FFF"><b>D11</b><br>#44783F<br><i>5.2:1</i></span><span class="sw" style="background:#613F78;color:#FFF"><b>D12</b><br>#613F78<br><i>8.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2>magnolia · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#D6E0E5;color:#000"><b>L3</b><br>#D6E0E5<br><i>14.1:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L4</b><br>#E5DBD6<br><i>13.9:1</i></span><span class="sw" style="background:#E5D6E0;color:#000"><b>L5</b><br>#E5D6E0<br><i>13.6:1</i></span><span class="sw" style="background:#D6E5E3;color:#000"><b>L6</b><br>#D6E5E3<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E4E2D7;color:#000"><b>L7</b><br>#E4E2D7<br><i>14.6:1</i></span><span class="sw" style="background:#DAE4D7;color:#000"><b>L8</b><br>#DAE4D7<br><i>14.5:1</i></span><span class="sw" style="background:#D7DAE4;color:#000"><b>L9</b><br>#D7DAE4<br><i>13.6:1</i></span><span class="sw" style="background:#E2D7E4;color:#000"><b>L10</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E0E4D7;color:#000"><b>L11</b><br>#E0E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#DCD7E4;color:#000"><b>L12</b><br>#DCD7E4<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#3A677E;color:#FFF"><b>D3</b><br>#3A677E<br><i>6.1:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D4</b><br>#7E513A<br><i>6.7:1</i></span><span class="sw" style="background:#7E3A67;color:#FFF"><b>D5</b><br>#7E3A67<br><i>7.8:1</i></span><span class="sw" style="background:#3A7E72;color:#FFF"><b>D6</b><br>#3A7E72<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#786F3F;color:#FFF"><b>D7</b><br>#786F3F<br><i>5.1:1</i></span><span class="sw" style="background:#49783F;color:#FFF"><b>D8</b><br>#49783F<br><i>5.2:1</i></span><span class="sw" style="background:#3F4978;color:#FFF"><b>D9</b><br>#3F4978<br><i>8.6:1</i></span><span class="sw" style="background:#6F3F78;color:#FFF"><b>D10</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#65783F;color:#FFF"><b>D11</b><br>#65783F<br><i>4.9:1</i></span><span class="sw" style="background:#523F78;color:#FFF"><b>D12</b><br>#523F78<br><i>9.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2>magnolia · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#E0E5D6;color:#000"><b>L3</b><br>#E0E5D6<br><i>14.7:1</i></span><span class="sw" style="background:#DBD6E5;color:#000"><b>L4</b><br>#DBD6E5<br><i>13.3:1</i></span><span class="sw" style="background:#D6E0E5;color:#000"><b>L5</b><br>#D6E0E5<br><i>14.1:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L6</b><br>#E5DBD6<br><i>13.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E4D8D7;color:#000"><b>L7</b><br>#E4D8D7<br><i>13.6:1</i></span><span class="sw" style="background:#D7E4DF;color:#000"><b>L8</b><br>#D7E4DF<br><i>14.5:1</i></span><span class="sw" style="background:#E3E4D7;color:#000"><b>L9</b><br>#E3E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#DFD7E4;color:#000"><b>L10</b><br>#DFD7E4<br><i>13.5:1</i></span><span class="sw" style="background:#D7DDE4;color:#000"><b>L11</b><br>#D7DDE4<br><i>13.8:1</i></span><span class="sw" style="background:#E4DFD7;color:#000"><b>L12</b><br>#E4DFD7<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#677E3A;color:#FFF"><b>D3</b><br>#677E3A<br><i>4.5:1</i></span><span class="sw" style="background:#513A7E;color:#FFF"><b>D4</b><br>#513A7E<br><i>9.3:1</i></span><span class="sw" style="background:#3A677E;color:#FFF"><b>D5</b><br>#3A677E<br><i>6.1:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D6</b><br>#7E513A<br><i>6.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#78443F;color:#FFF"><b>D7</b><br>#78443F<br><i>7.8:1</i></span><span class="sw" style="background:#3F7861;color:#FFF"><b>D8</b><br>#3F7861<br><i>5.2:1</i></span><span class="sw" style="background:#74783F;color:#FFF"><b>D9</b><br>#74783F<br><i>4.7:1</i></span><span class="sw" style="background:#613F78;color:#FFF"><b>D10</b><br>#613F78<br><i>8.4:1</i></span><span class="sw" style="background:#3F5778;color:#FFF"><b>D11</b><br>#3F5778<br><i>7.4:1</i></span><span class="sw" style="background:#78613F;color:#FFF"><b>D12</b><br>#78613F<br><i>5.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2>magnolia · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L2</b><br>#E5DBD6<br><i>13.9:1</i></span><span class="sw" style="background:#E5E3D6;color:#000"><b>L3</b><br>#E5E3D6<br><i>14.7:1</i></span><span class="sw" style="background:#E0E5D6;color:#000"><b>L4</b><br>#E0E5D6<br><i>14.7:1</i></span><span class="sw" style="background:#D9E5D6;color:#000"><b>L5</b><br>#D9E5D6<br><i>14.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L6</b><br>#D6E5DB<br><i>14.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7E4E2;color:#000"><b>L7</b><br>#D7E4E2<br><i>14.5:1</i></span><span class="sw" style="background:#D7E0E4;color:#000"><b>L8</b><br>#D7E0E4<br><i>14.1:1</i></span><span class="sw" style="background:#D7DAE4;color:#000"><b>L9</b><br>#D7DAE4<br><i>13.6:1</i></span><span class="sw" style="background:#DCD7E4;color:#000"><b>L10</b><br>#DCD7E4<br><i>13.4:1</i></span><span class="sw" style="background:#E2D7E4;color:#000"><b>L11</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7E0;color:#000"><b>L12</b><br>#E4D7E0<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D2</b><br>#7E513A<br><i>6.7:1</i></span><span class="sw" style="background:#7E723A;color:#FFF"><b>D3</b><br>#7E723A<br><i>4.8:1</i></span><span class="sw" style="background:#677E3A;color:#FFF"><b>D4</b><br>#677E3A<br><i>4.5:1</i></span><span class="sw" style="background:#457E3A;color:#FFF"><b>D5</b><br>#457E3A<br><i>4.9:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D6</b><br>#3A7E51<br><i>4.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#3F786F;color:#FFF"><b>D7</b><br>#3F786F<br><i>5.1:1</i></span><span class="sw" style="background:#3F6578;color:#FFF"><b>D8</b><br>#3F6578<br><i>6.3:1</i></span><span class="sw" style="background:#3F4978;color:#FFF"><b>D9</b><br>#3F4978<br><i>8.6:1</i></span><span class="sw" style="background:#523F78;color:#FFF"><b>D10</b><br>#523F78<br><i>9.0:1</i></span><span class="sw" style="background:#6F3F78;color:#FFF"><b>D11</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#783F65;color:#FFF"><b>D12</b><br>#783F65<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2>magnolia · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#E5D9D6;color:#000"><b>L2</b><br>#E5D9D6<br><i>13.7:1</i></span><span class="sw" style="background:#E5D6DE;color:#000"><b>L3</b><br>#E5D6DE<br><i>13.5:1</i></span><span class="sw" style="background:#E5DED6;color:#000"><b>L4</b><br>#E5DED6<br><i>14.2:1</i></span><span class="sw" style="background:#E5D6E3;color:#000"><b>L5</b><br>#E5D6E3<br><i>13.6:1</i></span><span class="sw" style="background:#E5E3D6;color:#000"><b>L6</b><br>#E5E3D6<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E2D7E4;color:#000"><b>L7</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E4D8D7;color:#000"><b>L8</b><br>#E4D8D7<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7DD;color:#000"><b>L9</b><br>#E4D7DD<br><i>13.6:1</i></span><span class="sw" style="background:#E4DCD7;color:#000"><b>L10</b><br>#E4DCD7<br><i>14.0:1</i></span><span class="sw" style="background:#E4D7E0;color:#000"><b>L11</b><br>#E4D7E0<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7DA;color:#000"><b>L12</b><br>#E4D7DA<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#7E453A;color:#FFF"><b>D2</b><br>#7E453A<br><i>7.5:1</i></span><span class="sw" style="background:#7E3A5C;color:#FFF"><b>D3</b><br>#7E3A5C<br><i>7.9:1</i></span><span class="sw" style="background:#7E5C3A;color:#FFF"><b>D4</b><br>#7E5C3A<br><i>6.0:1</i></span><span class="sw" style="background:#7E3A72;color:#FFF"><b>D5</b><br>#7E3A72<br><i>7.7:1</i></span><span class="sw" style="background:#7E723A;color:#FFF"><b>D6</b><br>#7E723A<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6F3F78;color:#FFF"><b>D7</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#78443F;color:#FFF"><b>D8</b><br>#78443F<br><i>7.8:1</i></span><span class="sw" style="background:#783F57;color:#FFF"><b>D9</b><br>#783F57<br><i>7.9:1</i></span><span class="sw" style="background:#78523F;color:#FFF"><b>D10</b><br>#78523F<br><i>6.8:1</i></span><span class="sw" style="background:#783F65;color:#FFF"><b>D11</b><br>#783F65<br><i>7.8:1</i></span><span class="sw" style="background:#783F49;color:#FFF"><b>D12</b><br>#783F49<br><i>8.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2>atelier · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DC;color:#000"><b>L3</b><br>#DAE2DC<br><i>13.2:1</i></span><span class="sw" style="background:#DFE2DA;color:#000"><b>L4</b><br>#DFE2DA<br><i>13.3:1</i></span><span class="sw" style="background:#E0DAE2;color:#000"><b>L5</b><br>#E0DAE2<br><i>12.7:1</i></span><span class="sw" style="background:#DADBE2;color:#000"><b>L6</b><br>#DADBE2<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCE1DB;color:#000"><b>L7</b><br>#DCE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L8</b><br>#E1DBDB<br><i>12.7:1</i></span><span class="sw" style="background:#E1E1DB;color:#000"><b>L9</b><br>#E1E1DB<br><i>13.3:1</i></span><span class="sw" style="background:#DBDEE1;color:#000"><b>L10</b><br>#DBDEE1<br><i>12.9:1</i></span><span class="sw" style="background:#DBE1DF;color:#000"><b>L11</b><br>#DBE1DF<br><i>13.2:1</i></span><span class="sw" style="background:#E1DBDF;color:#000"><b>L12</b><br>#E1DBDF<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#427551;color:#FFF"><b>D3</b><br>#427551<br><i>5.4:1</i></span><span class="sw" style="background:#677542;color:#FFF"><b>D4</b><br>#677542<br><i>5.0:1</i></span><span class="sw" style="background:#6A4275;color:#FFF"><b>D5</b><br>#6A4275<br><i>7.9:1</i></span><span class="sw" style="background:#424975;color:#FFF"><b>D6</b><br>#424975<br><i>8.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#507146;color:#FFF"><b>D7</b><br>#507146<br><i>5.5:1</i></span><span class="sw" style="background:#714648;color:#FFF"><b>D8</b><br>#714648<br><i>7.9:1</i></span><span class="sw" style="background:#707146;color:#FFF"><b>D9</b><br>#707146<br><i>5.1:1</i></span><span class="sw" style="background:#465A71;color:#FFF"><b>D10</b><br>#465A71<br><i>7.1:1</i></span><span class="sw" style="background:#467161;color:#FFF"><b>D11</b><br>#467161<br><i>5.5:1</i></span><span class="sw" style="background:#714665;color:#FFF"><b>D12</b><br>#714665<br><i>7.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2>atelier · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DADAE2;color:#000"><b>L3</b><br>#DADAE2<br><i>12.5:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L4</b><br>#E1E2DA<br><i>13.4:1</i></span><span class="sw" style="background:#E2DADA;color:#000"><b>L5</b><br>#E2DADA<br><i>12.7:1</i></span><span class="sw" style="background:#DADEE2;color:#000"><b>L6</b><br>#DADEE2<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEE1DB;color:#000"><b>L7</b><br>#DEE1DB<br><i>13.2:1</i></span><span class="sw" style="background:#DBE1DE;color:#000"><b>L8</b><br>#DBE1DE<br><i>13.1:1</i></span><span class="sw" style="background:#DEDBE1;color:#000"><b>L9</b><br>#DEDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#E1DBDE;color:#000"><b>L10</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#DBE1DB;color:#000"><b>L11</b><br>#DBE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBE1;color:#000"><b>L12</b><br>#E1DBE1<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#444275;color:#FFF"><b>D3</b><br>#444275<br><i>9.2:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D4</b><br>#737542<br><i>4.8:1</i></span><span class="sw" style="background:#754442;color:#FFF"><b>D5</b><br>#754442<br><i>7.9:1</i></span><span class="sw" style="background:#425A75;color:#FFF"><b>D6</b><br>#425A75<br><i>7.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5A7146;color:#FFF"><b>D7</b><br>#5A7146<br><i>5.4:1</i></span><span class="sw" style="background:#46715D;color:#FFF"><b>D8</b><br>#46715D<br><i>5.6:1</i></span><span class="sw" style="background:#5D4671;color:#FFF"><b>D9</b><br>#5D4671<br><i>8.1:1</i></span><span class="sw" style="background:#71465A;color:#FFF"><b>D10</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#467148;color:#FFF"><b>D11</b><br>#467148<br><i>5.7:1</i></span><span class="sw" style="background:#714670;color:#FFF"><b>D12</b><br>#714670<br><i>7.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2>atelier · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DA;color:#000"><b>L3</b><br>#DAE2DA<br><i>13.2:1</i></span><span class="sw" style="background:#E2DAE1;color:#000"><b>L4</b><br>#E2DAE1<br><i>12.7:1</i></span><span class="sw" style="background:#DADAE2;color:#000"><b>L5</b><br>#DADAE2<br><i>12.5:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L6</b><br>#E1E2DA<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1E0DB;color:#000"><b>L7</b><br>#E1E0DB<br><i>13.2:1</i></span><span class="sw" style="background:#DBDFE1;color:#000"><b>L8</b><br>#DBDFE1<br><i>13.0:1</i></span><span class="sw" style="background:#DCE1DB;color:#000"><b>L9</b><br>#DCE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBDF;color:#000"><b>L10</b><br>#E1DBDF<br><i>12.8:1</i></span><span class="sw" style="background:#DDDBE1;color:#000"><b>L11</b><br>#DDDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#DFE1DB;color:#000"><b>L12</b><br>#DFE1DB<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#427544;color:#FFF"><b>D3</b><br>#427544<br><i>5.4:1</i></span><span class="sw" style="background:#754273;color:#FFF"><b>D4</b><br>#754273<br><i>7.5:1</i></span><span class="sw" style="background:#444275;color:#FFF"><b>D5</b><br>#444275<br><i>9.2:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D6</b><br>#737542<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#716846;color:#FFF"><b>D7</b><br>#716846<br><i>5.6:1</i></span><span class="sw" style="background:#466571;color:#FFF"><b>D8</b><br>#466571<br><i>6.2:1</i></span><span class="sw" style="background:#507146;color:#FFF"><b>D9</b><br>#507146<br><i>5.5:1</i></span><span class="sw" style="background:#714665;color:#FFF"><b>D10</b><br>#714665<br><i>7.6:1</i></span><span class="sw" style="background:#524671;color:#FFF"><b>D11</b><br>#524671<br><i>8.5:1</i></span><span class="sw" style="background:#657146;color:#FFF"><b>D12</b><br>#657146<br><i>5.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2>atelier · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L2</b><br>#E1E2DA<br><i>13.4:1</i></span><span class="sw" style="background:#DEE2DA;color:#000"><b>L3</b><br>#DEE2DA<br><i>13.3:1</i></span><span class="sw" style="background:#DAE2DA;color:#000"><b>L4</b><br>#DAE2DA<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DE;color:#000"><b>L5</b><br>#DAE2DE<br><i>13.2:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L6</b><br>#DAE1E2<br><i>13.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DBDEE1;color:#000"><b>L7</b><br>#DBDEE1<br><i>12.9:1</i></span><span class="sw" style="background:#DBDBE1;color:#000"><b>L8</b><br>#DBDBE1<br><i>12.6:1</i></span><span class="sw" style="background:#DEDBE1;color:#000"><b>L9</b><br>#DEDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#E1DBE1;color:#000"><b>L10</b><br>#E1DBE1<br><i>12.8:1</i></span><span class="sw" style="background:#E1DBDE;color:#000"><b>L11</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L12</b><br>#E1DBDB<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D2</b><br>#737542<br><i>4.8:1</i></span><span class="sw" style="background:#5A7542;color:#FFF"><b>D3</b><br>#5A7542<br><i>5.2:1</i></span><span class="sw" style="background:#427544;color:#FFF"><b>D4</b><br>#427544<br><i>5.4:1</i></span><span class="sw" style="background:#42755D;color:#FFF"><b>D5</b><br>#42755D<br><i>5.3:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D6</b><br>#427375<br><i>5.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#465A71;color:#FFF"><b>D7</b><br>#465A71<br><i>7.1:1</i></span><span class="sw" style="background:#484671;color:#FFF"><b>D8</b><br>#484671<br><i>8.8:1</i></span><span class="sw" style="background:#5D4671;color:#FFF"><b>D9</b><br>#5D4671<br><i>8.1:1</i></span><span class="sw" style="background:#714670;color:#FFF"><b>D10</b><br>#714670<br><i>7.5:1</i></span><span class="sw" style="background:#71465A;color:#FFF"><b>D11</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#714846;color:#FFF"><b>D12</b><br>#714846<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2>atelier · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#E2E1DA;color:#000"><b>L2</b><br>#E2E1DA<br><i>13.3:1</i></span><span class="sw" style="background:#E2DCDA;color:#000"><b>L3</b><br>#E2DCDA<br><i>12.9:1</i></span><span class="sw" style="background:#E0E2DA;color:#000"><b>L4</b><br>#E0E2DA<br><i>13.3:1</i></span><span class="sw" style="background:#E2DADB;color:#000"><b>L5</b><br>#E2DADB<br><i>12.7:1</i></span><span class="sw" style="background:#DEE2DA;color:#000"><b>L6</b><br>#DEE2DA<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1DBDE;color:#000"><b>L7</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#E1E0DB;color:#000"><b>L8</b><br>#E1E0DB<br><i>13.2:1</i></span><span class="sw" style="background:#E1DDDB;color:#000"><b>L9</b><br>#E1DDDB<br><i>12.9:1</i></span><span class="sw" style="background:#E1E1DB;color:#000"><b>L10</b><br>#E1E1DB<br><i>13.3:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L11</b><br>#E1DBDB<br><i>12.7:1</i></span><span class="sw" style="background:#E1DEDB;color:#000"><b>L12</b><br>#E1DEDB<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#756E42;color:#FFF"><b>D2</b><br>#756E42<br><i>5.2:1</i></span><span class="sw" style="background:#754D42;color:#FFF"><b>D3</b><br>#754D42<br><i>7.2:1</i></span><span class="sw" style="background:#6B7542;color:#FFF"><b>D4</b><br>#6B7542<br><i>4.9:1</i></span><span class="sw" style="background:#754249;color:#FFF"><b>D5</b><br>#754249<br><i>8.0:1</i></span><span class="sw" style="background:#5A7542;color:#FFF"><b>D6</b><br>#5A7542<br><i>5.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#71465A;color:#FFF"><b>D7</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#716846;color:#FFF"><b>D8</b><br>#716846<br><i>5.6:1</i></span><span class="sw" style="background:#715246;color:#FFF"><b>D9</b><br>#715246<br><i>7.0:1</i></span><span class="sw" style="background:#707146;color:#FFF"><b>D10</b><br>#707146<br><i>5.1:1</i></span><span class="sw" style="background:#714846;color:#FFF"><b>D11</b><br>#714846<br><i>7.7:1</i></span><span class="sw" style="background:#715D46;color:#FFF"><b>D12</b><br>#715D46<br><i>6.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2>ardesia · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDF;color:#000"><b>L3</b><br>#E0DCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DDDCE0;color:#000"><b>L4</b><br>#DDDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DDE0DC;color:#000"><b>L5</b><br>#DDE0DC<br><i>13.4:1</i></span><span class="sw" style="background:#E0DFDC;color:#000"><b>L6</b><br>#E0DFDC<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDCDF;color:#000"><b>L7</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L8</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDCDF;color:#000"><b>L9</b><br>#DCDCDF<br><i>13.0:1</i></span><span class="sw" style="background:#DFDEDC;color:#000"><b>L10</b><br>#DFDEDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDCDE;color:#000"><b>L11</b><br>#DFDCDE<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDD;color:#000"><b>L12</b><br>#DCDFDD<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B4D63;color:#FFF"><b>D3</b><br>#6B4D63<br><i>7.3:1</i></span><span class="sw" style="background:#544D6B;color:#FFF"><b>D4</b><br>#544D6B<br><i>7.9:1</i></span><span class="sw" style="background:#546B4D;color:#FFF"><b>D5</b><br>#546B4D<br><i>5.9:1</i></span><span class="sw" style="background:#6B664D;color:#FFF"><b>D6</b><br>#6B664D<br><i>5.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#624F69;color:#FFF"><b>D7</b><br>#624F69<br><i>7.4:1</i></span><span class="sw" style="background:#4F6967;color:#FFF"><b>D8</b><br>#4F6967<br><i>5.9:1</i></span><span class="sw" style="background:#4F4F69;color:#FFF"><b>D9</b><br>#4F4F69<br><i>7.9:1</i></span><span class="sw" style="background:#695C4F;color:#FFF"><b>D10</b><br>#695C4F<br><i>6.5:1</i></span><span class="sw" style="background:#694F5A;color:#FFF"><b>D11</b><br>#694F5A<br><i>7.3:1</i></span><span class="sw" style="background:#4F6955;color:#FFF"><b>D12</b><br>#4F6955<br><i>6.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2>ardesia · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0E0DC;color:#000"><b>L3</b><br>#E0E0DC<br><i>13.5:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L4</b><br>#DCDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DCE0E0;color:#000"><b>L5</b><br>#DCE0E0<br><i>13.4:1</i></span><span class="sw" style="background:#E0DEDC;color:#000"><b>L6</b><br>#E0DEDC<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDCDF;color:#000"><b>L7</b><br>#DEDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DFDCDE;color:#000"><b>L8</b><br>#DFDCDE<br><i>13.1:1</i></span><span class="sw" style="background:#DEDFDC;color:#000"><b>L9</b><br>#DEDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDE;color:#000"><b>L10</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DFDCDF;color:#000"><b>L11</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDC;color:#000"><b>L12</b><br>#DCDFDC<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B6B4D;color:#FFF"><b>D3</b><br>#6B6B4D<br><i>5.5:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D4</b><br>#4D4D6B<br><i>8.1:1</i></span><span class="sw" style="background:#4D6B6B;color:#FFF"><b>D5</b><br>#4D6B6B<br><i>5.8:1</i></span><span class="sw" style="background:#6B5C4D;color:#FFF"><b>D6</b><br>#6B5C4D<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5C4F69;color:#FFF"><b>D7</b><br>#5C4F69<br><i>7.6:1</i></span><span class="sw" style="background:#694F5C;color:#FFF"><b>D8</b><br>#694F5C<br><i>7.3:1</i></span><span class="sw" style="background:#5C694F;color:#FFF"><b>D9</b><br>#5C694F<br><i>5.9:1</i></span><span class="sw" style="background:#4F695C;color:#FFF"><b>D10</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#694F69;color:#FFF"><b>D11</b><br>#694F69<br><i>7.2:1</i></span><span class="sw" style="background:#4F694F;color:#FFF"><b>D12</b><br>#4F694F<br><i>6.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2>ardesia · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCE0;color:#000"><b>L3</b><br>#E0DCE0<br><i>13.1:1</i></span><span class="sw" style="background:#DCE0DC;color:#000"><b>L4</b><br>#DCE0DC<br><i>13.3:1</i></span><span class="sw" style="background:#E0E0DC;color:#000"><b>L5</b><br>#E0E0DC<br><i>13.5:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L6</b><br>#DCDCE0<br><i>13.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCDDDF;color:#000"><b>L7</b><br>#DCDDDF<br><i>13.1:1</i></span><span class="sw" style="background:#DFDDDC;color:#000"><b>L8</b><br>#DFDDDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDCDF;color:#000"><b>L9</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDD;color:#000"><b>L10</b><br>#DCDFDD<br><i>13.3:1</i></span><span class="sw" style="background:#DFDFDC;color:#000"><b>L11</b><br>#DFDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DDDCDF;color:#000"><b>L12</b><br>#DDDCDF<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B4D6B;color:#FFF"><b>D3</b><br>#6B4D6B<br><i>7.2:1</i></span><span class="sw" style="background:#4D6B4D;color:#FFF"><b>D4</b><br>#4D6B4D<br><i>6.0:1</i></span><span class="sw" style="background:#6B6B4D;color:#FFF"><b>D5</b><br>#6B6B4D<br><i>5.5:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D6</b><br>#4D4D6B<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4F5569;color:#FFF"><b>D7</b><br>#4F5569<br><i>7.4:1</i></span><span class="sw" style="background:#69554F;color:#FFF"><b>D8</b><br>#69554F<br><i>7.0:1</i></span><span class="sw" style="background:#624F69;color:#FFF"><b>D9</b><br>#624F69<br><i>7.4:1</i></span><span class="sw" style="background:#4F6955;color:#FFF"><b>D10</b><br>#4F6955<br><i>6.0:1</i></span><span class="sw" style="background:#62694F;color:#FFF"><b>D11</b><br>#62694F<br><i>5.7:1</i></span><span class="sw" style="background:#554F69;color:#FFF"><b>D12</b><br>#554F69<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2>ardesia · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L2</b><br>#DCDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DEDCE0;color:#000"><b>L3</b><br>#DEDCE0<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCE0;color:#000"><b>L4</b><br>#E0DCE0<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDE;color:#000"><b>L5</b><br>#E0DCDE<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L6</b><br>#E0DCDC<br><i>13.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDEDC;color:#000"><b>L7</b><br>#DFDEDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDFDC;color:#000"><b>L8</b><br>#DFDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DEDFDC;color:#000"><b>L9</b><br>#DEDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDC;color:#000"><b>L10</b><br>#DCDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDE;color:#000"><b>L11</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L12</b><br>#DCDFDF<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D2</b><br>#4D4D6B<br><i>8.1:1</i></span><span class="sw" style="background:#5C4D6B;color:#FFF"><b>D3</b><br>#5C4D6B<br><i>7.7:1</i></span><span class="sw" style="background:#6B4D6B;color:#FFF"><b>D4</b><br>#6B4D6B<br><i>7.2:1</i></span><span class="sw" style="background:#6B4D5C;color:#FFF"><b>D5</b><br>#6B4D5C<br><i>7.4:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D6</b><br>#6B4D4D<br><i>7.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#695C4F;color:#FFF"><b>D7</b><br>#695C4F<br><i>6.5:1</i></span><span class="sw" style="background:#69694F;color:#FFF"><b>D8</b><br>#69694F<br><i>5.6:1</i></span><span class="sw" style="background:#5C694F;color:#FFF"><b>D9</b><br>#5C694F<br><i>5.9:1</i></span><span class="sw" style="background:#4F694F;color:#FFF"><b>D10</b><br>#4F694F<br><i>6.1:1</i></span><span class="sw" style="background:#4F695C;color:#FFF"><b>D11</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#4F6969;color:#FFF"><b>D12</b><br>#4F6969<br><i>5.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2>ardesia · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#DCDDE0;color:#000"><b>L2</b><br>#DCDDE0<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFE0;color:#000"><b>L3</b><br>#DCDFE0<br><i>13.3:1</i></span><span class="sw" style="background:#DDDCE0;color:#000"><b>L4</b><br>#DDDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DCE0DF;color:#000"><b>L5</b><br>#DCE0DF<br><i>13.4:1</i></span><span class="sw" style="background:#DEDCE0;color:#000"><b>L6</b><br>#DEDCE0<br><i>13.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCDFDE;color:#000"><b>L7</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DCDDDF;color:#000"><b>L8</b><br>#DCDDDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L9</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDCDF;color:#000"><b>L10</b><br>#DCDCDF<br><i>13.0:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L11</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDEDF;color:#000"><b>L12</b><br>#DCDEDF<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#4D526B;color:#FFF"><b>D2</b><br>#4D526B<br><i>7.7:1</i></span><span class="sw" style="background:#4D666B;color:#FFF"><b>D3</b><br>#4D666B<br><i>6.1:1</i></span><span class="sw" style="background:#524D6B;color:#FFF"><b>D4</b><br>#524D6B<br><i>8.0:1</i></span><span class="sw" style="background:#4D6B66;color:#FFF"><b>D5</b><br>#4D6B66<br><i>5.8:1</i></span><span class="sw" style="background:#5C4D6B;color:#FFF"><b>D6</b><br>#5C4D6B<br><i>7.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4F695C;color:#FFF"><b>D7</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#4F5569;color:#FFF"><b>D8</b><br>#4F5569<br><i>7.4:1</i></span><span class="sw" style="background:#4F6269;color:#FFF"><b>D9</b><br>#4F6269<br><i>6.4:1</i></span><span class="sw" style="background:#4F4F69;color:#FFF"><b>D10</b><br>#4F4F69<br><i>7.9:1</i></span><span class="sw" style="background:#4F6969;color:#FFF"><b>D11</b><br>#4F6969<br><i>5.9:1</i></span><span class="sw" style="background:#4F5C69;color:#FFF"><b>D12</b><br>#4F5C69<br><i>6.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2>concrete · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L3</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L5</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L6</b><br>#DDDEDF<br><i>14.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDFDD;color:#000"><b>L7</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L8</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L9</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDF;color:#000"><b>L10</b><br>#DDDFDF<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L11</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L12</b><br>#DEDDDF<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#55684F;color:#FFF"><b>D3</b><br>#55684F<br><i>6.0:1</i></span><span class="sw" style="background:#68624F;color:#FFF"><b>D4</b><br>#68624F<br><i>6.1:1</i></span><span class="sw" style="background:#554F68;color:#FFF"><b>D5</b><br>#554F68<br><i>7.8:1</i></span><span class="sw" style="background:#4F6068;color:#FFF"><b>D6</b><br>#4F6068<br><i>6.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#616751;color:#FFF"><b>D7</b><br>#616751<br><i>5.9:1</i></span><span class="sw" style="background:#67515E;color:#FFF"><b>D8</b><br>#67515E<br><i>7.2:1</i></span><span class="sw" style="background:#675C51;color:#FFF"><b>D9</b><br>#675C51<br><i>6.5:1</i></span><span class="sw" style="background:#516767;color:#FFF"><b>D10</b><br>#516767<br><i>6.0:1</i></span><span class="sw" style="background:#516753;color:#FFF"><b>D11</b><br>#516753<br><i>6.1:1</i></span><span class="sw" style="background:#615167;color:#FFF"><b>D12</b><br>#615167<br><i>7.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2>concrete · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L3</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L5</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDF;color:#000"><b>L6</b><br>#DDDFDF<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDFDD;color:#000"><b>L7</b><br>#DFDFDD<br><i>14.4:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L8</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L9</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DFDDDF;color:#000"><b>L10</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L11</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L12</b><br>#DEDDDF<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#4F5C68;color:#FFF"><b>D3</b><br>#4F5C68<br><i>6.9:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D4</b><br>#685C4F<br><i>6.5:1</i></span><span class="sw" style="background:#684F5C;color:#FFF"><b>D5</b><br>#684F5C<br><i>7.3:1</i></span><span class="sw" style="background:#4F6868;color:#FFF"><b>D6</b><br>#4F6868<br><i>6.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#676751;color:#FFF"><b>D7</b><br>#676751<br><i>5.8:1</i></span><span class="sw" style="background:#516751;color:#FFF"><b>D8</b><br>#516751<br><i>6.2:1</i></span><span class="sw" style="background:#515167;color:#FFF"><b>D9</b><br>#515167<br><i>7.7:1</i></span><span class="sw" style="background:#675167;color:#FFF"><b>D10</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#5C6751;color:#FFF"><b>D11</b><br>#5C6751<br><i>6.0:1</i></span><span class="sw" style="background:#5C5167;color:#FFF"><b>D12</b><br>#5C5167<br><i>7.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2>concrete · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>10/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L3</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L4</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L5</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L6</b><br>#DFDEDD<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L7</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L8</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L9</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L10</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L11</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L12</b><br>#DFDEDD<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#5C684F;color:#FFF"><b>D3</b><br>#5C684F<br><i>5.9:1</i></span><span class="sw" style="background:#5C4F68;color:#FFF"><b>D4</b><br>#5C4F68<br><i>7.6:1</i></span><span class="sw" style="background:#4F5C68;color:#FFF"><b>D5</b><br>#4F5C68<br><i>6.9:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D6</b><br>#685C4F<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#675651;color:#FFF"><b>D7</b><br>#675651<br><i>6.9:1</i></span><span class="sw" style="background:#516761;color:#FFF"><b>D8</b><br>#516761<br><i>6.1:1</i></span><span class="sw" style="background:#616751;color:#FFF"><b>D9</b><br>#616751<br><i>5.9:1</i></span><span class="sw" style="background:#615167;color:#FFF"><b>D10</b><br>#615167<br><i>7.3:1</i></span><span class="sw" style="background:#515667;color:#FFF"><b>D11</b><br>#515667<br><i>7.3:1</i></span><span class="sw" style="background:#676151;color:#FFF"><b>D12</b><br>#676151<br><i>6.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2>concrete · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>10/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L2</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDFDD;color:#000"><b>L3</b><br>#DFDFDD<br><i>14.4:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L4</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L5</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L6</b><br>#DDDFDE<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DDDFDF;color:#000"><b>L7</b><br>#DDDFDF<br><i>14.3:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L8</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L9</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L10</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDF;color:#000"><b>L11</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L12</b><br>#DFDDDE<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D2</b><br>#685C4F<br><i>6.5:1</i></span><span class="sw" style="background:#68684F;color:#FFF"><b>D3</b><br>#68684F<br><i>5.7:1</i></span><span class="sw" style="background:#5C684F;color:#FFF"><b>D4</b><br>#5C684F<br><i>5.9:1</i></span><span class="sw" style="background:#4F684F;color:#FFF"><b>D5</b><br>#4F684F<br><i>6.1:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D6</b><br>#4F685C<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#516767;color:#FFF"><b>D7</b><br>#516767<br><i>6.0:1</i></span><span class="sw" style="background:#515C67;color:#FFF"><b>D8</b><br>#515C67<br><i>6.8:1</i></span><span class="sw" style="background:#515167;color:#FFF"><b>D9</b><br>#515167<br><i>7.7:1</i></span><span class="sw" style="background:#5C5167;color:#FFF"><b>D10</b><br>#5C5167<br><i>7.4:1</i></span><span class="sw" style="background:#675167;color:#FFF"><b>D11</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#67515C;color:#FFF"><b>D12</b><br>#67515C<br><i>7.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2>concrete · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L2</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L3</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L5</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDFDD;color:#000"><b>L6</b><br>#DFDFDD<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDDDF;color:#000"><b>L7</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L8</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L9</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L10</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L11</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L12</b><br>#DFDDDD<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#68584F;color:#FFF"><b>D2</b><br>#68584F<br><i>6.8:1</i></span><span class="sw" style="background:#684F58;color:#FFF"><b>D3</b><br>#684F58<br><i>7.4:1</i></span><span class="sw" style="background:#68604F;color:#FFF"><b>D4</b><br>#68604F<br><i>6.2:1</i></span><span class="sw" style="background:#684F60;color:#FFF"><b>D5</b><br>#684F60<br><i>7.3:1</i></span><span class="sw" style="background:#68684F;color:#FFF"><b>D6</b><br>#68684F<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#675167;color:#FFF"><b>D7</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#675651;color:#FFF"><b>D8</b><br>#675651<br><i>6.9:1</i></span><span class="sw" style="background:#675156;color:#FFF"><b>D9</b><br>#675156<br><i>7.3:1</i></span><span class="sw" style="background:#675C51;color:#FFF"><b>D10</b><br>#675C51<br><i>6.5:1</i></span><span class="sw" style="background:#67515C;color:#FFF"><b>D11</b><br>#67515C<br><i>7.2:1</i></span><span class="sw" style="background:#675151;color:#FFF"><b>D12</b><br>#675151<br><i>7.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2>onyx · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#5A6058;color:#FFF"><b>D3</b><br>#5A6058<br><i>6.5:1</i></span><span class="sw" style="background:#605E58;color:#FFF"><b>D4</b><br>#605E58<br><i>6.5:1</i></span><span class="sw" style="background:#5A5860;color:#FFF"><b>D5</b><br>#5A5860<br><i>7.0:1</i></span><span class="sw" style="background:#585D60;color:#FFF"><b>D6</b><br>#585D60<br><i>6.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5E5F58;color:#FFF"><b>D7</b><br>#5E5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D8</b><br>#5F585C<br><i>6.9:1</i></span><span class="sw" style="background:#5F5C58;color:#FFF"><b>D9</b><br>#5F5C58<br><i>6.6:1</i></span><span class="sw" style="background:#585F5F;color:#FFF"><b>D10</b><br>#585F5F<br><i>6.5:1</i></span><span class="sw" style="background:#585F59;color:#FFF"><b>D11</b><br>#585F59<br><i>6.6:1</i></span><span class="sw" style="background:#5E585F;color:#FFF"><b>D12</b><br>#5E585F<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2>onyx · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#585C60;color:#FFF"><b>D3</b><br>#585C60<br><i>6.7:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D4</b><br>#605C58<br><i>6.6:1</i></span><span class="sw" style="background:#60585C;color:#FFF"><b>D5</b><br>#60585C<br><i>6.9:1</i></span><span class="sw" style="background:#586060;color:#FFF"><b>D6</b><br>#586060<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F5F58;color:#FFF"><b>D7</b><br>#5F5F58<br><i>6.4:1</i></span><span class="sw" style="background:#585F58;color:#FFF"><b>D8</b><br>#585F58<br><i>6.6:1</i></span><span class="sw" style="background:#58585F;color:#FFF"><b>D9</b><br>#58585F<br><i>7.1:1</i></span><span class="sw" style="background:#5F585F;color:#FFF"><b>D10</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5C5F58;color:#FFF"><b>D11</b><br>#5C5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5C585F;color:#FFF"><b>D12</b><br>#5C585F<br><i>7.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2>onyx · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#5C6058;color:#FFF"><b>D3</b><br>#5C6058<br><i>6.4:1</i></span><span class="sw" style="background:#5C5860;color:#FFF"><b>D4</b><br>#5C5860<br><i>7.0:1</i></span><span class="sw" style="background:#585C60;color:#FFF"><b>D5</b><br>#585C60<br><i>6.7:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D6</b><br>#605C58<br><i>6.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F5A58;color:#FFF"><b>D7</b><br>#5F5A58<br><i>6.8:1</i></span><span class="sw" style="background:#585F5E;color:#FFF"><b>D8</b><br>#585F5E<br><i>6.5:1</i></span><span class="sw" style="background:#5E5F58;color:#FFF"><b>D9</b><br>#5E5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5E585F;color:#FFF"><b>D10</b><br>#5E585F<br><i>6.9:1</i></span><span class="sw" style="background:#585A5F;color:#FFF"><b>D11</b><br>#585A5F<br><i>6.9:1</i></span><span class="sw" style="background:#5F5E58;color:#FFF"><b>D12</b><br>#5F5E58<br><i>6.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2>onyx · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D2</b><br>#605C58<br><i>6.6:1</i></span><span class="sw" style="background:#606058;color:#FFF"><b>D3</b><br>#606058<br><i>6.3:1</i></span><span class="sw" style="background:#5C6058;color:#FFF"><b>D4</b><br>#5C6058<br><i>6.4:1</i></span><span class="sw" style="background:#586058;color:#FFF"><b>D5</b><br>#586058<br><i>6.5:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D6</b><br>#58605C<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#585F5F;color:#FFF"><b>D7</b><br>#585F5F<br><i>6.5:1</i></span><span class="sw" style="background:#585C5F;color:#FFF"><b>D8</b><br>#585C5F<br><i>6.8:1</i></span><span class="sw" style="background:#58585F;color:#FFF"><b>D9</b><br>#58585F<br><i>7.1:1</i></span><span class="sw" style="background:#5C585F;color:#FFF"><b>D10</b><br>#5C585F<br><i>7.0:1</i></span><span class="sw" style="background:#5F585F;color:#FFF"><b>D11</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D12</b><br>#5F585C<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2>onyx · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>12/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#605A58;color:#FFF"><b>D2</b><br>#605A58<br><i>6.8:1</i></span><span class="sw" style="background:#60585A;color:#FFF"><b>D3</b><br>#60585A<br><i>6.9:1</i></span><span class="sw" style="background:#605D58;color:#FFF"><b>D4</b><br>#605D58<br><i>6.6:1</i></span><span class="sw" style="background:#60585D;color:#FFF"><b>D5</b><br>#60585D<br><i>6.9:1</i></span><span class="sw" style="background:#606058;color:#FFF"><b>D6</b><br>#606058<br><i>6.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F585F;color:#FFF"><b>D7</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5F5A58;color:#FFF"><b>D8</b><br>#5F5A58<br><i>6.8:1</i></span><span class="sw" style="background:#5F585A;color:#FFF"><b>D9</b><br>#5F585A<br><i>6.9:1</i></span><span class="sw" style="background:#5F5C58;color:#FFF"><b>D10</b><br>#5F5C58<br><i>6.6:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D11</b><br>#5F585C<br><i>6.9:1</i></span><span class="sw" style="background:#5F5858;color:#FFF"><b>D12</b><br>#5F5858<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2>carbone · Proposal 1: Wong CB-safe</h2>
<div class="scores">
  AA-text light: <b>0/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>45°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>94°</b> &middot;
  hue coverage: <b>305°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#889584;color:#FFF"><b>L3</b><br>#889584<br><i>2.7:1</i></span><span class="sw" style="background:#959084;color:#FFF"><b>L4</b><br>#959084<br><i>2.7:1</i></span><span class="sw" style="background:#888495;color:#FFF"><b>L5</b><br>#888495<br><i>3.1:1</i></span><span class="sw" style="background:#848F95;color:#FFF"><b>L6</b><br>#848F95<br><i>2.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#909385;color:#FFF"><b>L7</b><br>#909385<br><i>2.7:1</i></span><span class="sw" style="background:#93858D;color:#FFF"><b>L8</b><br>#93858D<br><i>3.0:1</i></span><span class="sw" style="background:#938C85;color:#FFF"><b>L9</b><br>#938C85<br><i>2.8:1</i></span><span class="sw" style="background:#859393;color:#FFF"><b>L10</b><br>#859393<br><i>2.7:1</i></span><span class="sw" style="background:#859386;color:#FFF"><b>L11</b><br>#859386<br><i>2.8:1</i></span><span class="sw" style="background:#908593;color:#FFF"><b>L12</b><br>#908593<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#536D4B;color:#FFF"><b>D3</b><br>#536D4B<br><i>5.7:1</i></span><span class="sw" style="background:#6D644B;color:#FFF"><b>D4</b><br>#6D644B<br><i>5.9:1</i></span><span class="sw" style="background:#534B6D;color:#FFF"><b>D5</b><br>#534B6D<br><i>8.1:1</i></span><span class="sw" style="background:#4B616D;color:#FFF"><b>D6</b><br>#4B616D<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#636A4D;color:#FFF"><b>D7</b><br>#636A4D<br><i>5.7:1</i></span><span class="sw" style="background:#6A4D5E;color:#FFF"><b>D8</b><br>#6A4D5E<br><i>7.4:1</i></span><span class="sw" style="background:#6A5C4D;color:#FFF"><b>D9</b><br>#6A5C4D<br><i>6.5:1</i></span><span class="sw" style="background:#4D6A6A;color:#FFF"><b>D10</b><br>#4D6A6A<br><i>5.9:1</i></span><span class="sw" style="background:#4D6A50;color:#FFF"><b>D11</b><br>#4D6A50<br><i>6.0:1</i></span><span class="sw" style="background:#634D6A;color:#FFF"><b>D12</b><br>#634D6A<br><i>7.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2>carbone · Proposal 2: Brand triad</h2>
<div class="scores">
  AA-text light: <b>0/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>90°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#848C95;color:#FFF"><b>L3</b><br>#848C95<br><i>2.9:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L4</b><br>#958C84<br><i>2.8:1</i></span><span class="sw" style="background:#95848C;color:#FFF"><b>L5</b><br>#95848C<br><i>3.0:1</i></span><span class="sw" style="background:#849595;color:#FFF"><b>L6</b><br>#849595<br><i>2.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#939385;color:#FFF"><b>L7</b><br>#939385<br><i>2.7:1</i></span><span class="sw" style="background:#859385;color:#FFF"><b>L8</b><br>#859385<br><i>2.8:1</i></span><span class="sw" style="background:#858593;color:#FFF"><b>L9</b><br>#858593<br><i>3.1:1</i></span><span class="sw" style="background:#938593;color:#FFF"><b>L10</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#8C9385;color:#FFF"><b>L11</b><br>#8C9385<br><i>2.7:1</i></span><span class="sw" style="background:#8C8593;color:#FFF"><b>L12</b><br>#8C8593<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#4B5C6D;color:#FFF"><b>D3</b><br>#4B5C6D<br><i>6.9:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D4</b><br>#6D5C4B<br><i>6.4:1</i></span><span class="sw" style="background:#6D4B5C;color:#FFF"><b>D5</b><br>#6D4B5C<br><i>7.5:1</i></span><span class="sw" style="background:#4B6D6D;color:#FFF"><b>D6</b><br>#4B6D6D<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A6A4D;color:#FFF"><b>D7</b><br>#6A6A4D<br><i>5.6:1</i></span><span class="sw" style="background:#4D6A4D;color:#FFF"><b>D8</b><br>#4D6A4D<br><i>6.0:1</i></span><span class="sw" style="background:#4D4D6A;color:#FFF"><b>D9</b><br>#4D4D6A<br><i>8.1:1</i></span><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D10</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#5C6A4D;color:#FFF"><b>D11</b><br>#5C6A4D<br><i>5.8:1</i></span><span class="sw" style="background:#5C4D6A;color:#FFF"><b>D12</b><br>#5C4D6A<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2>carbone · Proposal 3: Treemap distinct</h2>
<div class="scores">
  AA-text light: <b>0/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>60°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>85°</b> &middot;
  hue coverage: <b>285°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#8C9584;color:#FFF"><b>L3</b><br>#8C9584<br><i>2.7:1</i></span><span class="sw" style="background:#8C8495;color:#FFF"><b>L4</b><br>#8C8495<br><i>3.1:1</i></span><span class="sw" style="background:#848C95;color:#FFF"><b>L5</b><br>#848C95<br><i>2.9:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L6</b><br>#958C84<br><i>2.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#938985;color:#FFF"><b>L7</b><br>#938985<br><i>2.9:1</i></span><span class="sw" style="background:#859390;color:#FFF"><b>L8</b><br>#859390<br><i>2.7:1</i></span><span class="sw" style="background:#909385;color:#FFF"><b>L9</b><br>#909385<br><i>2.7:1</i></span><span class="sw" style="background:#908593;color:#FFF"><b>L10</b><br>#908593<br><i>3.0:1</i></span><span class="sw" style="background:#858993;color:#FFF"><b>L11</b><br>#858993<br><i>3.0:1</i></span><span class="sw" style="background:#939085;color:#FFF"><b>L12</b><br>#939085<br><i>2.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#5C6D4B;color:#FFF"><b>D3</b><br>#5C6D4B<br><i>5.6:1</i></span><span class="sw" style="background:#5C4B6D;color:#FFF"><b>D4</b><br>#5C4B6D<br><i>7.8:1</i></span><span class="sw" style="background:#4B5C6D;color:#FFF"><b>D5</b><br>#4B5C6D<br><i>6.9:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D6</b><br>#6D5C4B<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A554D;color:#FFF"><b>D7</b><br>#6A554D<br><i>7.0:1</i></span><span class="sw" style="background:#4D6A63;color:#FFF"><b>D8</b><br>#4D6A63<br><i>5.9:1</i></span><span class="sw" style="background:#636A4D;color:#FFF"><b>D9</b><br>#636A4D<br><i>5.7:1</i></span><span class="sw" style="background:#634D6A;color:#FFF"><b>D10</b><br>#634D6A<br><i>7.5:1</i></span><span class="sw" style="background:#4D556A;color:#FFF"><b>D11</b><br>#4D556A<br><i>7.4:1</i></span><span class="sw" style="background:#6A634D;color:#FFF"><b>D12</b><br>#6A634D<br><i>6.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2>carbone · Proposal 4: Wheel uniform</h2>
<div class="scores">
  AA-text light: <b>0/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>30°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>75°</b> &middot;
  hue coverage: <b>330°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L2</b><br>#958C84<br><i>2.8:1</i></span><span class="sw" style="background:#959584;color:#FFF"><b>L3</b><br>#959584<br><i>2.6:1</i></span><span class="sw" style="background:#8C9584;color:#FFF"><b>L4</b><br>#8C9584<br><i>2.7:1</i></span><span class="sw" style="background:#849584;color:#FFF"><b>L5</b><br>#849584<br><i>2.7:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L6</b><br>#84958C<br><i>2.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#859393;color:#FFF"><b>L7</b><br>#859393<br><i>2.7:1</i></span><span class="sw" style="background:#858C93;color:#FFF"><b>L8</b><br>#858C93<br><i>2.9:1</i></span><span class="sw" style="background:#858593;color:#FFF"><b>L9</b><br>#858593<br><i>3.1:1</i></span><span class="sw" style="background:#8C8593;color:#FFF"><b>L10</b><br>#8C8593<br><i>3.0:1</i></span><span class="sw" style="background:#938593;color:#FFF"><b>L11</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#93858C;color:#FFF"><b>L12</b><br>#93858C<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D2</b><br>#6D5C4B<br><i>6.4:1</i></span><span class="sw" style="background:#6D6D4B;color:#FFF"><b>D3</b><br>#6D6D4B<br><i>5.3:1</i></span><span class="sw" style="background:#5C6D4B;color:#FFF"><b>D4</b><br>#5C6D4B<br><i>5.6:1</i></span><span class="sw" style="background:#4B6D4B;color:#FFF"><b>D5</b><br>#4B6D4B<br><i>5.9:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D6</b><br>#4B6D5C<br><i>5.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4D6A6A;color:#FFF"><b>D7</b><br>#4D6A6A<br><i>5.9:1</i></span><span class="sw" style="background:#4D5C6A;color:#FFF"><b>D8</b><br>#4D5C6A<br><i>6.9:1</i></span><span class="sw" style="background:#4D4D6A;color:#FFF"><b>D9</b><br>#4D4D6A<br><i>8.1:1</i></span><span class="sw" style="background:#5C4D6A;color:#FFF"><b>D10</b><br>#5C4D6A<br><i>7.7:1</i></span><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D11</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#6A4D5C;color:#FFF"><b>D12</b><br>#6A4D5C<br><i>7.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2>carbone · Proposal 5: Analogous mono</h2>
<div class="scores">
  AA-text light: <b>0/12</b> &middot;
  AA-text dark:  <b>12/12</b> &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>2/12</b> <br>
  min adjacent ΔH (slots 1-6): <b>20°</b> &middot;
  brand affinity (avg ΔH 1-6): <b>30°</b> &middot;
  hue coverage: <b>120°/360°</b>
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#958984;color:#FFF"><b>L2</b><br>#958984<br><i>2.9:1</i></span><span class="sw" style="background:#958489;color:#FFF"><b>L3</b><br>#958489<br><i>3.0:1</i></span><span class="sw" style="background:#958F84;color:#FFF"><b>L4</b><br>#958F84<br><i>2.7:1</i></span><span class="sw" style="background:#95848F;color:#FFF"><b>L5</b><br>#95848F<br><i>3.0:1</i></span><span class="sw" style="background:#959584;color:#FFF"><b>L6</b><br>#959584<br><i>2.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#938593;color:#FFF"><b>L7</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#938985;color:#FFF"><b>L8</b><br>#938985<br><i>2.9:1</i></span><span class="sw" style="background:#938589;color:#FFF"><b>L9</b><br>#938589<br><i>3.0:1</i></span><span class="sw" style="background:#938C85;color:#FFF"><b>L10</b><br>#938C85<br><i>2.8:1</i></span><span class="sw" style="background:#93858C;color:#FFF"><b>L11</b><br>#93858C<br><i>3.0:1</i></span><span class="sw" style="background:#938585;color:#FFF"><b>L12</b><br>#938585<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#6D564B;color:#FFF"><b>D2</b><br>#6D564B<br><i>6.8:1</i></span><span class="sw" style="background:#6D4B56;color:#FFF"><b>D3</b><br>#6D4B56<br><i>7.5:1</i></span><span class="sw" style="background:#6D614B;color:#FFF"><b>D4</b><br>#6D614B<br><i>6.1:1</i></span><span class="sw" style="background:#6D4B61;color:#FFF"><b>D5</b><br>#6D4B61<br><i>7.4:1</i></span><span class="sw" style="background:#6D6D4B;color:#FFF"><b>D6</b><br>#6D6D4B<br><i>5.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D7</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#6A554D;color:#FFF"><b>D8</b><br>#6A554D<br><i>7.0:1</i></span><span class="sw" style="background:#6A4D55;color:#FFF"><b>D9</b><br>#6A4D55<br><i>7.5:1</i></span><span class="sw" style="background:#6A5C4D;color:#FFF"><b>D10</b><br>#6A5C4D<br><i>6.5:1</i></span><span class="sw" style="background:#6A4D5C;color:#FFF"><b>D11</b><br>#6A4D5C<br><i>7.4:1</i></span><span class="sw" style="background:#6A4D4D;color:#FFF"><b>D12</b><br>#6A4D4D<br><i>7.5:1</i></span></div>
</div>

</div>


---

<!-- _class: title -->

# Palette proposals
## ranked top-5 per theme · 13 themes · 65 candidates

Each slide: 12 paired slots (hue shared between light + dark variants).
Light = pale fill + dark text contract (AA target 4.5:1 on theme text-heading).
Dark = deep fill + white text contract (AA target 4.5:1 on white).

Composite score (0-100):
  • AA-text light pass   30 pts
  • AA-text dark pass    30 pts
  • Graphical dark on bg 15 pts
  • Adjacency 1-6 ΔH     15 pts (60°+ = full credit)
  • Brand affinity        5 pts (peaked at 75° — anchored but diverse)
  • Hue coverage          5 pts (300°+ = full credit)

Slides are sorted within each theme: #1 is the highest scorer. The metric
breakdown next to each ratio shows the points contributed by that axis.

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> indaco · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E7E6D5;color:#000"><b>L3</b><br>#E7E6D5<br><i>14.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L4</b><br>#D5D6E7<br><i>12.6:1</i></span><span class="sw" style="background:#D5E7E6;color:#000"><b>L5</b><br>#D5E7E6<br><i>14.2:1</i></span><span class="sw" style="background:#E7DDD5;color:#000"><b>L6</b><br>#E7DDD5<br><i>13.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DDD6E6;color:#000"><b>L7</b><br>#DDD6E6<br><i>12.8:1</i></span><span class="sw" style="background:#E6D6DF;color:#000"><b>L8</b><br>#E6D6DF<br><i>13.0:1</i></span><span class="sw" style="background:#DFE6D6;color:#000"><b>L9</b><br>#DFE6D6<br><i>14.2:1</i></span><span class="sw" style="background:#D6E6DD;color:#000"><b>L10</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#E5D6E6;color:#000"><b>L11</b><br>#E5D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#D7E6D6;color:#000"><b>L12</b><br>#D7E6D6<br><i>14.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D3</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D4</b><br>#323686<br><i>10.5:1</i></span><span class="sw" style="background:#30827E;color:#FFF"><b>D5</b><br>#30827E<br><i>4.5:1</i></span><span class="sw" style="background:#865832;color:#FFF"><b>D6</b><br>#865832<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#583880;color:#FFF"><b>D7</b><br>#583880<br><i>9.2:1</i></span><span class="sw" style="background:#80385F;color:#FFF"><b>D8</b><br>#80385F<br><i>7.9:1</i></span><span class="sw" style="background:#5F8038;color:#FFF"><b>D9</b><br>#5F8038<br><i>4.5:1</i></span><span class="sw" style="background:#388058;color:#FFF"><b>D10</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#7C3880;color:#FFF"><b>D11</b><br>#7C3880<br><i>7.7:1</i></span><span class="sw" style="background:#3C8038;color:#FFF"><b>D12</b><br>#3C8038<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> indaco · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E6D5E7;color:#000"><b>L3</b><br>#E6D5E7<br><i>13.0:1</i></span><span class="sw" style="background:#D6E7D5;color:#000"><b>L4</b><br>#D6E7D5<br><i>14.0:1</i></span><span class="sw" style="background:#E7E6D5;color:#000"><b>L5</b><br>#E7E6D5<br><i>14.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L6</b><br>#D5D6E7<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6DBE6;color:#000"><b>L7</b><br>#D6DBE6<br><i>13.1:1</i></span><span class="sw" style="background:#E6D9D6;color:#000"><b>L8</b><br>#E6D9D6<br><i>13.2:1</i></span><span class="sw" style="background:#E1D6E6;color:#000"><b>L9</b><br>#E1D6E6<br><i>12.9:1</i></span><span class="sw" style="background:#D6E6D9;color:#000"><b>L10</b><br>#D6E6D9<br><i>14.0:1</i></span><span class="sw" style="background:#E3E6D6;color:#000"><b>L11</b><br>#E3E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#D9D6E6;color:#000"><b>L12</b><br>#D9D6E6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#823286;color:#FFF"><b>D3</b><br>#823286<br><i>7.6:1</i></span><span class="sw" style="background:#368632;color:#FFF"><b>D4</b><br>#368632<br><i>4.6:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D5</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D6</b><br>#323686<br><i>10.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#384D80;color:#FFF"><b>D7</b><br>#384D80<br><i>8.3:1</i></span><span class="sw" style="background:#804638;color:#FFF"><b>D8</b><br>#804638<br><i>7.4:1</i></span><span class="sw" style="background:#6A3880;color:#FFF"><b>D9</b><br>#6A3880<br><i>8.4:1</i></span><span class="sw" style="background:#388046;color:#FFF"><b>D10</b><br>#388046<br><i>4.8:1</i></span><span class="sw" style="background:#6E7C36;color:#FFF"><b>D11</b><br>#6E7C36<br><i>4.6:1</i></span><span class="sw" style="background:#463880;color:#FFF"><b>D12</b><br>#463880<br><i>9.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> indaco · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L2</b><br>#E7D5D6<br><i>12.9:1</i></span><span class="sw" style="background:#E7D5E3;color:#000"><b>L3</b><br>#E7D5E3<br><i>13.0:1</i></span><span class="sw" style="background:#D8D5E7;color:#000"><b>L4</b><br>#D8D5E7<br><i>12.6:1</i></span><span class="sw" style="background:#DAE7D5;color:#000"><b>L5</b><br>#DAE7D5<br><i>14.1:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L6</b><br>#E7E3D5<br><i>14.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1D6E6;color:#000"><b>L7</b><br>#E1D6E6<br><i>12.9:1</i></span><span class="sw" style="background:#D6E6E4;color:#000"><b>L8</b><br>#D6E6E4<br><i>14.1:1</i></span><span class="sw" style="background:#D6D7E6;color:#000"><b>L9</b><br>#D6D7E6<br><i>12.7:1</i></span><span class="sw" style="background:#E6DDD6;color:#000"><b>L10</b><br>#E6DDD6<br><i>13.5:1</i></span><span class="sw" style="background:#E6D6DD;color:#000"><b>L11</b><br>#E6D6DD<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6D9;color:#000"><b>L12</b><br>#D6E6D9<br><i>14.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D2</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#863275;color:#FFF"><b>D3</b><br>#863275<br><i>7.7:1</i></span><span class="sw" style="background:#423286;color:#FFF"><b>D4</b><br>#423286<br><i>10.3:1</i></span><span class="sw" style="background:#498230;color:#FFF"><b>D5</b><br>#498230<br><i>4.6:1</i></span><span class="sw" style="background:#867432;color:#FFF"><b>D6</b><br>#867432<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A3880;color:#FFF"><b>D7</b><br>#6A3880<br><i>8.4:1</i></span><span class="sw" style="background:#388076;color:#FFF"><b>D8</b><br>#388076<br><i>4.6:1</i></span><span class="sw" style="background:#383C80;color:#FFF"><b>D9</b><br>#383C80<br><i>9.9:1</i></span><span class="sw" style="background:#805838;color:#FFF"><b>D10</b><br>#805838<br><i>6.2:1</i></span><span class="sw" style="background:#803859;color:#FFF"><b>D11</b><br>#803859<br><i>8.0:1</i></span><span class="sw" style="background:#388046;color:#FFF"><b>D12</b><br>#388046<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> indaco · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#D5D6E7;color:#000"><b>L2</b><br>#D5D6E7<br><i>12.6:1</i></span><span class="sw" style="background:#DDD5E7;color:#000"><b>L3</b><br>#DDD5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E6D5E7;color:#000"><b>L4</b><br>#E6D5E7<br><i>13.0:1</i></span><span class="sw" style="background:#E7D5DF;color:#000"><b>L5</b><br>#E7D5DF<br><i>12.9:1</i></span><span class="sw" style="background:#E7D5D6;color:#000"><b>L6</b><br>#E7D5D6<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6DDD6;color:#000"><b>L7</b><br>#E6DDD6<br><i>13.5:1</i></span><span class="sw" style="background:#E6E5D6;color:#000"><b>L8</b><br>#E6E5D6<br><i>14.3:1</i></span><span class="sw" style="background:#DFE6D6;color:#000"><b>L9</b><br>#DFE6D6<br><i>14.2:1</i></span><span class="sw" style="background:#D7E6D6;color:#000"><b>L10</b><br>#D7E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6DD;color:#000"><b>L11</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6E5;color:#000"><b>L12</b><br>#D6E6E5<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D2</b><br>#323686<br><i>10.5:1</i></span><span class="sw" style="background:#583286;color:#FFF"><b>D3</b><br>#583286<br><i>9.5:1</i></span><span class="sw" style="background:#823286;color:#FFF"><b>D4</b><br>#823286<br><i>7.6:1</i></span><span class="sw" style="background:#863260;color:#FFF"><b>D5</b><br>#863260<br><i>8.0:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D6</b><br>#863236<br><i>8.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#805838;color:#FFF"><b>D7</b><br>#805838<br><i>6.2:1</i></span><span class="sw" style="background:#7C7936;color:#FFF"><b>D8</b><br>#7C7936<br><i>4.5:1</i></span><span class="sw" style="background:#5F8038;color:#FFF"><b>D9</b><br>#5F8038<br><i>4.5:1</i></span><span class="sw" style="background:#3C8038;color:#FFF"><b>D10</b><br>#3C8038<br><i>4.8:1</i></span><span class="sw" style="background:#388058;color:#FFF"><b>D11</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#38807C;color:#FFF"><b>D12</b><br>#38807C<br><i>4.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FFFFFF;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> indaco · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D4DFE8;color:#000"><b>L1</b><br>#D4DFE8<br><i>13.4:1</i></span><span class="sw" style="background:#D5D9E7;color:#000"><b>L2</b><br>#D5D9E7<br><i>12.9:1</i></span><span class="sw" style="background:#D5E5E7;color:#000"><b>L3</b><br>#D5E5E7<br><i>14.0:1</i></span><span class="sw" style="background:#D7D5E7;color:#000"><b>L4</b><br>#D7D5E7<br><i>12.6:1</i></span><span class="sw" style="background:#D5E7E3;color:#000"><b>L5</b><br>#D5E7E3<br><i>14.1:1</i></span><span class="sw" style="background:#DDD5E7;color:#000"><b>L6</b><br>#DDD5E7<br><i>12.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6DD;color:#000"><b>L7</b><br>#D6E6DD<br><i>14.0:1</i></span><span class="sw" style="background:#D6DBE6;color:#000"><b>L8</b><br>#D6DBE6<br><i>13.1:1</i></span><span class="sw" style="background:#D6E3E6;color:#000"><b>L9</b><br>#D6E3E6<br><i>13.8:1</i></span><span class="sw" style="background:#D6D7E6;color:#000"><b>L10</b><br>#D6D7E6<br><i>12.7:1</i></span><span class="sw" style="background:#D6E6E5;color:#000"><b>L11</b><br>#D6E6E5<br><i>14.1:1</i></span><span class="sw" style="background:#D6DFE6;color:#000"><b>L12</b><br>#D6DFE6<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E608A;color:#FFF"><b>D1</b><br>#2E608A<br><i>6.7:1</i></span><span class="sw" style="background:#324486;color:#FFF"><b>D2</b><br>#324486<br><i>9.1:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D3</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D4</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#308271;color:#FFF"><b>D5</b><br>#308271<br><i>4.6:1</i></span><span class="sw" style="background:#583286;color:#FFF"><b>D6</b><br>#583286<br><i>9.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#388058;color:#FFF"><b>D7</b><br>#388058<br><i>4.8:1</i></span><span class="sw" style="background:#384D80;color:#FFF"><b>D8</b><br>#384D80<br><i>8.3:1</i></span><span class="sw" style="background:#387180;color:#FFF"><b>D9</b><br>#387180<br><i>5.5:1</i></span><span class="sw" style="background:#383C80;color:#FFF"><b>D10</b><br>#383C80<br><i>9.9:1</i></span><span class="sw" style="background:#38807C;color:#FFF"><b>D11</b><br>#38807C<br><i>4.6:1</i></span><span class="sw" style="background:#385F80;color:#FFF"><b>D12</b><br>#385F80<br><i>6.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> cuoio · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D7D5E6;color:#000"><b>L3</b><br>#D7D5E6<br><i>12.0:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L4</b><br>#E4E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#E6D7D5;color:#000"><b>L5</b><br>#E6D7D5<br><i>12.4:1</i></span><span class="sw" style="background:#D5DCE6;color:#000"><b>L6</b><br>#D5DCE6<br><i>12.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCE5D7;color:#000"><b>L7</b><br>#DCE5D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E5E0;color:#000"><b>L8</b><br>#D7E5E0<br><i>13.3:1</i></span><span class="sw" style="background:#E0D7E5;color:#000"><b>L9</b><br>#E0D7E5<br><i>12.4:1</i></span><span class="sw" style="background:#E5D7DC;color:#000"><b>L10</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#D7E5D8;color:#000"><b>L11</b><br>#D7E5D8<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E3;color:#000"><b>L12</b><br>#E5D7E3<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D3</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D4</b><br>#727B2D<br><i>4.6:1</i></span><span class="sw" style="background:#863B32;color:#FFF"><b>D5</b><br>#863B32<br><i>7.8:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D6</b><br>#325286<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#538038;color:#FFF"><b>D7</b><br>#538038<br><i>4.7:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D8</b><br>#388064<br><i>4.7:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D9</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#803853;color:#FFF"><b>D10</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D11</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D12</b><br>#803877<br><i>7.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> cuoio · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6D7;color:#000"><b>L3</b><br>#D5E6D7<br><i>13.3:1</i></span><span class="sw" style="background:#E6D5E4;color:#000"><b>L4</b><br>#E6D5E4<br><i>12.4:1</i></span><span class="sw" style="background:#D7D5E6;color:#000"><b>L5</b><br>#D7D5E6<br><i>12.0:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L6</b><br>#E4E6D5<br><i>13.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5E3D7;color:#000"><b>L7</b><br>#E5E3D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E0E5;color:#000"><b>L8</b><br>#D7E0E5<br><i>12.9:1</i></span><span class="sw" style="background:#D9E5D7;color:#000"><b>L9</b><br>#D9E5D7<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E0;color:#000"><b>L10</b><br>#E5D7E0<br><i>12.5:1</i></span><span class="sw" style="background:#DCD7E5;color:#000"><b>L11</b><br>#DCD7E5<br><i>12.3:1</i></span><span class="sw" style="background:#E0E5D7;color:#000"><b>L12</b><br>#E0E5D7<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#32863B;color:#FFF"><b>D3</b><br>#32863B<br><i>4.6:1</i></span><span class="sw" style="background:#86327C;color:#FFF"><b>D4</b><br>#86327C<br><i>7.6:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D5</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D6</b><br>#727B2D<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#807638;color:#FFF"><b>D7</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#386580;color:#FFF"><b>D8</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D9</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#803865;color:#FFF"><b>D10</b><br>#803865<br><i>7.9:1</i></span><span class="sw" style="background:#523880;color:#FFF"><b>D11</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#637C36;color:#FFF"><b>D12</b><br>#637C36<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> cuoio · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L2</b><br>#D5E4E6<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6DC;color:#000"><b>L3</b><br>#D5E6DC<br><i>13.3:1</i></span><span class="sw" style="background:#E0E6D5;color:#000"><b>L4</b><br>#E0E6D5<br><i>13.6:1</i></span><span class="sw" style="background:#E4D5E6;color:#000"><b>L5</b><br>#E4D5E6<br><i>12.3:1</i></span><span class="sw" style="background:#D5D6E6;color:#000"><b>L6</b><br>#D5D6E6<br><i>12.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9E5D7;color:#000"><b>L7</b><br>#D9E5D7<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7D7;color:#000"><b>L8</b><br>#E5D7D7<br><i>12.4:1</i></span><span class="sw" style="background:#E3E5D7;color:#000"><b>L9</b><br>#E3E5D7<br><i>13.6:1</i></span><span class="sw" style="background:#D7DCE5;color:#000"><b>L10</b><br>#D7DCE5<br><i>12.6:1</i></span><span class="sw" style="background:#D7E5E1;color:#000"><b>L11</b><br>#D7E5E1<br><i>13.3:1</i></span><span class="sw" style="background:#E5D7E0;color:#000"><b>L12</b><br>#E5D7E0<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D2</b><br>#327C86<br><i>4.8:1</i></span><span class="sw" style="background:#328651;color:#FFF"><b>D3</b><br>#328651<br><i>4.5:1</i></span><span class="sw" style="background:#617F2F;color:#FFF"><b>D4</b><br>#617F2F<br><i>4.6:1</i></span><span class="sw" style="background:#7B3286;color:#FFF"><b>D5</b><br>#7B3286<br><i>7.9:1</i></span><span class="sw" style="background:#323686;color:#FFF"><b>D6</b><br>#323686<br><i>10.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#428038;color:#FFF"><b>D7</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#803A38;color:#FFF"><b>D8</b><br>#803A38<br><i>8.1:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D10</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#38806A;color:#FFF"><b>D11</b><br>#38806A<br><i>4.7:1</i></span><span class="sw" style="background:#803865;color:#FFF"><b>D12</b><br>#803865<br><i>7.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> cuoio · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#E4E6D5;color:#000"><b>L2</b><br>#E4E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#DCE6D5;color:#000"><b>L3</b><br>#DCE6D5<br><i>13.4:1</i></span><span class="sw" style="background:#D5E6D7;color:#000"><b>L4</b><br>#D5E6D7<br><i>13.3:1</i></span><span class="sw" style="background:#D5E6E0;color:#000"><b>L5</b><br>#D5E6E0<br><i>13.4:1</i></span><span class="sw" style="background:#D5E4E6;color:#000"><b>L6</b><br>#D5E4E6<br><i>13.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7DCE5;color:#000"><b>L7</b><br>#D7DCE5<br><i>12.6:1</i></span><span class="sw" style="background:#D8D7E5;color:#000"><b>L8</b><br>#D8D7E5<br><i>12.2:1</i></span><span class="sw" style="background:#E0D7E5;color:#000"><b>L9</b><br>#E0D7E5<br><i>12.4:1</i></span><span class="sw" style="background:#E5D7E3;color:#000"><b>L10</b><br>#E5D7E3<br><i>12.5:1</i></span><span class="sw" style="background:#E5D7DC;color:#000"><b>L11</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#E5D8D7;color:#000"><b>L12</b><br>#E5D8D7<br><i>12.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#727B2D;color:#FFF"><b>D2</b><br>#727B2D<br><i>4.6:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D3</b><br>#508230<br><i>4.6:1</i></span><span class="sw" style="background:#32863B;color:#FFF"><b>D4</b><br>#32863B<br><i>4.6:1</i></span><span class="sw" style="background:#308263;color:#FFF"><b>D5</b><br>#308263<br><i>4.7:1</i></span><span class="sw" style="background:#327C86;color:#FFF"><b>D6</b><br>#327C86<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#385380;color:#FFF"><b>D7</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#403880;color:#FFF"><b>D8</b><br>#403880<br><i>10.0:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D9</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D10</b><br>#803877<br><i>7.6:1</i></span><span class="sw" style="background:#803853;color:#FFF"><b>D11</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D12</b><br>#804038<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF7F2;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> cuoio · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E7E0D5;color:#000"><b>L1</b><br>#E7E0D5<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>13.7:1</i></span><span class="sw" style="background:#E6DAD5;color:#000"><b>L3</b><br>#E6DAD5<br><i>12.6:1</i></span><span class="sw" style="background:#E2E6D5;color:#000"><b>L4</b><br>#E2E6D5<br><i>13.6:1</i></span><span class="sw" style="background:#E6D5D6;color:#000"><b>L5</b><br>#E6D5D6<br><i>12.2:1</i></span><span class="sw" style="background:#DCE6D5;color:#000"><b>L6</b><br>#DCE6D5<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DC;color:#000"><b>L7</b><br>#E5D7DC<br><i>12.4:1</i></span><span class="sw" style="background:#E5E3D7;color:#000"><b>L8</b><br>#E5E3D7<br><i>13.4:1</i></span><span class="sw" style="background:#E5DCD7;color:#000"><b>L9</b><br>#E5DCD7<br><i>12.8:1</i></span><span class="sw" style="background:#E3E5D7;color:#000"><b>L10</b><br>#E3E5D7<br><i>13.6:1</i></span><span class="sw" style="background:#E5D8D7;color:#000"><b>L11</b><br>#E5D8D7<br><i>12.5:1</i></span><span class="sw" style="background:#E5E0D7;color:#000"><b>L12</b><br>#E5E0D7<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8A672E;color:#FFF"><b>D1</b><br>#8A672E<br><i>5.2:1</i></span><span class="sw" style="background:#7B772D;color:#FFF"><b>D2</b><br>#7B772D<br><i>4.6:1</i></span><span class="sw" style="background:#864A32;color:#FFF"><b>D3</b><br>#864A32<br><i>6.9:1</i></span><span class="sw" style="background:#687F2F;color:#FFF"><b>D4</b><br>#687F2F<br><i>4.5:1</i></span><span class="sw" style="background:#863236;color:#FFF"><b>D5</b><br>#863236<br><i>8.3:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D6</b><br>#508230<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#803853;color:#FFF"><b>D7</b><br>#803853<br><i>8.1:1</i></span><span class="sw" style="background:#807638;color:#FFF"><b>D8</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#805238;color:#FFF"><b>D9</b><br>#805238<br><i>6.6:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D10</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D11</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#806438;color:#FFF"><b>D12</b><br>#806438<br><i>5.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> mustard · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D9D5E7;color:#000"><b>L3</b><br>#D9D5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L4</b><br>#E2E7D5<br><i>14.4:1</i></span><span class="sw" style="background:#E7D9D5;color:#000"><b>L5</b><br>#E7D9D5<br><i>13.3:1</i></span><span class="sw" style="background:#D5D9E7;color:#000"><b>L6</b><br>#D5D9E7<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DAE6D6;color:#000"><b>L7</b><br>#DAE6D6<br><i>14.1:1</i></span><span class="sw" style="background:#D6E6E2;color:#000"><b>L8</b><br>#D6E6E2<br><i>14.1:1</i></span><span class="sw" style="background:#E2D6E6;color:#000"><b>L9</b><br>#E2D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D6DA;color:#000"><b>L10</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6DA;color:#000"><b>L11</b><br>#D6E6DA<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L12</b><br>#E6D6E2<br><i>13.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#42298E;color:#FFF"><b>D3</b><br>#42298E<br><i>10.8:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D4</b><br>#687F25<br><i>4.5:1</i></span><span class="sw" style="background:#8E4229;color:#FFF"><b>D5</b><br>#8E4229<br><i>7.1:1</i></span><span class="sw" style="background:#29428E;color:#FFF"><b>D6</b><br>#29428E<br><i>9.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#44832F;color:#FFF"><b>D7</b><br>#44832F<br><i>4.6:1</i></span><span class="sw" style="background:#2F836E;color:#FFF"><b>D8</b><br>#2F836E<br><i>4.6:1</i></span><span class="sw" style="background:#713187;color:#FFF"><b>D9</b><br>#713187<br><i>8.4:1</i></span><span class="sw" style="background:#873146;color:#FFF"><b>D10</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#2F8344;color:#FFF"><b>D11</b><br>#2F8344<br><i>4.7:1</i></span><span class="sw" style="background:#873171;color:#FFF"><b>D12</b><br>#873171<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> mustard · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D5E7D9;color:#000"><b>L3</b><br>#D5E7D9<br><i>14.1:1</i></span><span class="sw" style="background:#E7D5E2;color:#000"><b>L4</b><br>#E7D5E2<br><i>13.0:1</i></span><span class="sw" style="background:#D9D5E7;color:#000"><b>L5</b><br>#D9D5E7<br><i>12.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L6</b><br>#E2E7D5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6E6D6;color:#000"><b>L7</b><br>#E6E6D6<br><i>14.4:1</i></span><span class="sw" style="background:#D6DEE6;color:#000"><b>L8</b><br>#D6DEE6<br><i>13.4:1</i></span><span class="sw" style="background:#D6E6D6;color:#000"><b>L9</b><br>#D6E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6DE;color:#000"><b>L10</b><br>#E6D6DE<br><i>13.0:1</i></span><span class="sw" style="background:#DED6E6;color:#000"><b>L11</b><br>#DED6E6<br><i>12.9:1</i></span><span class="sw" style="background:#DEE6D6;color:#000"><b>L12</b><br>#DEE6D6<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#27873F;color:#FFF"><b>D3</b><br>#27873F<br><i>4.5:1</i></span><span class="sw" style="background:#8E2975;color:#FFF"><b>D4</b><br>#8E2975<br><i>7.7:1</i></span><span class="sw" style="background:#42298E;color:#FFF"><b>D5</b><br>#42298E<br><i>10.8:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D6</b><br>#687F25<br><i>4.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#78782B;color:#FFF"><b>D7</b><br>#78782B<br><i>4.6:1</i></span><span class="sw" style="background:#315C87;color:#FFF"><b>D8</b><br>#315C87<br><i>7.0:1</i></span><span class="sw" style="background:#318731;color:#FFF"><b>D9</b><br>#318731<br><i>4.5:1</i></span><span class="sw" style="background:#87315C;color:#FFF"><b>D10</b><br>#87315C<br><i>8.0:1</i></span><span class="sw" style="background:#5C3187;color:#FFF"><b>D11</b><br>#5C3187<br><i>9.4:1</i></span><span class="sw" style="background:#577F2E;color:#FFF"><b>D12</b><br>#577F2E<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> mustard · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L2</b><br>#D5E2E7<br><i>13.8:1</i></span><span class="sw" style="background:#D5E7DE;color:#000"><b>L3</b><br>#D5E7DE<br><i>14.2:1</i></span><span class="sw" style="background:#DEE7D5;color:#000"><b>L4</b><br>#DEE7D5<br><i>14.3:1</i></span><span class="sw" style="background:#E7D5E7;color:#000"><b>L5</b><br>#E7D5E7<br><i>13.1:1</i></span><span class="sw" style="background:#D6D5E7;color:#000"><b>L6</b><br>#D6D5E7<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6D6;color:#000"><b>L7</b><br>#D6E6D6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D9D6;color:#000"><b>L8</b><br>#E6D9D6<br><i>13.2:1</i></span><span class="sw" style="background:#E2E6D6;color:#000"><b>L9</b><br>#E2E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#D6DAE6;color:#000"><b>L10</b><br>#D6DAE6<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6E3;color:#000"><b>L11</b><br>#D6E6E3<br><i>14.1:1</i></span><span class="sw" style="background:#E6D6DE;color:#000"><b>L12</b><br>#E6D6DE<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D2</b><br>#29758E<br><i>5.2:1</i></span><span class="sw" style="background:#268354;color:#FFF"><b>D3</b><br>#268354<br><i>4.7:1</i></span><span class="sw" style="background:#548326;color:#FFF"><b>D4</b><br>#548326<br><i>4.5:1</i></span><span class="sw" style="background:#8E298E;color:#FFF"><b>D5</b><br>#8E298E<br><i>7.3:1</i></span><span class="sw" style="background:#32298E;color:#FFF"><b>D6</b><br>#32298E<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#318731;color:#FFF"><b>D7</b><br>#318731<br><i>4.5:1</i></span><span class="sw" style="background:#873F31;color:#FFF"><b>D8</b><br>#873F31<br><i>7.5:1</i></span><span class="sw" style="background:#687C2D;color:#FFF"><b>D9</b><br>#687C2D<br><i>4.7:1</i></span><span class="sw" style="background:#314687;color:#FFF"><b>D10</b><br>#314687<br><i>8.9:1</i></span><span class="sw" style="background:#2F8375;color:#FFF"><b>D11</b><br>#2F8375<br><i>4.5:1</i></span><span class="sw" style="background:#87315C;color:#FFF"><b>D12</b><br>#87315C<br><i>8.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> mustard · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L2</b><br>#E2E7D5<br><i>14.4:1</i></span><span class="sw" style="background:#D9E7D5;color:#000"><b>L3</b><br>#D9E7D5<br><i>14.2:1</i></span><span class="sw" style="background:#D5E7D9;color:#000"><b>L4</b><br>#D5E7D9<br><i>14.1:1</i></span><span class="sw" style="background:#D5E7E2;color:#000"><b>L5</b><br>#D5E7E2<br><i>14.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L6</b><br>#D5E2E7<br><i>13.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6DAE6;color:#000"><b>L7</b><br>#D6DAE6<br><i>13.0:1</i></span><span class="sw" style="background:#DAD6E6;color:#000"><b>L8</b><br>#DAD6E6<br><i>12.8:1</i></span><span class="sw" style="background:#E2D6E6;color:#000"><b>L9</b><br>#E2D6E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L10</b><br>#E6D6E2<br><i>13.1:1</i></span><span class="sw" style="background:#E6D6DA;color:#000"><b>L11</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#E6DAD6;color:#000"><b>L12</b><br>#E6DAD6<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#687F25;color:#FFF"><b>D2</b><br>#687F25<br><i>4.5:1</i></span><span class="sw" style="background:#3D8326;color:#FFF"><b>D3</b><br>#3D8326<br><i>4.7:1</i></span><span class="sw" style="background:#27873F;color:#FFF"><b>D4</b><br>#27873F<br><i>4.5:1</i></span><span class="sw" style="background:#26836B;color:#FFF"><b>D5</b><br>#26836B<br><i>4.6:1</i></span><span class="sw" style="background:#29758E;color:#FFF"><b>D6</b><br>#29758E<br><i>5.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#314687;color:#FFF"><b>D7</b><br>#314687<br><i>8.9:1</i></span><span class="sw" style="background:#463187;color:#FFF"><b>D8</b><br>#463187<br><i>10.2:1</i></span><span class="sw" style="background:#713187;color:#FFF"><b>D9</b><br>#713187<br><i>8.4:1</i></span><span class="sw" style="background:#873171;color:#FFF"><b>D10</b><br>#873171<br><i>7.8:1</i></span><span class="sw" style="background:#873146;color:#FFF"><b>D11</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#874631;color:#FFF"><b>D12</b><br>#874631<br><i>7.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F0;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> mustard · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8E3D4;color:#000"><b>L1</b><br>#E8E3D4<br><i>14.2:1</i></span><span class="sw" style="background:#E5E7D5;color:#000"><b>L2</b><br>#E5E7D5<br><i>14.5:1</i></span><span class="sw" style="background:#E7DCD5;color:#000"><b>L3</b><br>#E7DCD5<br><i>13.5:1</i></span><span class="sw" style="background:#DFE7D5;color:#000"><b>L4</b><br>#DFE7D5<br><i>14.3:1</i></span><span class="sw" style="background:#E7D6D5;color:#000"><b>L5</b><br>#E7D6D5<br><i>13.0:1</i></span><span class="sw" style="background:#D9E7D5;color:#000"><b>L6</b><br>#D9E7D5<br><i>14.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D6DA;color:#000"><b>L7</b><br>#E6D6DA<br><i>13.0:1</i></span><span class="sw" style="background:#E6E6D6;color:#000"><b>L8</b><br>#E6E6D6<br><i>14.4:1</i></span><span class="sw" style="background:#E6DED6;color:#000"><b>L9</b><br>#E6DED6<br><i>13.7:1</i></span><span class="sw" style="background:#E2E6D6;color:#000"><b>L10</b><br>#E2E6D6<br><i>14.3:1</i></span><span class="sw" style="background:#E6DAD6;color:#000"><b>L11</b><br>#E6DAD6<br><i>13.3:1</i></span><span class="sw" style="background:#E6E2D6;color:#000"><b>L12</b><br>#E6E2D6<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8B7123;color:#FFF"><b>D1</b><br>#8B7123<br><i>4.7:1</i></span><span class="sw" style="background:#737B23;color:#FFF"><b>D2</b><br>#737B23<br><i>4.6:1</i></span><span class="sw" style="background:#8E5329;color:#FFF"><b>D3</b><br>#8E5329<br><i>6.1:1</i></span><span class="sw" style="background:#597F25;color:#FFF"><b>D4</b><br>#597F25<br><i>4.7:1</i></span><span class="sw" style="background:#8E3229;color:#FFF"><b>D5</b><br>#8E3229<br><i>8.0:1</i></span><span class="sw" style="background:#3D8326;color:#FFF"><b>D6</b><br>#3D8326<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#873146;color:#FFF"><b>D7</b><br>#873146<br><i>8.2:1</i></span><span class="sw" style="background:#78782B;color:#FFF"><b>D8</b><br>#78782B<br><i>4.6:1</i></span><span class="sw" style="background:#875C31;color:#FFF"><b>D9</b><br>#875C31<br><i>5.8:1</i></span><span class="sw" style="background:#687C2D;color:#FFF"><b>D10</b><br>#687C2D<br><i>4.7:1</i></span><span class="sw" style="background:#874631;color:#FFF"><b>D11</b><br>#874631<br><i>7.1:1</i></span><span class="sw" style="background:#877131;color:#FFF"><b>D12</b><br>#877131<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> laguna · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E8E0D4;color:#000"><b>L3</b><br>#E8E0D4<br><i>12.6:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L4</b><br>#D4DCE8<br><i>11.9:1</i></span><span class="sw" style="background:#D4E8E0;color:#000"><b>L5</b><br>#D4E8E0<br><i>12.9:1</i></span><span class="sw" style="background:#E8D6D4;color:#000"><b>L6</b><br>#E8D6D4<br><i>11.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D8D6E6;color:#000"><b>L7</b><br>#D8D6E6<br><i>11.5:1</i></span><span class="sw" style="background:#E6D6E4;color:#000"><b>L8</b><br>#E6D6E4<br><i>11.9:1</i></span><span class="sw" style="background:#E4E6D6;color:#000"><b>L9</b><br>#E4E6D6<br><i>13.0:1</i></span><span class="sw" style="background:#D6E6D8;color:#000"><b>L10</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#E0D6E6;color:#000"><b>L11</b><br>#E0D6E6<br><i>11.7:1</i></span><span class="sw" style="background:#DCE6D6;color:#000"><b>L12</b><br>#DCE6D6<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#866632;color:#FFF"><b>D3</b><br>#866632<br><i>5.3:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D4</b><br>#325286<br><i>7.8:1</i></span><span class="sw" style="background:#308263;color:#FFF"><b>D5</b><br>#308263<br><i>4.7:1</i></span><span class="sw" style="background:#863B32;color:#FFF"><b>D6</b><br>#863B32<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#403880;color:#FFF"><b>D7</b><br>#403880<br><i>10.0:1</i></span><span class="sw" style="background:#803877;color:#FFF"><b>D8</b><br>#803877<br><i>7.6:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D10</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#643880;color:#FFF"><b>D11</b><br>#643880<br><i>8.7:1</i></span><span class="sw" style="background:#538038;color:#FFF"><b>D12</b><br>#538038<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> laguna · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E0D4E8;color:#000"><b>L3</b><br>#E0D4E8<br><i>11.6:1</i></span><span class="sw" style="background:#DCE8D4;color:#000"><b>L4</b><br>#DCE8D4<br><i>13.0:1</i></span><span class="sw" style="background:#E8E0D4;color:#000"><b>L5</b><br>#E8E0D4<br><i>12.6:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L6</b><br>#D4DCE8<br><i>11.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E0E6;color:#000"><b>L7</b><br>#D6E0E6<br><i>12.3:1</i></span><span class="sw" style="background:#E6D6D8;color:#000"><b>L8</b><br>#E6D6D8<br><i>11.8:1</i></span><span class="sw" style="background:#DCD6E6;color:#000"><b>L9</b><br>#DCD6E6<br><i>11.6:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L10</b><br>#D8E6D6<br><i>12.7:1</i></span><span class="sw" style="background:#E6E4D6;color:#000"><b>L11</b><br>#E6E4D6<br><i>12.9:1</i></span><span class="sw" style="background:#D6D8E6;color:#000"><b>L12</b><br>#D6D8E6<br><i>11.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#663286;color:#FFF"><b>D3</b><br>#663286<br><i>8.9:1</i></span><span class="sw" style="background:#508230;color:#FFF"><b>D4</b><br>#508230<br><i>4.6:1</i></span><span class="sw" style="background:#866632;color:#FFF"><b>D5</b><br>#866632<br><i>5.3:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D6</b><br>#325286<br><i>7.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#386580;color:#FFF"><b>D7</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#803842;color:#FFF"><b>D8</b><br>#803842<br><i>8.2:1</i></span><span class="sw" style="background:#523880;color:#FFF"><b>D9</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D10</b><br>#428038<br><i>4.8:1</i></span><span class="sw" style="background:#807638;color:#FFF"><b>D11</b><br>#807638<br><i>4.6:1</i></span><span class="sw" style="background:#384280;color:#FFF"><b>D12</b><br>#384280<br><i>9.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> laguna · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L2</b><br>#E8D4DC<br><i>11.7:1</i></span><span class="sw" style="background:#E5D4E8;color:#000"><b>L3</b><br>#E5D4E8<br><i>11.7:1</i></span><span class="sw" style="background:#D4D7E8;color:#000"><b>L4</b><br>#D4D7E8<br><i>11.5:1</i></span><span class="sw" style="background:#E0E8D4;color:#000"><b>L5</b><br>#E0E8D4<br><i>13.1:1</i></span><span class="sw" style="background:#E8DDD4;color:#000"><b>L6</b><br>#E8DDD4<br><i>12.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCD6E6;color:#000"><b>L7</b><br>#DCD6E6<br><i>11.6:1</i></span><span class="sw" style="background:#D6E6DE;color:#000"><b>L8</b><br>#D6E6DE<br><i>12.8:1</i></span><span class="sw" style="background:#D6DCE6;color:#000"><b>L9</b><br>#D6DCE6<br><i>12.0:1</i></span><span class="sw" style="background:#E6D8D6;color:#000"><b>L10</b><br>#E6D8D6<br><i>11.9:1</i></span><span class="sw" style="background:#E6D6E3;color:#000"><b>L11</b><br>#E6D6E3<br><i>11.9:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L12</b><br>#D8E6D6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D2</b><br>#863252<br><i>8.1:1</i></span><span class="sw" style="background:#7B3286;color:#FFF"><b>D3</b><br>#7B3286<br><i>7.9:1</i></span><span class="sw" style="background:#323D86;color:#FFF"><b>D4</b><br>#323D86<br><i>9.8:1</i></span><span class="sw" style="background:#617F2F;color:#FFF"><b>D5</b><br>#617F2F<br><i>4.6:1</i></span><span class="sw" style="background:#865832;color:#FFF"><b>D6</b><br>#865832<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#523880;color:#FFF"><b>D7</b><br>#523880<br><i>9.4:1</i></span><span class="sw" style="background:#38805E;color:#FFF"><b>D8</b><br>#38805E<br><i>4.8:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D9</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#804038;color:#FFF"><b>D10</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#803871;color:#FFF"><b>D11</b><br>#803871<br><i>7.7:1</i></span><span class="sw" style="background:#428038;color:#FFF"><b>D12</b><br>#428038<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> laguna · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#D4DCE8;color:#000"><b>L2</b><br>#D4DCE8<br><i>11.9:1</i></span><span class="sw" style="background:#D6D4E8;color:#000"><b>L3</b><br>#D6D4E8<br><i>11.4:1</i></span><span class="sw" style="background:#E0D4E8;color:#000"><b>L4</b><br>#E0D4E8<br><i>11.6:1</i></span><span class="sw" style="background:#E8D4E5;color:#000"><b>L5</b><br>#E8D4E5<br><i>11.8:1</i></span><span class="sw" style="background:#E8D4DC;color:#000"><b>L6</b><br>#E8D4DC<br><i>11.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D8D6;color:#000"><b>L7</b><br>#E6D8D6<br><i>11.9:1</i></span><span class="sw" style="background:#E6E0D6;color:#000"><b>L8</b><br>#E6E0D6<br><i>12.6:1</i></span><span class="sw" style="background:#E4E6D6;color:#000"><b>L9</b><br>#E4E6D6<br><i>13.0:1</i></span><span class="sw" style="background:#DCE6D6;color:#000"><b>L10</b><br>#DCE6D6<br><i>12.8:1</i></span><span class="sw" style="background:#D6E6D8;color:#000"><b>L11</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#D6E6E0;color:#000"><b>L12</b><br>#D6E6E0<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#325286;color:#FFF"><b>D2</b><br>#325286<br><i>7.8:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D3</b><br>#3B3286<br><i>10.6:1</i></span><span class="sw" style="background:#663286;color:#FFF"><b>D4</b><br>#663286<br><i>8.9:1</i></span><span class="sw" style="background:#86327C;color:#FFF"><b>D5</b><br>#86327C<br><i>7.6:1</i></span><span class="sw" style="background:#863252;color:#FFF"><b>D6</b><br>#863252<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#804038;color:#FFF"><b>D7</b><br>#804038<br><i>7.8:1</i></span><span class="sw" style="background:#806438;color:#FFF"><b>D8</b><br>#806438<br><i>5.5:1</i></span><span class="sw" style="background:#717935;color:#FFF"><b>D9</b><br>#717935<br><i>4.7:1</i></span><span class="sw" style="background:#538038;color:#FFF"><b>D10</b><br>#538038<br><i>4.7:1</i></span><span class="sw" style="background:#388040;color:#FFF"><b>D11</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D12</b><br>#388064<br><i>4.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F5FAFC;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> laguna · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D3E6E8;color:#000"><b>L1</b><br>#D3E6E8<br><i>12.8:1</i></span><span class="sw" style="background:#D4DFE8;color:#000"><b>L2</b><br>#D4DFE8<br><i>12.2:1</i></span><span class="sw" style="background:#D4E8E3;color:#000"><b>L3</b><br>#D4E8E3<br><i>12.9:1</i></span><span class="sw" style="background:#D4D8E8;color:#000"><b>L4</b><br>#D4D8E8<br><i>11.6:1</i></span><span class="sw" style="background:#D4E8DD;color:#000"><b>L5</b><br>#D4E8DD<br><i>12.9:1</i></span><span class="sw" style="background:#D6D4E8;color:#000"><b>L6</b><br>#D6D4E8<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6D8;color:#000"><b>L7</b><br>#D6E6D8<br><i>12.7:1</i></span><span class="sw" style="background:#D6E0E6;color:#000"><b>L8</b><br>#D6E0E6<br><i>12.3:1</i></span><span class="sw" style="background:#D6E6E4;color:#000"><b>L9</b><br>#D6E6E4<br><i>12.8:1</i></span><span class="sw" style="background:#D6DCE6;color:#000"><b>L10</b><br>#D6DCE6<br><i>12.0:1</i></span><span class="sw" style="background:#D6E6E0;color:#000"><b>L11</b><br>#D6E6E0<br><i>12.8:1</i></span><span class="sw" style="background:#D6E4E6;color:#000"><b>L12</b><br>#D6E4E6<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#2E7F8A;color:#FFF"><b>D1</b><br>#2E7F8A<br><i>4.6:1</i></span><span class="sw" style="background:#326086;color:#FFF"><b>D2</b><br>#326086<br><i>6.7:1</i></span><span class="sw" style="background:#308271;color:#FFF"><b>D3</b><br>#308271<br><i>4.6:1</i></span><span class="sw" style="background:#324486;color:#FFF"><b>D4</b><br>#324486<br><i>9.1:1</i></span><span class="sw" style="background:#308255;color:#FFF"><b>D5</b><br>#308255<br><i>4.7:1</i></span><span class="sw" style="background:#3B3286;color:#FFF"><b>D6</b><br>#3B3286<br><i>10.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#388040;color:#FFF"><b>D7</b><br>#388040<br><i>4.9:1</i></span><span class="sw" style="background:#386580;color:#FFF"><b>D8</b><br>#386580<br><i>6.3:1</i></span><span class="sw" style="background:#388076;color:#FFF"><b>D9</b><br>#388076<br><i>4.6:1</i></span><span class="sw" style="background:#385380;color:#FFF"><b>D10</b><br>#385380<br><i>7.7:1</i></span><span class="sw" style="background:#388064;color:#FFF"><b>D11</b><br>#388064<br><i>4.7:1</i></span><span class="sw" style="background:#387780;color:#FFF"><b>D12</b><br>#387780<br><i>5.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> burgundy · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L3</b><br>#D5E2E7<br><i>14.3:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L4</b><br>#E7DAD5<br><i>13.9:1</i></span><span class="sw" style="background:#E7D5E2;color:#000"><b>L5</b><br>#E7D5E2<br><i>13.5:1</i></span><span class="sw" style="background:#D5E7E3;color:#000"><b>L6</b><br>#D5E7E3<br><i>14.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6E3D6;color:#000"><b>L7</b><br>#E6E3D6<br><i>14.7:1</i></span><span class="sw" style="background:#D9E6D6;color:#000"><b>L8</b><br>#D9E6D6<br><i>14.6:1</i></span><span class="sw" style="background:#D6D9E6;color:#000"><b>L9</b><br>#D6D9E6<br><i>13.5:1</i></span><span class="sw" style="background:#E3D6E6;color:#000"><b>L10</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E1E6D6;color:#000"><b>L11</b><br>#E1E6D6<br><i>14.9:1</i></span><span class="sw" style="background:#DBD6E6;color:#000"><b>L12</b><br>#DBD6E6<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#2D6E8A;color:#FFF"><b>D3</b><br>#2D6E8A<br><i>5.7:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D4</b><br>#8A492D<br><i>6.8:1</i></span><span class="sw" style="background:#8A2D6E;color:#FFF"><b>D5</b><br>#8A2D6E<br><i>7.8:1</i></span><span class="sw" style="background:#2B8371;color:#FFF"><b>D6</b><br>#2B8371<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#837334;color:#FFF"><b>D7</b><br>#837334<br><i>4.7:1</i></span><span class="sw" style="background:#448334;color:#FFF"><b>D8</b><br>#448334<br><i>4.6:1</i></span><span class="sw" style="background:#344483;color:#FFF"><b>D9</b><br>#344483<br><i>9.1:1</i></span><span class="sw" style="background:#733483;color:#FFF"><b>D10</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#667C32;color:#FFF"><b>D11</b><br>#667C32<br><i>4.7:1</i></span><span class="sw" style="background:#4C3483;color:#FFF"><b>D12</b><br>#4C3483<br><i>9.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> burgundy · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L3</b><br>#E2E7D5<br><i>15.0:1</i></span><span class="sw" style="background:#DAD5E7;color:#000"><b>L4</b><br>#DAD5E7<br><i>13.2:1</i></span><span class="sw" style="background:#D5E2E7;color:#000"><b>L5</b><br>#D5E2E7<br><i>14.3:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L6</b><br>#E7DAD5<br><i>13.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E6D7D6;color:#000"><b>L7</b><br>#E6D7D6<br><i>13.6:1</i></span><span class="sw" style="background:#D6E6DF;color:#000"><b>L8</b><br>#D6E6DF<br><i>14.7:1</i></span><span class="sw" style="background:#E5E6D6;color:#000"><b>L9</b><br>#E5E6D6<br><i>15.0:1</i></span><span class="sw" style="background:#DFD6E6;color:#000"><b>L10</b><br>#DFD6E6<br><i>13.4:1</i></span><span class="sw" style="background:#D6DDE6;color:#000"><b>L11</b><br>#D6DDE6<br><i>13.8:1</i></span><span class="sw" style="background:#E6DFD6;color:#000"><b>L12</b><br>#E6DFD6<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#657F2A;color:#FFF"><b>D3</b><br>#657F2A<br><i>4.5:1</i></span><span class="sw" style="background:#492D8A;color:#FFF"><b>D4</b><br>#492D8A<br><i>10.4:1</i></span><span class="sw" style="background:#2D6E8A;color:#FFF"><b>D5</b><br>#2D6E8A<br><i>5.7:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D6</b><br>#8A492D<br><i>6.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#833834;color:#FFF"><b>D7</b><br>#833834<br><i>8.1:1</i></span><span class="sw" style="background:#348360;color:#FFF"><b>D8</b><br>#348360<br><i>4.6:1</i></span><span class="sw" style="background:#757830;color:#FFF"><b>D9</b><br>#757830<br><i>4.7:1</i></span><span class="sw" style="background:#603483;color:#FFF"><b>D10</b><br>#603483<br><i>9.1:1</i></span><span class="sw" style="background:#345883;color:#FFF"><b>D11</b><br>#345883<br><i>7.3:1</i></span><span class="sw" style="background:#836034;color:#FFF"><b>D12</b><br>#836034<br><i>5.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> burgundy · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L2</b><br>#D5E7DA<br><i>14.7:1</i></span><span class="sw" style="background:#DDE7D5;color:#000"><b>L3</b><br>#DDE7D5<br><i>14.9:1</i></span><span class="sw" style="background:#E7DFD5;color:#000"><b>L4</b><br>#E7DFD5<br><i>14.4:1</i></span><span class="sw" style="background:#D6D5E7;color:#000"><b>L5</b><br>#D6D5E7<br><i>13.1:1</i></span><span class="sw" style="background:#D5E5E7;color:#000"><b>L6</b><br>#D5E5E7<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5E6D6;color:#000"><b>L7</b><br>#E5E6D6<br><i>15.0:1</i></span><span class="sw" style="background:#E6D6E2;color:#000"><b>L8</b><br>#E6D6E2<br><i>13.6:1</i></span><span class="sw" style="background:#E6DBD6;color:#000"><b>L9</b><br>#E6DBD6<br><i>14.0:1</i></span><span class="sw" style="background:#D6E6E3;color:#000"><b>L10</b><br>#D6E6E3<br><i>14.7:1</i></span><span class="sw" style="background:#D8E6D6;color:#000"><b>L11</b><br>#D8E6D6<br><i>14.6:1</i></span><span class="sw" style="background:#DFD6E6;color:#000"><b>L12</b><br>#DFD6E6<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D2</b><br>#2C8647<br><i>4.6:1</i></span><span class="sw" style="background:#52832B;color:#FFF"><b>D3</b><br>#52832B<br><i>4.5:1</i></span><span class="sw" style="background:#8A602D;color:#FFF"><b>D4</b><br>#8A602D<br><i>5.5:1</i></span><span class="sw" style="background:#322D8A;color:#FFF"><b>D5</b><br>#322D8A<br><i>11.2:1</i></span><span class="sw" style="background:#2D7E8A;color:#FFF"><b>D6</b><br>#2D7E8A<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#757830;color:#FFF"><b>D7</b><br>#757830<br><i>4.7:1</i></span><span class="sw" style="background:#833472;color:#FFF"><b>D8</b><br>#833472<br><i>7.8:1</i></span><span class="sw" style="background:#834C34;color:#FFF"><b>D9</b><br>#834C34<br><i>6.9:1</i></span><span class="sw" style="background:#348373;color:#FFF"><b>D10</b><br>#348373<br><i>4.5:1</i></span><span class="sw" style="background:#3E8334;color:#FFF"><b>D11</b><br>#3E8334<br><i>4.7:1</i></span><span class="sw" style="background:#603483;color:#FFF"><b>D12</b><br>#603483<br><i>9.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> burgundy · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#E7DAD5;color:#000"><b>L2</b><br>#E7DAD5<br><i>13.9:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L3</b><br>#E7E3D5<br><i>14.7:1</i></span><span class="sw" style="background:#E2E7D5;color:#000"><b>L4</b><br>#E2E7D5<br><i>15.0:1</i></span><span class="sw" style="background:#D8E7D5;color:#000"><b>L5</b><br>#D8E7D5<br><i>14.7:1</i></span><span class="sw" style="background:#D5E7DA;color:#000"><b>L6</b><br>#D5E7DA<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D6E6E3;color:#000"><b>L7</b><br>#D6E6E3<br><i>14.7:1</i></span><span class="sw" style="background:#D6E1E6;color:#000"><b>L8</b><br>#D6E1E6<br><i>14.2:1</i></span><span class="sw" style="background:#D6D9E6;color:#000"><b>L9</b><br>#D6D9E6<br><i>13.5:1</i></span><span class="sw" style="background:#DBD6E6;color:#000"><b>L10</b><br>#DBD6E6<br><i>13.3:1</i></span><span class="sw" style="background:#E3D6E6;color:#000"><b>L11</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6E1;color:#000"><b>L12</b><br>#E6D6E1<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#8A492D;color:#FFF"><b>D2</b><br>#8A492D<br><i>6.8:1</i></span><span class="sw" style="background:#86742C;color:#FFF"><b>D3</b><br>#86742C<br><i>4.6:1</i></span><span class="sw" style="background:#657F2A;color:#FFF"><b>D4</b><br>#657F2A<br><i>4.5:1</i></span><span class="sw" style="background:#3E862C;color:#FFF"><b>D5</b><br>#3E862C<br><i>4.5:1</i></span><span class="sw" style="background:#2C8647;color:#FFF"><b>D6</b><br>#2C8647<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#348373;color:#FFF"><b>D7</b><br>#348373<br><i>4.5:1</i></span><span class="sw" style="background:#346C83;color:#FFF"><b>D8</b><br>#346C83<br><i>5.8:1</i></span><span class="sw" style="background:#344483;color:#FFF"><b>D9</b><br>#344483<br><i>9.1:1</i></span><span class="sw" style="background:#4C3483;color:#FFF"><b>D10</b><br>#4C3483<br><i>9.9:1</i></span><span class="sw" style="background:#733483;color:#FFF"><b>D11</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#83346C;color:#FFF"><b>D12</b><br>#83346C<br><i>7.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF2F2;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> burgundy · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E8D4D8;color:#000"><b>L1</b><br>#E8D4D8<br><i>13.4:1</i></span><span class="sw" style="background:#E7D7D5;color:#000"><b>L2</b><br>#E7D7D5<br><i>13.6:1</i></span><span class="sw" style="background:#E7D5DE;color:#000"><b>L3</b><br>#E7D5DE<br><i>13.5:1</i></span><span class="sw" style="background:#E7DDD5;color:#000"><b>L4</b><br>#E7DDD5<br><i>14.2:1</i></span><span class="sw" style="background:#E7D5E5;color:#000"><b>L5</b><br>#E7D5E5<br><i>13.6:1</i></span><span class="sw" style="background:#E7E3D5;color:#000"><b>L6</b><br>#E7E3D5<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3D6E6;color:#000"><b>L7</b><br>#E3D6E6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D7D6;color:#000"><b>L8</b><br>#E6D7D6<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6DD;color:#000"><b>L9</b><br>#E6D6DD<br><i>13.6:1</i></span><span class="sw" style="background:#E6DBD6;color:#000"><b>L10</b><br>#E6DBD6<br><i>14.0:1</i></span><span class="sw" style="background:#E6D6E1;color:#000"><b>L11</b><br>#E6D6E1<br><i>13.6:1</i></span><span class="sw" style="background:#E6D6D9;color:#000"><b>L12</b><br>#E6D6D9<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#8E293E;color:#FFF"><b>D1</b><br>#8E293E<br><i>8.3:1</i></span><span class="sw" style="background:#8A3A2D;color:#FFF"><b>D2</b><br>#8A3A2D<br><i>7.7:1</i></span><span class="sw" style="background:#8A2D5F;color:#FFF"><b>D3</b><br>#8A2D5F<br><i>8.0:1</i></span><span class="sw" style="background:#8A592D;color:#FFF"><b>D4</b><br>#8A592D<br><i>5.9:1</i></span><span class="sw" style="background:#8A2D7E;color:#FFF"><b>D5</b><br>#8A2D7E<br><i>7.6:1</i></span><span class="sw" style="background:#86742C;color:#FFF"><b>D6</b><br>#86742C<br><i>4.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#733483;color:#FFF"><b>D7</b><br>#733483<br><i>8.2:1</i></span><span class="sw" style="background:#833834;color:#FFF"><b>D8</b><br>#833834<br><i>8.1:1</i></span><span class="sw" style="background:#833458;color:#FFF"><b>D9</b><br>#833458<br><i>8.1:1</i></span><span class="sw" style="background:#834C34;color:#FFF"><b>D10</b><br>#834C34<br><i>6.9:1</i></span><span class="sw" style="background:#83346C;color:#FFF"><b>D11</b><br>#83346C<br><i>7.9:1</i></span><span class="sw" style="background:#833444;color:#FFF"><b>D12</b><br>#833444<br><i>8.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> crepuscolo · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#D5E6D5;color:#000"><b>L3</b><br>#D5E6D5<br><i>14.3:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L4</b><br>#E6D5E6<br><i>13.4:1</i></span><span class="sw" style="background:#D5D5E6;color:#000"><b>L5</b><br>#D5D5E6<br><i>12.9:1</i></span><span class="sw" style="background:#DEE6D5;color:#000"><b>L6</b><br>#DEE6D5<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DE;color:#000"><b>L7</b><br>#E5D7DE<br><i>13.4:1</i></span><span class="sw" style="background:#E5DED7;color:#000"><b>L8</b><br>#E5DED7<br><i>14.0:1</i></span><span class="sw" style="background:#D7E5DE;color:#000"><b>L9</b><br>#D7E5DE<br><i>14.4:1</i></span><span class="sw" style="background:#D7DEE5;color:#000"><b>L10</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#E5D7D7;color:#000"><b>L11</b><br>#E5D7D7<br><i>13.4:1</i></span><span class="sw" style="background:#D7E5E5;color:#000"><b>L12</b><br>#D7E5E5<br><i>14.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#368236;color:#FFF"><b>D3</b><br>#368236<br><i>4.8:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D4</b><br>#823682<br><i>7.5:1</i></span><span class="sw" style="background:#363682;color:#FFF"><b>D5</b><br>#363682<br><i>10.5:1</i></span><span class="sw" style="background:#597E34;color:#FFF"><b>D6</b><br>#597E34<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#7C3C5C;color:#FFF"><b>D7</b><br>#7C3C5C<br><i>7.9:1</i></span><span class="sw" style="background:#7C5C3C;color:#FFF"><b>D8</b><br>#7C5C3C<br><i>6.1:1</i></span><span class="sw" style="background:#3C7C5C;color:#FFF"><b>D9</b><br>#3C7C5C<br><i>5.0:1</i></span><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D10</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#7C3C3C;color:#FFF"><b>D11</b><br>#7C3C3C<br><i>8.2:1</i></span><span class="sw" style="background:#3C7C7C;color:#FFF"><b>D12</b><br>#3C7C7C<br><i>4.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> crepuscolo · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#E6D5D5;color:#000"><b>L3</b><br>#E6D5D5<br><i>13.2:1</i></span><span class="sw" style="background:#D5E6E6;color:#000"><b>L4</b><br>#D5E6E6<br><i>14.5:1</i></span><span class="sw" style="background:#D5E6D5;color:#000"><b>L5</b><br>#D5E6D5<br><i>14.3:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L6</b><br>#E6D5E6<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1D7E5;color:#000"><b>L7</b><br>#E1D7E5<br><i>13.4:1</i></span><span class="sw" style="background:#E1E5D7;color:#000"><b>L8</b><br>#E1E5D7<br><i>14.6:1</i></span><span class="sw" style="background:#E5D7DA;color:#000"><b>L9</b><br>#E5D7DA<br><i>13.4:1</i></span><span class="sw" style="background:#D7E1E5;color:#000"><b>L10</b><br>#D7E1E5<br><i>14.1:1</i></span><span class="sw" style="background:#D7E5DA;color:#000"><b>L11</b><br>#D7E5DA<br><i>14.3:1</i></span><span class="sw" style="background:#E5D7E1;color:#000"><b>L12</b><br>#E5D7E1<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#823636;color:#FFF"><b>D3</b><br>#823636<br><i>8.3:1</i></span><span class="sw" style="background:#347E7E;color:#FFF"><b>D4</b><br>#347E7E<br><i>4.7:1</i></span><span class="sw" style="background:#368236;color:#FFF"><b>D5</b><br>#368236<br><i>4.8:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D6</b><br>#823682<br><i>7.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6C3C7C;color:#FFF"><b>D7</b><br>#6C3C7C<br><i>8.2:1</i></span><span class="sw" style="background:#6C7C3C;color:#FFF"><b>D8</b><br>#6C7C3C<br><i>4.6:1</i></span><span class="sw" style="background:#7C3C4C;color:#FFF"><b>D9</b><br>#7C3C4C<br><i>8.1:1</i></span><span class="sw" style="background:#3C6C7C;color:#FFF"><b>D10</b><br>#3C6C7C<br><i>5.8:1</i></span><span class="sw" style="background:#3C7C4C;color:#FFF"><b>D11</b><br>#3C7C4C<br><i>5.0:1</i></span><span class="sw" style="background:#7C3C6C;color:#FFF"><b>D12</b><br>#7C3C6C<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> crepuscolo · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L2</b><br>#E6E6D5<br><i>14.8:1</i></span><span class="sw" style="background:#E6DAD5;color:#000"><b>L3</b><br>#E6DAD5<br><i>13.7:1</i></span><span class="sw" style="background:#E6D5E2;color:#000"><b>L4</b><br>#E6D5E2<br><i>13.3:1</i></span><span class="sw" style="background:#D5E6E2;color:#000"><b>L5</b><br>#D5E6E2<br><i>14.5:1</i></span><span class="sw" style="background:#D8E6D5;color:#000"><b>L6</b><br>#D8E6D5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E5D7DA;color:#000"><b>L7</b><br>#E5D7DA<br><i>13.4:1</i></span><span class="sw" style="background:#D7D8E5;color:#000"><b>L8</b><br>#D7D8E5<br><i>13.2:1</i></span><span class="sw" style="background:#E5D7E5;color:#000"><b>L9</b><br>#E5D7E5<br><i>13.5:1</i></span><span class="sw" style="background:#DEE5D7;color:#000"><b>L10</b><br>#DEE5D7<br><i>14.5:1</i></span><span class="sw" style="background:#E5DFD7;color:#000"><b>L11</b><br>#E5DFD7<br><i>14.1:1</i></span><span class="sw" style="background:#D7E1E5;color:#000"><b>L12</b><br>#D7E1E5<br><i>14.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D2</b><br>#777731<br><i>4.7:1</i></span><span class="sw" style="background:#824936;color:#FFF"><b>D3</b><br>#824936<br><i>7.1:1</i></span><span class="sw" style="background:#82366F;color:#FFF"><b>D4</b><br>#82366F<br><i>7.8:1</i></span><span class="sw" style="background:#36826F;color:#FFF"><b>D5</b><br>#36826F<br><i>4.6:1</i></span><span class="sw" style="background:#428236;color:#FFF"><b>D6</b><br>#428236<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#7C3C4C;color:#FFF"><b>D7</b><br>#7C3C4C<br><i>8.1:1</i></span><span class="sw" style="background:#3C417C;color:#FFF"><b>D8</b><br>#3C417C<br><i>9.4:1</i></span><span class="sw" style="background:#7C3C7C;color:#FFF"><b>D9</b><br>#7C3C7C<br><i>7.5:1</i></span><span class="sw" style="background:#5C7C3C;color:#FFF"><b>D10</b><br>#5C7C3C<br><i>4.8:1</i></span><span class="sw" style="background:#7C613C;color:#FFF"><b>D11</b><br>#7C613C<br><i>5.8:1</i></span><span class="sw" style="background:#3C6C7C;color:#FFF"><b>D12</b><br>#3C6C7C<br><i>5.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> crepuscolo · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E6D5E6;color:#000"><b>L2</b><br>#E6D5E6<br><i>13.4:1</i></span><span class="sw" style="background:#E6D5DE;color:#000"><b>L3</b><br>#E6D5DE<br><i>13.3:1</i></span><span class="sw" style="background:#E6D5D5;color:#000"><b>L4</b><br>#E6D5D5<br><i>13.2:1</i></span><span class="sw" style="background:#E6DED5;color:#000"><b>L5</b><br>#E6DED5<br><i>14.0:1</i></span><span class="sw" style="background:#E6E6D5;color:#000"><b>L6</b><br>#E6E6D5<br><i>14.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEE5D7;color:#000"><b>L7</b><br>#DEE5D7<br><i>14.5:1</i></span><span class="sw" style="background:#D7E5D7;color:#000"><b>L8</b><br>#D7E5D7<br><i>14.3:1</i></span><span class="sw" style="background:#D7E5DE;color:#000"><b>L9</b><br>#D7E5DE<br><i>14.4:1</i></span><span class="sw" style="background:#D7E5E5;color:#000"><b>L10</b><br>#D7E5E5<br><i>14.4:1</i></span><span class="sw" style="background:#D7DEE5;color:#000"><b>L11</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#D7D7E5;color:#000"><b>L12</b><br>#D7D7E5<br><i>13.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#823682;color:#FFF"><b>D2</b><br>#823682<br><i>7.5:1</i></span><span class="sw" style="background:#82365C;color:#FFF"><b>D3</b><br>#82365C<br><i>8.0:1</i></span><span class="sw" style="background:#823636;color:#FFF"><b>D4</b><br>#823636<br><i>8.3:1</i></span><span class="sw" style="background:#825C36;color:#FFF"><b>D5</b><br>#825C36<br><i>5.9:1</i></span><span class="sw" style="background:#777731;color:#FFF"><b>D6</b><br>#777731<br><i>4.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5C7C3C;color:#FFF"><b>D7</b><br>#5C7C3C<br><i>4.8:1</i></span><span class="sw" style="background:#3C7C3C;color:#FFF"><b>D8</b><br>#3C7C3C<br><i>5.1:1</i></span><span class="sw" style="background:#3C7C5C;color:#FFF"><b>D9</b><br>#3C7C5C<br><i>5.0:1</i></span><span class="sw" style="background:#3C7C7C;color:#FFF"><b>D10</b><br>#3C7C7C<br><i>4.8:1</i></span><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D11</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#3C3C7C;color:#FFF"><b>D12</b><br>#3C3C7C<br><i>9.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAF8FC;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> crepuscolo · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DED5E7;color:#000"><b>L1</b><br>#DED5E7<br><i>13.2:1</i></span><span class="sw" style="background:#E4D5E6;color:#000"><b>L2</b><br>#E4D5E6<br><i>13.3:1</i></span><span class="sw" style="background:#D8D5E6;color:#000"><b>L3</b><br>#D8D5E6<br><i>13.0:1</i></span><span class="sw" style="background:#E6D5E4;color:#000"><b>L4</b><br>#E6D5E4<br><i>13.4:1</i></span><span class="sw" style="background:#D5D8E6;color:#000"><b>L5</b><br>#D5D8E6<br><i>13.2:1</i></span><span class="sw" style="background:#E6D5DE;color:#000"><b>L6</b><br>#E6D5DE<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7DEE5;color:#000"><b>L7</b><br>#D7DEE5<br><i>13.8:1</i></span><span class="sw" style="background:#E1D7E5;color:#000"><b>L8</b><br>#E1D7E5<br><i>13.4:1</i></span><span class="sw" style="background:#DAD7E5;color:#000"><b>L9</b><br>#DAD7E5<br><i>13.2:1</i></span><span class="sw" style="background:#E5D7E5;color:#000"><b>L10</b><br>#E5D7E5<br><i>13.5:1</i></span><span class="sw" style="background:#D7D7E5;color:#000"><b>L11</b><br>#D7D7E5<br><i>13.1:1</i></span><span class="sw" style="background:#DED7E5;color:#000"><b>L12</b><br>#DED7E5<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#5C3285;color:#FFF"><b>D1</b><br>#5C3285<br><i>9.3:1</i></span><span class="sw" style="background:#753682;color:#FFF"><b>D2</b><br>#753682<br><i>8.1:1</i></span><span class="sw" style="background:#423682;color:#FFF"><b>D3</b><br>#423682<br><i>10.1:1</i></span><span class="sw" style="background:#823675;color:#FFF"><b>D4</b><br>#823675<br><i>7.7:1</i></span><span class="sw" style="background:#364282;color:#FFF"><b>D5</b><br>#364282<br><i>9.3:1</i></span><span class="sw" style="background:#82365C;color:#FFF"><b>D6</b><br>#82365C<br><i>8.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#3C5C7C;color:#FFF"><b>D7</b><br>#3C5C7C<br><i>7.0:1</i></span><span class="sw" style="background:#6C3C7C;color:#FFF"><b>D8</b><br>#6C3C7C<br><i>8.2:1</i></span><span class="sw" style="background:#4C3C7C;color:#FFF"><b>D9</b><br>#4C3C7C<br><i>9.4:1</i></span><span class="sw" style="background:#7C3C7C;color:#FFF"><b>D10</b><br>#7C3C7C<br><i>7.5:1</i></span><span class="sw" style="background:#3C3C7C;color:#FFF"><b>D11</b><br>#3C3C7C<br><i>9.9:1</i></span><span class="sw" style="background:#5C3C7C;color:#FFF"><b>D12</b><br>#5C3C7C<br><i>8.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> brina · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E3E1D8;color:#000"><b>L3</b><br>#E3E1D8<br><i>12.1:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L4</b><br>#D8DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#D8E3E1;color:#000"><b>L5</b><br>#D8E3E1<br><i>12.1:1</i></span><span class="sw" style="background:#E3DCD8;color:#000"><b>L6</b><br>#E3DCD8<br><i>11.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCD9E3;color:#000"><b>L7</b><br>#DCD9E3<br><i>11.4:1</i></span><span class="sw" style="background:#E3D9E0;color:#000"><b>L8</b><br>#E3D9E0<br><i>11.5:1</i></span><span class="sw" style="background:#E0E3D9;color:#000"><b>L9</b><br>#E0E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#D9E3DC;color:#000"><b>L10</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#E1D9E3;color:#000"><b>L11</b><br>#E1D9E3<br><i>11.5:1</i></span><span class="sw" style="background:#DBE3D9;color:#000"><b>L12</b><br>#DBE3D9<br><i>12.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#796E3E;color:#FFF"><b>D3</b><br>#796E3E<br><i>5.1:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D4</b><br>#3E4A79<br><i>8.5:1</i></span><span class="sw" style="background:#3E796E;color:#FFF"><b>D5</b><br>#3E796E<br><i>5.0:1</i></span><span class="sw" style="background:#79503E;color:#FFF"><b>D6</b><br>#79503E<br><i>6.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#524375;color:#FFF"><b>D7</b><br>#524375<br><i>8.7:1</i></span><span class="sw" style="background:#754366;color:#FFF"><b>D8</b><br>#754366<br><i>7.6:1</i></span><span class="sw" style="background:#667543;color:#FFF"><b>D9</b><br>#667543<br><i>5.0:1</i></span><span class="sw" style="background:#437552;color:#FFF"><b>D10</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#6B4375;color:#FFF"><b>D11</b><br>#6B4375<br><i>7.8:1</i></span><span class="sw" style="background:#4D7543;color:#FFF"><b>D12</b><br>#4D7543<br><i>5.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> brina · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E1D8E3;color:#000"><b>L3</b><br>#E1D8E3<br><i>11.4:1</i></span><span class="sw" style="background:#DBE3D8;color:#000"><b>L4</b><br>#DBE3D8<br><i>12.1:1</i></span><span class="sw" style="background:#E3E1D8;color:#000"><b>L5</b><br>#E3E1D8<br><i>12.1:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L6</b><br>#D8DBE3<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9DDE3;color:#000"><b>L7</b><br>#D9DDE3<br><i>11.6:1</i></span><span class="sw" style="background:#E3DAD9;color:#000"><b>L8</b><br>#E3DAD9<br><i>11.5:1</i></span><span class="sw" style="background:#DED9E3;color:#000"><b>L9</b><br>#DED9E3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3DA;color:#000"><b>L10</b><br>#D9E3DA<br><i>12.0:1</i></span><span class="sw" style="background:#E2E3D9;color:#000"><b>L11</b><br>#E2E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#DAD9E3;color:#000"><b>L12</b><br>#DAD9E3<br><i>11.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#6E3E79;color:#FFF"><b>D3</b><br>#6E3E79<br><i>8.0:1</i></span><span class="sw" style="background:#4A793E;color:#FFF"><b>D4</b><br>#4A793E<br><i>5.1:1</i></span><span class="sw" style="background:#796E3E;color:#FFF"><b>D5</b><br>#796E3E<br><i>5.1:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D6</b><br>#3E4A79<br><i>8.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#435975;color:#FFF"><b>D7</b><br>#435975<br><i>7.2:1</i></span><span class="sw" style="background:#754543;color:#FFF"><b>D8</b><br>#754543<br><i>7.8:1</i></span><span class="sw" style="background:#5E4375;color:#FFF"><b>D9</b><br>#5E4375<br><i>8.3:1</i></span><span class="sw" style="background:#437545;color:#FFF"><b>D10</b><br>#437545<br><i>5.4:1</i></span><span class="sw" style="background:#727543;color:#FFF"><b>D11</b><br>#727543<br><i>4.8:1</i></span><span class="sw" style="background:#454375;color:#FFF"><b>D12</b><br>#454375<br><i>9.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> brina · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L2</b><br>#E3D8DB<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8E3;color:#000"><b>L3</b><br>#E3D8E3<br><i>11.5:1</i></span><span class="sw" style="background:#D9D8E3;color:#000"><b>L4</b><br>#D9D8E3<br><i>11.2:1</i></span><span class="sw" style="background:#DDE3D8;color:#000"><b>L5</b><br>#DDE3D8<br><i>12.1:1</i></span><span class="sw" style="background:#E3DFD8;color:#000"><b>L6</b><br>#E3DFD8<br><i>11.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DED9E3;color:#000"><b>L7</b><br>#DED9E3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3E0;color:#000"><b>L8</b><br>#D9E3E0<br><i>12.1:1</i></span><span class="sw" style="background:#D9DBE3;color:#000"><b>L9</b><br>#D9DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#E3DCD9;color:#000"><b>L10</b><br>#E3DCD9<br><i>11.7:1</i></span><span class="sw" style="background:#E3D9DF;color:#000"><b>L11</b><br>#E3D9DF<br><i>11.5:1</i></span><span class="sw" style="background:#D9E3DA;color:#000"><b>L12</b><br>#D9E3DA<br><i>12.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D2</b><br>#793E4A<br><i>8.1:1</i></span><span class="sw" style="background:#793E76;color:#FFF"><b>D3</b><br>#793E76<br><i>7.6:1</i></span><span class="sw" style="background:#413E79;color:#FFF"><b>D4</b><br>#413E79<br><i>9.6:1</i></span><span class="sw" style="background:#59793E;color:#FFF"><b>D5</b><br>#59793E<br><i>5.0:1</i></span><span class="sw" style="background:#79643E;color:#FFF"><b>D6</b><br>#79643E<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5E4375;color:#FFF"><b>D7</b><br>#5E4375<br><i>8.3:1</i></span><span class="sw" style="background:#437567;color:#FFF"><b>D8</b><br>#437567<br><i>5.3:1</i></span><span class="sw" style="background:#434D75;color:#FFF"><b>D9</b><br>#434D75<br><i>8.2:1</i></span><span class="sw" style="background:#755243;color:#FFF"><b>D10</b><br>#755243<br><i>6.9:1</i></span><span class="sw" style="background:#754362;color:#FFF"><b>D11</b><br>#754362<br><i>7.7:1</i></span><span class="sw" style="background:#437545;color:#FFF"><b>D12</b><br>#437545<br><i>5.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> brina · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#D8DBE3;color:#000"><b>L2</b><br>#D8DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#DCD8E3;color:#000"><b>L3</b><br>#DCD8E3<br><i>11.3:1</i></span><span class="sw" style="background:#E1D8E3;color:#000"><b>L4</b><br>#E1D8E3<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8E0;color:#000"><b>L5</b><br>#E3D8E0<br><i>11.4:1</i></span><span class="sw" style="background:#E3D8DB;color:#000"><b>L6</b><br>#E3D8DB<br><i>11.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3DCD9;color:#000"><b>L7</b><br>#E3DCD9<br><i>11.7:1</i></span><span class="sw" style="background:#E3E1D9;color:#000"><b>L8</b><br>#E3E1D9<br><i>12.1:1</i></span><span class="sw" style="background:#E0E3D9;color:#000"><b>L9</b><br>#E0E3D9<br><i>12.2:1</i></span><span class="sw" style="background:#DBE3D9;color:#000"><b>L10</b><br>#DBE3D9<br><i>12.1:1</i></span><span class="sw" style="background:#D9E3DC;color:#000"><b>L11</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#D9E3E1;color:#000"><b>L12</b><br>#D9E3E1<br><i>12.1:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#3E4A79;color:#FFF"><b>D2</b><br>#3E4A79<br><i>8.5:1</i></span><span class="sw" style="background:#503E79;color:#FFF"><b>D3</b><br>#503E79<br><i>9.1:1</i></span><span class="sw" style="background:#6E3E79;color:#FFF"><b>D4</b><br>#6E3E79<br><i>8.0:1</i></span><span class="sw" style="background:#793E68;color:#FFF"><b>D5</b><br>#793E68<br><i>7.8:1</i></span><span class="sw" style="background:#793E4A;color:#FFF"><b>D6</b><br>#793E4A<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#755243;color:#FFF"><b>D7</b><br>#755243<br><i>6.9:1</i></span><span class="sw" style="background:#756B43;color:#FFF"><b>D8</b><br>#756B43<br><i>5.3:1</i></span><span class="sw" style="background:#667543;color:#FFF"><b>D9</b><br>#667543<br><i>5.0:1</i></span><span class="sw" style="background:#4D7543;color:#FFF"><b>D10</b><br>#4D7543<br><i>5.3:1</i></span><span class="sw" style="background:#437552;color:#FFF"><b>D11</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#43756B;color:#FFF"><b>D12</b><br>#43756B<br><i>5.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F2F5F7;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> brina · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#D8E0E4;color:#000"><b>L1</b><br>#D8E0E4<br><i>11.8:1</i></span><span class="sw" style="background:#D8DCE3;color:#000"><b>L2</b><br>#D8DCE3<br><i>11.5:1</i></span><span class="sw" style="background:#D8E3E3;color:#000"><b>L3</b><br>#D8E3E3<br><i>12.1:1</i></span><span class="sw" style="background:#D8D9E3;color:#000"><b>L4</b><br>#D8D9E3<br><i>11.3:1</i></span><span class="sw" style="background:#D8E3DF;color:#000"><b>L5</b><br>#D8E3DF<br><i>12.0:1</i></span><span class="sw" style="background:#DCD8E3;color:#000"><b>L6</b><br>#DCD8E3<br><i>11.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D9E3DC;color:#000"><b>L7</b><br>#D9E3DC<br><i>12.0:1</i></span><span class="sw" style="background:#D9DDE3;color:#000"><b>L8</b><br>#D9DDE3<br><i>11.6:1</i></span><span class="sw" style="background:#D9E2E3;color:#000"><b>L9</b><br>#D9E2E3<br><i>12.0:1</i></span><span class="sw" style="background:#D9DBE3;color:#000"><b>L10</b><br>#D9DBE3<br><i>11.4:1</i></span><span class="sw" style="background:#D9E3E1;color:#000"><b>L11</b><br>#D9E3E1<br><i>12.1:1</i></span><span class="sw" style="background:#D9E0E3;color:#000"><b>L12</b><br>#D9E0E3<br><i>11.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#3C697C;color:#FFF"><b>D1</b><br>#3C697C<br><i>6.0:1</i></span><span class="sw" style="background:#3E5479;color:#FFF"><b>D2</b><br>#3E5479<br><i>7.6:1</i></span><span class="sw" style="background:#3E7977;color:#FFF"><b>D3</b><br>#3E7977<br><i>5.0:1</i></span><span class="sw" style="background:#3E4079;color:#FFF"><b>D4</b><br>#3E4079<br><i>9.5:1</i></span><span class="sw" style="background:#3E7964;color:#FFF"><b>D5</b><br>#3E7964<br><i>5.1:1</i></span><span class="sw" style="background:#503E79;color:#FFF"><b>D6</b><br>#503E79<br><i>9.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#437552;color:#FFF"><b>D7</b><br>#437552<br><i>5.4:1</i></span><span class="sw" style="background:#435975;color:#FFF"><b>D8</b><br>#435975<br><i>7.2:1</i></span><span class="sw" style="background:#437275;color:#FFF"><b>D9</b><br>#437275<br><i>5.4:1</i></span><span class="sw" style="background:#434D75;color:#FFF"><b>D10</b><br>#434D75<br><i>8.2:1</i></span><span class="sw" style="background:#43756B;color:#FFF"><b>D11</b><br>#43756B<br><i>5.3:1</i></span><span class="sw" style="background:#436675;color:#FFF"><b>D12</b><br>#436675<br><i>6.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> magnolia · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#D6E0E5;color:#000"><b>L3</b><br>#D6E0E5<br><i>14.1:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L4</b><br>#E5DBD6<br><i>13.9:1</i></span><span class="sw" style="background:#E5D6E0;color:#000"><b>L5</b><br>#E5D6E0<br><i>13.6:1</i></span><span class="sw" style="background:#D6E5E3;color:#000"><b>L6</b><br>#D6E5E3<br><i>14.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E4E2D7;color:#000"><b>L7</b><br>#E4E2D7<br><i>14.6:1</i></span><span class="sw" style="background:#DAE4D7;color:#000"><b>L8</b><br>#DAE4D7<br><i>14.5:1</i></span><span class="sw" style="background:#D7DAE4;color:#000"><b>L9</b><br>#D7DAE4<br><i>13.6:1</i></span><span class="sw" style="background:#E2D7E4;color:#000"><b>L10</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E0E4D7;color:#000"><b>L11</b><br>#E0E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#DCD7E4;color:#000"><b>L12</b><br>#DCD7E4<br><i>13.4:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#3A677E;color:#FFF"><b>D3</b><br>#3A677E<br><i>6.1:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D4</b><br>#7E513A<br><i>6.7:1</i></span><span class="sw" style="background:#7E3A67;color:#FFF"><b>D5</b><br>#7E3A67<br><i>7.8:1</i></span><span class="sw" style="background:#3A7E72;color:#FFF"><b>D6</b><br>#3A7E72<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#786F3F;color:#FFF"><b>D7</b><br>#786F3F<br><i>5.1:1</i></span><span class="sw" style="background:#49783F;color:#FFF"><b>D8</b><br>#49783F<br><i>5.2:1</i></span><span class="sw" style="background:#3F4978;color:#FFF"><b>D9</b><br>#3F4978<br><i>8.6:1</i></span><span class="sw" style="background:#6F3F78;color:#FFF"><b>D10</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#65783F;color:#FFF"><b>D11</b><br>#65783F<br><i>4.9:1</i></span><span class="sw" style="background:#523F78;color:#FFF"><b>D12</b><br>#523F78<br><i>9.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> magnolia · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#E0E5D6;color:#000"><b>L3</b><br>#E0E5D6<br><i>14.7:1</i></span><span class="sw" style="background:#DBD6E5;color:#000"><b>L4</b><br>#DBD6E5<br><i>13.3:1</i></span><span class="sw" style="background:#D6E0E5;color:#000"><b>L5</b><br>#D6E0E5<br><i>14.1:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L6</b><br>#E5DBD6<br><i>13.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E4D8D7;color:#000"><b>L7</b><br>#E4D8D7<br><i>13.6:1</i></span><span class="sw" style="background:#D7E4DF;color:#000"><b>L8</b><br>#D7E4DF<br><i>14.5:1</i></span><span class="sw" style="background:#E3E4D7;color:#000"><b>L9</b><br>#E3E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#DFD7E4;color:#000"><b>L10</b><br>#DFD7E4<br><i>13.5:1</i></span><span class="sw" style="background:#D7DDE4;color:#000"><b>L11</b><br>#D7DDE4<br><i>13.8:1</i></span><span class="sw" style="background:#E4DFD7;color:#000"><b>L12</b><br>#E4DFD7<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#677E3A;color:#FFF"><b>D3</b><br>#677E3A<br><i>4.5:1</i></span><span class="sw" style="background:#513A7E;color:#FFF"><b>D4</b><br>#513A7E<br><i>9.3:1</i></span><span class="sw" style="background:#3A677E;color:#FFF"><b>D5</b><br>#3A677E<br><i>6.1:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D6</b><br>#7E513A<br><i>6.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#78443F;color:#FFF"><b>D7</b><br>#78443F<br><i>7.8:1</i></span><span class="sw" style="background:#3F7861;color:#FFF"><b>D8</b><br>#3F7861<br><i>5.2:1</i></span><span class="sw" style="background:#74783F;color:#FFF"><b>D9</b><br>#74783F<br><i>4.7:1</i></span><span class="sw" style="background:#613F78;color:#FFF"><b>D10</b><br>#613F78<br><i>8.4:1</i></span><span class="sw" style="background:#3F5778;color:#FFF"><b>D11</b><br>#3F5778<br><i>7.4:1</i></span><span class="sw" style="background:#78613F;color:#FFF"><b>D12</b><br>#78613F<br><i>5.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> magnolia · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L2</b><br>#D6E5DB<br><i>14.5:1</i></span><span class="sw" style="background:#DDE5D6;color:#000"><b>L3</b><br>#DDE5D6<br><i>14.7:1</i></span><span class="sw" style="background:#E5DFD6;color:#000"><b>L4</b><br>#E5DFD6<br><i>14.3:1</i></span><span class="sw" style="background:#D7D6E5;color:#000"><b>L5</b><br>#D7D6E5<br><i>13.2:1</i></span><span class="sw" style="background:#D6E3E5;color:#000"><b>L6</b><br>#D6E3E5<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E3E4D7;color:#000"><b>L7</b><br>#E3E4D7<br><i>14.7:1</i></span><span class="sw" style="background:#E4D7E1;color:#000"><b>L8</b><br>#E4D7E1<br><i>13.6:1</i></span><span class="sw" style="background:#E4DCD7;color:#000"><b>L9</b><br>#E4DCD7<br><i>14.0:1</i></span><span class="sw" style="background:#D7E4E2;color:#000"><b>L10</b><br>#D7E4E2<br><i>14.5:1</i></span><span class="sw" style="background:#D8E4D7;color:#000"><b>L11</b><br>#D8E4D7<br><i>14.4:1</i></span><span class="sw" style="background:#DFD7E4;color:#000"><b>L12</b><br>#DFD7E4<br><i>13.5:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D2</b><br>#3A7E51<br><i>4.9:1</i></span><span class="sw" style="background:#567E3A;color:#FFF"><b>D3</b><br>#567E3A<br><i>4.7:1</i></span><span class="sw" style="background:#7E613A;color:#FFF"><b>D4</b><br>#7E613A<br><i>5.7:1</i></span><span class="sw" style="background:#403A7E;color:#FFF"><b>D5</b><br>#403A7E<br><i>9.9:1</i></span><span class="sw" style="background:#3A727E;color:#FFF"><b>D6</b><br>#3A727E<br><i>5.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#74783F;color:#FFF"><b>D7</b><br>#74783F<br><i>4.7:1</i></span><span class="sw" style="background:#783F6A;color:#FFF"><b>D8</b><br>#783F6A<br><i>7.7:1</i></span><span class="sw" style="background:#78523F;color:#FFF"><b>D9</b><br>#78523F<br><i>6.8:1</i></span><span class="sw" style="background:#3F786F;color:#FFF"><b>D10</b><br>#3F786F<br><i>5.1:1</i></span><span class="sw" style="background:#44783F;color:#FFF"><b>D11</b><br>#44783F<br><i>5.2:1</i></span><span class="sw" style="background:#613F78;color:#FFF"><b>D12</b><br>#613F78<br><i>8.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> magnolia · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#E5DBD6;color:#000"><b>L2</b><br>#E5DBD6<br><i>13.9:1</i></span><span class="sw" style="background:#E5E3D6;color:#000"><b>L3</b><br>#E5E3D6<br><i>14.7:1</i></span><span class="sw" style="background:#E0E5D6;color:#000"><b>L4</b><br>#E0E5D6<br><i>14.7:1</i></span><span class="sw" style="background:#D9E5D6;color:#000"><b>L5</b><br>#D9E5D6<br><i>14.5:1</i></span><span class="sw" style="background:#D6E5DB;color:#000"><b>L6</b><br>#D6E5DB<br><i>14.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#D7E4E2;color:#000"><b>L7</b><br>#D7E4E2<br><i>14.5:1</i></span><span class="sw" style="background:#D7E0E4;color:#000"><b>L8</b><br>#D7E0E4<br><i>14.1:1</i></span><span class="sw" style="background:#D7DAE4;color:#000"><b>L9</b><br>#D7DAE4<br><i>13.6:1</i></span><span class="sw" style="background:#DCD7E4;color:#000"><b>L10</b><br>#DCD7E4<br><i>13.4:1</i></span><span class="sw" style="background:#E2D7E4;color:#000"><b>L11</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7E0;color:#000"><b>L12</b><br>#E4D7E0<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#7E513A;color:#FFF"><b>D2</b><br>#7E513A<br><i>6.7:1</i></span><span class="sw" style="background:#7E723A;color:#FFF"><b>D3</b><br>#7E723A<br><i>4.8:1</i></span><span class="sw" style="background:#677E3A;color:#FFF"><b>D4</b><br>#677E3A<br><i>4.5:1</i></span><span class="sw" style="background:#457E3A;color:#FFF"><b>D5</b><br>#457E3A<br><i>4.9:1</i></span><span class="sw" style="background:#3A7E51;color:#FFF"><b>D6</b><br>#3A7E51<br><i>4.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#3F786F;color:#FFF"><b>D7</b><br>#3F786F<br><i>5.1:1</i></span><span class="sw" style="background:#3F6578;color:#FFF"><b>D8</b><br>#3F6578<br><i>6.3:1</i></span><span class="sw" style="background:#3F4978;color:#FFF"><b>D9</b><br>#3F4978<br><i>8.6:1</i></span><span class="sw" style="background:#523F78;color:#FFF"><b>D10</b><br>#523F78<br><i>9.0:1</i></span><span class="sw" style="background:#6F3F78;color:#FFF"><b>D11</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#783F65;color:#FFF"><b>D12</b><br>#783F65<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FCF8F5;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> magnolia · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E6D6D8;color:#000"><b>L1</b><br>#E6D6D8<br><i>13.5:1</i></span><span class="sw" style="background:#E5D9D6;color:#000"><b>L2</b><br>#E5D9D6<br><i>13.7:1</i></span><span class="sw" style="background:#E5D6DE;color:#000"><b>L3</b><br>#E5D6DE<br><i>13.5:1</i></span><span class="sw" style="background:#E5DED6;color:#000"><b>L4</b><br>#E5DED6<br><i>14.2:1</i></span><span class="sw" style="background:#E5D6E3;color:#000"><b>L5</b><br>#E5D6E3<br><i>13.6:1</i></span><span class="sw" style="background:#E5E3D6;color:#000"><b>L6</b><br>#E5E3D6<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E2D7E4;color:#000"><b>L7</b><br>#E2D7E4<br><i>13.6:1</i></span><span class="sw" style="background:#E4D8D7;color:#000"><b>L8</b><br>#E4D8D7<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7DD;color:#000"><b>L9</b><br>#E4D7DD<br><i>13.6:1</i></span><span class="sw" style="background:#E4DCD7;color:#000"><b>L10</b><br>#E4DCD7<br><i>14.0:1</i></span><span class="sw" style="background:#E4D7E0;color:#000"><b>L11</b><br>#E4D7E0<br><i>13.6:1</i></span><span class="sw" style="background:#E4D7DA;color:#000"><b>L12</b><br>#E4D7DA<br><i>13.6:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#813743;color:#FFF"><b>D1</b><br>#813743<br><i>8.2:1</i></span><span class="sw" style="background:#7E453A;color:#FFF"><b>D2</b><br>#7E453A<br><i>7.5:1</i></span><span class="sw" style="background:#7E3A5C;color:#FFF"><b>D3</b><br>#7E3A5C<br><i>7.9:1</i></span><span class="sw" style="background:#7E5C3A;color:#FFF"><b>D4</b><br>#7E5C3A<br><i>6.0:1</i></span><span class="sw" style="background:#7E3A72;color:#FFF"><b>D5</b><br>#7E3A72<br><i>7.7:1</i></span><span class="sw" style="background:#7E723A;color:#FFF"><b>D6</b><br>#7E723A<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6F3F78;color:#FFF"><b>D7</b><br>#6F3F78<br><i>7.9:1</i></span><span class="sw" style="background:#78443F;color:#FFF"><b>D8</b><br>#78443F<br><i>7.8:1</i></span><span class="sw" style="background:#783F57;color:#FFF"><b>D9</b><br>#783F57<br><i>7.9:1</i></span><span class="sw" style="background:#78523F;color:#FFF"><b>D10</b><br>#78523F<br><i>6.8:1</i></span><span class="sw" style="background:#783F65;color:#FFF"><b>D11</b><br>#783F65<br><i>7.8:1</i></span><span class="sw" style="background:#783F49;color:#FFF"><b>D12</b><br>#783F49<br><i>8.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> atelier · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DADAE2;color:#000"><b>L3</b><br>#DADAE2<br><i>12.5:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L4</b><br>#E1E2DA<br><i>13.4:1</i></span><span class="sw" style="background:#E2DADA;color:#000"><b>L5</b><br>#E2DADA<br><i>12.7:1</i></span><span class="sw" style="background:#DADEE2;color:#000"><b>L6</b><br>#DADEE2<br><i>12.9:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEE1DB;color:#000"><b>L7</b><br>#DEE1DB<br><i>13.2:1</i></span><span class="sw" style="background:#DBE1DE;color:#000"><b>L8</b><br>#DBE1DE<br><i>13.1:1</i></span><span class="sw" style="background:#DEDBE1;color:#000"><b>L9</b><br>#DEDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#E1DBDE;color:#000"><b>L10</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#DBE1DB;color:#000"><b>L11</b><br>#DBE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBE1;color:#000"><b>L12</b><br>#E1DBE1<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#444275;color:#FFF"><b>D3</b><br>#444275<br><i>9.2:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D4</b><br>#737542<br><i>4.8:1</i></span><span class="sw" style="background:#754442;color:#FFF"><b>D5</b><br>#754442<br><i>7.9:1</i></span><span class="sw" style="background:#425A75;color:#FFF"><b>D6</b><br>#425A75<br><i>7.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5A7146;color:#FFF"><b>D7</b><br>#5A7146<br><i>5.4:1</i></span><span class="sw" style="background:#46715D;color:#FFF"><b>D8</b><br>#46715D<br><i>5.6:1</i></span><span class="sw" style="background:#5D4671;color:#FFF"><b>D9</b><br>#5D4671<br><i>8.1:1</i></span><span class="sw" style="background:#71465A;color:#FFF"><b>D10</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#467148;color:#FFF"><b>D11</b><br>#467148<br><i>5.7:1</i></span><span class="sw" style="background:#714670;color:#FFF"><b>D12</b><br>#714670<br><i>7.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> atelier · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DA;color:#000"><b>L3</b><br>#DAE2DA<br><i>13.2:1</i></span><span class="sw" style="background:#E2DAE1;color:#000"><b>L4</b><br>#E2DAE1<br><i>12.7:1</i></span><span class="sw" style="background:#DADAE2;color:#000"><b>L5</b><br>#DADAE2<br><i>12.5:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L6</b><br>#E1E2DA<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1E0DB;color:#000"><b>L7</b><br>#E1E0DB<br><i>13.2:1</i></span><span class="sw" style="background:#DBDFE1;color:#000"><b>L8</b><br>#DBDFE1<br><i>13.0:1</i></span><span class="sw" style="background:#DCE1DB;color:#000"><b>L9</b><br>#DCE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBDF;color:#000"><b>L10</b><br>#E1DBDF<br><i>12.8:1</i></span><span class="sw" style="background:#DDDBE1;color:#000"><b>L11</b><br>#DDDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#DFE1DB;color:#000"><b>L12</b><br>#DFE1DB<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#427544;color:#FFF"><b>D3</b><br>#427544<br><i>5.4:1</i></span><span class="sw" style="background:#754273;color:#FFF"><b>D4</b><br>#754273<br><i>7.5:1</i></span><span class="sw" style="background:#444275;color:#FFF"><b>D5</b><br>#444275<br><i>9.2:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D6</b><br>#737542<br><i>4.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#716846;color:#FFF"><b>D7</b><br>#716846<br><i>5.6:1</i></span><span class="sw" style="background:#466571;color:#FFF"><b>D8</b><br>#466571<br><i>6.2:1</i></span><span class="sw" style="background:#507146;color:#FFF"><b>D9</b><br>#507146<br><i>5.5:1</i></span><span class="sw" style="background:#714665;color:#FFF"><b>D10</b><br>#714665<br><i>7.6:1</i></span><span class="sw" style="background:#524671;color:#FFF"><b>D11</b><br>#524671<br><i>8.5:1</i></span><span class="sw" style="background:#657146;color:#FFF"><b>D12</b><br>#657146<br><i>5.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> atelier · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L2</b><br>#DAE1E2<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DC;color:#000"><b>L3</b><br>#DAE2DC<br><i>13.2:1</i></span><span class="sw" style="background:#DFE2DA;color:#000"><b>L4</b><br>#DFE2DA<br><i>13.3:1</i></span><span class="sw" style="background:#E0DAE2;color:#000"><b>L5</b><br>#E0DAE2<br><i>12.7:1</i></span><span class="sw" style="background:#DADBE2;color:#000"><b>L6</b><br>#DADBE2<br><i>12.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCE1DB;color:#000"><b>L7</b><br>#DCE1DB<br><i>13.1:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L8</b><br>#E1DBDB<br><i>12.7:1</i></span><span class="sw" style="background:#E1E1DB;color:#000"><b>L9</b><br>#E1E1DB<br><i>13.3:1</i></span><span class="sw" style="background:#DBDEE1;color:#000"><b>L10</b><br>#DBDEE1<br><i>12.9:1</i></span><span class="sw" style="background:#DBE1DF;color:#000"><b>L11</b><br>#DBE1DF<br><i>13.2:1</i></span><span class="sw" style="background:#E1DBDF;color:#000"><b>L12</b><br>#E1DBDF<br><i>12.8:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D2</b><br>#427375<br><i>5.3:1</i></span><span class="sw" style="background:#427551;color:#FFF"><b>D3</b><br>#427551<br><i>5.4:1</i></span><span class="sw" style="background:#677542;color:#FFF"><b>D4</b><br>#677542<br><i>5.0:1</i></span><span class="sw" style="background:#6A4275;color:#FFF"><b>D5</b><br>#6A4275<br><i>7.9:1</i></span><span class="sw" style="background:#424975;color:#FFF"><b>D6</b><br>#424975<br><i>8.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#507146;color:#FFF"><b>D7</b><br>#507146<br><i>5.5:1</i></span><span class="sw" style="background:#714648;color:#FFF"><b>D8</b><br>#714648<br><i>7.9:1</i></span><span class="sw" style="background:#707146;color:#FFF"><b>D9</b><br>#707146<br><i>5.1:1</i></span><span class="sw" style="background:#465A71;color:#FFF"><b>D10</b><br>#465A71<br><i>7.1:1</i></span><span class="sw" style="background:#467161;color:#FFF"><b>D11</b><br>#467161<br><i>5.5:1</i></span><span class="sw" style="background:#714665;color:#FFF"><b>D12</b><br>#714665<br><i>7.6:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> atelier · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#E1E2DA;color:#000"><b>L2</b><br>#E1E2DA<br><i>13.4:1</i></span><span class="sw" style="background:#DEE2DA;color:#000"><b>L3</b><br>#DEE2DA<br><i>13.3:1</i></span><span class="sw" style="background:#DAE2DA;color:#000"><b>L4</b><br>#DAE2DA<br><i>13.2:1</i></span><span class="sw" style="background:#DAE2DE;color:#000"><b>L5</b><br>#DAE2DE<br><i>13.2:1</i></span><span class="sw" style="background:#DAE1E2;color:#000"><b>L6</b><br>#DAE1E2<br><i>13.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DBDEE1;color:#000"><b>L7</b><br>#DBDEE1<br><i>12.9:1</i></span><span class="sw" style="background:#DBDBE1;color:#000"><b>L8</b><br>#DBDBE1<br><i>12.6:1</i></span><span class="sw" style="background:#DEDBE1;color:#000"><b>L9</b><br>#DEDBE1<br><i>12.7:1</i></span><span class="sw" style="background:#E1DBE1;color:#000"><b>L10</b><br>#E1DBE1<br><i>12.8:1</i></span><span class="sw" style="background:#E1DBDE;color:#000"><b>L11</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L12</b><br>#E1DBDB<br><i>12.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#737542;color:#FFF"><b>D2</b><br>#737542<br><i>4.8:1</i></span><span class="sw" style="background:#5A7542;color:#FFF"><b>D3</b><br>#5A7542<br><i>5.2:1</i></span><span class="sw" style="background:#427544;color:#FFF"><b>D4</b><br>#427544<br><i>5.4:1</i></span><span class="sw" style="background:#42755D;color:#FFF"><b>D5</b><br>#42755D<br><i>5.3:1</i></span><span class="sw" style="background:#427375;color:#FFF"><b>D6</b><br>#427375<br><i>5.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#465A71;color:#FFF"><b>D7</b><br>#465A71<br><i>7.1:1</i></span><span class="sw" style="background:#484671;color:#FFF"><b>D8</b><br>#484671<br><i>8.8:1</i></span><span class="sw" style="background:#5D4671;color:#FFF"><b>D9</b><br>#5D4671<br><i>8.1:1</i></span><span class="sw" style="background:#714670;color:#FFF"><b>D10</b><br>#714670<br><i>7.5:1</i></span><span class="sw" style="background:#71465A;color:#FFF"><b>D11</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#714846;color:#FFF"><b>D12</b><br>#714846<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#F0EDE6;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> atelier · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#E2DEDA;color:#000"><b>L1</b><br>#E2DEDA<br><i>13.0:1</i></span><span class="sw" style="background:#E2E1DA;color:#000"><b>L2</b><br>#E2E1DA<br><i>13.3:1</i></span><span class="sw" style="background:#E2DCDA;color:#000"><b>L3</b><br>#E2DCDA<br><i>12.9:1</i></span><span class="sw" style="background:#E0E2DA;color:#000"><b>L4</b><br>#E0E2DA<br><i>13.3:1</i></span><span class="sw" style="background:#E2DADB;color:#000"><b>L5</b><br>#E2DADB<br><i>12.7:1</i></span><span class="sw" style="background:#DEE2DA;color:#000"><b>L6</b><br>#DEE2DA<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#E1DBDE;color:#000"><b>L7</b><br>#E1DBDE<br><i>12.8:1</i></span><span class="sw" style="background:#E1E0DB;color:#000"><b>L8</b><br>#E1E0DB<br><i>13.2:1</i></span><span class="sw" style="background:#E1DDDB;color:#000"><b>L9</b><br>#E1DDDB<br><i>12.9:1</i></span><span class="sw" style="background:#E1E1DB;color:#000"><b>L10</b><br>#E1E1DB<br><i>13.3:1</i></span><span class="sw" style="background:#E1DBDB;color:#000"><b>L11</b><br>#E1DBDB<br><i>12.7:1</i></span><span class="sw" style="background:#E1DEDB;color:#000"><b>L12</b><br>#E1DEDB<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#775E40;color:#FFF"><b>D1</b><br>#775E40<br><i>6.1:1</i></span><span class="sw" style="background:#756E42;color:#FFF"><b>D2</b><br>#756E42<br><i>5.2:1</i></span><span class="sw" style="background:#754D42;color:#FFF"><b>D3</b><br>#754D42<br><i>7.2:1</i></span><span class="sw" style="background:#6B7542;color:#FFF"><b>D4</b><br>#6B7542<br><i>4.9:1</i></span><span class="sw" style="background:#754249;color:#FFF"><b>D5</b><br>#754249<br><i>8.0:1</i></span><span class="sw" style="background:#5A7542;color:#FFF"><b>D6</b><br>#5A7542<br><i>5.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#71465A;color:#FFF"><b>D7</b><br>#71465A<br><i>7.7:1</i></span><span class="sw" style="background:#716846;color:#FFF"><b>D8</b><br>#716846<br><i>5.6:1</i></span><span class="sw" style="background:#715246;color:#FFF"><b>D9</b><br>#715246<br><i>7.0:1</i></span><span class="sw" style="background:#707146;color:#FFF"><b>D10</b><br>#707146<br><i>5.1:1</i></span><span class="sw" style="background:#714846;color:#FFF"><b>D11</b><br>#714846<br><i>7.7:1</i></span><span class="sw" style="background:#715D46;color:#FFF"><b>D12</b><br>#715D46<br><i>6.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> ardesia · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0E0DC;color:#000"><b>L3</b><br>#E0E0DC<br><i>13.5:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L4</b><br>#DCDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DCE0E0;color:#000"><b>L5</b><br>#DCE0E0<br><i>13.4:1</i></span><span class="sw" style="background:#E0DEDC;color:#000"><b>L6</b><br>#E0DEDC<br><i>13.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDCDF;color:#000"><b>L7</b><br>#DEDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DFDCDE;color:#000"><b>L8</b><br>#DFDCDE<br><i>13.1:1</i></span><span class="sw" style="background:#DEDFDC;color:#000"><b>L9</b><br>#DEDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDE;color:#000"><b>L10</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DFDCDF;color:#000"><b>L11</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDC;color:#000"><b>L12</b><br>#DCDFDC<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B6B4D;color:#FFF"><b>D3</b><br>#6B6B4D<br><i>5.5:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D4</b><br>#4D4D6B<br><i>8.1:1</i></span><span class="sw" style="background:#4D6B6B;color:#FFF"><b>D5</b><br>#4D6B6B<br><i>5.8:1</i></span><span class="sw" style="background:#6B5C4D;color:#FFF"><b>D6</b><br>#6B5C4D<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5C4F69;color:#FFF"><b>D7</b><br>#5C4F69<br><i>7.6:1</i></span><span class="sw" style="background:#694F5C;color:#FFF"><b>D8</b><br>#694F5C<br><i>7.3:1</i></span><span class="sw" style="background:#5C694F;color:#FFF"><b>D9</b><br>#5C694F<br><i>5.9:1</i></span><span class="sw" style="background:#4F695C;color:#FFF"><b>D10</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#694F69;color:#FFF"><b>D11</b><br>#694F69<br><i>7.2:1</i></span><span class="sw" style="background:#4F694F;color:#FFF"><b>D12</b><br>#4F694F<br><i>6.1:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> ardesia · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCE0;color:#000"><b>L3</b><br>#E0DCE0<br><i>13.1:1</i></span><span class="sw" style="background:#DCE0DC;color:#000"><b>L4</b><br>#DCE0DC<br><i>13.3:1</i></span><span class="sw" style="background:#E0E0DC;color:#000"><b>L5</b><br>#E0E0DC<br><i>13.5:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L6</b><br>#DCDCE0<br><i>13.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCDDDF;color:#000"><b>L7</b><br>#DCDDDF<br><i>13.1:1</i></span><span class="sw" style="background:#DFDDDC;color:#000"><b>L8</b><br>#DFDDDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDCDF;color:#000"><b>L9</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDD;color:#000"><b>L10</b><br>#DCDFDD<br><i>13.3:1</i></span><span class="sw" style="background:#DFDFDC;color:#000"><b>L11</b><br>#DFDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DDDCDF;color:#000"><b>L12</b><br>#DDDCDF<br><i>13.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B4D6B;color:#FFF"><b>D3</b><br>#6B4D6B<br><i>7.2:1</i></span><span class="sw" style="background:#4D6B4D;color:#FFF"><b>D4</b><br>#4D6B4D<br><i>6.0:1</i></span><span class="sw" style="background:#6B6B4D;color:#FFF"><b>D5</b><br>#6B6B4D<br><i>5.5:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D6</b><br>#4D4D6B<br><i>8.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4F5569;color:#FFF"><b>D7</b><br>#4F5569<br><i>7.4:1</i></span><span class="sw" style="background:#69554F;color:#FFF"><b>D8</b><br>#69554F<br><i>7.0:1</i></span><span class="sw" style="background:#624F69;color:#FFF"><b>D9</b><br>#624F69<br><i>7.4:1</i></span><span class="sw" style="background:#4F6955;color:#FFF"><b>D10</b><br>#4F6955<br><i>6.0:1</i></span><span class="sw" style="background:#62694F;color:#FFF"><b>D11</b><br>#62694F<br><i>5.7:1</i></span><span class="sw" style="background:#554F69;color:#FFF"><b>D12</b><br>#554F69<br><i>7.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> ardesia · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L2</b><br>#E0DCDC<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDF;color:#000"><b>L3</b><br>#E0DCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DDDCE0;color:#000"><b>L4</b><br>#DDDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DDE0DC;color:#000"><b>L5</b><br>#DDE0DC<br><i>13.4:1</i></span><span class="sw" style="background:#E0DFDC;color:#000"><b>L6</b><br>#E0DFDC<br><i>13.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDCDF;color:#000"><b>L7</b><br>#DFDCDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L8</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDCDF;color:#000"><b>L9</b><br>#DCDCDF<br><i>13.0:1</i></span><span class="sw" style="background:#DFDEDC;color:#000"><b>L10</b><br>#DFDEDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDCDE;color:#000"><b>L11</b><br>#DFDCDE<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDD;color:#000"><b>L12</b><br>#DCDFDD<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D2</b><br>#6B4D4D<br><i>7.5:1</i></span><span class="sw" style="background:#6B4D63;color:#FFF"><b>D3</b><br>#6B4D63<br><i>7.3:1</i></span><span class="sw" style="background:#544D6B;color:#FFF"><b>D4</b><br>#544D6B<br><i>7.9:1</i></span><span class="sw" style="background:#546B4D;color:#FFF"><b>D5</b><br>#546B4D<br><i>5.9:1</i></span><span class="sw" style="background:#6B664D;color:#FFF"><b>D6</b><br>#6B664D<br><i>5.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#624F69;color:#FFF"><b>D7</b><br>#624F69<br><i>7.4:1</i></span><span class="sw" style="background:#4F6967;color:#FFF"><b>D8</b><br>#4F6967<br><i>5.9:1</i></span><span class="sw" style="background:#4F4F69;color:#FFF"><b>D9</b><br>#4F4F69<br><i>7.9:1</i></span><span class="sw" style="background:#695C4F;color:#FFF"><b>D10</b><br>#695C4F<br><i>6.5:1</i></span><span class="sw" style="background:#694F5A;color:#FFF"><b>D11</b><br>#694F5A<br><i>7.3:1</i></span><span class="sw" style="background:#4F6955;color:#FFF"><b>D12</b><br>#4F6955<br><i>6.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> ardesia · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#DCDCE0;color:#000"><b>L2</b><br>#DCDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DEDCE0;color:#000"><b>L3</b><br>#DEDCE0<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCE0;color:#000"><b>L4</b><br>#E0DCE0<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDE;color:#000"><b>L5</b><br>#E0DCDE<br><i>13.1:1</i></span><span class="sw" style="background:#E0DCDC;color:#000"><b>L6</b><br>#E0DCDC<br><i>13.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDEDC;color:#000"><b>L7</b><br>#DFDEDC<br><i>13.2:1</i></span><span class="sw" style="background:#DFDFDC;color:#000"><b>L8</b><br>#DFDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DEDFDC;color:#000"><b>L9</b><br>#DEDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDC;color:#000"><b>L10</b><br>#DCDFDC<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDE;color:#000"><b>L11</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L12</b><br>#DCDFDF<br><i>13.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#4D4D6B;color:#FFF"><b>D2</b><br>#4D4D6B<br><i>8.1:1</i></span><span class="sw" style="background:#5C4D6B;color:#FFF"><b>D3</b><br>#5C4D6B<br><i>7.7:1</i></span><span class="sw" style="background:#6B4D6B;color:#FFF"><b>D4</b><br>#6B4D6B<br><i>7.2:1</i></span><span class="sw" style="background:#6B4D5C;color:#FFF"><b>D5</b><br>#6B4D5C<br><i>7.4:1</i></span><span class="sw" style="background:#6B4D4D;color:#FFF"><b>D6</b><br>#6B4D4D<br><i>7.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#695C4F;color:#FFF"><b>D7</b><br>#695C4F<br><i>6.5:1</i></span><span class="sw" style="background:#69694F;color:#FFF"><b>D8</b><br>#69694F<br><i>5.6:1</i></span><span class="sw" style="background:#5C694F;color:#FFF"><b>D9</b><br>#5C694F<br><i>5.9:1</i></span><span class="sw" style="background:#4F694F;color:#FFF"><b>D10</b><br>#4F694F<br><i>6.1:1</i></span><span class="sw" style="background:#4F695C;color:#FFF"><b>D11</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#4F6969;color:#FFF"><b>D12</b><br>#4F6969<br><i>5.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#EFEEEA;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> ardesia · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DCDEE0;color:#000"><b>L1</b><br>#DCDEE0<br><i>13.2:1</i></span><span class="sw" style="background:#DCDDE0;color:#000"><b>L2</b><br>#DCDDE0<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFE0;color:#000"><b>L3</b><br>#DCDFE0<br><i>13.3:1</i></span><span class="sw" style="background:#DDDCE0;color:#000"><b>L4</b><br>#DDDCE0<br><i>13.0:1</i></span><span class="sw" style="background:#DCE0DF;color:#000"><b>L5</b><br>#DCE0DF<br><i>13.4:1</i></span><span class="sw" style="background:#DEDCE0;color:#000"><b>L6</b><br>#DEDCE0<br><i>13.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DCDFDE;color:#000"><b>L7</b><br>#DCDFDE<br><i>13.3:1</i></span><span class="sw" style="background:#DCDDDF;color:#000"><b>L8</b><br>#DCDDDF<br><i>13.1:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L9</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDCDF;color:#000"><b>L10</b><br>#DCDCDF<br><i>13.0:1</i></span><span class="sw" style="background:#DCDFDF;color:#000"><b>L11</b><br>#DCDFDF<br><i>13.3:1</i></span><span class="sw" style="background:#DCDEDF;color:#000"><b>L12</b><br>#DCDEDF<br><i>13.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#4B5C6C;color:#FFF"><b>D1</b><br>#4B5C6C<br><i>6.9:1</i></span><span class="sw" style="background:#4D526B;color:#FFF"><b>D2</b><br>#4D526B<br><i>7.7:1</i></span><span class="sw" style="background:#4D666B;color:#FFF"><b>D3</b><br>#4D666B<br><i>6.1:1</i></span><span class="sw" style="background:#524D6B;color:#FFF"><b>D4</b><br>#524D6B<br><i>8.0:1</i></span><span class="sw" style="background:#4D6B66;color:#FFF"><b>D5</b><br>#4D6B66<br><i>5.8:1</i></span><span class="sw" style="background:#5C4D6B;color:#FFF"><b>D6</b><br>#5C4D6B<br><i>7.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4F695C;color:#FFF"><b>D7</b><br>#4F695C<br><i>6.0:1</i></span><span class="sw" style="background:#4F5569;color:#FFF"><b>D8</b><br>#4F5569<br><i>7.4:1</i></span><span class="sw" style="background:#4F6269;color:#FFF"><b>D9</b><br>#4F6269<br><i>6.4:1</i></span><span class="sw" style="background:#4F4F69;color:#FFF"><b>D10</b><br>#4F4F69<br><i>7.9:1</i></span><span class="sw" style="background:#4F6969;color:#FFF"><b>D11</b><br>#4F6969<br><i>5.9:1</i></span><span class="sw" style="background:#4F5C69;color:#FFF"><b>D12</b><br>#4F5C69<br><i>6.8:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2><span class="rank">#1/5</span> concrete · Brand triad <span class="score">98<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> (14pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L3</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L5</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDF;color:#000"><b>L6</b><br>#DDDFDF<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDFDD;color:#000"><b>L7</b><br>#DFDFDD<br><i>14.4:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L8</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L9</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DFDDDF;color:#000"><b>L10</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L11</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L12</b><br>#DEDDDF<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#4F5C68;color:#FFF"><b>D3</b><br>#4F5C68<br><i>6.9:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D4</b><br>#685C4F<br><i>6.5:1</i></span><span class="sw" style="background:#684F5C;color:#FFF"><b>D5</b><br>#684F5C<br><i>7.3:1</i></span><span class="sw" style="background:#4F6868;color:#FFF"><b>D6</b><br>#4F6868<br><i>6.0:1</i></span></div>
  <div class="row"><span class="sw" style="background:#676751;color:#FFF"><b>D7</b><br>#676751<br><i>5.8:1</i></span><span class="sw" style="background:#516751;color:#FFF"><b>D8</b><br>#516751<br><i>6.2:1</i></span><span class="sw" style="background:#515167;color:#FFF"><b>D9</b><br>#515167<br><i>7.7:1</i></span><span class="sw" style="background:#675167;color:#FFF"><b>D10</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#5C6751;color:#FFF"><b>D11</b><br>#5C6751<br><i>6.0:1</i></span><span class="sw" style="background:#5C5167;color:#FFF"><b>D12</b><br>#5C5167<br><i>7.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2><span class="rank">#2/5</span> concrete · Treemap distinct <span class="score">97<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>10/12</b> (13pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L3</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L4</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L5</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L6</b><br>#DFDEDD<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L7</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L8</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L9</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L10</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L11</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L12</b><br>#DFDEDD<br><i>14.3:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#5C684F;color:#FFF"><b>D3</b><br>#5C684F<br><i>5.9:1</i></span><span class="sw" style="background:#5C4F68;color:#FFF"><b>D4</b><br>#5C4F68<br><i>7.6:1</i></span><span class="sw" style="background:#4F5C68;color:#FFF"><b>D5</b><br>#4F5C68<br><i>6.9:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D6</b><br>#685C4F<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#675651;color:#FFF"><b>D7</b><br>#675651<br><i>6.9:1</i></span><span class="sw" style="background:#516761;color:#FFF"><b>D8</b><br>#516761<br><i>6.1:1</i></span><span class="sw" style="background:#616751;color:#FFF"><b>D9</b><br>#616751<br><i>5.9:1</i></span><span class="sw" style="background:#615167;color:#FFF"><b>D10</b><br>#615167<br><i>7.3:1</i></span><span class="sw" style="background:#515667;color:#FFF"><b>D11</b><br>#515667<br><i>7.3:1</i></span><span class="sw" style="background:#676151;color:#FFF"><b>D12</b><br>#676151<br><i>6.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2><span class="rank">#3/5</span> concrete · Wong CB-safe <span class="score">94<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> (14pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L2</b><br>#DDDFDE<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L3</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L5</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L6</b><br>#DDDEDF<br><i>14.2:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDFDD;color:#000"><b>L7</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L8</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L9</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDF;color:#000"><b>L10</b><br>#DDDFDF<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L11</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L12</b><br>#DEDDDF<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D2</b><br>#4F685C<br><i>6.1:1</i></span><span class="sw" style="background:#55684F;color:#FFF"><b>D3</b><br>#55684F<br><i>6.0:1</i></span><span class="sw" style="background:#68624F;color:#FFF"><b>D4</b><br>#68624F<br><i>6.1:1</i></span><span class="sw" style="background:#554F68;color:#FFF"><b>D5</b><br>#554F68<br><i>7.8:1</i></span><span class="sw" style="background:#4F6068;color:#FFF"><b>D6</b><br>#4F6068<br><i>6.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#616751;color:#FFF"><b>D7</b><br>#616751<br><i>5.9:1</i></span><span class="sw" style="background:#67515E;color:#FFF"><b>D8</b><br>#67515E<br><i>7.2:1</i></span><span class="sw" style="background:#675C51;color:#FFF"><b>D9</b><br>#675C51<br><i>6.5:1</i></span><span class="sw" style="background:#516767;color:#FFF"><b>D10</b><br>#516767<br><i>6.0:1</i></span><span class="sw" style="background:#516753;color:#FFF"><b>D11</b><br>#516753<br><i>6.1:1</i></span><span class="sw" style="background:#615167;color:#FFF"><b>D12</b><br>#615167<br><i>7.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2><span class="rank">#4/5</span> concrete · Wheel uniform <span class="score">90<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>10/12</b> (13pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L2</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDFDD;color:#000"><b>L3</b><br>#DFDFDD<br><i>14.4:1</i></span><span class="sw" style="background:#DEDFDD;color:#000"><b>L4</b><br>#DEDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDD;color:#000"><b>L5</b><br>#DDDFDD<br><i>14.3:1</i></span><span class="sw" style="background:#DDDFDE;color:#000"><b>L6</b><br>#DDDFDE<br><i>14.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DDDFDF;color:#000"><b>L7</b><br>#DDDFDF<br><i>14.3:1</i></span><span class="sw" style="background:#DDDEDF;color:#000"><b>L8</b><br>#DDDEDF<br><i>14.2:1</i></span><span class="sw" style="background:#DDDDDF;color:#000"><b>L9</b><br>#DDDDDF<br><i>14.1:1</i></span><span class="sw" style="background:#DEDDDF;color:#000"><b>L10</b><br>#DEDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDF;color:#000"><b>L11</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L12</b><br>#DFDDDE<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#685C4F;color:#FFF"><b>D2</b><br>#685C4F<br><i>6.5:1</i></span><span class="sw" style="background:#68684F;color:#FFF"><b>D3</b><br>#68684F<br><i>5.7:1</i></span><span class="sw" style="background:#5C684F;color:#FFF"><b>D4</b><br>#5C684F<br><i>5.9:1</i></span><span class="sw" style="background:#4F684F;color:#FFF"><b>D5</b><br>#4F684F<br><i>6.1:1</i></span><span class="sw" style="background:#4F685C;color:#FFF"><b>D6</b><br>#4F685C<br><i>6.1:1</i></span></div>
  <div class="row"><span class="sw" style="background:#516767;color:#FFF"><b>D7</b><br>#516767<br><i>6.0:1</i></span><span class="sw" style="background:#515C67;color:#FFF"><b>D8</b><br>#515C67<br><i>6.8:1</i></span><span class="sw" style="background:#515167;color:#FFF"><b>D9</b><br>#515167<br><i>7.7:1</i></span><span class="sw" style="background:#5C5167;color:#FFF"><b>D10</b><br>#5C5167<br><i>7.4:1</i></span><span class="sw" style="background:#675167;color:#FFF"><b>D11</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#67515C;color:#FFF"><b>D12</b><br>#67515C<br><i>7.2:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#B8B8B5;color:#FFF">

<div class="head">
<h2><span class="rank">#5/5</span> concrete · Analogous mono <span class="score">84<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>11/12</b> (14pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DFDDDD;color:#000"><b>L1</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L2</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L3</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L4</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L5</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDFDD;color:#000"><b>L6</b><br>#DFDFDD<br><i>14.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DFDDDF;color:#000"><b>L7</b><br>#DFDDDF<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L8</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L9</b><br>#DFDDDD<br><i>14.2:1</i></span><span class="sw" style="background:#DFDEDD;color:#000"><b>L10</b><br>#DFDEDD<br><i>14.3:1</i></span><span class="sw" style="background:#DFDDDE;color:#000"><b>L11</b><br>#DFDDDE<br><i>14.2:1</i></span><span class="sw" style="background:#DFDDDD;color:#000"><b>L12</b><br>#DFDDDD<br><i>14.2:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6A4E4E;color:#FFF"><b>D1</b><br>#6A4E4E<br><i>7.5:1</i></span><span class="sw" style="background:#68584F;color:#FFF"><b>D2</b><br>#68584F<br><i>6.8:1</i></span><span class="sw" style="background:#684F58;color:#FFF"><b>D3</b><br>#684F58<br><i>7.4:1</i></span><span class="sw" style="background:#68604F;color:#FFF"><b>D4</b><br>#68604F<br><i>6.2:1</i></span><span class="sw" style="background:#684F60;color:#FFF"><b>D5</b><br>#684F60<br><i>7.3:1</i></span><span class="sw" style="background:#68684F;color:#FFF"><b>D6</b><br>#68684F<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#675167;color:#FFF"><b>D7</b><br>#675167<br><i>7.1:1</i></span><span class="sw" style="background:#675651;color:#FFF"><b>D8</b><br>#675651<br><i>6.9:1</i></span><span class="sw" style="background:#675156;color:#FFF"><b>D9</b><br>#675156<br><i>7.3:1</i></span><span class="sw" style="background:#675C51;color:#FFF"><b>D10</b><br>#675C51<br><i>6.5:1</i></span><span class="sw" style="background:#67515C;color:#FFF"><b>D11</b><br>#67515C<br><i>7.2:1</i></span><span class="sw" style="background:#675151;color:#FFF"><b>D12</b><br>#675151<br><i>7.3:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2><span class="rank">#1/5</span> onyx · Brand triad <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#585C60;color:#FFF"><b>D3</b><br>#585C60<br><i>6.7:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D4</b><br>#605C58<br><i>6.6:1</i></span><span class="sw" style="background:#60585C;color:#FFF"><b>D5</b><br>#60585C<br><i>6.9:1</i></span><span class="sw" style="background:#586060;color:#FFF"><b>D6</b><br>#586060<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F5F58;color:#FFF"><b>D7</b><br>#5F5F58<br><i>6.4:1</i></span><span class="sw" style="background:#585F58;color:#FFF"><b>D8</b><br>#585F58<br><i>6.6:1</i></span><span class="sw" style="background:#58585F;color:#FFF"><b>D9</b><br>#58585F<br><i>7.1:1</i></span><span class="sw" style="background:#5F585F;color:#FFF"><b>D10</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5C5F58;color:#FFF"><b>D11</b><br>#5C5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5C585F;color:#FFF"><b>D12</b><br>#5C585F<br><i>7.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2><span class="rank">#2/5</span> onyx · Treemap distinct <span class="score">99<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#5C6058;color:#FFF"><b>D3</b><br>#5C6058<br><i>6.4:1</i></span><span class="sw" style="background:#5C5860;color:#FFF"><b>D4</b><br>#5C5860<br><i>7.0:1</i></span><span class="sw" style="background:#585C60;color:#FFF"><b>D5</b><br>#585C60<br><i>6.7:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D6</b><br>#605C58<br><i>6.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F5A58;color:#FFF"><b>D7</b><br>#5F5A58<br><i>6.8:1</i></span><span class="sw" style="background:#585F5E;color:#FFF"><b>D8</b><br>#585F5E<br><i>6.5:1</i></span><span class="sw" style="background:#5E5F58;color:#FFF"><b>D9</b><br>#5E5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5E585F;color:#FFF"><b>D10</b><br>#5E585F<br><i>6.9:1</i></span><span class="sw" style="background:#585A5F;color:#FFF"><b>D11</b><br>#585A5F<br><i>6.9:1</i></span><span class="sw" style="background:#5F5E58;color:#FFF"><b>D12</b><br>#5F5E58<br><i>6.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2><span class="rank">#3/5</span> onyx · Wong CB-safe <span class="score">95<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D2</b><br>#58605C<br><i>6.5:1</i></span><span class="sw" style="background:#5A6058;color:#FFF"><b>D3</b><br>#5A6058<br><i>6.5:1</i></span><span class="sw" style="background:#605E58;color:#FFF"><b>D4</b><br>#605E58<br><i>6.5:1</i></span><span class="sw" style="background:#5A5860;color:#FFF"><b>D5</b><br>#5A5860<br><i>7.0:1</i></span><span class="sw" style="background:#585D60;color:#FFF"><b>D6</b><br>#585D60<br><i>6.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5E5F58;color:#FFF"><b>D7</b><br>#5E5F58<br><i>6.5:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D8</b><br>#5F585C<br><i>6.9:1</i></span><span class="sw" style="background:#5F5C58;color:#FFF"><b>D9</b><br>#5F5C58<br><i>6.6:1</i></span><span class="sw" style="background:#585F5F;color:#FFF"><b>D10</b><br>#585F5F<br><i>6.5:1</i></span><span class="sw" style="background:#585F59;color:#FFF"><b>D11</b><br>#585F59<br><i>6.6:1</i></span><span class="sw" style="background:#5E585F;color:#FFF"><b>D12</b><br>#5E585F<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2><span class="rank">#4/5</span> onyx · Wheel uniform <span class="score">93<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#605C58;color:#FFF"><b>D2</b><br>#605C58<br><i>6.6:1</i></span><span class="sw" style="background:#606058;color:#FFF"><b>D3</b><br>#606058<br><i>6.3:1</i></span><span class="sw" style="background:#5C6058;color:#FFF"><b>D4</b><br>#5C6058<br><i>6.4:1</i></span><span class="sw" style="background:#586058;color:#FFF"><b>D5</b><br>#586058<br><i>6.5:1</i></span><span class="sw" style="background:#58605C;color:#FFF"><b>D6</b><br>#58605C<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#585F5F;color:#FFF"><b>D7</b><br>#585F5F<br><i>6.5:1</i></span><span class="sw" style="background:#585C5F;color:#FFF"><b>D8</b><br>#585C5F<br><i>6.8:1</i></span><span class="sw" style="background:#58585F;color:#FFF"><b>D9</b><br>#58585F<br><i>7.1:1</i></span><span class="sw" style="background:#5C585F;color:#FFF"><b>D10</b><br>#5C585F<br><i>7.0:1</i></span><span class="sw" style="background:#5F585F;color:#FFF"><b>D11</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D12</b><br>#5F585C<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#FAFAFA;color:#000">

<div class="head">
<h2><span class="rank">#5/5</span> onyx · Analogous mono <span class="score">85<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>12/12</b> (30pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>0/12</b> &middot;
  dark: <b>12/12</b> (15pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L1</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L2</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L3</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L4</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L5</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L6</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#DEDEDE;color:#000"><b>L7</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L8</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L9</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L10</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L11</b><br>#DEDEDE<br><i>14.7:1</i></span><span class="sw" style="background:#DEDEDE;color:#000"><b>L12</b><br>#DEDEDE<br><i>14.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#605757;color:#FFF"><b>D1</b><br>#605757<br><i>7.0:1</i></span><span class="sw" style="background:#605A58;color:#FFF"><b>D2</b><br>#605A58<br><i>6.8:1</i></span><span class="sw" style="background:#60585A;color:#FFF"><b>D3</b><br>#60585A<br><i>6.9:1</i></span><span class="sw" style="background:#605D58;color:#FFF"><b>D4</b><br>#605D58<br><i>6.6:1</i></span><span class="sw" style="background:#60585D;color:#FFF"><b>D5</b><br>#60585D<br><i>6.9:1</i></span><span class="sw" style="background:#606058;color:#FFF"><b>D6</b><br>#606058<br><i>6.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#5F585F;color:#FFF"><b>D7</b><br>#5F585F<br><i>6.9:1</i></span><span class="sw" style="background:#5F5A58;color:#FFF"><b>D8</b><br>#5F5A58<br><i>6.8:1</i></span><span class="sw" style="background:#5F585A;color:#FFF"><b>D9</b><br>#5F585A<br><i>6.9:1</i></span><span class="sw" style="background:#5F5C58;color:#FFF"><b>D10</b><br>#5F5C58<br><i>6.6:1</i></span><span class="sw" style="background:#5F585C;color:#FFF"><b>D11</b><br>#5F585C<br><i>6.9:1</i></span><span class="sw" style="background:#5F5858;color:#FFF"><b>D12</b><br>#5F5858<br><i>6.9:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2><span class="rank">#1/5</span> carbone · Brand triad <span class="score">62<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>0/12</b> (0pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> (8pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>90°</b> (4pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#848C95;color:#FFF"><b>L3</b><br>#848C95<br><i>2.9:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L4</b><br>#958C84<br><i>2.8:1</i></span><span class="sw" style="background:#95848C;color:#FFF"><b>L5</b><br>#95848C<br><i>3.0:1</i></span><span class="sw" style="background:#849595;color:#FFF"><b>L6</b><br>#849595<br><i>2.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#939385;color:#FFF"><b>L7</b><br>#939385<br><i>2.7:1</i></span><span class="sw" style="background:#859385;color:#FFF"><b>L8</b><br>#859385<br><i>2.8:1</i></span><span class="sw" style="background:#858593;color:#FFF"><b>L9</b><br>#858593<br><i>3.1:1</i></span><span class="sw" style="background:#938593;color:#FFF"><b>L10</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#8C9385;color:#FFF"><b>L11</b><br>#8C9385<br><i>2.7:1</i></span><span class="sw" style="background:#8C8593;color:#FFF"><b>L12</b><br>#8C8593<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#4B5C6D;color:#FFF"><b>D3</b><br>#4B5C6D<br><i>6.9:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D4</b><br>#6D5C4B<br><i>6.4:1</i></span><span class="sw" style="background:#6D4B5C;color:#FFF"><b>D5</b><br>#6D4B5C<br><i>7.5:1</i></span><span class="sw" style="background:#4B6D6D;color:#FFF"><b>D6</b><br>#4B6D6D<br><i>5.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A6A4D;color:#FFF"><b>D7</b><br>#6A6A4D<br><i>5.6:1</i></span><span class="sw" style="background:#4D6A4D;color:#FFF"><b>D8</b><br>#4D6A4D<br><i>6.0:1</i></span><span class="sw" style="background:#4D4D6A;color:#FFF"><b>D9</b><br>#4D4D6A<br><i>8.1:1</i></span><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D10</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#5C6A4D;color:#FFF"><b>D11</b><br>#5C6A4D<br><i>5.8:1</i></span><span class="sw" style="background:#5C4D6A;color:#FFF"><b>D12</b><br>#5C4D6A<br><i>7.7:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2><span class="rank">#2/5</span> carbone · Treemap distinct <span class="score">62<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>0/12</b> (0pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> (8pt) <br>
  min adjacent ΔH 1-6: <b>60°</b> (15pt) &middot;
  brand affinity 1-6: <b>85°</b> (5pt) &middot;
  hue coverage: <b>285°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#8C9584;color:#FFF"><b>L3</b><br>#8C9584<br><i>2.7:1</i></span><span class="sw" style="background:#8C8495;color:#FFF"><b>L4</b><br>#8C8495<br><i>3.1:1</i></span><span class="sw" style="background:#848C95;color:#FFF"><b>L5</b><br>#848C95<br><i>2.9:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L6</b><br>#958C84<br><i>2.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#938985;color:#FFF"><b>L7</b><br>#938985<br><i>2.9:1</i></span><span class="sw" style="background:#859390;color:#FFF"><b>L8</b><br>#859390<br><i>2.7:1</i></span><span class="sw" style="background:#909385;color:#FFF"><b>L9</b><br>#909385<br><i>2.7:1</i></span><span class="sw" style="background:#908593;color:#FFF"><b>L10</b><br>#908593<br><i>3.0:1</i></span><span class="sw" style="background:#858993;color:#FFF"><b>L11</b><br>#858993<br><i>3.0:1</i></span><span class="sw" style="background:#939085;color:#FFF"><b>L12</b><br>#939085<br><i>2.7:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#5C6D4B;color:#FFF"><b>D3</b><br>#5C6D4B<br><i>5.6:1</i></span><span class="sw" style="background:#5C4B6D;color:#FFF"><b>D4</b><br>#5C4B6D<br><i>7.8:1</i></span><span class="sw" style="background:#4B5C6D;color:#FFF"><b>D5</b><br>#4B5C6D<br><i>6.9:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D6</b><br>#6D5C4B<br><i>6.4:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A554D;color:#FFF"><b>D7</b><br>#6A554D<br><i>7.0:1</i></span><span class="sw" style="background:#4D6A63;color:#FFF"><b>D8</b><br>#4D6A63<br><i>5.9:1</i></span><span class="sw" style="background:#636A4D;color:#FFF"><b>D9</b><br>#636A4D<br><i>5.7:1</i></span><span class="sw" style="background:#634D6A;color:#FFF"><b>D10</b><br>#634D6A<br><i>7.5:1</i></span><span class="sw" style="background:#4D556A;color:#FFF"><b>D11</b><br>#4D556A<br><i>7.4:1</i></span><span class="sw" style="background:#6A634D;color:#FFF"><b>D12</b><br>#6A634D<br><i>6.0:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2><span class="rank">#3/5</span> carbone · Wong CB-safe <span class="score">58<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>0/12</b> (0pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> (8pt) <br>
  min adjacent ΔH 1-6: <b>45°</b> (11pt) &middot;
  brand affinity 1-6: <b>94°</b> (4pt) &middot;
  hue coverage: <b>305°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L2</b><br>#84958C<br><i>2.7:1</i></span><span class="sw" style="background:#889584;color:#FFF"><b>L3</b><br>#889584<br><i>2.7:1</i></span><span class="sw" style="background:#959084;color:#FFF"><b>L4</b><br>#959084<br><i>2.7:1</i></span><span class="sw" style="background:#888495;color:#FFF"><b>L5</b><br>#888495<br><i>3.1:1</i></span><span class="sw" style="background:#848F95;color:#FFF"><b>L6</b><br>#848F95<br><i>2.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#909385;color:#FFF"><b>L7</b><br>#909385<br><i>2.7:1</i></span><span class="sw" style="background:#93858D;color:#FFF"><b>L8</b><br>#93858D<br><i>3.0:1</i></span><span class="sw" style="background:#938C85;color:#FFF"><b>L9</b><br>#938C85<br><i>2.8:1</i></span><span class="sw" style="background:#859393;color:#FFF"><b>L10</b><br>#859393<br><i>2.7:1</i></span><span class="sw" style="background:#859386;color:#FFF"><b>L11</b><br>#859386<br><i>2.8:1</i></span><span class="sw" style="background:#908593;color:#FFF"><b>L12</b><br>#908593<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D2</b><br>#4B6D5C<br><i>5.8:1</i></span><span class="sw" style="background:#536D4B;color:#FFF"><b>D3</b><br>#536D4B<br><i>5.7:1</i></span><span class="sw" style="background:#6D644B;color:#FFF"><b>D4</b><br>#6D644B<br><i>5.9:1</i></span><span class="sw" style="background:#534B6D;color:#FFF"><b>D5</b><br>#534B6D<br><i>8.1:1</i></span><span class="sw" style="background:#4B616D;color:#FFF"><b>D6</b><br>#4B616D<br><i>6.5:1</i></span></div>
  <div class="row"><span class="sw" style="background:#636A4D;color:#FFF"><b>D7</b><br>#636A4D<br><i>5.7:1</i></span><span class="sw" style="background:#6A4D5E;color:#FFF"><b>D8</b><br>#6A4D5E<br><i>7.4:1</i></span><span class="sw" style="background:#6A5C4D;color:#FFF"><b>D9</b><br>#6A5C4D<br><i>6.5:1</i></span><span class="sw" style="background:#4D6A6A;color:#FFF"><b>D10</b><br>#4D6A6A<br><i>5.9:1</i></span><span class="sw" style="background:#4D6A50;color:#FFF"><b>D11</b><br>#4D6A50<br><i>6.0:1</i></span><span class="sw" style="background:#634D6A;color:#FFF"><b>D12</b><br>#634D6A<br><i>7.5:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2><span class="rank">#4/5</span> carbone · Wheel uniform <span class="score">55<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>0/12</b> (0pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>6/12</b> (8pt) <br>
  min adjacent ΔH 1-6: <b>30°</b> (8pt) &middot;
  brand affinity 1-6: <b>75°</b> (5pt) &middot;
  hue coverage: <b>330°</b> (5pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#958C84;color:#FFF"><b>L2</b><br>#958C84<br><i>2.8:1</i></span><span class="sw" style="background:#959584;color:#FFF"><b>L3</b><br>#959584<br><i>2.6:1</i></span><span class="sw" style="background:#8C9584;color:#FFF"><b>L4</b><br>#8C9584<br><i>2.7:1</i></span><span class="sw" style="background:#849584;color:#FFF"><b>L5</b><br>#849584<br><i>2.7:1</i></span><span class="sw" style="background:#84958C;color:#FFF"><b>L6</b><br>#84958C<br><i>2.7:1</i></span></div>
  <div class="row"><span class="sw" style="background:#859393;color:#FFF"><b>L7</b><br>#859393<br><i>2.7:1</i></span><span class="sw" style="background:#858C93;color:#FFF"><b>L8</b><br>#858C93<br><i>2.9:1</i></span><span class="sw" style="background:#858593;color:#FFF"><b>L9</b><br>#858593<br><i>3.1:1</i></span><span class="sw" style="background:#8C8593;color:#FFF"><b>L10</b><br>#8C8593<br><i>3.0:1</i></span><span class="sw" style="background:#938593;color:#FFF"><b>L11</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#93858C;color:#FFF"><b>L12</b><br>#93858C<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#6D5C4B;color:#FFF"><b>D2</b><br>#6D5C4B<br><i>6.4:1</i></span><span class="sw" style="background:#6D6D4B;color:#FFF"><b>D3</b><br>#6D6D4B<br><i>5.3:1</i></span><span class="sw" style="background:#5C6D4B;color:#FFF"><b>D4</b><br>#5C6D4B<br><i>5.6:1</i></span><span class="sw" style="background:#4B6D4B;color:#FFF"><b>D5</b><br>#4B6D4B<br><i>5.9:1</i></span><span class="sw" style="background:#4B6D5C;color:#FFF"><b>D6</b><br>#4B6D5C<br><i>5.8:1</i></span></div>
  <div class="row"><span class="sw" style="background:#4D6A6A;color:#FFF"><b>D7</b><br>#4D6A6A<br><i>5.9:1</i></span><span class="sw" style="background:#4D5C6A;color:#FFF"><b>D8</b><br>#4D5C6A<br><i>6.9:1</i></span><span class="sw" style="background:#4D4D6A;color:#FFF"><b>D9</b><br>#4D4D6A<br><i>8.1:1</i></span><span class="sw" style="background:#5C4D6A;color:#FFF"><b>D10</b><br>#5C4D6A<br><i>7.7:1</i></span><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D11</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#6A4D5C;color:#FFF"><b>D12</b><br>#6A4D5C<br><i>7.4:1</i></span></div>
</div>

</div>

---

<!-- _class: blank -->

<div class="prop" style="background:#0F0E0C;color:#FFF">

<div class="head">
<h2><span class="rank">#5/5</span> carbone · Analogous mono <span class="score">42<span class="score-unit">/100</span></span></h2>
<div class="scores">
  AA-text light: <b>0/12</b> (0pt) &middot;
  AA-text dark:  <b>12/12</b> (30pt) &middot;
  graphical on bg light: <b>12/12</b> &middot;
  dark: <b>2/12</b> (3pt) <br>
  min adjacent ΔH 1-6: <b>20°</b> (5pt) &middot;
  brand affinity 1-6: <b>30°</b> (3pt) &middot;
  hue coverage: <b>120°</b> (2pt)
</div>
</div>

<div class="tier">
  <div class="tier-lbl">LIGHT (band, dark text)</div>
  <div class="row"><span class="sw" style="background:#958383;color:#FFF"><b>L1</b><br>#958383<br><i>3.1:1</i></span><span class="sw" style="background:#958984;color:#FFF"><b>L2</b><br>#958984<br><i>2.9:1</i></span><span class="sw" style="background:#958489;color:#FFF"><b>L3</b><br>#958489<br><i>3.0:1</i></span><span class="sw" style="background:#958F84;color:#FFF"><b>L4</b><br>#958F84<br><i>2.7:1</i></span><span class="sw" style="background:#95848F;color:#FFF"><b>L5</b><br>#95848F<br><i>3.0:1</i></span><span class="sw" style="background:#959584;color:#FFF"><b>L6</b><br>#959584<br><i>2.6:1</i></span></div>
  <div class="row"><span class="sw" style="background:#938593;color:#FFF"><b>L7</b><br>#938593<br><i>3.0:1</i></span><span class="sw" style="background:#938985;color:#FFF"><b>L8</b><br>#938985<br><i>2.9:1</i></span><span class="sw" style="background:#938589;color:#FFF"><b>L9</b><br>#938589<br><i>3.0:1</i></span><span class="sw" style="background:#938C85;color:#FFF"><b>L10</b><br>#938C85<br><i>2.8:1</i></span><span class="sw" style="background:#93858C;color:#FFF"><b>L11</b><br>#93858C<br><i>3.0:1</i></span><span class="sw" style="background:#938585;color:#FFF"><b>L12</b><br>#938585<br><i>3.0:1</i></span></div>
</div>

<div class="tier">
  <div class="tier-lbl">DARK (cat/chart, white text)</div>
  <div class="row"><span class="sw" style="background:#6E4949;color:#FFF"><b>D1</b><br>#6E4949<br><i>7.7:1</i></span><span class="sw" style="background:#6D564B;color:#FFF"><b>D2</b><br>#6D564B<br><i>6.8:1</i></span><span class="sw" style="background:#6D4B56;color:#FFF"><b>D3</b><br>#6D4B56<br><i>7.5:1</i></span><span class="sw" style="background:#6D614B;color:#FFF"><b>D4</b><br>#6D614B<br><i>6.1:1</i></span><span class="sw" style="background:#6D4B61;color:#FFF"><b>D5</b><br>#6D4B61<br><i>7.4:1</i></span><span class="sw" style="background:#6D6D4B;color:#FFF"><b>D6</b><br>#6D6D4B<br><i>5.3:1</i></span></div>
  <div class="row"><span class="sw" style="background:#6A4D6A;color:#FFF"><b>D7</b><br>#6A4D6A<br><i>7.3:1</i></span><span class="sw" style="background:#6A554D;color:#FFF"><b>D8</b><br>#6A554D<br><i>7.0:1</i></span><span class="sw" style="background:#6A4D55;color:#FFF"><b>D9</b><br>#6A4D55<br><i>7.5:1</i></span><span class="sw" style="background:#6A5C4D;color:#FFF"><b>D10</b><br>#6A5C4D<br><i>6.5:1</i></span><span class="sw" style="background:#6A4D5C;color:#FFF"><b>D11</b><br>#6A4D5C<br><i>7.4:1</i></span><span class="sw" style="background:#6A4D4D;color:#FFF"><b>D12</b><br>#6A4D4D<br><i>7.5:1</i></span></div>
</div>

</div>
