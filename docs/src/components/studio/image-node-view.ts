// THE IMAGE NODE VIEW — Compose draws a picture as a picture, and a tap opens its editor.
//
// Before this, a Library photo (`![alt](asset:harbor)`) was an `<img>` the browser could not load, so Compose showed a
// broken-image mark where the slide shows the photo. Now:
//
//   · A Library photo is drawn from the Studio's own name → URL map (media-urls.ts), the one the preview renders with, and
//     it redraws when the Library changes.
//   · An image the author embedded as a data URI is drawn as it is: its bytes are in the document already.
//   · Anything else (a web address, `sample:` art, a relative file) is drawn as a stand-in that says what it is. The editor
//     fetches nothing the author did not put in the deck's own bytes, so opening a deck never reaches the network; the slide
//     preview beside Compose draws the real picture, under the Studio's own web-image setting.
//   · A background (`![bg right](…)`) says so: it fills a side of the slide, it is not a picture in the text.
//
// One button holds the drawing, as the inline objects do, so a press never moves the caret or raises a touch keyboard, and the
// click selects the node and opens its editor (inline-objects.ts `openObjectEditor`).
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §6.

import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import { assetNameOf, bgKeywords, bgSideOf, imageSourceKind } from '@/lib/compose/image-objects';
import { openObjectEditor } from '@/lib/compose/inline-objects';
import { ensureAssetUrls, onAssetUrlsChanged } from './media-urls';

/** The Library's name → URL map, as of the last read. Empty until the first read finishes. */
let urls: Record<string, string> = {};
let loaded = false;
const live = new Set<ImageView>();
let subscribed = false;

/** Read the map once and keep every drawn image current with the Library. */
function ensureMap(): void {
	if (subscribed) return;
	subscribed = true;
	const refresh = () =>
		void ensureAssetUrls().then((m) => {
			urls = m;
			loaded = true;
			for (const v of live) v.paint();
		});
	onAssetUrlsChanged(refresh);
	refresh();
}

/** What a stand-in says for an image the editor does not fetch. */
function describe(src: string, alt: string): string {
	if (alt.trim() && bgKeywords(alt) === null) return alt.trim();
	if (src.startsWith('sample:')) return `Sample art: ${src.slice(7)}`;
	if (/^https?:/i.test(src)) return `Web image: ${src.replace(/^https?:\/\//i, '').slice(0, 48)}`;
	return src.slice(0, 48);
}

/** The side a background takes, in words. */
const SIDE_NAME = { left: 'Left side', right: 'Right side', full: 'Full slide' } as const;

class ImageView implements NodeView {
	dom: HTMLElement;
	private btn: HTMLButtonElement;
	private node: PMNode;

	constructor(
		node: PMNode,
		private view: EditorView,
		private getPos: () => number | undefined,
	) {
		this.node = node;
		this.dom = document.createElement('span');
		this.dom.contentEditable = 'false';
		this.btn = document.createElement('button');
		this.btn.type = 'button';
		this.btn.className = 'cs-img-btn';
		// A press must not move the caret or raise a touch keyboard: the selection becomes the node, in the click below.
		this.btn.addEventListener('mousedown', (e) => e.preventDefault());
		this.btn.addEventListener('click', (e) => {
			e.preventDefault();
			const pos = this.getPos();
			if (typeof pos === 'number') openObjectEditor(this.view, pos);
		});
		this.dom.append(this.btn);
		live.add(this);
		ensureMap();
		this.paint();
	}

	paint(): void {
		const src = String(this.node.attrs.src ?? '');
		const alt = String(this.node.attrs.alt ?? '');
		const kind = imageSourceKind(src);
		const name = assetNameOf(src);
		const bg = bgKeywords(alt) !== null;
		this.btn.replaceChildren();
		this.dom.className = `cs-img${bg ? ' cs-img-bg' : ''}`;
		this.btn.title = 'Edit this image';
		this.btn.setAttribute('aria-label', `Edit ${bg ? 'background image' : 'image'}${alt && !bg ? `: ${alt}` : ''}`);

		// The engine matches a name without regard to case, and a name is never an object's own property (`asset:constructor`).
		const key = name?.toLowerCase() ?? '';
		const url = kind === 'asset' && name ? (Object.hasOwn(urls, key) ? urls[key] : null) : kind === 'data' ? src : null;
		if (url) {
			const img = document.createElement('img');
			img.src = url;
			// The alt is the author's description of the picture; a background's alt is a directive, not a description.
			img.alt = bg ? '' : alt;
			img.draggable = false;
			this.btn.append(img);
		} else {
			const missing = kind === 'asset' && loaded;
			const tile = document.createElement('span');
			tile.className = `cs-img-stand${missing ? ' cs-img-missing' : ''}`;
			const label = document.createElement('span');
			label.className = 'cs-img-stand-label';
			label.textContent = kind === 'asset' ? (missing ? `Photo not in this Library: ${name}` : `Loading ${name}…`) : describe(src, alt);
			tile.append(label);
			this.btn.append(tile);
		}
		if (bg) {
			const badge = document.createElement('span');
			badge.className = 'cs-img-badge';
			badge.textContent = `Background · ${SIDE_NAME[bgSideOf(alt)]}`;
			this.btn.append(badge);
		}
	}

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		const changed = node.attrs.src !== this.node.attrs.src || node.attrs.alt !== this.node.attrs.alt;
		this.node = node;
		if (changed) this.paint();
		return true;
	}

	// Events on the button are ours (the click above); the editor leaves them alone.
	stopEvent(e: Event): boolean {
		return e.target instanceof Node && this.btn.contains(e.target);
	}

	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		live.delete(this);
	}
}

/** The `nodeViews` entry for the image node. */
export function imageNodeView(node: PMNode, view: EditorView, getPos: () => number | undefined): NodeView {
	return new ImageView(node, view, getPos);
}
