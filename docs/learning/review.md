# The review, and what was done about it

Before any of this was built, the plan was reviewed across eight dimensions —
Cloudflare feasibility, schema, the statistics of the adaptive engine, child UX,
security, abandonment risk, scope, and curriculum fit — with every finding
challenged twice: once for technical truth, once for whether it was
proportionate to a two-person family project rather than enterprise advice.

That produced **64 findings**. 31 were adversarially verified before the run was
stopped; the load-bearing technical claims were then checked by hand against
the repository and against Cloudflare's current documentation, which corrected
one of them.

This file records what happened to each. It is here because a list of problems
that nobody can tell you the fate of is worse than no list: in a year, the
question will not be "what was wrong with the plan" but "was this thought
about, and what was decided".

**Legend** — `FIXED` the code does something specific about it · `ACCEPTED` the
risk is real and deliberately taken · `REJECTED` the finding did not survive
checking · `DEFERRED` real, but not yet.

---

## The five that changed the design

These are not the most technically interesting. They are the ones that would
have made the finished thing worse in a way that was hard to reverse.

### 1. The streak had to go — `FIXED`

> *Streak is a completion-contingent reward and will break by ~week 10.*

A streak rewards unbroken completion, so the first interrupted week — illness,
exams, a wedding — converts a record of work into a record of failure, and the
research on completion-contingent rewards says it takes the underlying
motivation with it. For something meant to last three years, that is exactly
backwards.

There is no streak anywhere in the code. `kidTotals()` returns only quantities
that can never fall.

### 2. His screen was a debt ledger — `FIXED`

> *His one screen is a debt ledger; every progress view is on dad's screen.*

In the first draft, every view of progress lived on the coach dashboard and the
boy's screen showed only what he owed. Fixed in three ways: cumulative counts
that cannot decrease, carry-overs renamed "still alive" and moved below the
work rather than above it, and `/learning/history` open to both roles, because
a record of a child that the child may not read is not his record.

### 3. The adaptive engine was false precision — `FIXED`

> *Topic states classify on n≈4; the 70% threshold is unreachable noise.*

"Strong = first-pass ≥ 70%" cannot be estimated from four attempts. The
thresholds are gone. `MIN_N = 6` in `engine.ts`, below which a topic reports
`too_few` and prints its raw counts — *"2 alone · 3 with a hint · 1 stuck — too
few to call"*. The topic map page says in plain words that it is a prompt for
attention and not a measurement.

### 4. Auth failed open — `FIXED`

> *`output` defaults to static, so a forgotten `prerender = false` publishes an
> unguarded page.*

The worst finding in the set, and worse than it was stated. `astro.config.mjs`
sets no `output`, so Astro 5 defaults to static. One forgotten line on one page
produces two failures at once and neither of them errors: the page builds to a
static file that never runs the auth check, **and** `@astrojs/sitemap` publishes
it, because a prerendered page is a real page, and `robots.txt` said `Allow: /`.

Three fixes, because one was not enough:

- `src/integrations/learning-guard.mjs` fails the build, naming the file, if any
  `/learning` route would be prerendered. This is tested by deliberately
  removing the line and confirming the build stops.
- The sitemap has an explicit filter for `/learning`.
- `robots.txt` now disallows `/learning` and `/certificate`.

And a fourth, which is the one that actually closes it: `/learning` refuses to
serve on any hostname other than `LEARNING_HOST`, so preview deployments and
`*.pages.dev` are not a second unauthenticated front door. The localhost
exemption is compiled out of production builds.

### 5. There were no dates anywhere — `FIXED`

> *No dates anywhere, and ZIO is roughly ten weeks away.*

The plan counted weeks. An Indian school year yields roughly 34 usable
Saturdays, not 52, so a week-counting plan reports failure every exam season.
Every date in the system is now a real calendar date; the seed lays out real
Saturdays; `break_period` exists so a declared break is a fact rather than a
gap; and nothing derived treats a declared break as a missed week.

---

## Cloudflare and deployment

