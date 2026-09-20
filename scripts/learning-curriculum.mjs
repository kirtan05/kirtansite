/**
 * The curriculum, as data.
 *
 * This file is the seed for the `course` / `session` / `problem` / `task`
 * tables. It is hand-written rather than parsed out of the book, because the
 * book's problem numerals are images — there is no text to scrape — and
 * because the useful part (which topics a problem exercises, and what counts
 * as its answer) is a judgement that has to be made by a person anyway.
 *
 * Only sessions that have an actual printed sheet carry problems. The rest are
 * seeded as titles so that the calendar and the "next sheet" logic work, and
 * they get their problems added when their sheet is written.
 *
 * Run `node scripts/learning-seed.mjs --apply` after editing.
 */

export const START_DATE = '2026-09-26'; // the Saturday Sheet 2 is planned for

/** Sessions with no problem set of their own. Burago has six such evenings;
 *  three of them (the olympiads) have no set at all, and scoring them as if
 *  they were problem sets would put three fictitious zeroes in the record. */
const KIND = {
  4: 'game', 9: 'game', 12: 'olympiad', 15: 'game',
  18: 'game', 21: 'olympiad', 24: 'game', 29: 'olympiad',
};

const BURAGO_TITLES = [
  'How to Solve a Problem',
  'Knights and Liars',
  'How to Turn Lies into Truth',
  'Mathematical Auction',
  'Word Problems and Common Sense',
  'More Word Problems',
  'Odd and Even Numbers I — Magic Paper Cups',
  'Odd and Even Numbers II — Definitions and Properties',
  'Halloween Math Hockey I',
  'Odd and Even Numbers III — Alternations',
  'Weighings and Counterfeit Coins',
  'Mathematical Olympiad I',
  'Meet the Cube — First Lesson in 3D Geometry',
  'Cross Sections — Second Lesson in 3D Geometry',
  'Mathematical Auction',
  'Combinatorics I',
  'Combinatorics II',
  'Mathematical Hockey II',
  'Numerical Puzzles I — Runaway Digits',
  'Numerical Puzzles II — Encrypted Problems',
  'Mathematical Olympiad II',
  'Divisibility I — Definition and Properties',
  'Divisibility II — Prime Numbers and Prime Factorization',
  'Mathematical Auction',
  'Divisibility III — Divisibility Rules',
  'Divisibility IV — Relatively Prime Numbers',
  'Mathematical Games of Strategy I',
  'Mathematical Games of Strategy II',
  'Mathematical Olympiad III',
];

// ───────────────────────────────────────────────────────────── topics

export const TOPICS = [
  // math
  ['counting', 'Counting and cuts', 'math'],
  ['invariants', 'Invariants — what does not change', 'math'],
  ['contradiction', 'Assume, then contradict', 'math'],
  ['implication', 'Implication — all A are B', 'math'],
  ['knights', 'Knights and liars', 'math'],
  ['logic-grid', 'Logic grids', 'math'],
  ['pigeonhole', 'Pigeonhole', 'math'],
  ['language', 'Language and precision', 'math'],
  ['underdetermined', 'Not enough information', 'math'],
  ['word-problems', 'Word problems and pictures', 'math'],
  ['exhaustive', 'Finding every answer', 'math'],
  ['spatial', 'Spatial and matchstick puzzles', 'math'],
  ['geometry-3d', '3D geometry', 'math'],
  ['parity', 'Parity', 'math'],
  ['divisibility', 'Divisibility', 'math'],
  ['combinatorics', 'Combinatorics', 'math'],
  ['strategy', 'Games of strategy', 'math'],
  // computer
  ['files', 'Files and folders', 'computer'],
  ['typing', 'Typing', 'computer'],
  ['apps', 'Using an application', 'computer'],
  ['shortcuts', 'Keyboard shortcuts', 'computer'],
  ['web', 'The web, downloads and uploads', 'computer'],
  ['sheets', 'Spreadsheets', 'computer'],
  ['terminal', 'The terminal', 'computer'],
  ['programming', 'Programming', 'computer'],
];

// ─────────────────────────────────────────────────── problems we have sheets for

/**
 * ref, label, kind, answer, [topics]
 *
 * `label` is what shows in the grade queue, so it has to be recognisable at a
 * glance three weeks later — "the beaver's logs", not "problem 1".
 */
const S01 = [
  ['W1', 'five brothers, one sister', 'warmup', '6 children', ['language']],
  ['W2', 'two coins, two purses', 'warmup', 'one purse goes inside the other', ['language', 'contradiction']],
  ['1', "Brendan's logs — 25 cuts", 'problem', '26 pieces', ['counting', 'invariants']],
  ['1b', 'two logs, 40 cuts', 'part', '42 pieces — every cut adds one, wherever it falls', ['counting', 'invariants']],
  ['1c', 'three logs, 50 cuts', 'part', '53 pieces', ['counting', 'invariants']],
  ['2', 'matchstick fish, move three', 'problem', 'reflect the body; see the coach figure', ['spatial']],
  ['3a', 'three of the same colour', 'problem', '5 — four could be 2 red and 2 blue', ['pigeonhole']],
  ['3b', 'three blue', 'part', '17 — 16 could be all 14 red plus 2 blue', ['pigeonhole']],
  ['4', '39 socks, any two include a blue', 'problem', 'exactly one red', ['contradiction']],
  ['5', 'four girls, four cities', 'problem', 'Emma SF · Bella NY · Alice Boston · Rachel Seattle', ['logic-grid']],
  ['6', 'the plane over Alaska', 'problem', 'no — it lands east of where it started', ['geometry-3d']],
];

