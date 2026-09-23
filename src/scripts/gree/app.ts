/**
 * /gree client. Four screens (Words, Questions, Writing, Progress) over one
 * local copy of the learner's state, synced to D1 through an outbox so that
 * nothing is lost when the office wifi drops or the phone sleeps.
 */
import {
  addDays, dayOf, daysBetween, isCorrect, makeTest, modeFor, promote, shuffle, stageOf,
  type Card, type Question, type Test, type Word,
} from './engine';
import { TASKS, taskById, type Task } from './prompts';

// ═══════════════════════════════════════════ small helpers

const $view = document.getElementById('view') as HTMLElement;
const $toast = document.getElementById('toast') as HTMLElement;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const LS = {
  get<T>(k: string): T | null {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* storage full or blocked: the server copy is the real one anyway */
    }
  },
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const nowIso = () => new Date().toISOString();
const today = () => dayOf();

let toastTimer = 0;
function toast(msg: string) {
  $toast.textContent = msg;
  $toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => $toast.classList.remove('on'), 2200);
}

function mmss(sec: number) {
  const s = Math.max(0, Math.floor(Math.abs(sec)));
  return `${sec < 0 ? '+' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function prettyDay(d: string) {
  return new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Render an example sentence with the target word in bold. */
function exampleHtml(ex: string) {
  return esc(ex).replace(/\[\[([^\]]+)\]\]/g, '<b>$1</b>');
}

// ═══════════════════════════════════════════ state

const device =
  LS.get<string>('gree.device') ??
  (() => {
    const d = `${/Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 'phone' : 'computer'}-${Math.random().toString(36).slice(2, 6)}`;
    LS.set('gree.device', d);
    return d;
  })();

let words: Word[] = [];
let byId = new Map<number, Word>();
let byLemma = new Map<string, Word>();
let questions: Question[] = [];
const cards = new Map<number, Card>();
const qstate = new Map<string, Card>();
let settings: Record<string, string> = {};
interface DayStat { s: number; n: number; ok: number; new: number; q: number; qok: number; logm: number }
let days: Record<string, DayStat> = {};
let logs: { id: string; day: string; kind: string; minutes: number; note: string | null }[] = [];
let essays: { id: string; day: string; task: string; prompt: string; words: number; seconds: number | null; graded: number; at: string }[] = [];

const npd = () => Number(settings.new_per_day ?? 20);
const greDate = () => settings.gre_date ?? '2026-10-31';
const toeflDate = () => settings.toefl_date ?? '2026-10-17';

function dayStat(d = today()): DayStat {
  return (days[d] ??= { s: 0, n: 0, ok: 0, new: 0, q: 0, qok: 0, logm: 0 });
}

// ═══════════════════════════════════════════ outbox + sync

interface Outbox {
  answers: any[];
  cards: Record<string, any[]>;
  qstates: Record<string, any[]>;
  ticks: any[];
  settings: Record<string, unknown>;
}
const emptyBox = (): Outbox => ({ answers: [], cards: {}, qstates: {}, ticks: [], settings: {} });
let outbox: Outbox = { ...emptyBox(), ...(LS.get<Outbox>('gree.outbox') ?? {}) };
const saveBox = () => LS.set('gree.outbox', outbox);
const boxEmpty = (b: Outbox) =>
  !b.answers.length && !b.ticks.length && !Object.keys(b.cards).length && !Object.keys(b.qstates).length && !Object.keys(b.settings).length;

function signedOut() {
  location.href = '/gree';
}

let flushing = false;
async function flush(keepalive = false) {
  if (flushing || boxEmpty(outbox)) return;
  flushing = true;
  const sending = outbox;
  outbox = emptyBox();
  saveBox();
  try {
    const res = await fetch('/gree/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive,
      body: JSON.stringify({
        device,
        answers: sending.answers,
        cards: Object.values(sending.cards),
        qstates: Object.values(sending.qstates),
        ticks: sending.ticks,
        settings: sending.settings,
      }),
    });
    if (res.status === 401) return signedOut();
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    // Put everything back in front of whatever was queued meanwhile.
    outbox = {
      answers: [...sending.answers, ...outbox.answers],
      cards: { ...sending.cards, ...outbox.cards },
      qstates: { ...sending.qstates, ...outbox.qstates },
      ticks: [...sending.ticks, ...outbox.ticks],
      settings: { ...sending.settings, ...outbox.settings },
    };
    saveBox();
  } finally {
    flushing = false;
  }
}

function saveCard(id: number, c: Card) {
  cards.set(id, c);
  outbox.cards[id] = [id, c.box, c.due, c.r, c.w, c.first, c.last];
  saveBox();
}
function saveQ(id: string, c: Card) {
  qstate.set(id, c);
  outbox.qstates[id] = [id, c.box, c.due, c.r, c.w, c.last];
  saveBox();
}
function saveSetting(k: string, v: string | number) {
  settings[k] = String(v);
  outbox.settings[k] = v;
  saveBox();
  flush();
}
function recordAnswer(kind: 'new' | 'review' | 'redo' | 'question', item: string | number, mode: string, correct: boolean, ms: number) {
  outbox.answers.push({ id: uid(), at: nowIso(), day: today(), kind, item: String(item), mode, correct, ms: Math.round(ms) });
  saveBox();
  const d = dayStat();
  d.n++;
  if (correct) d.ok++;
  if (kind === 'question') {
    d.q++;
    if (correct) d.qok++;
  }
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (res.status === 401) {
    signedOut();
    throw new Error('signed out');
  }
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function pullState() {
  const s = await api('/gree/api/state');
  cards.clear();
  for (const [id, box, due, r, w, first, last] of s.cards) cards.set(id, { box, due, r, w, first, last });
  qstate.clear();
  for (const [id, box, due, r, w, last] of s.qstate) qstate.set(id, { box, due, r, w, first: last, last });
  // Anything this device has not managed to send yet is newer than the server.
  for (const [id, box, due, r, w, first, last] of Object.values(outbox.cards)) cards.set(id, { box, due, r, w, first, last });
  for (const [id, box, due, r, w, last] of Object.values(outbox.qstates)) qstate.set(id, { box, due, r, w, first: last, last });
  settings = { ...s.settings, ...Object.fromEntries(Object.entries(outbox.settings).map(([k, v]) => [k, String(v)])) };
  days = s.days;
  logs = s.logs;
  essays = s.essays;
  return s.contentVersion as string;
}

async function loadContent(version: string) {
  const cached = LS.get<{ version: string; words: Word[]; questions: Question[] }>('gree.content');
  const c = cached?.version === version ? cached : await api('/gree/api/content');
  if (c !== cached) LS.set('gree.content', c);
  words = c.words;
  questions = c.questions;
  byId = new Map(words.map((w) => [w.id, w]));
  byLemma = new Map(words.map((w) => [w.w.toLowerCase(), w]));
}

// ═══════════════════════════════════════════ time on task
// Counts a second only while this tab is visible and was used in the last 90s.

let lastInput = Date.now();
let pendingSeconds = 0;
let area = 'study';
for (const ev of ['pointerdown', 'keydown', 'scroll', 'input', 'touchstart']) {
  addEventListener(ev, () => (lastInput = Date.now()), { passive: true, capture: true });
}
setInterval(() => {
  if (document.visibilityState !== 'visible' || Date.now() - lastInput > 90_000) return;
  pendingSeconds++;
  dayStat().s++;
}, 1000);
function flushTicks() {
  if (pendingSeconds <= 0) return;
  outbox.ticks.push({ id: uid(), day: today(), seconds: pendingSeconds, area });
  pendingSeconds = 0;
  saveBox();
}
setInterval(() => {
  flushTicks();
  flush();
}, 20_000);
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'hidden') {
    flushTicks();
    flush(true);
  } else {
    // Back on this device: pick up anything done on another one.
    try {
      await flush();
      await pullState();
      if (!session && !qset && !writing) render();
    } catch {
      /* offline: keep working from local state */
    }
  }
});

// ═══════════════════════════════════════════ router

type Tab = 'study' | 'practice' | 'write' | 'progress';
const TABS: Tab[] = ['study', 'practice', 'write', 'progress'];
const currentTab = (): Tab => {
  const h = location.hash.slice(1).split('/')[0] as Tab;
  return TABS.includes(h) ? h : 'study';
};

function render() {
  const tab = currentTab();
  area = tab;
  document.querySelectorAll<HTMLAnchorElement>('.tabs a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  if (tab === 'study') session ? renderStep() : studyHome();
  else if (tab === 'practice') qset ? renderQ() : practiceHome();
  else if (tab === 'write') writing ? renderEditor() : writeHome();
  else progressView();
}
addEventListener('hashchange', () => {
  flushTicks();
  render();
  window.scrollTo(0, 0);
});

function on(sel: string, fn: (e: Event, el: HTMLElement) => void) {
  $view.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', (e) => fn(e, el)));
}

// ═══════════════════════════════════════════ WORDS

type Step = { t: 'teach'; id: number; i: number; n: number } | { t: 'test'; id: number; kind: 'new' | 'review' | 'redo'; attempt: number };

interface Session {
  rounds: Step[][];
  round: Step[];
  pos: number;
  total: number;
  done: number;
  first: Map<number, boolean>; // result of the first test of each word this session
  missed: Set<number>;
  test?: Test;
  shownAt: number;
  answered: number | null;
}
let session: Session | null = null;

function newToday(): number {
  const t = today();
  let n = 0;
  for (const c of cards.values()) if (dayOf(new Date(c.first)) === t) n++;
  return n;
}
function dueIds(): number[] {
  const t = today();
  return [...cards.entries()]
    .filter(([, c]) => c.box >= 1 && c.due <= t)
    .sort((a, b) => a[1].due.localeCompare(b[1].due) || a[1].box - b[1].box)
    .map(([id]) => id);
}
const stuckIds = () => [...cards.entries()].filter(([, c]) => c.box === 0).map(([id]) => id);
const unseen = () => words.filter((w) => !cards.has(w.id));

function studyHome() {
  const due = dueIds();
  const stuck = stuckIds();
  const newLeft = Math.max(0, npd() - newToday());
  const learned = [...cards.values()].filter((c) => c.box >= 1).length;
  const nothing = !due.length && !stuck.length && !newLeft;
  const gre = daysBetween(today(), greDate());

  $view.innerHTML = `
    <h2>Words</h2>
    <p class="muted">${gre >= 0 ? `${gre} days to the GRE.` : ''} ${learned} of ${words.length} words learned.</p>
    <div class="stats">
      <div class="stat"><b>${due.length}</b><span>due for review</span></div>
      <div class="stat"><b>${newLeft}</b><span>new words left today</span></div>
      <div class="stat"><b>${Math.round(dayStat().s / 60) + dayStat().logm}</b><span>minutes today</span></div>
    </div>
    ${
      nothing
        ? `<div class="note"><strong>Done for today.</strong><p class="muted">Every review is cleared and today's new words are in. Add a few more, or switch to Questions.</p></div>
           <div class="row"><button class="btn primary" data-go="more">Learn 5 more words</button><a class="btn" href="#practice">Practise questions</a></div>`
        : `<button class="btn primary wide" data-go="all">Start: ${[due.length && `${due.length} review${due.length === 1 ? '' : 's'}`, stuck.length && `${stuck.length} unfinished`, newLeft && `${Math.min(newLeft, unseen().length)} new`].filter(Boolean).join(', ')}</button>
           <div class="row" style="margin-top:.6rem">
             ${due.length && newLeft ? `<button class="btn" data-go="review">Reviews only</button><button class="btn" data-go="new">New words only</button>` : ''}
           </div>`
    }
    <h3>How a session works</h3>
    <ul class="plain-list muted">
      <li>You learn 5 new words, then get tested on those 5.</li>
      <li>Miss one and you see the card again, then it's retested before the round ends.</li>
      <li>Get it right and it comes back later: in 1 day, then 3, 7, 14, 30 and 60. A miss sends it back to 1 day.</li>
      <li>Tests change as a word gets easier for you: meaning, then the word from its meaning, then fill-in-the-blank and synonyms, as on the GRE.</li>
      <li>Barron's 333 high-frequency words come first, then the rest of Essential Words for the GRE.</li>
    </ul>`;
  on('[data-go]', (_e, el) => startSession(el.dataset.go as any));
}

function startSession(kind: 'all' | 'review' | 'new' | 'more') {
  const rounds: Step[][] = [];
  if (kind === 'all' || kind === 'review') {
    const due = dueIds();
    for (let i = 0; i < due.length; i += 10) {
      rounds.push(shuffle(due.slice(i, i + 10)).map((id) => ({ t: 'test', id, kind: 'review', attempt: 0 })));
    }
  }
  if (kind !== 'review') {
    const newLeft = kind === 'more' ? 5 : Math.max(0, npd() - newToday());
    const ids = [...stuckIds(), ...unseen().slice(0, newLeft).map((w) => w.id)];
    for (let i = 0; i < ids.length; i += 5) {
      const g = ids.slice(i, i + 5);
      rounds.push([
        ...g.map((id, j): Step => ({ t: 'teach', id, i: j + 1, n: g.length })),
        ...shuffle(g).map((id): Step => ({ t: 'test', id, kind: 'new', attempt: 0 })),
      ]);
    }
  }
  if (!rounds.length) return toast('Nothing to study right now');
  const total = rounds.reduce((n, r) => n + r.length, 0);
  session = { rounds: rounds.slice(1), round: rounds[0], pos: 0, total, done: 0, first: new Map(), missed: new Set(), shownAt: 0, answered: null };
  renderStep();
}

function advance() {
  const s = session!;
  s.done++;
  s.pos++;
  s.test = undefined;
  s.answered = null;
  if (s.pos >= s.round.length) {
    const next = s.rounds.shift();
    if (!next) return finishSession();
    s.round = next;
    s.pos = 0;
  }
  renderStep();
  window.scrollTo(0, 0);
}

function progressBar() {
  const s = session!;
  const pct = Math.min(100, Math.round((s.done / Math.max(1, s.total)) * 100));
  return `<div class="progressline" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
}

