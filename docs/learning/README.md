# /learning

A private progress record at `kirtanjain.com/learning`, for one eleven-year-old
being coached through maths and computing olympiad preparation over several
years. Two shared passwords, two screens that matter, and one input.

## Start here

| | |
|---|---|
| [architecture.md](architecture.md) | how the pieces fit, what is in which file, the request path |
| [data-model.md](data-model.md) | the seventeen tables and why each one exists |
| [security.md](security.md) | what this protects and what it plainly does not |
| [operations.md](operations.md) | the runbook: deploy, add a sheet, back up, fix things |
| [review.md](review.md) | the 64-finding review, and what was done about each |

The teaching side — the sheets, the coach notes, the curriculum plan — lives in
the separate `learning` repo, not here.

## The one-paragraph version

Three jobs, in priority order: **make the work happen**, **notice what is
actually going on**, and **keep the record**. Only the second justifies
software; the other two could be done on paper.

The whole system has exactly one human input: at the Saturday defence, the
coach marks each problem one of four ways — *solved alone*, *solved with a
hint*, *stuck*, *not attempted*. Every chart, colour, carry-over and re-test
date is derived from that. If grading ever costs more than a couple of minutes,
it stops happening in November, and every derived number then freezes while
continuing to look authoritative. That is the system's single point of failure
and the dashboard says so, in red, above everything else.

## The four decisions worth knowing

**There is no streak.** A reward contingent on unbroken completion breaks the
first week life interrupts, and takes the motivation with it. Wrong mechanic
for a three-year project.

**Nothing on his screen can go down.** Cumulative counts only; carry-overs are
called "still alive" and sit below the work. The first draft of that screen
showed him only what he owed.

**No percentage below six observations.** With four data points "72% mastery"
is a confident-looking random number. Below the threshold the topic map prints
raw counts and the words *too few to call*.

**His marks are claims; his father's are the record.** They are different
columns and neither overwrites the other, because the disagreement between them
is the most interesting thing here.

## The failure this is most defended against

`astro.config.mjs` sets no `output`, so Astro defaults to static. Forget
`export const prerender = false;` on one page and it builds to a static file
that never runs the auth check **and** gets published to the sitemap — two
failures, no error. The build now refuses, by name, and the sitemap filter,
`robots.txt` and a hostname lock sit behind that.
