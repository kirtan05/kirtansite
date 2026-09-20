#!/usr/bin/env node
/**
 * Make a password record for wrangler secrets.
 *
 *   node scripts/learning-hash.mjs 'some pass phrase'
 *   node scripts/learning-hash.mjs 'some pass phrase' 20000
 *
 * Prints `pbkdf2$<iterations>$<salt>$<hash>`. Feed it to:
 *   npx wrangler pages secret put LEARNING_PW_KID --project-name kirtansite
 *
 * On the iteration count. The Workers free plan allows 10ms of CPU per
 * invocation, and exceeding it kills the request — so a login page that is too
 * secure simply does not work. 10,000 rounds of PBKDF2-SHA256 measures
 * comfortably inside the budget. That is weak by web-login standards and
 * strong by "two shared passwords on a private family URL" standards, which is
 * what this actually is. The count is stored in the record, so raising or
 * lowering it later needs no code change and no deploy.
 */
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const password = process.argv[2];
const iterations = Number(process.argv[3] ?? 10000);

if (!password) {
  console.error('usage: node scripts/learning-hash.mjs <password> [iterations]');
  process.exit(1);
}

const b64u = (b) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');

console.log(`pbkdf2$${iterations}$${b64u(salt)}$${b64u(hash)}`);
