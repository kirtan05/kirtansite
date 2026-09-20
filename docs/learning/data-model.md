# /learning — the data model

Seventeen tables, of which four matter and the rest support them. The four:
`session`, `problem`, `entry`, `attempt`. Everything on every screen is a query
over `attempt`.

## The spine

```
course ── session ── problem ── problem (sub-parts, via parent_id)
   │         │          │
   │         │          ├── problem_answer      coach-only, a separate table
   │         │          └── problem_topic ── topic
   │         │
   │         ├── task ── task_state             the computer track
   │         └── planned                        which Saturday
   │
   └── strand: 'math' | 'computer'
```

**Why a course above the session.** Burago Year 1 and the computer ladder
advance on independent clocks — sheet 6 and rung 2 at the same time — and a
flat list of sessions cannot express that. It also means Year 2 is a row, not a
migration.

**Why sub-parts are rows.** Sheet 1's problem 1 has parts (b) and (c) with
different answers and different difficulty; so does the cube problem on Sheet 2.
Both Burago and ZIO are graded per sub-part. A per-problem grain silently
averages them away.

**Why `problem` has no statement and no answer.** Statements live in the
Markdown sheets in the `learning` repo, which is where they are authored,
printed, and handed to a child — duplicating them into a database creates two
sources of truth for the same sentence. Answers live in `problem_answer`, a
separate table, so that no query on a kid-role path can reach them by accident.

## What happened

```
entry ────── attempt ────── problem
  │             │
  │             ├── kid_mark      got_it | tried | not_yet      ← his claim
  │             ├── outcome       solved_alone | solved_with_hint
  │             │                 | stuck | not_attempted       ← the record
  │             ├── kind          first | carryover | retest
  │             └── voided_at     an attempt that should not count
  │
  ├── upload ── (R2)
  ├── favourite_problem_id
  └── coach_took_pencil · coach_answered_fast · coach_lectured
```

### `entry` — one evening

Unique on `(session_id, on_date)`. Two distinct timestamps that were one field
in the first draft:

- `closed_at` — **he** finished for today.
- `verified_at` — **his father** graded it.

Keeping them apart is what stops a child's own tick from appearing as a
verified result on every chart downstream. It is also what makes the freshness
banner possible: `verified_at` is the age of the whole dashboard's inputs.

The three `coach_*` booleans are the only numbers in the system about the coach
rather than the boy. They exist because the plan's own largest risk is the
coach talking too much, and nobody else will ever notice it.

### `attempt` — one meeting with one problem

Two columns, not one. `kid_mark` is never written by grading and `outcome` is
never written by him. The gap between them is the single most interesting
quantity the system collects, and one column would average it away.

`kind` is computed **once**, when the row is created, by `attemptKindFor()`,
from the state of the problem at that moment. It is never re-derived, because
by the time you would re-derive it the state has moved on.

| kind | means | contributes to |
|---|---|---|
| `first` | first honest meeting | speed of acquisition |
| `carryover` | met before, still open | "blocked" |
| `retest` | the scheduler asked again | **retention — the only signal that can see forgetting** |

`not_attempted` is excluded from every calculation in `engine.ts`. It means the
evening ran out, not that he could not do it.

### `problem_state` — is it still alive?

`open` | `solved` | `retired`, with a `since` date and a reason.

This is a fact about a problem that outlives any single evening, which is why
it is not a column on `attempt`. Retiring requires a reason — a carry-over that
can be silently dropped is a carry-over that will be.

### `retest` — the forgetting ladder

3 weeks → 10 weeks → 6 months, in `RETEST_STAGES`.

```
state: due → done      passed; advance a stage
       due → failed    and a FRESH retest is created at stage 0
       due → skipped   not asked
       due → retired   the problem was retired
```

Deliberately cheap: one or two extra problems a week. Anything more expensive
gets skipped in November, and a scheduler that gets skipped is worse than none,
because the gaps it leaves still look like data.

### `upload` — evidence

Keys are `entries/<date>/<entry-id>/<upload-id>.<ext>`, so the bucket is
browsable and an export is a directory walk rather than a join.

`superseded_by` rather than deletion. He can retake a bad photograph; the old
one is put away, not destroyed. R2 deletion is irreversible and a mis-tap
should not cost a page of his working.

`mime` is sniffed from the bytes. The browser's `Content-Type` is a claim from
a device an eleven-year-old controls and is never used.

### `task` / `task_state` — the computer track

The computer track is three different shapes of thing — `drill`, `build`,
`concept` — and none of them has a four-way outcome. "Solved with a hint" is
not a thing that happens when you make a folder.

`task_state` mirrors `attempt`'s two-column design: `claimed` is his word for
it, `done` is his father's. The `concept` rungs produce no file at all, which
is exactly why they need a row: they are the ones most likely to be quietly
skipped, and the coach dashboard lists every claimed-but-unconfirmed rung with
"no file attached" beside it.

### `measurement` — measured, not claimed

Typing speed and anything else with a number. Generalised rather than a
`typing_log` table, because the second metric always arrives.

### `break_period` — a fortnight off is not neglect

Exams, travel, Diwali. Nothing derived may score a declared break as a missed
week, and history renders it as a labelled break rather than a hole. A year
from now, *"exams, 2 weeks"* is a fact; an unexplained gap is a reproach.

### `setting` — the cookie epochs

`epoch_kid` and `epoch_coach`. Bumping one invalidates every cookie issued for
that role. This is the whole of "sign out everywhere", and the only real answer
to a coach cookie ending up on the child's laptop.

### `audit`

Logins, uploads, voids, retirements, epoch bumps. Cheap, and the thing you will
want when something looks wrong in eighteen months. Writing to it never fails a
request.

## Conventions

- Dates are `TEXT` `YYYY-MM-DD`, in **Asia/Kolkata**. Workers run UTC; see
  `dates.ts`.
- Timestamps are `TEXT` ISO-8601 UTC.
- Booleans are `INTEGER` 0/1.
- Ids are `TEXT`. Curriculum ids are **derived from content**
  (`prob:burago-y1:2:W1`) so reseeding is idempotent; a reseed that allocated
  fresh ids would orphan every attempt ever recorded. Runtime ids are
  `crypto.randomUUID()`.
- Every enum has a `CHECK` constraint. Every reference has a foreign key.

## Counting the queries

D1 on the free plan allows 50 statements per Worker invocation. The heaviest
page is `/learning/coach`: seven statements in one `batch`, plus two for the
topic map. The export is one statement per table, seventeen in a single batch.
Nothing anywhere is per-row.
