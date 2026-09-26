export const prerender = false;

import type { APIRoute } from 'astro';
import { requireFiles, serveObject } from '../../../lib/major/guard';

/** The "how Major writes questions" notes, as markdown. */
export const GET: APIRoute = async (ctx) => {
  const g = await requireFiles(ctx);
  if (!g.ok) return g.response;
  return serveObject(g.files, 'playbook.md', 'text/markdown; charset=utf-8', 'private, no-store');
};
