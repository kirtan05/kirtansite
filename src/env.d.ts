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

  /** /learning activity monitor — see docs/superpowers/specs/2026-10-14-learning-activity-monitor-design.md */
  ACTIVITY_DB?: D1Database;
  /** Per-device bearer token the laptop uploader presents to the ingest route. */
  ACTIVITY_INGEST_TOKEN?: string;
  ACTIVITY_INGEST_TOKEN_PHONE?: string; // his phone's own ingest token (optional)
  /** Read-only bearer token for the nightly summary endpoint. Writers can't read, readers can't write. */
  ACTIVITY_READ_TOKEN?: string;

  /** PC Quest — the Windows task app. Spec: learning repo, pcquest/docs/TASK-FORMAT.md */
  PCQUEST_DB?: D1Database;
  /** Bearer token on his laptop: GET sync and POST events only. */
  PCQUEST_KID_TOKEN?: string;
  /** Bearer token on Kirtan's box (`quest`): packs, progress, approve, reset, release. */
  PCQUEST_COACH_TOKEN?: string;
  /** SPKI base64 public key every pushed pack must be signed by (`quest keygen`). */
  PCQUEST_PACK_PUBKEY?: string;

  /** /gree — GRE/TOEFL English trainer. One user, one password. */
  GREE_DB?: D1Database;
  GREE_HOST?: string;
  /** pbkdf2 record, same format as LEARNING_PW_* */
  GREE_PW?: string;
  GREE_COOKIE_KEY?: string;

  /** /major — quiz revision. One password, files in R2, no database. */
  MAJOR_FILES?: R2Bucket;
  MAJOR_HOST?: string;
  /** pbkdf2 record, same format as LEARNING_PW_* */
  MAJOR_PW?: string;
  MAJOR_COOKIE_KEY?: string;

  /** /net — home router & network monitor (devices, DNS, flows, GPON stats). */
  NETMON_DB?: D1Database;
  NETMON_HOST?: string;
  /** pbkdf2 record, same format as LEARNING_PW_* */
  NETMON_PW?: string;
  NETMON_COOKIE_KEY?: string;
  /** Write-only bearer token for collectors (ThinkPad, ESP32, Pi, OpenWrt). */
  NETMON_INGEST_TOKEN?: string;
}

type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
