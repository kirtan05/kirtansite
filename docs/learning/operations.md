# /learning — runbook

Everything you will need to do to this, in the order you are likely to need it.

## The resources

| what | name | id |
|---|---|---|
| Pages project | `kirtansite` | git-connected to `github.com/kirtan05/kirtansite` |
| D1 database | `learning` | `a7142589-d293-4233-aad7-d816bdfa3333` |
| R2 bucket | `learning-uploads` | private, no public URL |
| KV namespace | `SESSION` | `bd66b23481b941de8496a8215556344b` — unused, the adapter expects it |

> **`wrangler.jsonc` is the source of truth for this Pages project.** Once that
> file exists, Cloudflare ignores the bindings and variables panel in the
> dashboard. If you change a binding there and nothing happens, this is why.
> Secrets are the exception: they are still managed with
> `wrangler pages secret`.

## Deploying

The Pages project builds from `main` on push. There is nothing else to do.

```bash
npm run build          # the guard runs here; a mistake fails the build
git push
```

The build **will fail loudly** if any `/learning` route would be prerendered.
That is the point of `src/integrations/learning-guard.mjs`; see
`review.md` for what it is preventing.

## Running it locally

```bash
cp .dev.vars.example .dev.vars
node scripts/learning-hash.mjs 'kid'    # paste into LEARNING_PW_KID
node scripts/learning-hash.mjs 'coach'  # paste into LEARNING_PW_COACH

npx wrangler d1 execute learning --local --file migrations/0001_init.sql -y
npx wrangler d1 execute learning --local --file migrations/0002_task_state.sql -y
node scripts/learning-seed.mjs > /tmp/seed.sql
npx wrangler d1 execute learning --local --file /tmp/seed.sql -y

npm run dev            # http://localhost:4321/learning
```

The adapter's `platformProxy` supplies the bindings locally, reading
`wrangler.jsonc`. Without it every `/learning` page returns 503.

The sheets are served from R2, so local sheet links 404 until you put them
there too:

```bash
npx wrangler r2 object put learning-uploads/sheets/S02-STUDENT.pdf \
  --file ../learning/sessions/S02-Sheet2-STUDENT.pdf \
  --content-type application/pdf --local
```

## Adding next week's sheet

This is the routine you will run most, roughly weekly.

**1. Write the sheet.** In the `learning` repo:

```bash
cd ~/Desktop/projects/learning/sessions
$EDITOR S03-student.md S03-coach.md
python3 _mkfig.py        # only if the sheet has matchstick figures
./_build.sh S03          # -> S03-Sheet3-STUDENT.pdf and -COACH.pdf
```

**2. Put the PDFs where the site can serve them.**

```bash
cd ~/Desktop/projects/kirtansite
for v in STUDENT COACH; do
  npx wrangler r2 object put learning-uploads/sheets/S03-$v.pdf \
    --file ../learning/sessions/S03-Sheet3-$v.pdf \
    --content-type application/pdf --remote
done
```

The filename the site asks for is `<sheet_slug>-STUDENT.pdf`, so the R2 key is
`sheets/S03-STUDENT.pdf` regardless of what the local build called it.

**3. Add the problems.** In `scripts/learning-curriculum.mjs`, add an `S03`
array and register it in `SHEETS`. Each row is
`[ref, label, kind, answer, [topics]]`.

- `label` shows in the grade queue, so make it recognisable at a glance three
  weeks later: *"the beaver's logs"*, not *"problem 1"*.
- `kind` is `warmup` | `problem` | `starred` | `part`.
- A ref ending in a letter (`1b`) is automatically a sub-part of `1`.
- Tag two or three topics. Tagging generously is right for a system one person
  maintains; the topic page already says what that costs.

**4. Seed it.** Idempotent, so run it as often as you like.

```bash
node scripts/learning-seed.mjs --apply
```

**5. Commit.** The curriculum is code; it belongs in git.

## Backups

**Run this before every migration.** It is not optional: D1 and R2 are one
account holding several years of a child's work.

```bash
node scripts/learning-export.mjs ~/learning-backup-$(date +%F)
```

Produces a dated folder containing every row as JSON, every uploaded file at
its original path, and a `README.md` explaining the tables to whoever opens it
later. Nothing in it needs this website, an account, or any particular
software.

The coach dashboard also has a **download everything (json)** link, which gives
the database but not the files.

## Migrations

```bash
node scripts/learning-export.mjs ~/learning-backup-$(date +%F)   # first
$EDITOR migrations/0003_whatever.sql
npx wrangler d1 execute learning --local  --file migrations/0003_whatever.sql -y
npm run dev     # check it
npx wrangler d1 execute learning --remote --file migrations/0003_whatever.sql -y
```

D1 has no transactional DDL worth relying on. Keep each migration small enough
that re-running the previous export is an acceptable recovery.

## Passwords

```bash
node scripts/learning-hash.mjs 'three random words here'
echo 'pbkdf2$10000$...' | npx wrangler pages secret put LEARNING_PW_KID --project-name kirtansite
```

Then bump the epoch so old cookies die — the "sign coach out everywhere" button
does this for the coach role; for the kid role:

```bash
npx wrangler d1 execute learning --remote --command \
  "UPDATE setting SET value = CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='epoch_kid'"
```

## Useful queries

```bash
d1() { npx wrangler d1 execute learning --remote --command "$1"; }

# how stale is the dashboard?
d1 "SELECT MAX(on_date) FROM entry WHERE verified_at IS NOT NULL"

# what is still open, and for how long
d1 "SELECT p.ref, s.seq, ps.since FROM problem_state ps
    JOIN problem p ON p.id=ps.problem_id JOIN session s ON s.id=p.session_id
    WHERE ps.state='open' ORDER BY ps.since"

# the re-test ladder
d1 "SELECT p.ref, r.stage, r.due_on, r.state FROM retest r
    JOIN problem p ON p.id=r.problem_id ORDER BY r.due_on"

# computer rungs he claimed and nobody confirmed
d1 "SELECT t.title, ts.on_date FROM task_state ts
    JOIN task t ON t.id=ts.task_id WHERE ts.state='claimed'"

# move a planned session
d1 "UPDATE planned SET on_date='2026-10-10' WHERE session_id='sess:burago-y1:3'"
```

## Troubleshooting

**Everything under /learning 404s.** The hostname does not match
`LEARNING_HOST` in `wrangler.jsonc`. This is also what preview deployments are
supposed to do.

**503 "not configured on this deployment".** Bindings are missing. On a preview
deployment that is intentional. On production, check that `wrangler.jsonc`
reached the build — remember it overrides the dashboard, not the other way
round.

**The build fails with `learning-guard`.** It is telling you the exact file
that is missing `export const prerender = false;`. Add the line. Do not disable
the guard; read `review.md` first.

**Login always fails.** Check the secret is the full
`pbkdf2$10000$salt$hash` record and not the plaintext password.

**Error 1102 / "exceeded CPU limit" on login only.** The iteration count is too
high for the free plan. Generate a new record with a lower count; it is stored
in the record, so no code change is needed.

**A sheet link 404s.** The PDF is not in R2 under `sheets/<slug>-STUDENT.pdf`,
or you are signed in as the kid and asked for a `-COACH.pdf`.

**Local D1 commands print a `FileHandle` error.** An old wrangler on Node 26.
`npm i -D wrangler@latest`. The command usually succeeded anyway.
