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
 *
 * This is not a nice-to-have. D1 and R2 are one account holding several years
 * of a child's work; the export is what makes that survivable, and the window
 * in which it matters most is the months of schema churn, not the calm years
 * afterwards. Run it before every migration, and on a timer if you can.
 *
 * It reads through wrangler, so it needs nothing but a logged-in CLI.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const dest = process.argv[2];
if (!dest) {
  console.error('usage: node scripts/learning-export.mjs <directory>');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

function d1(sql) {
  const raw = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'learning', '--remote', '--json', '--command', sql],
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

writeFileSync(
  join(dest, 'README.md'),
  `# Circle — exported record

Exported ${new Date().toISOString()} from kirtanjain.com/learning.

- \`learning-${today}.json\` — every row of the database, one key per table.
- \`entries/<date>/<entry id>/\` — the photographs and files uploaded that evening.
- \`sheets/\` — the printed sheets, student and coach versions.

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
