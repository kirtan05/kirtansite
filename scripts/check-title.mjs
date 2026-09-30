// Post-build checks for /title (docs/superpowers/specs/2026-10-01-title-pitch-page-design.md).
// Run after `npm run build`: node scripts/check-title.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const pagePath = [join(DIST, 'title/index.html'), join(DIST, 'title.html')].find((p) => existsSync(p));
if (!pagePath) {
  console.error('FAIL: no built /title page in dist/');
  process.exit(1);
}
const html = readFileSync(pagePath, 'utf8');
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// Contact
check(html.includes('href="tel:+916360357636"'), 'Call link must be tel:+916360357636');
const mailto = (html.match(/href="(mailto:[^"]+)"/)?.[1] ?? '').replaceAll('&amp;', '&').replaceAll('&#38;', '&');
check(mailto.startsWith('mailto:kirtanjain0504@gmail.com?subject=Title%20file%20request&body='), 'mailto must carry the subject and a body');
check(mailto.includes('%0D%0A'), 'mailto body lines must be separated by encoded CRLF');
check(mailto.includes(encodeURIComponent('Survey / block no.:')), 'mailto body must ask for the survey number');

// Link preview
const meta = (p) => html.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]+)"`))?.[1];
check(meta('og:image') === 'https://kirtanjain.com/title/og.png', 'og:image must be the absolute https URL');
check(!!meta('og:title') && !!meta('og:description'), 'og:title and og:description are required');
const png = join(DIST, 'title/og.png');
if (existsSync(png)) {
  const b = readFileSync(png);
  check(b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630, 'og.png must be 1200x630');
  check(b.length < 300_000, `og.png must be under 300 KB (is ${b.length})`);
} else check(false, 'dist/title/og.png missing');

// Every local asset the page or its CSS points at exists
const cssFiles = [...html.matchAll(/href="(\/_astro\/[^"]+\.css)"/g)].map((m) => join(DIST, m[1]));
const css = cssFiles.map((f) => readFileSync(f, 'utf8')).join('\n') + (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n');
const refs = [
  ...[...html.matchAll(/(?:href|src|content)="(?:https:\/\/kirtanjain\.com)?(\/(?:title|fonts\/title)\/[^"]+)"/g)].map((m) => m[1]),
  ...[...css.matchAll(/url\(['"]?(\/fonts\/title\/[^'")]+)['"]?\)/g)].map((m) => m[1]),
];
check(refs.some((r) => r.endsWith('.woff2')), 'page must load the /fonts/title woff2 files');
for (const r of new Set(refs)) {
  const p = r.endsWith('/') ? join(DIST, r, 'index.html') : join(DIST, r);
  check(existsSync(p), `referenced file missing from dist: ${r}`);
}
check(html.includes('/title/title-file-sample.pdf') && html.includes('/title/title-file-sample-draft.docx'), 'page must link the sample PDF and Word draft');

// No scripts, forms or tracking
check(!/<script\b/i.test(html), 'page must not ship <script>');
check(!/<form\b/i.test(html), 'page must not have a form');

// Copy rules, checked against visible text
const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
const banned = [/captcha/i, /scrap(e|ing|er)/i, /\bbots?\b/i, /automat/i, /\bAI\b/, /seamless/i, /unlock/i, /revolution/i,
  /cutting[- ]edge/i, /effortless/i, /game[- ]chang/i, /leverag/i, /empower/i, /streamlin/i, /hassle[- ]free/i, /one[- ]stop/i];
for (const re of banned) check(!re.test(text), `banned word in copy: ${re}`);
check(text.includes('Names, village and survey number changed'), 'sample must be labelled as changed');
check(text.includes('₹199') && /First 3 survey numbers free/.test(text), 'price line must be present');

// Every Gujarati text run sits under lang="gu"
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<title>[\s\S]*?<\/title>/i, '');
const stack = [];
const re = /<\/?([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g;
let m;
while ((m = re.exec(body))) {
  if (m[3] !== undefined) {
    if (/[઀-૿]/.test(m[3]) && (stack.at(-1)?.lang ?? 'en') !== 'gu') failures.push(`Gujarati outside lang="gu": "${m[3].trim().slice(0, 40)}"`);
    continue;
  }
  const tag = m[1].toLowerCase();
  if (m[0].startsWith('</')) {
    const i = stack.findLastIndex((s) => s.tag === tag);
    if (i >= 0) stack.length = i;
    continue;
  }
  if (VOID.has(tag) || m[2].trim().endsWith('/')) continue;
  stack.push({ tag, lang: m[2].match(/\blang="([^"]+)"/)?.[1] ?? stack.at(-1)?.lang ?? 'en' });
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL: ${f}`).join('\n'));
  process.exit(1);
}
console.log(`check-title: ok (${pagePath})`);