function wordCard(w: Word, compact = false) {
  return `
    ${compact ? '' : `<p class="head"><span class="mark">${esc(w.w)}</span></p>`}
    <p class="pos">${esc(w.pos ?? '')}${w.hf ? ' · high-frequency' : ''}</p>
    <p class="plain">${esc(w.plain)}</p>
    <p class="def">${esc(w.d)}</p>
    ${w.ex ? `<p class="ex">${exampleHtml(w.ex)}</p>` : ''}
    <dl class="facts">
      ${w.syn?.length ? `<div><dt>Same as</dt><dd>${esc(w.syn.join(', '))}</dd></div>` : ''}
      ${w.ant?.length ? `<div><dt>Opposite</dt><dd>${esc(w.ant.join(', '))}</dd></div>` : ''}
      ${w.mn ? `<div><dt>Remember it</dt><dd>${esc(w.mn)}</dd></div>` : ''}
      ${w.group ? `<div><dt>Word family</dt><dd>${esc(w.group)}</dd></div>` : ''}
    </dl>
    ${w.trap ? `<p class="trap">Watch out: ${esc(w.trap)}</p>` : ''}`;
}

function renderStep() {
  const s = session!;
  const step = s.round[s.pos];
  const w = byId.get(step.id);
  if (!w) return advance();

  if (step.t === 'teach') {
    if (!cards.has(w.id)) {
      const t = nowIso();
      saveCard(w.id, { box: 0, due: today(), r: 0, w: 0, first: t, last: t });
    }
    $view.innerHTML = `
      ${progressBar()}
      <p class="kicker">New word ${step.i} of ${step.n}</p>
      ${wordCard(w)}
      <button class="btn primary wide" data-next>${step.i === step.n ? 'Test me on these' : 'Next word'}</button>
      <p><button class="btn link" data-quit>End session</button></p>`;
    requestAnimationFrame(() => $view.querySelector('.mark')?.classList.add('on'));
    on('[data-next]', advance);
    on('[data-quit]', finishSession);
    return;
  }

  const card = cards.get(w.id);
  if (!s.test) {
    s.test = makeTest(words, w, modeFor(card, step.kind, step.attempt));
    s.shownAt = performance.now();
  }
  const t = s.test;
  const label = step.kind === 'new' ? 'Test' : step.kind === 'redo' ? 'Try again' : 'Review';
  const left = s.round.length - s.pos;
  let promptHtml = '';
  if (t.mode === 'meaning') promptHtml = `<p class="kicker">What does this mean?</p><p class="head"><span class="mark">${esc(t.prompt)}</span></p>`;
  else if (t.mode === 'synonym') promptHtml = `<p class="kicker">Closest in meaning to</p><p class="head"><span class="mark">${esc(t.prompt)}</span></p>`;
  else if (t.mode === 'word') promptHtml = `<p class="kicker">Which word means</p><p class="prompt">${esc(t.prompt)}${w.pos ? ` <span class="pos">(${esc(w.pos)})</span>` : ''}</p>`;
  else promptHtml = `<p class="kicker">Fill the blank</p><p class="prompt">${esc(t.prompt).replace('\u0000', '<span class="blank"></span>').replace(/\u0000/g, '<span class="blank"></span>')}</p>${t.note ? `<p class="muted small">${esc(t.note)}</p>` : ''}`;

  $view.innerHTML = `
    ${progressBar()}
    <p class="kicker">${label} · ${left} left in this round</p>
    ${promptHtml}
    <div class="opts" role="group" aria-label="Answers">
      ${t.options.map((o, i) => `<button class="opt ${t.serifOptions ? 'serif' : ''}" data-i="${i}"><span class="k">${i + 1}</span><span>${esc(o)}</span></button>`).join('')}
    </div>
    <p class="row" style="justify-content:space-between"><button class="btn link" data-i="-1">I don't know</button><button class="btn link" data-quit>End session</button></p>
    <div id="after"></div>`;
  if (s.answered !== null) showAnswer(s.answered, true);
  on('[data-i]', (_e, el) => showAnswer(Number(el.dataset.i)));
  on('[data-quit]', finishSession);
}

