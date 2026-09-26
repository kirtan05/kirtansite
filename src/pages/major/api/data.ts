export const prerender = false;

import type { APIRoute } from 'astro';
import { requireFiles, serveObject } from '../../../lib/major/guard';

/** All questions (data.json in the MAJOR_FILES bucket). */
export const GET: APIRoute = async (ctx) => {
  const g = await requireFiles(ctx);
  if (!g.ok) return g.response;
  return serveObject(g.files, 'data.json', 'application/json', 'private, no-store');
};
