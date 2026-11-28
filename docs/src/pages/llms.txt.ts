// /llms.txt — a ~2 KB router for AI agents (https://llmstxt.org), built from
// src/lib/discovery.mjs. scripts/check-discovery.mjs fails the build on a dead link.
import type { APIRoute } from 'astro';
import enginePkg from '../../../packages/lattice/package.json' with { type: 'json' };
import { llmsTxt } from '../lib/discovery.mjs';

export const GET: APIRoute = ({ site }) =>
	new Response(llmsTxt({ site, version: enginePkg.version }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
