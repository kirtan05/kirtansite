# /learning — what this protects, and what it does not

Written plainly, because the alternative is security theatre that someone later
mistakes for a guarantee.

## What this is

A lock on a door nobody knows about. Two shared passwords, one for the boy and
one for his father, on a URL that is not linked from anywhere, not in the
sitemap, and disallowed in `robots.txt`.

## What it is not

**It is not a defence against a determined attacker.** The Cloudflare free plan
gives no rate limiting, no bot management and no WAF rules worth the name, so
there is nothing to stop someone submitting passwords in a loop. Adding a
counter in D1 would slow a naive script and would not slow anyone else, at the
cost of a write on every login. It has not been added.

The honest mitigation is the password itself: the shared passphrases are three
or four random words, which is far beyond what an unthrottled online guessing
attack reaches. If that ever stops feeling sufficient, put the site behind
Cloudflare Access — it is free for up to 50 users and it is a real answer,
where a login counter is not.

## The threat that actually matters

It is not a stranger. It is the eleven-year-old, who will at some point sit at
a laptop where his father was last signed in, and who has every ordinary
incentive to look at the grading.

Three things address it:

1. **The coach cookie lasts 12 hours.** His lasts 90 days. Grading happens in
   one sitting; there is no reason for that cookie to survive the week.
2. **"Sign coach out everywhere"** on the dashboard bumps `setting.epoch_coach`,
   which invalidates every coach cookie that exists, including ones on devices
   nobody has in front of them.
3. **The kid role cannot reach coach data even if it reaches a coach URL.**
   `requireRole()` is the only way to obtain a database handle, and it hands
   back one that already has a role attached. Answers live in a separate table
   that no kid-path query references. The separation is at the query layer, not
   in the templates.

## Password storage

`pbkdf2$<iterations>$<salt>$<hash>`, PBKDF2-SHA256, 32-byte output, per-role
random 16-byte salt, stored as a Pages secret.

**10,000 iterations, which is low, and deliberate.** The Workers free plan
allows 10ms of CPU per invocation and exceeding it kills the request — so a
login page that is too expensive simply does not work. Ten thousand rounds
measures comfortably inside the budget. Both hashes are always checked on every
attempt, so a wrong password costs the same work whichever role it nearly
matched, and the comparison is constant-time.

The iteration count is stored *in the record*, so it can be raised or lowered
later with a new secret and no code change and no deploy.

## The cookie

`v1.<payload>.<signature>` — HMAC-SHA256 over the payload with
`LEARNING_COOKIE_KEY`. Payload is `{role, epoch, expiry}`. `HttpOnly`,
`Secure`, `SameSite=Lax`, `Path=/learning`.

Signature is verified before the payload is parsed, and compared in constant
time. There is no server-side session table: the epoch in `setting` provides
revocation without one.

## The hostname lock

This is the control that closes the exposure the rest of the list would not
have.

A Pages project serves the same code on `kirtansite.pages.dev`, on every
preview branch URL, and on the real domain. Each of those is a fully functional
front door onto the same database. `robots.txt` does not close a door; it asks
politely.

So `/learning` returns **404** — not 403, because on the wrong hostname it
should not exist — unless the hostname matches `LEARNING_HOST`. Preview
deployments are additionally given *no bindings at all* in `wrangler.jsonc`, so
even if the host check were wrong they would have nothing to read. The
localhost exemption is behind `import.meta.env.DEV` and is compiled out of
production builds.

## Uploads

Four things go wrong with a phone photograph, and all four fail silently:

| problem | fix |
|---|---|
| iOS produces HEIC that nothing displays | canvas re-encode to JPEG in the browser |
| an 8 MB camera file | canvas resize to a 2000px long edge; server caps at 8 MB |
| the image is sideways | `createImageBitmap(..., {imageOrientation: 'from-image'})` bakes it into the pixels |
| **EXIF contains the GPS coordinates of the house** | a canvas export has nowhere to put EXIF |

That is the client half, and it runs on a device the boy controls, so it is not
the last line of defence. On the server:

- The type is **sniffed from the magic bytes**. The client's `Content-Type` is
  never used.
- JPEG APP1 (EXIF and XMP) segments are stripped again regardless. APP0 (JFIF
  density) and APP14 (Adobe colour transform) are kept, because dropping either
  changes how the picture renders. *Verified with a synthetic JPEG carrying a
  GPS marker: 154 bytes in, 82 out, marker gone, JFIF intact, structure valid.*
- HEIC that still arrives is rejected with a message an eleven-year-old can act
  on, rather than "unsupported file".

## Serving files back

The R2 bucket is private and has no public URL. Every read goes through
`/learning/api/file/[id]`, which means every read has a role attached and can
be revoked by rotating an epoch.

A public bucket with unguessable keys was the obvious alternative and is much
worse: it makes a child's photographs permanently and unauthenticatedly
readable by anyone who ever sees one link, forever, with no way to take it
back.

Stored images are untrusted content served from our own origin, so the response
carries `X-Content-Type-Options: nosniff` and a
`default-src 'none'; sandbox` CSP.

Coach sheets carry every answer and differ from student sheets by one word in
the filename. They are role-gated in `sheet/[...name].ts`, and the filename is
validated against a strict pattern so it cannot escape the `sheets/` prefix.

## Secrets

| name | where |
|---|---|
| `LEARNING_PW_KID` | `wrangler pages secret` |
| `LEARNING_PW_COACH` | `wrangler pages secret` |
| `LEARNING_COOKIE_KEY` | `wrangler pages secret` |

`.dev.vars` holds local-only equivalents and is gitignored;
`.dev.vars.example` is committed and contains no real values. Do not copy
production secrets into it.

## If something goes wrong

- **A password leaks** → `node scripts/learning-hash.mjs '<new one>'`,
  `wrangler pages secret put`, then bump the epoch for that role so existing
  cookies die.
- **The cookie key leaks** → rotate `LEARNING_COOKIE_KEY`. Every cookie becomes
  invalid immediately, because the signature no longer verifies.
- **A device is lost** → "sign coach out everywhere" on the dashboard.
- **Something was uploaded that should not have been** → it can be superseded
  from the UI; genuine removal means deleting the R2 object by hand, and that
  is irreversible. Export first.
