export const prerender = false;

/**
 * Accept one file.
 *
 * Everything the client says about the file is treated as a claim. The type
 * comes from the bytes, the size limit is enforced after reading, and EXIF is
 * stripped again here even though the upload form already re-encoded through
 * a canvas — because the form is JavaScript running on a device an
 * eleven-year-old controls, and it is not the last line of defence.
 */
import type { APIRoute } from 'astro';
import { audit, requireRole } from '../../../lib/learning/guard';
import { MAX_BYTES, isUploadKind, r2Key, sha256Hex, sniff, stripJpegExif } from '../../../lib/learning/files';
import { currentSession, ensureEntry } from '../../../lib/learning/queries';
import { today } from '../../../lib/learning/dates';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);

export const POST: APIRoute = async (ctx) => {
  const gate = await requireRole(ctx, 'any');
  if (!gate.ok) return gate.response;
  const { db, files, role } = gate.ctx;

  const form = await ctx.request.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return new Response('no file', { status: 400 });
  if (file.size > MAX_BYTES) {
    return new Response(`that file is ${Math.round(file.size / 1024 / 1024)} MB — the limit is 8 MB`, { status: 413 });
  }

  let bytes = new Uint8Array(await file.arrayBuffer());
  const kindRaw = String(form.get('kind') ?? 'other');
  const kind = isUploadKind(kindRaw) ? kindRaw : 'other';

  const type = sniff(bytes);
  if (!type) return new Response('that is not a kind of file this can keep', { status: 415 });
  if (type.mime === 'image/heic') {
    // Reachable only when the canvas path failed — old browser, or a file
    // picked from Files rather than the camera.
    return new Response('that photo is in iPhone HEIC format — open it, screenshot it, and send the screenshot', {
      status: 415,
    });
  }
  if (!ALLOWED.has(type.mime)) return new Response(`cannot keep ${type.mime}`, { status: 415 });

  if (type.mime === 'image/jpeg') bytes = stripJpegExif(bytes);

  const sessionId = String(form.get('session_id') ?? '') || (await currentSession(db))?.id;
  if (!sessionId) return new Response('nothing to attach this to', { status: 400 });

  const entry = await ensureEntry(db, sessionId);
  const id = crypto.randomUUID();
  const key = r2Key(entry.on_date, entry.id, id, type.ext);
  const sha = await sha256Hex(bytes);

  // Same bytes for the same evening: he retook the photo. Keep both, mark the
  // old one superseded, and never delete — R2 deletion is irreversible and a
  // mis-tap should not cost a page of his working.
  const dupe = await db
    .prepare('SELECT id FROM upload WHERE entry_id = ? AND kind = ? AND superseded_by IS NULL ORDER BY created_at DESC LIMIT 1')
    .bind(entry.id, kind)
    .first<{ id: string }>();

  await files.put(key, bytes, {
    httpMetadata: { contentType: type.mime, cacheControl: 'private, max-age=0, must-revalidate' },
    customMetadata: { entry: entry.id, kind, by: role },
  });

  const filename = (file.name || `upload.${type.ext}`).replace(/[^\w.\- ]+/g, '_').slice(0, 120);

  const stmts = [
    db
      .prepare(
        `INSERT INTO upload (id, entry_id, r2_key, filename, mime, bytes, kind, sha256, created_at, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, entry.id, key, filename, type.mime, bytes.length, kind, sha, new Date().toISOString(), role),
  ];
  if (dupe && kind !== 'other' && kind !== 'file') {
    stmts.push(db.prepare('UPDATE upload SET superseded_by = ? WHERE id = ?').bind(id, dupe.id));
  }
  await db.batch(stmts);
  await audit(db, role, 'upload', `${kind} ${bytes.length}B ${today()}`);

  return Response.json({ ok: true, id, bytes: bytes.length, mime: type.mime });
};
