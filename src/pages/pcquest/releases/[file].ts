export const prerender = false;

/**
 * GET /pcquest/releases/<file> — PC Quest app updates (Velopack's releases.win.json, the .nupkg, Setup.exe),
 * stored in R2 (LEARNING_FILES) under pcquest/releases/. Public: the app's updater fetches without a token,
 * and the files hold no secrets. The app checks the nupkg's sha256 against the one `quest release` announced.
 */
import type { APIRoute } from 'astro';

const OK = /^[A-Za-z0-9._-]{1,128}$/;

export const GET: APIRoute = async (ctx) => {
  const file = ctx.params.file ?? '';
  if (!OK.test(file)) return new Response('not found', { status: 404 });
  const env = (ctx.locals as App.Locals)?.runtime?.env as Env | undefined;
  const bucket = env?.LEARNING_FILES;
  if (!bucket) return new Response('not configured', { status: 503 });
  const obj = await bucket.get(`pcquest/releases/${file}`);
  if (!obj) return new Response('not found', { status: 404 });
  const type = file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  return new Response(obj.body, {
    headers: {
      'Content-Type': type,
      'Content-Length': String(obj.size),
      'Cache-Control': file.endsWith('.json') ? 'no-cache' : 'public, max-age=31536000, immutable',
    },
  });
};
