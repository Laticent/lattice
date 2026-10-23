// A status card. The body is `status: late`, `title: …`, then a markdown detail after a blank line.
// The drawing holds slots, not values: the HOST fills ${status}, ${title} and ${detail} with the values this
// function returns, after it has checked each one against the fields the manifest declares.
function render({ body }) {
  const [head, ...rest] = body.split(/\n\s*\n/);
  const field = (name) => (new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(head) || [])[1] || '';
  const status = field('status');
  const html =
    `<div class="lp-status-card-card lp-status-card-${status === 'late' || status === 'at-risk' ? status : 'on-track'}">` +
    '<span class="lp-status-card-badge">${status}</span>' +
    '<h3 class="lp-status-card-title">${title}</h3>' +
    '<div class="lp-status-card-detail">${detail}</div>' +
    '</div>';
  return { html, data: { status, title: field('title'), detail: rest.join('\n\n') } };
}

export { render as default };
