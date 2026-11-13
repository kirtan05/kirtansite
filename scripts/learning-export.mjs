#!/usr/bin/env node
/**
 * Export everything to a plain folder.
 *
 *   node scripts/learning-export.mjs ~/learning-backup
 *
 * Produces:
 *
 *   learning-backup/
 *     learning-2026-09-20.json      the whole database
 *     README.md                     what this is, for whoever opens it later
 *     entries/2026-09-26/<entry>/…  every uploaded file, by date
 *     sheets/…                      every printed sheet
 *     pcquest-2026-09-20.json       PC Quest: packs, devices, every event (if bound)
 *     pcquest-assets/<pack>/…       the images those packs use
 *
 * This is not a nice-to-have. D1 and R2 are one account holding several years
 * of a child's work; the export is what makes that survivable, and the window
 * in which it matters most is the months of schema churn, not the calm years
 * afterwards. Run it before every migration, and on a timer if you can.
 *
 * It reads through wrangler, so it needs nothing but a logged-in CLI.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const dest = process.argv[2];
if (!dest) {
  console.error('usage: node scripts/learning-export.mjs <directory>');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

function d1(sql, db = 'learning') {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  // wrangler prefixes its banner; the JSON is the first '[' onwards.
  return JSON.parse(raw.slice(raw.indexOf('[')))[0].results;
}

const TABLES = [
  'course', 'session', 'problem', 'problem_answer', 'topic', 'problem_topic', 'task',
  'planned', 'break_period', 'entry', 'attempt', 'problem_state', 'retest',
  'upload', 'measurement', 'setting', 'audit',
];

mkdirSync(dest, { recursive: true });

const dump = { exported_at: new Date().toISOString(), schema_version: 1 };
for (const t of TABLES) {
  process.stderr.write(`  ${t}…`);
  dump[t] = d1(`SELECT * FROM ${t}`);
  process.stderr.write(` ${dump[t].length}\n`);
}
writeFileSync(join(dest, `learning-${today}.json`), JSON.stringify(dump, null, 2));

// ── the files ───────────────────────────────────────────────────────────
process.stderr.write('files…\n');
for (const u of dump.upload) {
  const target = join(dest, u.r2_key);
  mkdirSync(dirname(target), { recursive: true });
  try {
    execFileSync('npx', ['wrangler', 'r2', 'object', 'get', `learning-uploads/${u.r2_key}`, '--file', target, '--remote'], {
      stdio: 'ignore',
    });
  } catch {
    process.stderr.write(`  MISSING ${u.r2_key}\n`);
  }
}

// ── PC Quest, when its database is bound ────────────────────────────────
// Its own database (see migrations-pcquest/). Skipped until wrangler.jsonc
// carries a real database_id for it. Asset bytes go out as files, not JSON.
const wranglerConf = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const pcquestBound = /"database_name":\s*"pcquest"/.test(wranglerConf) && !wranglerConf.includes('00000000-0000-0000-0000-000000000000');
if (pcquestBound) {
  process.stderr.write('pcquest…\n');
  const pq = { exported_at: new Date().toISOString(), schema_version: 1 };
  for (const t of ['pq_pack', 'pq_device', 'pq_event', 'pq_approval', 'pq_reset', 'pq_release']) {
    process.stderr.write(`  ${t}…`);
    pq[t] = d1(`SELECT * FROM ${t}`, 'pcquest');
    process.stderr.write(` ${pq[t].length}\n`);
  }
  pq.pq_asset = d1('SELECT pack_id, path, sha256, length(bytes) AS size FROM pq_asset', 'pcquest');
  writeFileSync(join(dest, `pcquest-${today}.json`), JSON.stringify(pq, null, 2));
  for (const a of pq.pq_asset) {
    const safe = String(a.path).split(/[\\/]/).filter((p) => p && p !== '.' && p !== '..');
    const target = join(dest, 'pcquest-assets', a.pack_id, ...safe);
    mkdirSync(dirname(target), { recursive: true });
    const [row] = d1(`SELECT hex(bytes) AS hex FROM pq_asset WHERE sha256 = '${a.sha256.replace(/[^0-9a-f]/g, '')}' LIMIT 1`, 'pcquest');
    writeFileSync(target, Buffer.from(row?.hex ?? '', 'hex'));
  }
} else {
  process.stderr.write('pcquest: not bound in wrangler.jsonc, skipped\n');
}

writeFileSync(
  join(dest, 'README.md'),
  `# Circle — exported record

Exported ${new Date().toISOString()} from kirtanjain.com/learning.

- \`learning-${today}.json\` — every row of the database, one key per table.
- \`entries/<date>/<entry id>/\` — the photographs and files uploaded that evening.
- \`sheets/\` — the printed sheets, student and coach versions.
- \`pcquest-<date>.json\` — PC Quest, the Windows task app: the signed task
  packs, his laptop(s), and every event it sent (\`pq_event\`: one row per thing
  he did, \`at\` by the laptop's clock, \`received_at\` by the server's).
  \`pcquest-assets/\` holds the pictures those packs use.

Nothing here needs the website, an account, or any particular software: the
JSON is plain text and the photographs are ordinary JPEGs. If the site has gone
away, this folder is still the record, and that is the point of it.

The tables that matter, in the order they make sense:

| table | what it holds |
|---|---|
| \`session\` | the 29 Burago evenings and the computer ladder |
| \`problem\` | every problem and sub-part on a sheet |
| \`entry\` | one evening that actually happened |
| \`attempt\` | what he claimed, and what he could defend, per problem |
| \`problem_state\` | whether a problem is still alive, cracked, or retired |
| \`retest\` | the forgetting ladder: 3 weeks, 10 weeks, 6 months |
| \`upload\` | the file each photograph became |

\`attempt.outcome\` is the only judgement in the system. Everything else is
derived from it.
`,
);

console.error(`\nwrote ${dest}`);