| Finding | Disposition |
|---|---|
| `@astrojs/sitemap` publishes `/learning/` even with `prerender=false` | **FIXED** — filter plus the build guard plus robots.txt |
| Auth fails OPEN because `output` defaults to static | **FIXED** — see above |
| Repo deploys to Pages; the adapter dropped Pages support in v13 | **REJECTED** — checked by hand. The installed `@astrojs/cloudflare` 12.6.12 emits `_worker.js` + `_routes.json`, which is Pages format, and the build was verified to still produce it. The claim was about a version that is not installed. |
| Bindings will be undefined in `astro dev` | **FIXED** — `platformProxy` enabled in the adapter config, pointed at `wrangler.jsonc`. The second half of the claim (that this makes the dashboard read-only) is *true and intended*: once `wrangler.jsonc` exists it is the source of truth for the Pages project, which is documented in `operations.md` so nobody edits the dashboard and wonders why nothing changed. |
| R2 is private; the plan never says how the coach sees an image | **FIXED** — `/learning/api/file/[id]` serves from R2 behind the role check, with `nosniff` and a `sandbox` CSP, since stored images are untrusted content on our own origin |
| Free-plan CPU is 10ms per invocation; three parts exceed it | **FIXED** — this is why PBKDF2 runs at 10,000 iterations and why the count is stored *in* the password record, so it can be retuned with no deploy. Exceeding the ceiling would kill the login request outright, which is a worse failure than a cheaper KDF on a shared family password. |
| Phone photos go up and come back at full size | **FIXED** — the upload form re-encodes through a canvas to a long edge of 2000px before sending; the server caps at 8 MB |
| Three public-exposure surfaces: `.dev.vars`, `*.pages.dev`, robots/sitemap | **FIXED** — `.dev.vars` gitignored with a committed `.dev.vars.example`; `*.pages.dev` closed by the host lock and by giving the preview environment no bindings at all; robots and sitemap as above |
| Free-tier arithmetic is fine except 50 D1 queries per invocation | **ACCEPTED, with care** — the heaviest page (`/learning/coach`) issues 7 statements in one `batch` plus 2 for the topic map. The export endpoint is one statement per table, 17 total. Nothing is per-row. |

## The adaptive engine and its statistics

| Finding | Disposition |
|---|---|
| Topic states classify on n≈4 | **FIXED** — `MIN_N`, raw counts, `too_few` |
| `solved_alone` conflates a right answer with a right reason | **ACCEPTED, and written down** — this is real and unfixable without doubling the grading cost. The coach notes carry the mitigation instead: *"How do you know?"* asked every time, including when he is right. Recorded here so that nobody later mistakes `solved_alone` for "understood". |
| Re-tests re-use the identical problem, so they measure recall of an answer | **ACCEPTED** — partially mitigated by the 3-week minimum interval and by the fact that Burago problems are arguments, not answers. A reserve bank of equivalent problems is the real fix and is deferred; see below. |
| A failed re-test recolours the topic but never reschedules the item | **FIXED** — `applyGrade()` re-opens the problem *and* queues a fresh re-test at stage 0. Verified: a failed re-test produces `problem_state = open, reason = 'failed re-test'` and a new row due 21 days out. |
| alone-vs-hint measures the coach's improving restraint, not the boy | **ACCEPTED, and instrumented** — genuinely true and the reason `entry` carries `coach_took_pencil`, `coach_answered_fast`, `coach_lectured`. If the hint rate falls while those three also fall, the confound is visible rather than invisible. |
| Generous 2–3 topic tags make one bad Saturday look like three failing topics | **ACCEPTED, and stated on the page** — the topic map says this in as many words |
| No way to void an attempt | **FIXED** — `attempt.voided_at` / `void_reason`, with a control on the grade view; voided attempts are excluded from every query in `engine.ts` |
| The engine models only the maths strand | **FIXED** — `task` / `task_state` / `measurement` for the computer track, surfaced on both screens |
| The one input the engine needs is unobservable in the session as designed | **PARTLY FIXED** — grading is now explicitly a *later* act, done from the sheet and the photographs, not something to be captured live while teaching. The run sheet in the coach notes allocates it to afterwards. |

## Abandonment risk — the findings that matter most in month eight

