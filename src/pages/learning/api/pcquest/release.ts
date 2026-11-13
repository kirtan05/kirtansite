export const prerender = false;

/**
 * POST /learning/api/pcquest/release — `quest release <version> <url> <sha256>`
 * (coach token). Body: { version, url, sha256 }. The newest release (by the
 * time it was announced) goes out. Plain x.y.z only: the app parses it with
 * System.Version, which has no prerelease tags, and it in every sync as app: { latest, url, sha256 }.
 */
import type { APIRoute } from 'astro';
import { bad, bearer, json, readJson } from '../../../../lib/learning/pcquest-auth';

export const POST: APIRoute = async (ctx) => {
  const env = bearer(ctx, 'coach');
  if (env instanceof Response) return env;

  const body = await readJson(ctx);
  const { version, url, sha256 } = body ?? {};
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) return bad('bad version');
  if (typeof url !== 'string' || !/^https?:\/\//.test(url) || url.length > 1000) return bad('bad url');
  if (typeof sha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(sha256)) return bad('bad sha256');
  const at = new Date().toISOString();

  await env.PCQUEST_DB
    .prepare(
      `INSERT INTO pq_release (version, url, sha256, at) VALUES (?, ?, ?, ?)
       ON CONFLICT(version) DO UPDATE SET url = excluded.url, sha256 = excluded.sha256, at = excluded.at`,
    )
    .bind(version, url, sha256.toLowerCase(), at)
    .run();
  return json({ ok: true, app: { latest: version, url, sha256: sha256.toLowerCase() }, at });
};
