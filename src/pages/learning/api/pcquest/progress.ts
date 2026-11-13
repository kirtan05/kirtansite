export const prerender = false;

/**
 * GET /learning/api/pcquest/progress — everything `quest status` shows
 * (coach token): devices and last seen, every pack (retired too) with its
 * parsed payload, the folded progress, the rung summary, approvals, resets,
 * the tasks waiting on an approval, recent issues (blocked_caps, point_miss,
 * bad_sig from the last 30 days, one row per kind+task+rev+step with a count),
 * and the latest announced release.
 */
import type { APIRoute } from 'astro';
import { bearer, json } from '../../../../lib/learning/pcquest-auth';
import { coachView, payloadOf } from '../../../../lib/learning/pcquest-db';

export const GET: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;

  const v = await coachView(env.PCQUEST_DB);
  return json({
    devices: v.devices,
    packs: v.packs.map((p) => ({
      id: p.id,
      version: p.version,
      updated_at: p.updated_at,
      retired: !!p.retired,
      pack: payloadOf(p.wire),
    })),
    progress: v.progress,
    rungs: v.rungs,
    approvals: v.approvals,
    resets: v.resets,
    waiting: v.waiting.map((t) => t.id),
    issues: v.issues,
    app: v.app,
  });
};
