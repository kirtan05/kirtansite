/**
 * /gree study engine: days, the Leitner ladder, and question generation.
 * Pure functions only; no DOM, no network.
 */

export interface Word {
  id: number;
  w: string;
  pos: string | null;
  d: string;          // Barron's definition
  plain: string;      // the GRE meaning in a few words
  ex: string | null;  // example sentence, target wrapped as [[form]]
  mn: string | null;  // mnemonic
  syn: string[];
  ant: string[];
  group: string | null;
  trap: string | null;
  hf: boolean;        // in Barron's 333 high-frequency list
}

export interface Card {
  box: number;   // 0 = taught, not passed yet; 1..6 = passed
  due: string;   // YYYY-MM-DD
  r: number;
  w: number;
  first: string; // ISO
  last: string;  // ISO
}

export interface Question {
  id: string;
  type: 'se' | 'tc1' | 'tc2' | 'tc3';
  diff: 'easy' | 'medium' | 'hard';
  stem: string;
  choices?: string[];
  blanks?: string[][];
  answer: number[];
  explain: string;
}

// ────────────────────────────────────────── days (always India time)

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

export function dayOf(d: Date = new Date()): string {
  return fmt.format(d);
}

export function addDays(day: string, n: number): string {
  const t = new Date(day + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400_000);
}

// ────────────────────────────────────────── the ladder

/** Days until the next review after reaching each box. */
export const INTERVALS = [0, 1, 3, 7, 14, 30, 60];
export const TOP_BOX = INTERVALS.length - 1;

/** Right on the first try of the session: climb. Otherwise: back to box 1. */
export function promote(card: Card | undefined, today: string, now: string, firstTryRight: boolean, isNew: boolean): Card {
  const prev = card ?? { box: 0, due: today, r: 0, w: 0, first: now, last: now };
  let box: number;
  if (!firstTryRight) box = 1;
  else if (isNew || prev.box === 0) box = 1;
  else box = Math.min(prev.box + 1, TOP_BOX);
  return {
    box,
    due: addDays(today, INTERVALS[box]),
    r: prev.r + (firstTryRight ? 1 : 0),
    w: prev.w + (firstTryRight ? 0 : 1),
    first: prev.first,
    last: now,
  };
}

export type Stage = 'new' | 'learning' | 'known' | 'mastered';
export function stageOf(c: Card | undefined): Stage {
  if (!c) return 'new';
  if (c.box <= 2) return 'learning';
  if (c.box <= 4) return 'known';
  return 'mastered';
}

// ────────────────────────────────────────── randomness

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function pick<T>(a: T[], n: number, ok: (x: T) => boolean): T[] {
  const out: T[] = [];
  for (const x of shuffle(a)) {
    if (out.length >= n) break;
    if (ok(x)) out.push(x);
  }
  return out;
}

// ────────────────────────────────────────── word tests

export type Mode = 'meaning' | 'word' | 'blank' | 'synonym';

export interface Test {
  mode: Mode;
  word: Word;
  prompt: string;        // HTML-safe text; blanks rendered by the UI
  options: string[];
  answer: number;
  serifOptions: boolean;
  note?: string;
}

const norm = (s: string) => s.toLowerCase().trim();

/** Distractor words: same part of speech, different meaning group, not near-synonyms. */
function foils(all: Word[], w: Word, n: number): Word[] {
  const bad = new Set([norm(w.w), ...w.syn.map(norm), ...w.ant.map(norm)]);
  const same = (x: Word) =>
    x.id !== w.id &&
    !bad.has(norm(x.w)) &&
    !x.syn.map(norm).includes(norm(w.w)) &&
    (!w.group || x.group !== w.group);
  const samePos = pick(all, n, (x) => same(x) && (!w.pos || x.pos === w.pos));
  if (samePos.length >= n) return samePos;
  return samePos.concat(pick(all, n - samePos.length, (x) => same(x) && !samePos.includes(x)));
}

export function blankSentence(ex: string): { text: string; form: string } | null {
  const m = ex.match(/\[\[([^\]]+)\]\]/);
  if (!m) return null;
  return { text: ex.replace(/\[\[[^\]]+\]\]/g, '\u0000'), form: m[1] };
}

export function makeTest(all: Word[], w: Word, mode: Mode): Test {
  if (mode === 'blank' && (!w.ex || !blankSentence(w.ex))) mode = 'word';
  if (mode === 'synonym' && !w.syn.some((s) => !s.includes(' ') && norm(s) !== norm(w.w))) mode = 'meaning';

  if (mode === 'meaning') {
    const f = foils(all, w, 3);
    const opts = shuffle([w, ...f]);
    return { mode, word: w, prompt: w.w, options: opts.map((x) => x.plain), answer: opts.indexOf(w), serifOptions: false };
  }
  if (mode === 'word') {
    const f = foils(all, w, 3);
    const opts = shuffle([w, ...f]);
    return { mode, word: w, prompt: w.plain, options: opts.map((x) => x.w), answer: opts.indexOf(w), serifOptions: true };
  }
  if (mode === 'blank') {
    const b = blankSentence(w.ex!)!;
    const f = foils(all, w, 3);
    const opts = shuffle([w, ...f]);
    const inflected = norm(b.form) !== norm(w.w);
    return {
      mode, word: w, prompt: b.text, options: opts.map((x) => x.w), answer: opts.indexOf(w), serifOptions: true,
      note: inflected ? 'The word may appear in a different form in the sentence.' : undefined,
    };
  }
  // synonym: pick the synonym that a GRE answer choice would pair it with
  const syn = shuffle(w.syn.filter((s) => !s.includes(' ') && norm(s) !== norm(w.w)))[0];
  const exclude = new Set([norm(syn), norm(w.w), ...w.syn.map(norm), ...w.ant.map(norm)]);
  const pool: string[] = [];
  for (const x of shuffle(all)) {
    if (pool.length >= 3) break;
    if (x.id === w.id || (w.group && x.group === w.group) || (w.pos && x.pos !== w.pos)) continue;
    const cand = x.syn.find((s) => !s.includes(' ') && !exclude.has(norm(s)));
    if (cand && !pool.includes(cand)) pool.push(cand);
  }
  const opts = shuffle([syn, ...pool]);
  return { mode: 'synonym', word: w, prompt: w.w, options: opts, answer: opts.indexOf(syn), serifOptions: true };
}

/** Which kind of test a word gets, by how well it is known. */
export function modeFor(card: Card | undefined, kind: 'new' | 'review' | 'redo', attempt: number): Mode {
  if (kind === 'new') return 'meaning';
  if (kind === 'redo') return attempt % 2 ? 'word' : 'meaning';
  const box = card?.box ?? 1;
  const r = Math.random();
  if (box <= 1) return r < 0.5 ? 'word' : 'meaning';
  if (box === 2) return r < 0.6 ? 'blank' : 'word';
  return r < 0.4 ? 'blank' : r < 0.75 ? 'synonym' : 'word';
}

// ────────────────────────────────────────── practice questions

export function isCorrect(q: Question, picked: number[]): boolean {
  if (q.type === 'se') {
    const a = [...q.answer].sort().join(','), p = [...picked].sort().join(',');
    return a === p;
  }
  return q.answer.length === picked.length && q.answer.every((x, i) => x === picked[i]);
}
