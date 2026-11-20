// The D1 benchmark's plugin: `Label: value` lines as a bar chart. Every color comes from bench-bars.styles.css, so a frame
// that paints the drawing without the plugin's sheet shows black bars (the "bare" state the benchmark counts).
function render(fence) {
  var rows = fence.body.trim().split("\n").map((l) => {
    var m = /^(.*?):\s*([\d.]+)/.exec(l);
    return m ? { label: m[1].trim(), v: Number(m[2]) } : null;
  }).filter(Boolean);
  var max = Math.max.apply(null, rows.map((r) => r.v).concat([1]));
  var w = 1000, h = 400, base = 350, slot = (w - 80) / Math.max(rows.length, 1);
  var esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  var out = '<line class="lp-bench-bars-axis" x1="40" x2="960" y1="' + base + '" y2="' + base + '"></line>';
  rows.forEach((r, i) => {
    var bh = Math.round((r.v / max) * 280), x = Math.round(40 + i * slot + slot * 0.15), bw = Math.round(slot * 0.7);
    var cls = r.v === max ? "lp-bench-bars-bar lp-bench-bars-top" : "lp-bench-bars-bar";
    out += '<rect class="' + cls + '" x="' + x + '" y="' + (base - bh) + '" width="' + bw + '" height="' + bh + '" rx="6"></rect>';
    out += '<text class="lp-bench-bars-value" x="' + (x + bw / 2) + '" y="' + (base - bh - 12) + '" text-anchor="middle">' + esc(r.v) + '</text>';
    out += '<text class="lp-bench-bars-label" x="' + (x + bw / 2) + '" y="' + (base + 34) + '" text-anchor="middle">' + esc(r.label) + '</text>';
  });
  return '<svg class="lp-bench-bars-chart" id="' + fence.id + '" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + out + '</svg>';
}

export { render as default };