function showAnswer(i: number, replay = false) {
  const s = session!;
  const step = s.round[s.pos] as Extract<Step, { t: 'test' }>;
  const t = s.test!;
  const w = t.word;
  const right = i === t.answer;

  if (!replay) {
    if (s.answered !== null) return;
    s.answered = i;
    recordAnswer(step.kind, w.id, t.mode, right, performance.now() - s.shownAt);
    if (!s.first.has(w.id)) {
      s.first.set(w.id, right);
      saveCard(w.id, promote(cards.get(w.id), today(), nowIso(), right, step.kind === 'new'));
      if (step.kind === 'new') dayStat().new++;
    }
    if (!right) {
      s.missed.add(w.id);
      // Retest before this round ends, with a different kind of question.
      s.round.push({ t: 'test', id: w.id, kind: 'redo', attempt: step.attempt + 1 });
      s.total++;
    }
  }

  $view.querySelectorAll<HTMLButtonElement>('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === t.answer) b.classList.add('right');
    else if (j === i) b.classList.add('wrong');
  });
  $view.querySelectorAll<HTMLButtonElement>('button.link[data-i]').forEach((b) => (b.disabled = true));
  if (right) $view.querySelector('.mark')?.classList.add('on');

  const after = $view.querySelector('#after')!;
  after.innerHTML = right
    ? `<div class="verdict ok"><strong>Right. ${esc(w.w)}: ${esc(w.plain)}</strong>${w.ex && t.mode !== 'blank' ? `<p class="ex" style="margin:.5rem 0 0">${exampleHtml(w.ex)}</p>` : ''}</div>
       <button class="btn primary wide" data-next>Next</button>`
    : `<div class="verdict no"><strong>${i < 0 ? 'Here it is.' : 'Not quite.'} It comes back before this round ends.</strong></div>
       <div class="note">${wordCard(w, t.mode === 'meaning' || t.mode === 'synonym')}</div>
       <button class="btn primary wide" data-next>Got it</button>`;
  after.querySelector('[data-next]')!.addEventListener('click', advance);
  if (!replay && !right) after.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function finishSession() {
  const s = session;
  session = null;
  flush();
  if (!s || !s.first.size) return studyHome();
  const firstRight = [...s.first.values()].filter(Boolean).length;
  const missed = [...s.missed].map((id) => byId.get(id)!).filter(Boolean);
  $view.innerHTML = `
    <h2>Session done</h2>
    <div class="stats">
      <div class="stat"><b>${s.first.size}</b><span>words tested</span></div>
      <div class="stat"><b>${Math.round((firstRight / s.first.size) * 100)}%</b><span>right first time</span></div>
      <div class="stat"><b>${newToday()}</b><span>new words today</span></div>
    </div>
    ${
      missed.length
        ? `<h3>Missed this time, back tomorrow</h3><table class="list">${missed.map((w) => `<tr><td><b style="font-family:var(--serif)">${esc(w.w)}</b></td><td>${esc(w.plain)}</td></tr>`).join('')}</table>`
        : `<p>Nothing missed. Those words move up to their next interval.</p>`
    }
    <div class="row" style="margin-top:1.2rem"><button class="btn primary" data-home>Back to words</button><a class="btn" href="#practice">Practise questions</a></div>`;
  on('[data-home]', studyHome);
}

