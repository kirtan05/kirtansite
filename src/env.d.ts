/// <reference types="astro/client" />

/**
 * Cloudflare bindings available to on-demand routes.
 *
 * On preview deployments these are deliberately absent (see wrangler.jsonc),
 * which is why every one of them is optional here: code that reaches for a
 * binding must cope with it being missing rather than assume production.
 */
interface Env {
  LEARNING_DB?: D1Database;
  LEARNING_FILES?: R2Bucket;

  /** Hostname /learning is allowed to serve on. Anything else 404s. */
  LEARNING_HOST?: string;

  /** pbkdf2$<iterations>$<saltB64>$<hashB64> — see scripts/learning-hash.mjs */
  LEARNING_PW_KID?: string;
  LEARNING_PW_COACH?: string;

  /** Random 32+ byte base64 string used to sign session cookies. */
  LEARNING_COOKIE_KEY?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
