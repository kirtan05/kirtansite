# /learning — architecture

A private progress record for one eleven-year-old's maths and computing, added
inside this Astro site. No new hosting, no server to maintain, no accounts.

## The shape of it

```
kirtanjain.com/learning
        │
        ▼
  Cloudflare Pages ─ kirtansite ─ git-connected to github.com/kirtan05/kirtansite
        │
        ├── static HTML for every other page on the site
        └── _worker.js for /learning/**   (on-demand, one Worker invocation each)
                 │
                 ├── D1   LEARNING_DB      the record
                 ├── R2   LEARNING_FILES   photographs and printed sheets
                 └── KV   SESSION          unused; the adapter expects it
```

Everything under `/learning` is on-demand rendered. Everything else on the site
stays static and is untouched by this.

## Why each piece

| Piece | Choice | Why |
|---|---|---|
| Framework | Astro 5, already here | the site exists; adding routes is free |
| Rendering | `prerender = false` per route | keeps the rest of the site static, and static is what makes the rest of the site fast |
| Auth | HMAC-signed HttpOnly cookie, two shared passwords | no email, no accounts, no password resets, works on a phone in one go |
| Database | Cloudflare D1 | the whole dataset tops out around ten thousand rows in three years |
| Files | Cloudflare R2 | no egress fees, private by default |
| Secrets | `wrangler pages secret` | never in the repo |
| Config | `wrangler.jsonc` | bindings live in git next to the code that uses them |

## Files

```
wrangler.jsonc                      Pages config: bindings, vars, preview env
astro.config.mjs                    adapter, sitemap filter, the build guard
migrations/
  0001_init.sql                     the schema
  0002_task_state.sql               the computer track's state
scripts/
  learning-curriculum.mjs           the curriculum, as data
  learning-seed.mjs                 turns it into idempotent SQL
  learning-hash.mjs                 makes a password record
  learning-export.mjs               the whole record as a plain folder
src/
  integrations/learning-guard.mjs   fails the build if a /learning route would be static
  layouts/LearningLayout.astro      the shell
  lib/learning/
    auth.ts        passwords, cookie signing
    guard.ts       the gate every route goes through
    queries.ts     every SQL statement, kid-safe and coach-only separated
    engine.ts      topic states, the re-test ladder, the weekly brief
    attempts.ts    deciding whether an attempt is first / carryover / retest
    files.ts       type sniffing, EXIF stripping, R2 keys
    dates.ts       IST dates, breaks, re-test intervals
  pages/learning/
    index.astro              login (handles its own POST)
    today.astro              his screen
    history.astro            everything, by date — both roles
    session/[seq].astro      one sheet, every time it has been worked on
    sheet/[...name].ts       printed sheets out of R2, coach versions role-gated
    coach/index.astro        the weekly brief and the queue
    coach/grade.astro        four taps per problem
    coach/topics.astro       the topic map
    api/login  logout  mark  grade  task  entry  upload  export  file/[id]
```

## The request path

Every route under `/learning` — page or endpoint — begins the same way:

```ts
const gate = await requireRole(Astro, 'coach');   // or 'any'
if (!gate.ok) return gate.response;
const { role, db, files } = gate.ctx;
```

`requireRole` answers four questions and any "no" ends the request:

1. **Is this the right hostname?** `LEARNING_HOST`. A preview deployment is a
   second front door onto the same data, and it 404s. The localhost exemption
   is compiled out of production builds.
2. **Are the bindings here?** Preview deployments are given none on purpose, so
   they degrade to a 503 rather than pointing at the real database.
3. **Is the cookie valid?** Signature, then expiry.
4. **Is its epoch current?** `setting.epoch_coach` / `epoch_kid`. Bumping one
   invalidates every cookie of that role — the answer to "the coach cookie is
   now on his laptop". Cached per isolate for a minute.

The important structural property: **a caller cannot get a database handle
without a role attached to it.** Role separation therefore holds at the query
layer, not in the templates.

## The two writes that matter

Everything else in the system is derived from exactly two acts.

**He marks a problem.** `POST /learning/api/mark` writes `attempt.kid_mark` and
nothing else, ever. It is a claim.

**His father grades it.** `POST /learning/api/grade` writes `attempt.outcome`
and then does everything that follows from it, in one `applyGrade()` call:

```
solved              → problem closes, joins the re-test ladder at 3 weeks
solved on a re-test → ladder advances: 3 weeks → 10 weeks → 6 months
FAILED a re-test    → problem RE-OPENS and is re-queued from the start
stuck               → stays open; a carry-over, not a failure
not attempted       → nothing changes at all. It is not evidence.
```

That fourth line is the one the first draft got wrong. Without it, a forgotten
item is noticed once and then never asked about again.

## What is deliberately not here

- **No streak.** See `review.md`.
- **No percentages below six observations.** `MIN_N` in `engine.ts`.
- **No client-side framework.** Two small inline scripts, no hydration.
- **No statements or answers in the boy's queries.** Statements live in the
  repo sheets; answers live in `problem_answer`.
- **No public bucket.** Every file read goes through an authenticated route.
- **No deletes.** Superseding, voiding and retiring exist; destroying does not.
