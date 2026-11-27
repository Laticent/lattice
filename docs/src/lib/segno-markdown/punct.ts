/**
 * Unicode punctuation and symbols, as markdown-it reads them for CommonMark's flanking rules
 * (`isPunctCharCode`: uc.micro 2.1.0's `P` or `S`). The table is uc.micro's, not the JavaScript engine's
 * `\p{P}` / `\p{S}`: those follow each engine's Unicode version (Node 22's differs from uc.micro at 856 code
 * points), and the inline pass must read a flanking run the way markdown-it does in every browser.
 *
 * Above U+007F: sorted inclusive ranges, delta-encoded in base 36 (start, end, start, end, ...; each value is
 * the difference from the one before). Below it, CommonMark's ASCII punctuation. inline.test.ts holds the table
 * to uc.micro at every code point and prints a fresh one when uc.micro moves.
 */
const RANGES = '4h,8,2,1,2,3,3,0,2,2,3,0,4,0,o,0,w,0,cr,3,d,d,6,6,2,0,2,g,3a,0,9,0,6,1,2,0,33,0,3w,0,60,5,16,1,3,2,1b,0,2,0,3,0,3,0,19,1,i,9,c,0,2,2,23,3,2v,0,a,0,b,0,k,1,2,d,6h,3,5,1,1d,e,w,0,16,0,64,1,b,0,3m,1,7,1,2,0,3d,0,3e,1,3j,0,3n,7,3h,0,8,0,5,0,5n,0,16,0,3f,0,23,0,g,0,b,1,4m,m,3,5,l,0,2,0,2,0,2,3,20,0,1l,7,2,5,2,c,34,5,27,1,2k,0,h1,8,14,9,2v,0,h9,1,19,1,27,2,20,1,4e,2,2,3,11,a,8m,0,4,1,49,x,v,1,3l,6,2,5,4t,g,a,a,3i,3,1o,4,1r,1,1t,7,c,0,kq,0,2,2,c,2,e,2,e,2,e,1,i,n,9,1a,s,4,c,4,i,w,1s,1,2,3,2,1,b,0,2,2,6,5,2,0,2,0,2,0,5,0,c,1,5,4,6,3,2,0,1n,1,5,ie,q,a,2a,25,n,hh,v,rj,3,v,2,2w,6e,5,f,3,2,1,35,0,40,1a,2,19,z,p,2,2g,d,5x,r,f,2,3,4,o,g,0,6,1,6,2,2k,1,4,0,2j,0,45,1,5,9,x,z,c,0,h,u,c,t,9,0,g,v,b,12,g,8v,535,1r,h3l,1i,1k,1,7i,2,2s,0,b,0,38,5,9,m,a,1,2w,1,4e,3,b,3,1n,3,2f,1,15,2,2,0,1e,1,1c,0,2q,c,h,1,3h,3,o,2,2t,1,h,1,2y,0,f,1,3k,0,fni,0,3t,g,ak,h,3k,0,19,3,h,9,n,y,2,i,2,3,46,e,b,6,r,5,r,a,3f,6,2,6,e,1,77,2,1h,8,1m,g,3,2,2,c,4,0,1c,18,bn,0,1d,0,bj,0,ko,0,w,1,4n,0,w,0,7l,8,13,0,21,0,14,6,1v,6,2i,3,lt,0,4o,4,19,3,5a,6,32,1,2,3,3j,3,1d,1,28,3,5,0,e,0,2,2,2h,5,30,0,bm,4,b,1,2,0,2x,0,6z,m,2y,2,t,c,25,0,3n,3,70,0,7d,2,4c,0,2l,7,2c,2,2,4,2m,9,8o,4,17,1,hy,1,23,c,3q,s,e,0,vl,4,29p,1,bjw,1,3q,0,1u,8,5,1,nm,3,94,0,f5m,0,3,0,3ox,37,1p,6t,b,12,3,1n,6,2,n,1,8,t,5,1o,m,1t,4,0,57,2e,ob,0,q,0,w,0,q,0,w,0,q,0,w,0,q,0,w,0,q,0,1p,e7,1k,3,1f,7,2,d,2,6,1c4,0,c0,0,19b,1,nh,0,4,0,3i,0,ci,1,7j,17,5,2r,d,e,3,e,2,e,2,10,o,4g,1l,s,e,17,5,8,8,1,f,5,4b,rb,5,g,4,c,4,3a,5,2m,7,b,5,0,g,b,5,1j,9,9,7,13,9,t,3,1,27,9f,d,d,3,c,4,8,8,19,2,6,9,d,5,8,8,8,8,42,2,1i';

let table: Int32Array | null = null;

function decode(): Int32Array {
	const parts = RANGES.split(',');
	const out = new Int32Array(parts.length);
	let at = 0;
	for (let i = 0; i < parts.length; i++) out[i] = at += parseInt(parts[i], 36);
	return out;
}

/** CommonMark's ASCII punctuation (markdown-it's `isMdAsciiPunct`): the 32 printable non-alphanumerics. */
export function isAsciiPunct(c: number): boolean {
	return (c >= 0x21 && c <= 0x2f) || (c >= 0x3a && c <= 0x40) || (c >= 0x5b && c <= 0x60) || (c >= 0x7b && c <= 0x7e);
}

/** markdown-it's `isMdAsciiPunct(c) || isPunctCharCode(c)`, for a code point. */
export function isPunct(c: number): boolean {
	if (c < 0x80) return isAsciiPunct(c);
	const t = (table ??= decode());
	// The last range start at or below c; c is inside when it is also at or below that range's end.
	let lo = 0;
	let hi = (t.length >> 1) - 1;
	if (c < t[0]) return false;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (t[mid * 2] <= c) lo = mid;
		else hi = mid - 1;
	}
	return c <= t[lo * 2 + 1];
}

/** markdown-it's `isWhiteSpace`: Unicode Zs, tab, and the line-ending controls. */
export function isWhiteSpace(c: number): boolean {
	if (c >= 0x2000 && c <= 0x200a) return true;
	switch (c) {
		case 0x09:
		case 0x0a:
		case 0x0b:
		case 0x0c:
		case 0x0d:
		case 0x20:
		case 0xa0:
		case 0x1680:
		case 0x202f:
		case 0x205f:
		case 0x3000:
			return true;
	}
	return false;
}