// ═══════════════════════════════════════════ QUESTIONS

const QTYPES = [
  { id: 'mixed', name: 'Mixed' },
  { id: 'se', name: 'Sentence Equivalence' },
  { id: 'tc1', name: 'Text Completion, 1 blank' },
  { id: 'tcm', name: 'Text Completion, 2–3 blanks' },
] as const;
const typeName: Record<string, string> = { se: 'Sentence Equivalence', tc1: 'Text Completion', tc2: 'Text Completion, 2 blanks', tc3: 'Text Completion, 3 blanks' };
let qfilter: string = LS.get('gree.qfilter') ?? 'mixed';
const matches = (q: Question, f = qfilter) => f === 'mixed' || q.type === f || (f === 'tcm' && (q.type === 'tc2' || q.type === 'tc3'));

interface QSet {
  list: Question[];
  pos: number;
  picked: number[];
  checked: boolean;
  startedAt: number;
  results: { q: Question; right: boolean; ms: number }[];
  timer?: number;
}
let qset: QSet | null = null;

function practiceHome() {
  const t = today();
  const pool = questions.filter((q) => matches(q));
  const due = pool.filter((q) => (qstate.get(q.id)?.due ?? '9999') <= t);
  const fresh = pool.filter((q) => !qstate.has(q.id));
  const seen = questions.filter((q) => qstate.has(q.id));
  const acc = (list: Question[]) => {
    let r = 0, w = 0;
    for (const q of list) {
      const s = qstate.get(q.id);
      if (s) { r += s.r; w += s.w; }
    }
    return r + w ? `${Math.round((r / (r + w)) * 100)}%` : '–';
  };
  const rows = (['se', 'tc1', 'tc2', 'tc3'] as const).map((ty) => {
    const all = questions.filter((q) => q.type === ty);
    const done = all.filter((q) => qstate.has(q.id));
    return `<tr><td>${typeName[ty]}</td><td class="num">${done.length} / ${all.length}</td><td class="num">${acc(done)}</td></tr>`;
  });

  $view.innerHTML = `
    <h2>Questions</h2>
    <p class="muted">GRE-style Text Completion and Sentence Equivalence, built on your word list. Missed questions come back the next day, then later and later.</p>
    <div class="seg" role="group" aria-label="Question type" style="margin:1rem 0">
      ${QTYPES.map((x) => `<button data-f="${x.id}" aria-pressed="${qfilter === x.id}">${x.name}</button>`).join('')}
    </div>
    <div class="row">
      <button class="btn primary" data-start="new" ${fresh.length ? '' : 'disabled'}>10 new questions</button>
      <button class="btn" data-start="due" ${due.length ? '' : 'disabled'}>Redo missed (${due.length})</button>
    </div>
    <p class="muted small">${fresh.length} new in this type. Aim for about 1½ minutes a question, the GRE pace.</p>
    <h3>So far</h3>
    <table class="list"><tr><td class="muted">Type</td><td class="num muted">Done</td><td class="num muted">Right</td></tr>${rows.join('')}
      <tr><td><b>All</b></td><td class="num"><b>${seen.length} / ${questions.length}</b></td><td class="num"><b>${acc(seen)}</b></td></tr></table>
    <h3>Rules that win these questions</h3>
    <ul class="plain-list">
      <li>Cover the choices. Find the clue in the sentence and predict your own word first.</li>
      <li>Signal words set the direction: <i>although, despite, yet</i> flip it; <i>and, thus, because, indeed</i> keep it.</li>
      <li>Sentence Equivalence: both answers must fit and give the same meaning. A synonym pair that doesn't fit the sentence is a trap.</li>
      <li>Multi-blank: start with the blank that has the clearest clue, not always blank (i).</li>
      <li>Reread the whole sentence with your answers in before you commit.</li>
    </ul>
    <h3>Real ETS questions</h3>
    <p class="muted">The GRE never releases past papers. These official sources use real retired questions:</p>
    <ul class="plain-list">
      <li><a href="https://www.ets.org/gre/test-takers/general-test/prepare/powerprep.html" target="_blank" rel="noopener">POWERPREP</a>: 2 free full tests. Keep test 2 for the final week.</li>
      <li><a href="https://www.ets.org/gre/gre-mini-quiz.html" target="_blank" rel="noopener">GRE Mini Quiz</a>: 5 real verbal questions, good for a first look.</li>
      <li><a href="https://www.ets.org/gre/test-takers/general-test/prepare/content/verbal-reasoning.html" target="_blank" rel="noopener">ETS Verbal Reasoning overview</a>: official samples of each question type.</li>
      <li>Official GRE Verbal Reasoning Practice Questions (book, about 150 real questions) is the best paid source.</li>
    </ul>
    <p class="muted small">Log time spent on these under Progress so it counts toward your day.</p>`;
  on('[data-f]', (_e, el) => {
    qfilter = el.dataset.f!;
    LS.set('gree.qfilter', qfilter);
    practiceHome();
  });
  on('[data-start]', (_e, el) => {
    const list =
      el.dataset.start === 'due'
        ? shuffle(due).slice(0, 10)
        : (() => {
            const rank = { easy: 0, medium: 1, hard: 2 };
            // Easier first overall, but shuffled so types mix.
            return shuffle(fresh).sort((a, b) => rank[a.diff] - rank[b.diff] + (Math.random() - 0.5) * 1.2).slice(0, 10);
          })();
    qset = { list, pos: 0, picked: [], checked: false, startedAt: performance.now(), results: [] };
    renderQ();
  });
}

function stemHtml(q: Question) {
  let s = esc(q.stem);
  s = s.replace(/\((i{1,3})\)\s*_{2,}/g, '<span class="blank">($1)</span>');
  s = s.replace(/_{2,}/g, '<span class="blank"></span>');
  return s;
}