| Finding | Disposition |
|---|---|
| Real parent load is ~3–4 h/week; the plan budgeted 2 minutes and omitted sheet prep | **ACCEPTED, and the plan was rewritten to say so.** The two-minute claim was only ever about grading. Sheet prep is the real cost and `sessions/_build.sh` exists to cut it. |
| Missed weeks are unrecoverable data plus three cascading failures | **PARTLY FIXED** — `break_period`, and the freshness banner that greys the dashboard. Data from a missed week is genuinely unrecoverable and no software fixes that. |
| Everything keyed to weeks; ~34 usable Saturdays | **FIXED** — real dates throughout |
| No defined floor, no kill criteria | **ACCEPTED** — now in `PLAN.md` under "when to stop" |
| Make the plain folder the source of truth, site a read view | **REJECTED, deliberately** — considered and turned down. Grading on a phone in four taps is the one thing that keeps Saturday happening; editing Markdown on a laptop is not. The durability concern behind it is real, so the export moved from phase 5 to day one: `scripts/learning-export.mjs` writes a plain dated folder of JSON and original files. |
| The site brings a phone into a room the coach notes say must be phone-free | **FIXED in the notes, not the code** — Sheet 2's run sheet puts the phone back in the room only in the last five minutes, for the photograph, and makes that the computer lesson |
| The schema records the son and drops the coach | **FIXED** — the three coach self-report columns on `entry` |
| Coach outcome overwrites the kid's mark | **FIXED** — `kid_mark` and `outcome` are different columns and neither writes the other |
| Phone upload breaks on HEIC, size, orientation, silent failure | **FIXED** — canvas re-encode handles all four; server sniffs the bytes; HEIC that still arrives gets an error message that tells an eleven-year-old what to do instead |
| No plan for how he reaches the site or stays signed in | **FIXED** — his cookie lasts 90 days; the coach's lasts 12 hours |
| No concept of a legitimate break | **FIXED** — `break_period`, shown in history as a labelled break rather than a hole |
| "Which problem did you like most?" is dropped by the data model | **FIXED** — `entry.favourite_problem_id`, asked on the close-of-evening form |
| The evidence regime has no sunset; he cannot retake a bad photo | **FIXED** — re-uploading supersedes rather than deletes (`upload.superseded_by`); nothing is ever destroyed, because R2 deletion is irreversible and a mis-tap should not cost a page of working |

## Scope

| Finding | Disposition |
|---|---|
| Scope to the 2 screens a spreadsheet can't do; cut the other six | **REJECTED, on instruction** — the full build was chosen explicitly. Recorded here because the finding is sound and the risk it names is real: more screens is more to maintain, and this is the finding to revisit first if the thing starts to feel like a chore. |
| Phase 1 is not the minimum; ship a prerendered page this week | **OVERTAKEN** — the whole thing shipped at once |
| Phase 4 inverted: re-test is the payoff, topic map is the trap | **AGREED, and reflected in the UI** — the re-test list sits in the weekly brief where it is acted on; the topic map is a separate page with a warning at the bottom |
| DB-generated PDFs replace a pipeline that already works | **AGREED** — sheets stay Markdown in the repo, built by `_build.sh`, uploaded to R2. The database stores a slug, not a document. |
| Nothing onboards a boy who can't type or name a file | **FIXED** — the twelve-rung computer ladder in `scripts/learning-curriculum.mjs`, where rung one is *photograph the sheet and upload it yourself* |
| Streak and kid tap-to-mark: one writes nowhere, one scolds | **FIXED** — no streak; his marks write to `kid_mark` and are shown to the coach beside each problem while grading |

## Schema

