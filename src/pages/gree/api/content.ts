export const prerender = false;

import type { APIRoute } from 'astro';
import { json, requireApi } from '../../../lib/gree/guard';
import words from '../../../data/gree/words.json';
import questions from '../../../data/gree/questions.json';
import { CONTENT_VERSION } from '../../../data/gree/version';

/**
 * The word list and question bank. Behind the login because the definitions
 * and example sentences come from a published book; the client keeps a copy
 * keyed by CONTENT_VERSION so this is fetched once per content change.
 */
export const GET: APIRoute = async (ctx) => {
  const g = await requireApi(ctx);
  if (!g.ok) return g.response;
  return json({ version: CONTENT_VERSION, words, questions });
};