function renderQ() {
  const s = qset!;
  const q = s.list[s.pos];
  if (!q) return finishQ();
  clearInterval(s.timer);
  const blanks = q.blanks ?? [q.choices!];
  const multi = q.type === 'tc2' || q.type === 'tc3';
  const instr =
    q.type === 'se'
      ? 'Pick the two answers that each complete the sentence and give it the same meaning.'
      : multi
        ? 'Pick one answer for each blank.'
        : 'Pick one answer.';
  const roman = ['i', 'ii', 'iii'];

  $view.innerHTML = `
    <div class="bar"><span class="kicker">${typeName[q.type]} · ${q.diff} · ${s.pos + 1} of ${s.list.length}</span><span class="clock" id="qclock">0:00</span></div>
    <p class="prompt">${stemHtml(q)}</p>
    <p class="muted small">${instr}</p>
    ${
      multi
        ? `<div class="blanks n${blanks.length}">${blanks
            .map((opts, b) => `<div><h4>Blank (${roman[b]})</h4><div class="opts">${opts.map((o, i) => `<button class="opt serif" data-b="${b}" data-i="${i}">${esc(o)}</button>`).join('')}</div></div>`)
            .join('')}</div>`
        : `<div class="opts">${blanks[0].map((o, i) => `<button class="opt serif" data-b="0" data-i="${i}"><span class="k">${String.fromCharCode(65 + i)}</span><span>${esc(o)}</span></button>`).join('')}</div>`
    }
    <div id="after" style="margin-top:1rem"><button class="btn primary wide" data-check disabled>Check</button></div>
    <p><button class="btn link" data-quit>End set</button></p>`;

  const t0 = performance.now();
  const clock = $view.querySelector('#qclock') as HTMLElement;
  s.timer = window.setInterval(() => {
    const sec = (performance.now() - t0) / 1000;
    clock.textContent = mmss(sec);
    clock.classList.toggle('late', sec > 90);
  }, 500);

  s.picked = multi ? blanks.map(() => -1) : [];
  s.checked = false;
  const check = $view.querySelector('[data-check]') as HTMLButtonElement;
  const sync = () => {
    $view.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
      const bi = Number(b.dataset.b), i = Number(b.dataset.i);
      b.classList.toggle('sel', multi ? s.picked[bi] === i : s.picked.includes(i));
    });
    check.disabled = multi ? s.picked.includes(-1) : s.picked.length !== (q.type === 'se' ? 2 : 1);
  };
  on('.opt', (_e, el) => {
    if (s.checked) return;
    const bi = Number(el.dataset.b), i = Number(el.dataset.i);
    if (multi) s.picked[bi] = i;
    else if (q.type === 'se') s.picked = s.picked.includes(i) ? s.picked.filter((x) => x !== i) : [...s.picked, i].slice(-2);
    else s.picked = [i];
    sync();
  });
  check.addEventListener('click', () => checkQ(performance.now() - t0));
  on('[data-quit]', finishQ);
}

function checkQ(ms: number) {
  const s = qset!;
  const q = s.list[s.pos];
  clearInterval(s.timer);
  s.checked = true;
  const right = isCorrect(q, s.picked);
  s.results.push({ q, right, ms });
  recordAnswer('question', q.id, q.type, right, ms);
  const prev = qstate.get(q.id);
  saveQ(q.id, promote(prev, today(), nowIso(), right, !prev));

  const multi = q.type === 'tc2' || q.type === 'tc3';
  $view.querySelectorAll<HTMLButtonElement>('.opt').forEach((b) => {
    const bi = Number(b.dataset.b), i = Number(b.dataset.i);
    const isAns = multi ? q.answer[bi] === i : q.answer.includes(i);
    const isPicked = multi ? s.picked[bi] === i : s.picked.includes(i);
    b.disabled = true;
    b.classList.remove('sel');
    if (isAns) b.classList.add('right');
    else if (isPicked) b.classList.add('wrong');
  });

  // Every choice that is on the word list gets its meaning shown: distractors teach too.
  const opts = (q.blanks ?? [q.choices!]).flat();
  const gloss = opts
    .map((o) => byLemma.get(o.toLowerCase()))
    .filter((w): w is Word => !!w)
    .map((w) => `<span><b>${esc(w.w)}</b>: ${esc(w.plain)}</span>`)
    .join('');

  const after = $view.querySelector('#after')!;
  after.innerHTML = `
    <div class="verdict ${right ? 'ok' : 'no'}">
      <strong>${right ? 'Correct' : 'Not this time. It comes back tomorrow.'} (${mmss(ms / 1000)})</strong>
      <p>${esc(q.explain)}</p>
      ${gloss ? `<div class="gloss">${gloss}</div>` : ''}
    </div>
    <button class="btn primary wide" data-next>${s.pos + 1 < s.list.length ? 'Next question' : 'See results'}</button>`;
  after.querySelector('[data-next]')!.addEventListener('click', () => {
    s.pos++;
    renderQ();
    window.scrollTo(0, 0);
  });
}

function finishQ() {
  const s = qset;
  if (s) clearInterval(s.timer);
  qset = null;
  flush();
  if (!s || !s.results.length) return practiceHome();
  const right = s.results.filter((r) => r.right).length;
  const avg = s.results.reduce((n, r) => n + r.ms, 0) / s.results.length / 1000;
  $view.innerHTML = `
    <h2>Set done</h2>
    <div class="stats">
      <div class="stat"><b>${right} / ${s.results.length}</b><span>correct</span></div>
      <div class="stat"><b>${mmss(avg)}</b><span>per question (aim for 1:30)</span></div>
    </div>
    ${
      s.results.some((r) => !r.right)
        ? `<h3>Missed, back tomorrow</h3><ul class="plain-list">${s.results
            .filter((r) => !r.right)
            .map((r) => `<li>${esc(r.q.stem.slice(0, 110))}…</li>`)
            .join('')}</ul>`
        : ''
    }
    <div class="row" style="margin-top:1.2rem"><button class="btn primary" data-home>More questions</button><a class="btn" href="#study">Words</a></div>`;
  on('[data-home]', practiceHome);
}

// ═══════════════════════════════════════════ WRITING

interface Draft {
  id: string;
  task: Task;
  prompt: string;
  body: string;
  started: number | null; // epoch ms when the timer started
  elapsed: number;         // seconds before the current start
  checks: number[];
  finishing: boolean;
}
let writing: Draft | null = LS.get<Draft>('gree.draft');
let writeTimer = 0;
let lastSaved = '';

