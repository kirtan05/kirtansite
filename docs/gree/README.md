# /gree — GRE and TOEFL English trainer

Private, one learner, at `https://kirtanjain.com/gree`. Built for daily use on a
phone, the office laptop and the home laptop, all sharing one progress record.

## What's in it

| Screen | What it does |
|---|---|
| Words | 791 words: Barron's 333 high-frequency first, then the rest of *Essential Words for the GRE* (Geer). Each round teaches 5 new words, then tests them. A miss shows the card again and retests it before the round ends. Words answered right come back after 1, 3, 7, 14, 30 and 60 days (Leitner boxes 1–6); a miss drops the word to box 1. Tests get harder as the box rises: meaning → word from meaning → fill-in-the-blank / synonym. |
| Questions | Original GRE-style Sentence Equivalence and Text Completion (1, 2 and 3 blank) with explanations. Every choice that's on the word list is glossed. Missed questions come back the next day, on the same ladder. |
| Writing | Timed editor for the GRE Issue essay, TOEFL academic discussion, TOEFL email and free writing. Drafts are kept on the device and autosaved to D1. |
| Progress | Minutes per day (time on the site while in use, plus logged off-site work), streak, 12-week heatmap, word stages, day-by-day table, settings. |

## How it's built

- `src/pages/gree/index.astro`: login form, or the app shell once signed in.
- `src/scripts/gree/`: the client. `engine.ts` has the pure logic (days in
  Asia/Kolkata, the ladder, test generation), `app.ts` the screens and sync,
  `prompts.ts` the writing tasks.
- `src/pages/gree/api/`: `state` (GET everything), `content` (GET words and
  questions), `sync` (POST answers, card states, time ticks, settings), `log`,
  `essay`, `logout`.
- `src/lib/gree/guard.ts`: host lock, signed cookie (180 days, path `/gree`),
  epoch for "sign out on all devices". Same password format as `/learning`.
- D1 database `gree` (binding `GREE_DB`), schema in `migrations-gree/`.
  Separate from the `/learning` database on purpose.

Writes are idempotent (client uuids for events, `last_at` for card state), so
the client can resend its outbox any number of times. The client keeps an
outbox in localStorage and flushes every 20 s and when the tab is hidden.

Content lives in `src/data/gree/words.json` and `questions.json`, served only
behind the login because the definitions and sentences come from published
books. After editing either file run:

```bash
node scripts/gree-version.mjs   # devices refetch content only when this changes
```

## Secrets

```bash
node scripts/learning-hash.mjs 'new password' | tr -d '\n' | npx wrangler pages secret put GREE_PW --project-name kirtansite
openssl rand -base64 32 | tr -d '\n' | npx wrangler pages secret put GREE_COOKIE_KEY --project-name kirtansite
```

Changing `GREE_COOKIE_KEY` signs out every device. So does the "Sign out on all
devices" button (it bumps the epoch).

## Grading essays

Essays sit in the `essay` table with `feedback` empty. To grade:

```bash
d1() { npx wrangler d1 execute gree --remote --command "$1"; }
d1 "SELECT id, day, task, words, prompt, body FROM essay WHERE feedback IS NULL ORDER BY at DESC LIMIT 1"
# write the feedback, then:
d1 "UPDATE essay SET feedback = '...' WHERE id = '...'"   # double any single quotes
```

The app shows the feedback under the essay.

## Useful queries

```bash
d1 "SELECT day, SUM(seconds)/60 AS min FROM tick GROUP BY day ORDER BY day DESC LIMIT 14"
d1 "SELECT day, COUNT(*) n, SUM(correct) ok FROM answer GROUP BY day ORDER BY day DESC LIMIT 14"
d1 "SELECT box, COUNT(*) FROM card GROUP BY box"
d1 "SELECT item, COUNT(*) misses FROM answer WHERE correct=0 AND kind!='question' GROUP BY item ORDER BY misses DESC LIMIT 20"
```

## Local

```bash
# .dev.vars needs GREE_PW and GREE_COOKIE_KEY (see .dev.vars.example)
npx wrangler d1 execute gree --local --file migrations-gree/0001_init.sql -y
npm run dev   # http://localhost:4321/gree
```
