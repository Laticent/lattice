// THE SLIDE BAND, drawn (see below). Loaded by editor.js on the first `setBand`, which is after first paint:
// the band is only wanted once the focus sync has arrived, so it is not part of the route's eager JS.
//
// A range of the document the host wants marked: the slide the preview is showing. It is DRAWN, not
// decorated: two absolutely positioned boxes beside the content (a wash behind the lines, a bar over the
// gutter), placed from CodeMirror's own line heights. Line decorations were the first cut, and they cost a
// CodeMirror transaction, a redraw of every line of the slide and a forced style recalc (CodeMirror reads the
// DOM selection after any DOM change) at every slide boundary the reader scrolled past, which at 4x CPU
// throttle was most of the dropped frames. A drawn box touches nothing CodeMirror owns, so a mark costs one
// measure and two style writes. The text stays selectable and a click anywhere in the band lands exactly where
// it was made: the boxes are paint, never a hit target.
import { ViewPlugin } from '@codemirror/view';

export const bandPlugin = ViewPlugin.fromClass(
	class {
		constructor(view) {
			this.view = view;
			this.from = -1;
			this.to = -1;
			this.wash = document.createElement('div');
			this.wash.className = 'cm-slide-band';
			this.bar = document.createElement('div');
			this.bar.className = 'cm-slide-band-gutter';
			this.layer = document.createElement('div');
			this.layer.className = 'cm-slide-band-layer';
			this.layer.setAttribute('aria-hidden', 'true');
			this.layer.append(this.wash);
			// The wash sits behind the text (a layer with a negative z-index inside the scroller's own stacking
			// context); the bar must sit over the gutter's background, so it is the scroller's child itself.
			view.scrollDOM.insertBefore(this.layer, view.scrollDOM.firstChild);
			view.scrollDOM.append(this.bar);
			this.hide();
			this.job = { read: (v) => this.read(v), write: (m) => this.write(m), key: this };
		}
		hide() {
			this.wash.style.display = 'none';
			this.bar.style.display = 'none';
		}
		/** The lines marked, as offsets of their first and last character; null when nothing is. */
		range() {
			return this.from < 0 ? null : { from: this.from, to: this.to };
		}
		set(range) {
			if (range) {
				const doc = this.view.state.doc;
				const clamp = (n) => Math.max(0, Math.min(n, doc.length));
				this.from = doc.lineAt(clamp(range.from)).from;
				this.to = doc.lineAt(clamp(range.to)).to;
			} else this.from = -1;
			this.view.requestMeasure(this.job);
		}
		update(u) {
			// A typed character moves the band's edges with the text.
			if (this.from >= 0 && u.docChanged) {
				this.from = u.changes.mapPos(this.from, -1);
				this.to = u.changes.mapPos(this.to, 1);
			}
			if (u.docChanged || u.viewportChanged || u.geometryChanged) this.view.requestMeasure(this.job);
		}
		read(view) {
			if (this.from < 0) return null;
			const scroller = view.scrollDOM;
			const sr = scroller.getBoundingClientRect();
			const cr = view.contentDOM.getBoundingClientRect();
			const top = view.documentTop - sr.top + scroller.scrollTop + view.lineBlockAt(this.from).top;
			const bottom = view.documentTop - sr.top + scroller.scrollTop + view.lineBlockAt(this.to).bottom;
			return { top, height: bottom - top, left: cr.left - sr.left + scroller.scrollLeft, width: cr.width };
		}
		write(m) {
			if (!m) return this.hide();
			const w = this.wash.style;
			w.display = 'block';
			w.top = `${m.top}px`;
			w.height = `${m.height}px`;
			w.left = `${m.left}px`;
			w.width = `${m.width}px`;
			const b = this.bar.style;
			b.display = 'block';
			b.top = `${m.top}px`;
			b.height = `${m.height}px`;
		}
		destroy() {
			this.layer.remove();
			this.bar.remove();
		}
	},
);