function writeHome() {
  $view.innerHTML = `
    <h2>Writing</h2>
    <p class="muted">Short, timed and daily is how the writing comes back. Everything you write is saved, and you can ask Claude to grade any essay later.</p>
    <div class="opts" style="margin-top:1rem">
      ${TASKS.map((t) => `<button class="opt" data-task="${t.id}"><span style="flex:1"><b>${esc(t.name)}</b><br><span class="muted small">${t.minutes} minutes · ${t.target[0]}–${t.target[1]} words</span></span></button>`).join('')}
    </div>
    <p class="muted small" style="margin-top:.8rem">ETS publishes every real GRE Issue topic in its <a href="https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing.html" target="_blank" rel="noopener">Analytical Writing</a> pages. Paste one in with "Use my own prompt".</p>
    <h3>Your writing</h3>
    ${
      essays.length
        ? `<table class="list">${essays
            .map(
              (e) => `<tr><td>${prettyDay(e.day)}</td><td><a href="#write/${esc(e.id)}" data-open="${esc(e.id)}">${esc(taskById(e.task).name)}</a><br><span class="muted small">${esc(e.prompt.slice(0, 70))}…</span></td><td class="num">${e.words} words${e.graded ? '<br><b>graded</b>' : ''}</td></tr>`,
            )
            .join('')}</table>`
        : `<p class="muted">Nothing yet. Start with a 10-minute TOEFL discussion post; it's the gentlest way back in.</p>`
    }`;
  on('[data-task]', (_e, el) => newDraft(el.dataset.task as Task));
  on('[data-open]', (e, el) => {
    e.preventDefault();
    openEssay(el.dataset.open!);
  });
  const deep = location.hash.split('/')[1];
  if (deep) openEssay(deep);
}

function newDraft(task: Task, prompt?: string) {
  const t = taskById(task);
  writing = {
    id: uid(), task, prompt: prompt ?? t.prompts[Math.floor(Math.random() * t.prompts.length)],
    body: '', started: null, elapsed: 0, checks: [], finishing: false,
  };
  LS.set('gree.draft', writing);
  renderEditor();
}

const elapsedOf = (d: Draft) => d.elapsed + (d.started ? (Date.now() - d.started) / 1000 : 0);
const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;

async function saveDraft(force = false) {
  const d = writing;
  if (!d || !d.body.trim()) return;
  const key = d.body + d.prompt + d.checks.join();
  if (!force && key === lastSaved) return;
  try {
    await api('/gree/api/essay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: d.id, task: d.task, prompt: d.prompt, body: d.body, day: today(), seconds: Math.round(elapsedOf(d)), checks: d.checks }),
    });
    lastSaved = key;
  } catch {
    /* the local draft still has it; the next autosave will retry */
  }
}

function renderEditor() {
  const d = writing!;
  const t = taskById(d.task);
  clearInterval(writeTimer);

  if (d.finishing) {
    $view.innerHTML = `
      <h2>Check before you save</h2>
      <p class="muted">Reread your writing against each point. Tick only what's true.</p>
      <div class="checks">${t.checks.map((c, i) => `<label><input type="checkbox" data-c="${i}" ${d.checks.includes(i) ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>
      <p class="muted small">${countWords(d.body)} words in ${mmss(elapsedOf(d))}. Target ${t.target[0]}–${t.target[1]} words in ${t.minutes} minutes.</p>
      <div class="row"><button class="btn primary" data-save>Save</button><button class="btn" data-back>Keep editing</button></div>`;
    on('[data-c]', () => {
      d.checks = [...$view.querySelectorAll<HTMLInputElement>('[data-c]')].filter((x) => x.checked).map((x) => Number(x.dataset.c));
      LS.set('gree.draft', d);
    });
    on('[data-back]', () => {
      d.finishing = false;
      renderEditor();
    });
    on('[data-save]', async (_e, el) => {
      (el as HTMLButtonElement).disabled = true;
      await saveDraft(true);
      if (lastSaved) {
        toast('Saved');
        writing = null;
        LS.set('gree.draft', null);
        await pullState().catch(() => {});
        writeHome();
      } else {
        (el as HTMLButtonElement).disabled = false;
        toast("Couldn't save. Check your connection and try again");
      }
    });
    return;
  }

  $view.innerHTML = `
    <div class="bar">
      <span class="clock" id="clock">${mmss(t.minutes * 60 - elapsedOf(d))}</span>
      <span class="muted small" id="wc">${countWords(d.body)} words</span>
      <button class="btn" data-start>${d.started ? 'Pause' : d.elapsed ? 'Resume' : 'Start timer'}</button>
    </div>
    <p class="kicker">${esc(t.name)}</p>
    <div class="note"><p class="feedback" style="font-family:var(--serif)">${esc(d.prompt)}</p></div>
    <p class="row"><button class="btn link" data-another>Another prompt</button><button class="btn link" data-own>Use my own prompt</button></p>
    <p class="muted small">${esc(t.brief)}</p>
    <textarea class="essay" id="body" spellcheck="false" autocapitalize="sentences" placeholder="Start writing. Spellcheck is off, as it is on the test.">${esc(d.body)}</textarea>
    <div class="row" style="margin-top:.8rem"><button class="btn primary" data-finish>Finish</button><button class="btn link" data-discard>Discard</button></div>`;

  const body = $view.querySelector('#body') as HTMLTextAreaElement;
  const clock = $view.querySelector('#clock') as HTMLElement;
  const wc = $view.querySelector('#wc') as HTMLElement;
  const tick = () => {
    const left = t.minutes * 60 - elapsedOf(d);
    clock.textContent = left >= 0 ? mmss(left) : `${mmss(left)} over`;
    clock.classList.toggle('late', left < 0);
  };
  writeTimer = window.setInterval(() => {
    tick();
    if (d.started && Math.round(elapsedOf(d)) % 20 === 0) saveDraft();
  }, 1000);

  body.addEventListener('input', () => {
    d.body = body.value;
    if (!d.started && !d.elapsed) {
      d.started = Date.now();
      ($view.querySelector('[data-start]') as HTMLElement).textContent = 'Pause';
    }
    wc.textContent = `${countWords(d.body)} words`;
    LS.set('gree.draft', d);
  });
  on('[data-start]', (_e, el) => {
    if (d.started) {
      d.elapsed = elapsedOf(d);
      d.started = null;
      el.textContent = 'Resume';
    } else {
      d.started = Date.now();
      el.textContent = 'Pause';
      body.focus();
    }
    LS.set('gree.draft', d);
  });
  on('[data-another]', () => {
    const others = t.prompts.filter((p) => p !== d.prompt);
    d.prompt = others[Math.floor(Math.random() * others.length)] ?? d.prompt;
    LS.set('gree.draft', d);
    renderEditor();
  });
  on('[data-own]', () => {
    $view.querySelector('.note')!.innerHTML = `<textarea id="ownp" rows="5" placeholder="Paste the prompt here"></textarea><button class="btn" data-useown style="margin-top:.5rem">Use this prompt</button>`;
    on('[data-useown]', () => {
      const v = ($view.querySelector('#ownp') as HTMLTextAreaElement).value.trim();
      if (v) {
        d.prompt = v;
        LS.set('gree.draft', d);
      }
      renderEditor();
    });
  });
  on('[data-finish]', () => {
    if (!d.body.trim()) return toast('Write something first');
    d.elapsed = elapsedOf(d);
    d.started = null;
    d.finishing = true;
    LS.set('gree.draft', d);
    saveDraft();
    renderEditor();
  });
  on('[data-discard]', () => {
    if (d.body.trim() && !confirmInline()) return;
    writing = null;
    LS.set('gree.draft', null);
    clearInterval(writeTimer);
    writeHome();
  });
}

