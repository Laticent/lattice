// /robots.txt — built from src/lib/discovery.mjs, which says why it is one group for every
// crawler and why a Cloudflare preview disallows everything.
import type { APIRoute } from 'astro';
import { robotsTxt } from '../lib/discovery.mjs';

export const GET: APIRoute = ({ site }) =>
	new Response(robotsTxt({ site, index: !process.env.CF_PAGES }), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