| Finding | Disposition |
|---|---|
| `attempt` cannot hold the son's claim and the coach's record | **FIXED** — two columns |
| No sheet table: carry-over and retirement state has nowhere to live | **FIXED** — `problem_state`, which owns open/solved/retired independently of any evening |
| `attempt` anchored to entry, not the sheet; `kind` and date can't be trusted | **FIXED** — `kind` is computed once at row creation by `attemptKindFor()` from the state at that moment, and never re-derived |
| `retest_queue` has no lifecycle and the wrong grain | **FIXED** — `retest.state` is `due`/`done`/`failed`/`skipped`/`retired`, with `resolved_attempt_id` |
| "Folder screenshot missing" and the WPM chart are unqueryable | **FIXED** — `task_state` makes a missing rung a row you can select; `measurement` generalises `typing_log` |
| Problem grain: warm-ups and sub-parts collapsed into one row | **FIXED** — `problem.parent_id`, `problem.kind` including `warmup` and `part` |
| `problem.statement` duplicates the sheets and ships answers to the kid | **FIXED** — problems carry no statement at all; answers live in `problem_answer`, which no kid-role query touches |
| Section 3 has no types, constraints, timestamps or migration path | **FIXED** — `migrations/*.sql`, CHECK constraints on every enum, FKs throughout |

## Curriculum

| Finding | Disposition |
|---|---|
| The spine is a flat list: no course above the session | **FIXED** — `course` > `session` > `problem` > part |
| Attempt grain is per-problem; both curricula grade per sub-part | **FIXED** — sub-parts are rows |
| Six of 29 sessions are not problem sets; three have no set at all | **FIXED** — `session.kind` distinguishes `problem_set` / `game` / `olympiad`. Sessions 12, 21 and 29 are seeded as olympiads with no problems, so they contribute no phantom zeroes. |
| The curriculum cannot be seeded automatically: the numerals are images | **CONFIRMED, and worked around** — the seed is hand-written in `learning-curriculum.mjs`. Verified: the book's problem numbers really are images in the EPUB. |
| Only two problems get defended, but every outcome is stored as equally strong | **ACCEPTED** — noted here as a known limitation of the record |
| The computer track is three shapes crammed into `curriculum`+`problem` | **FIXED** — `task.kind` is `drill` / `build` / `concept`, each with its own evidence requirement |
| Topic taxonomy is undefined, and phase 4 is entirely a query over it | **FIXED** — 25 topics defined in the seed, 17 maths and 8 computer |
| Re-testing the identical problem; no reserve bank | **DEFERRED** — the honest state of affairs. The schema does not prevent adding a reserve bank later; nothing has been built. |

## Security

| Finding | Disposition |
|---|---|
| The coach cookie will end up on the eleven-year-old's laptop | **FIXED** — the coach cookie lasts 12 hours, and "sign coach out everywhere" bumps an epoch in `setting` that invalidates every cookie of that role |
| R2 key scheme unspecified; a public bucket makes the photos permanently public | **FIXED** — the bucket is private, keys are `entries/<date>/<entry>/<id>.<ext>`, and every read goes through an authenticated route |
| Phone photos carry home GPS; MIME type is client-supplied | **FIXED** — canvas re-encode drops EXIF entirely; the server strips JPEG APP1 again regardless, and sniffs the type from the bytes. Verified with a synthetic JPEG carrying a GPS marker: 154 bytes in, 82 bytes out, marker gone, JFIF density preserved. |
| Backup deferred to phase 5, but the destructive window is phases 2–4 | **FIXED** — the export exists now, both as an endpoint and as a script |
| Role separation is at the HTML layer only | **FIXED** — `requireRole()` is the only way to obtain a database handle, and it returns one already bound to a role; answers are in a table that kid-path queries do not reference |
| Nothing addresses the child's future access to a multi-year file about him | **PARTLY FIXED** — he can read the whole history today, and the export means the record can be handed to him as a folder. What happens when he is sixteen remains an open question and belongs in `PLAN.md`, not in code. |
| Be honest about brute force: free-tier controls don't work; most hardening is theatre | **ACCEPTED, and said out loud** — `security.md` states plainly what this is and is not |

---

## What is still open

1. **No reserve problem bank.** Re-tests reuse the identical problem, so they
   measure recall as well as retention. Real, unfixed, and cheap to improve
   later by tagging equivalent problems.
2. **Retention data says nothing until roughly week 15.** Do not tune anything
   on three data points; the topic page says so.
3. **`solved_alone` still conflates answer and reason.** Mitigated only by how
   the coach asks, never by the schema.
4. **Eight routes is more than two.** The scope finding was overruled, not
   refuted. If this starts feeling like a chore, that is where to cut.