/** Two-tap discard instead of a blocking browser dialog. */
let discardArmed = 0;
function confirmInline() {
  if (Date.now() - discardArmed < 4000) return true;
  discardArmed = Date.now();
  toast('Tap Discard again to throw this draft away');
  return false;
}

async function openEssay(id: string) {
  $view.innerHTML = `<p class="muted">Opening…</p>`;
  try {
    const e = await api(`/gree/api/essay?id=${encodeURIComponent(id)}`);
    const t = taskById(e.task);
    const checks: number[] = e.checks ? JSON.parse(e.checks) : [];
    $view.innerHTML = `
      <p><a href="#write" class="btn link">All writing</a></p>
      <h2>${esc(t.name)}</h2>
      <p class="muted">${prettyDay(e.day)} · ${e.words} words${e.seconds ? ` in ${mmss(e.seconds)}` : ''}</p>
      <div class="note"><p class="feedback" style="font-family:var(--serif)">${esc(e.prompt)}</p></div>
      <p class="feedback" style="font:1.05rem/1.7 var(--serif)">${esc(e.body)}</p>
      <h3>Feedback</h3>
      ${e.feedback ? `<div class="note feedback">${esc(e.feedback)}</div>` : `<p class="muted">Not graded yet. Ask Claude to grade your latest gree essay and the feedback will appear here.</p>`}
      <h3>Your self-check</h3>
      <ul class="plain-list">${t.checks.map((c, i) => `<li>${checks.includes(i) ? '✓' : '✗'} ${esc(c)}</li>`).join('')}</ul>
      <p style="margin-top:1.5rem"><button class="btn link" data-del>Delete this essay</button></p>`;
    on('[data-del]', async () => {
      if (!confirmInline()) return;
      await api('/gree/api/essay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'delete', id }) });
      await pullState().catch(() => {});
      location.hash = '#write';
    });
  } catch {
    $view.innerHTML = `<p>That essay couldn't be loaded.</p><p><a href="#write">Back to writing</a></p>`;
  }
}

// ═══════════════════════════════════════════ PROGRESS

const LOG_KINDS = ['POWERPREP / mock test', 'Official Guide questions', 'Reading comprehension', 'GregMat or other video', 'TOEFL practice', 'Reading (articles, books)', 'Quant', 'Other'];

function minutesOn(d: string) {
  const s = days[d];
  return s ? Math.round(s.s / 60) + (s.logm ?? 0) : 0;
}

function streak() {
  let d = today();
  if (minutesOn(d) < 10) d = addDays(d, -1);
  let n = 0;
  while (minutesOn(d) >= 10) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function progressView() {
  const t = today();
  const st = dayStat(t);
  const stages = { new: 0, learning: 0, known: 0, mastered: 0 };
  for (const w of words) stages[stageOf(cards.get(w.id))]++;
  const hf = words.filter((w) => w.hf);
  const hfLearned = hf.filter((w) => (cards.get(w.id)?.box ?? 0) >= 1).length;
  const pct = (n: number) => `${((n / Math.max(1, words.length)) * 100).toFixed(2)}%`;

  // 12-week heatmap ending this week, Monday-first columns.
  const end = t;
  const dow = (new Date(end + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const start = addDays(end, -(7 * 11 + dow));
  const cells: string[] = [];
  for (let i = 0; i < 7 * 12; i++) {
    const d = addDays(start, i);
    if (d > end) {
      cells.push(`<i class="future"></i>`);
      continue;
    }
    const m = minutesOn(d);
    const l = m === 0 ? 0 : m < 15 ? 1 : m < 45 ? 2 : m < 90 ? 3 : 4;
    cells.push(`<i data-l="${l}" title="${prettyDay(d)}: ${m} min"></i>`);
  }

  const recent = Array.from({ length: 14 }, (_, i) => addDays(t, -i))
    .map((d) => ({ d, s: days[d] }))
    .filter((r) => r.d === t || r.s);

  const gre = daysBetween(t, greDate());
  const toefl = daysBetween(t, toeflDate());
  const week = Array.from({ length: 7 }, (_, i) => minutesOn(addDays(t, -i))).reduce((a, b) => a + b, 0);

  $view.innerHTML = `
    <h2>Progress</h2>
    <p class="muted">${gre >= 0 ? `GRE in ${gre} days` : 'GRE date passed'}${toefl >= 0 ? `, TOEFL in ${toefl} days` : ''}. Streak: ${streak()} day${streak() === 1 ? '' : 's'} of 10+ minutes.</p>
    <div class="stats">
      <div class="stat"><b>${minutesOn(t)}</b><span>minutes today</span></div>
      <div class="stat"><b>${week}</b><span>minutes this week</span></div>
      <div class="stat"><b>${st.new}</b><span>new words today</span></div>
      <div class="stat"><b>${st.n - st.q}</b><span>word answers today${st.n - st.q ? `, ${Math.round(((st.ok - st.qok) / (st.n - st.q)) * 100)}% right` : ''}</span></div>
      <div class="stat"><b>${st.q}</b><span>questions today${st.q ? `, ${st.qok} right` : ''}</span></div>
    </div>

    <h3>Last 12 weeks</h3>
    <div class="heat" aria-label="Minutes studied per day">${cells.join('')}</div>
    <p class="legend"><span>Minutes per day, including logged work:</span><span><i style="background:var(--rule)"></i>0</span><span><i style="background:color-mix(in srgb,var(--hi) 35%,var(--rule))"></i>under 15</span><span><i style="background:color-mix(in srgb,var(--hi) 65%,var(--rule))"></i>15–45</span><span><i style="background:var(--hi)"></i>45–90</span><span><i style="background:var(--ink)"></i>90+</span></p>

    <h3>Words</h3>
    <div class="ladder" role="img" aria-label="${stages.mastered} mastered, ${stages.known} known, ${stages.learning} learning, ${stages.new} not started">
      <i style="width:${pct(stages.mastered)};background:var(--ink)"></i>
      <i style="width:${pct(stages.known)};background:var(--hi)"></i>
      <i style="width:${pct(stages.learning)};background:color-mix(in srgb,var(--hi) 40%,var(--rule))"></i>
    </div>
    <p class="legend">
      <span><i style="background:var(--ink)"></i>${stages.mastered} mastered (30+ day gap)</span>
      <span><i style="background:var(--hi)"></i>${stages.known} known</span>
      <span><i style="background:color-mix(in srgb,var(--hi) 40%,var(--rule))"></i>${stages.learning} learning</span>
      <span><i style="background:var(--rule)"></i>${stages.new} not started</span>
    </p>
    <p class="muted small">Barron's 333 high-frequency: ${hfLearned} of ${hf.length} learned. At ${npd()} a day you ${gre > 0 ? `would reach about ${Math.min(words.length, cards.size + npd() * gre)} words by test day` : 'are on the final stretch'}.</p>

    <h3>Log other work</h3>
    <form id="logf" class="row" style="align-items:flex-end">
      <div class="field" style="flex:2;min-width:12rem"><label for="lk">What</label><select id="lk">${LOG_KINDS.map((k) => `<option>${esc(k)}</option>`).join('')}</select></div>
      <div class="field" style="flex:1;min-width:6rem"><label for="lm">Minutes</label><input id="lm" type="number" inputmode="numeric" min="1" max="600" required></div>
      <div class="field" style="flex:3;min-width:12rem"><label for="ln">Note (score, what you covered)</label><input id="ln" maxlength="500"></div>
      <button class="btn primary" type="submit" style="margin:.6rem 0">Add</button>
    </form>
    ${
      logs.length
        ? `<table class="list">${logs
            .slice(0, 15)
            .map((l) => `<tr><td>${prettyDay(l.day)}</td><td>${esc(l.kind)}${l.note ? `<br><span class="muted small">${esc(l.note)}</span>` : ''}</td><td class="num">${l.minutes} min<br><button class="btn link small" data-dellog="${esc(l.id)}">remove</button></td></tr>`)
            .join('')}</table>`
        : ''
    }

    <h3>Day by day</h3>
    <table class="list">
      <tr><td class="muted">Day</td><td class="num muted">Minutes</td><td class="num muted">New</td><td class="num muted">Answers</td><td class="num muted">Right</td></tr>
      ${recent
        .map(({ d, s }) => `<tr><td>${d === t ? 'Today' : prettyDay(d)}</td><td class="num">${minutesOn(d)}</td><td class="num">${s?.new ?? 0}</td><td class="num">${s?.n ?? 0}</td><td class="num">${s?.n ? Math.round((s.ok / s.n) * 100) + '%' : '–'}</td></tr>`)
        .join('')}
    </table>

    <h3>Settings</h3>
    <p class="muted small">New words per day</p>
    <div class="seg" role="group" aria-label="New words per day">${[10, 15, 20, 25, 30].map((n) => `<button data-npd="${n}" aria-pressed="${npd() === n}">${n}</button>`).join('')}</div>
    <div class="row" style="margin-top:.8rem">
      <div class="field"><label for="gd">GRE date</label><input id="gd" type="date" value="${esc(greDate())}"></div>
      <div class="field"><label for="td">TOEFL date</label><input id="td" type="date" value="${esc(toeflDate())}"></div>
    </div>
    <div class="row" style="margin-top:1rem">
      <form method="post" action="/gree/api/logout"><button class="btn">Sign out</button></form>
      <form method="post" action="/gree/api/logout?everywhere=1"><button class="btn">Sign out on all devices</button></form>
    </div>
    <p class="muted small" style="margin-top:1rem">This device: ${esc(device)}. ${boxEmpty(outbox) ? 'Everything is synced.' : 'Some progress is waiting to sync.'}</p>`;

  on('[data-npd]', (_e, el) => {
    saveSetting('new_per_day', Number(el.dataset.npd));
    progressView();
  });
  ($view.querySelector('#gd') as HTMLInputElement).addEventListener('change', (e) => saveSetting('gre_date', (e.target as HTMLInputElement).value));
  ($view.querySelector('#td') as HTMLInputElement).addEventListener('change', (e) => saveSetting('toefl_date', (e.target as HTMLInputElement).value));
  ($view.querySelector('#logf') as HTMLFormElement).addEventListener('submit', async (e) => {
    e.preventDefault();
    const minutes = Number(($view.querySelector('#lm') as HTMLInputElement).value);
    const kind = ($view.querySelector('#lk') as HTMLSelectElement).value;
    const note = ($view.querySelector('#ln') as HTMLInputElement).value.trim() || null;
    if (!Number.isInteger(minutes) || minutes < 1) return toast('Enter the minutes as a whole number');
    const entry = { id: uid(), day: today(), kind, minutes, note };
    try {
      await api('/gree/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
      logs.unshift(entry);
      dayStat().logm += minutes;
      toast(`Logged ${minutes} minutes`);
      progressView();
    } catch {
      toast("Couldn't log that. Check your connection");
    }
  });
  on('[data-dellog]', async (_e, el) => {
    const id = el.dataset.dellog!;
    const l = logs.find((x) => x.id === id);
    try {
      await api('/gree/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'delete', id }) });
      logs = logs.filter((x) => x.id !== id);
      if (l && days[l.day]) days[l.day].logm -= l.minutes;
      progressView();
    } catch {
      toast("Couldn't remove it. Check your connection");
    }
  });
}

// ═══════════════════════════════════════════ keyboard (laptop)

addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const next = $view.querySelector<HTMLButtonElement>('[data-next]');
  if ((e.key === 'Enter' || e.key === ' ') && next) {
    e.preventDefault();
    next.click();
    return;
  }
  if (currentTab() === 'study' && session && /^[1-4]$/.test(e.key)) {
    $view.querySelector<HTMLButtonElement>(`.opt[data-i="${Number(e.key) - 1}"]`)?.click();
  }
  if (currentTab() === 'practice' && qset && /^[a-fA-F]$/.test(e.key)) {
    $view.querySelector<HTMLButtonElement>(`.opt[data-b="0"][data-i="${e.key.toLowerCase().charCodeAt(0) - 97}"]`)?.click();
  }
  if (currentTab() === 'practice' && qset && e.key === 'Enter') {
    $view.querySelector<HTMLButtonElement>('[data-check]:not(:disabled)')?.click();
  }
});

// ═══════════════════════════════════════════ boot

(async function boot() {
  try {
    await flush();
    const version = await pullState();
    await loadContent(version);
    render();
  } catch (err) {
    const cached = LS.get<{ words: Word[]; questions: Question[] }>('gree.content');
    $view.innerHTML = `<h2>Can't reach the server</h2><p class="muted">${cached ? 'Check your connection and reload.' : 'This device has no saved copy yet. Connect once and reload.'}</p><button class="btn primary" onclick="location.reload()">Reload</button>`;
    console.error(err);
  }
})();