const S02 = [
  ['W1', 'gnome and the sardines', 'warmup', '10', ['word-problems']],
  ['W2', 'hippo, giraffe, rhino', 'warmup', 'cannot tell — not enough information', ['underdetermined']],
  ['W3', 'three into six, move two', 'warmup', 'Roman VI', ['spatial']],
  ['1', 'Max and the fish', 'problem', 'wrong — all fish swim does not make swimmers fish', ['implication']],
  ['2', 'Bim and Bom, one question', 'problem', '"Are you a liar?" — both answer no', ['knights']],
  ['3', 'the gold bar', 'problem', '15 pounds', ['word-problems']],
  ['4', 'litter out of the dustpan', 'problem', 'turn the pan upside down; see the coach figure', ['spatial']],
  ['5', 'the koala and the tree', 'problem', '16 days and 15 nights', ['word-problems', 'invariants']],
  ['6', 'Sam, Bob and Tom', 'problem', 'Bob liar, Tom knight, Sam unknowable', ['knights', 'contradiction', 'underdetermined']],
  ['7', 'the owlery', 'starred', '(2,2,0), (1,1,1), (0,0,2)', ['exhaustive', 'language']],
  ['8', "Johnny's painted cube", 'starred', '8 · 12 · 6 · 1', ['geometry-3d', 'counting']],
  ['8b', 'could fewer than six cuts work?', 'part', 'no — the centre cube needs six distinct cuts', ['invariants', 'contradiction']],
];

export const SHEETS = {
  1: { slug: 'S01', problems: S01 },
  2: { slug: 'S02', problems: S02 },
};

// ─────────────────────────────────────────────────────── computer track

/**
 * The computer ladder.
 *
 * He does not know what a file is. Every rung is therefore a thing he *does*
 * that produces a piece of evidence, and the evidence is usually the same act
 * as the tracking — photographing the sheet and uploading it IS the files
 * lesson. Nothing here is a lecture about computers.
 */
export const COMPUTER = [
  ['C1', 'Files and folders', [
    ['a', 'Photograph the sheet and upload it yourself', 'drill', 'photo'],
    ['b', 'Find the photo again on the phone, and say where it lives', 'concept', 'none'],
    ['c', 'Make a folder called Circle on the laptop', 'build', 'screenshot'],
  ]],
  ['C2', 'What a name is', [
    ['a', 'Rename three files so the names say what they are', 'drill', 'screenshot'],
    ['b', 'Find out what the bit after the dot means', 'concept', 'none'],
    ['c', 'First typing measurement — whatever it is', 'drill', 'measurement'],
  ]],
  ['C3', 'Saving and finding', [
    ['a', 'Write something, save it, close it, open it again', 'build', 'file'],
    ['b', 'Find a file by searching rather than by remembering', 'drill', 'screenshot'],
  ]],
  ['C4', 'Down and up', [
    ['a', 'Download a file and say where it went', 'drill', 'screenshot'],
    ['b', 'Upload that same file back here', 'drill', 'file'],
  ]],
  ['C5', 'Writing a document', [
    ['a', 'Type up one solution properly, with headings', 'build', 'file'],
    ['b', 'Export it as a PDF', 'drill', 'file'],
  ]],
  ['C6', 'The shortcuts', [
    ['a', 'Copy, paste, undo, select all, find — without the mouse', 'drill', 'screenshot'],
    ['b', 'Typing measurement', 'drill', 'measurement'],
  ]],
  ['C7', 'Putting things where they go', [
    ['a', 'Build a folder tree for school and Circle', 'build', 'screenshot'],
    ['b', 'Move last month of files into it', 'drill', 'screenshot'],
  ]],
  ['C8', 'Spreadsheets I', [
    ['a', 'Cells, rows, a column of numbers, and a total', 'build', 'file'],
  ]],
  ['C9', 'Spreadsheets II', [
    ['a', 'Chart his own typing scores over time', 'build', 'file'],
    ['b', 'Typing measurement', 'drill', 'measurement'],
  ]],
  ['C10', 'The terminal', [
    ['a', 'List a folder, change into it, make a new one', 'drill', 'screenshot'],
    ['b', 'Say what a path is', 'concept', 'none'],
  ]],
  ['C11', 'Programming I', [
    ['a', 'Print something, store something, read something typed in', 'build', 'file'],
  ]],
  ['C12', 'Programming II', [
    ['a', 'A loop', 'build', 'file'],
    ['b', "A program that solves Brendan's logs for any number of cuts", 'build', 'file'],
  ]],
];

// ───────────────────────────────────────────────────────── the calendar

/** Declared breaks. A fortnight of exams is a fact about the calendar and must
 *  never be scored as a fortnight of neglect. Confirm these dates. */
export const BREAKS = [
  ['2026-11-06', '2026-11-15', 'Diwali'],
];

export function buragoSessions() {
  return BURAGO_TITLES.map((title, i) => ({
    seq: i + 1,
    title,
    kind: KIND[i + 1] ?? 'problem_set',
    sheet_slug: SHEETS[i + 1]?.slug ?? null,
  }));
}
