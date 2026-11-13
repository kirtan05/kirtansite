export const prerender = false;

/**
 * POST /learning/api/pcquest/packs/:id/retire — the spec §10 spelling of
 * POST /packs/:id?retire=1 (coach token). Hides the pack from sync; history
 * is kept and nothing is deleted.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json } from '../../../../../../lib/learning/pcquest-auth';
import { retirePack } from '../../../../../../lib/learning/pcquest-db';

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;
  const id = ctx.params.id;
  if (!id || !/^[a-z0-9-]{1,64}$/.test(id)) return bad('bad pack id');

  if (!(await retirePack(env.PCQUEST_DB, id))) return bad('no such pack', 404);
  return json({ ok: true, pack: id, retired: true });
};
