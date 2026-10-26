/**
 * TOEFL tab: Reading, Listening and Build a Sentence in the 2026 TOEFL iBT
 * format, graded on the spot. Email and Academic Discussion reuse the Writing
 * editor (graded later by Claude). Speaking is practised outside the app.
 *
 * Listening audio is spoken by the browser (speechSynthesis), once, like the
 * exam. The transcript is shown only after checking.
 */
import { shuffle, type Card } from './engine';

export type TType = 'ctw' | 'rdl' | 'rap' | 'lcr' | 'lcv' | 'lan' | 'lat' | 'bas';
export interface TQ { q: string; choices: string[]; answer: number; explain: string }
export interface Line { s: 'f' | 'm'; t: string }
export interface TItem {
  id: string;
  type: TType;
  diff: 'easy' | 'medium' | 'hard';
  title?: string;
  text?: string;
  context?: string;
  audio?: Line[];
  qs?: TQ[];
  chunks?: string[];
  answer?: string;
  explain?: string;
}

export interface Ctx {
  view: HTMLElement;
  items: () => TItem[];
  state: Map<string, Card>;
  today: () => string;
  esc: (s: unknown) => string;
  mmss: (sec: number) => string;
  on: (sel: string, fn: (e: Event, el: HTMLElement) => void) => void;
  /** One scored answer (a question, a gap, a sentence). */
  record: (item: string, mode: string, correct: boolean, ms: number) => void;
  /** Put the whole item on the review ladder. */
  ladder: (id: string, right: boolean) => void;
  write: (task: 'toefl_email' | 'toefl_discussion') => void;
  done: () => void;
}

interface TypeInfo { id: TType; section: 'Reading' | 'Listening' | 'Writing'; name: string; per: number; hint: string }
const TYPES: TypeInfo[] = [
  { id: 'ctw', section: 'Reading', name: 'Complete the Words', per: 2, hint: 'Fill in the missing half of each word. About 3 min a paragraph.' },
  { id: 'rdl', section: 'Reading', name: 'Read in Daily Life', per: 3, hint: 'Notices, emails, menus. About 1 min a question.' },
  { id: 'rap', section: 'Reading', name: 'Read an Academic Passage', per: 1, hint: '~200 words, 5 questions. About 6 min.' },
  { id: 'lcr', section: 'Listening', name: 'Listen and Choose a Response', per: 10, hint: 'One spoken line, pick the natural reply.' },
  { id: 'lcv', section: 'Listening', name: 'Listen to a Conversation', per: 2, hint: 'Take notes. Questions appear after the audio.' },
  { id: 'lan', section: 'Listening', name: 'Listen to an Announcement', per: 2, hint: 'Short and dense. Note who, what, when.' },
  { id: 'lat', section: 'Listening', name: 'Listen to an Academic Talk', per: 1, hint: 'Note the main idea and each example.' },
  { id: 'bas', section: 'Writing', name: 'Build a Sentence', per: 10, hint: 'Tap the pieces in order. About 30 s each.' },
];
const typeOf = (t: TType) => TYPES.find((x) => x.id === t)!;

interface Run {
  type: TType;
  list: TItem[];
  pos: number;
  checked: boolean;
  t0: number;
  timer?: number;
  played: boolean;
  picks: number[];     // MCQ choice per question
  built: number[];     // bas: chunk indexes in the order tapped
  order: number[];     // bas: shuffled chunk indexes as shown
  pieces: string[];    // bas: chunks as shown (lowercased, split, plus one decoy)
  decoy: number;       // bas: index in pieces that belongs nowhere
  end: string;         // bas: closing punctuation, fixed in place
  results: { id: string; ok: number; of: number }[];
}
let run: Run | null = null;
export const toeflBusy = () => !!run;

export function toeflView(c: Ctx) {
  if (run) renderItem(c);
  else home(c);
}

// ═══════════════════════════════════════════ home

function home(c: Ctx) {
  const t = c.today();
  const all = c.items();
  const rows = (sec: string) =>
    TYPES.filter((x) => x.section === sec)
      .map((x) => {
        const pool = all.filter((i) => i.type === x.id);
        const seen = pool.filter((i) => c.state.has(i.id));
        const due = pool.filter((i) => (c.state.get(i.id)?.due ?? '9999') <= t);
        let r = 0, w = 0;
        for (const i of seen) { const s = c.state.get(i.id)!; r += s.r; w += s.w; }
        return `<div class="tf-row">
          <div><b>${c.esc(x.name)}</b><br><span class="muted small">${c.esc(x.hint)}</span>
            <br><span class="muted small">${seen.length} / ${pool.length} done${r + w ? ` · ${Math.round((r / (r + w)) * 100)}% sets clean` : ''}</span></div>
          <div class="tf-go">
            <button class="btn primary" data-go="${x.id}" ${pool.length > seen.length ? '' : 'disabled'}>Start</button>
            ${due.length ? `<button class="btn" data-redo="${x.id}">Redo (${due.length})</button>` : ''}
          </div></div>`;
      })
      .join('');

  c.view.innerHTML = `
    <h2>TOEFL</h2>
    <p class="muted">The 2026 TOEFL iBT, task by task. Reading, Listening and Build a Sentence are checked instantly; anything you miss comes back the next day. Emails and discussion posts are graded by Claude.</p>
    ${all.length ? '' : '<p class="err">No TOEFL content on this device yet. Reload once you are online.</p>'}
    <h3>Reading <span class="muted small">· ~30 min on test day</span></h3>${rows('Reading')}
    <h3>Listening <span class="muted small">· ~29 min · audio plays once, notes allowed</span></h3>
    <p class="muted small">Use headphones. Have paper ready, like the scratch paper at the center.</p>
    ${rows('Listening')}
    <h3>Writing <span class="muted small">· 23 min</span></h3>${rows('Writing')}
    <div class="tf-row"><div><b>Write an Email</b><br><span class="muted small">7 minutes. Cover all three points, polite and clear.</span></div>
      <div class="tf-go"><button class="btn primary" data-write="toefl_email">Write</button></div></div>
    <div class="tf-row"><div><b>Academic Discussion</b><br><span class="muted small">10 minutes, 100+ words. Take a side, add something new.</span></div>
      <div class="tf-go"><button class="btn primary" data-write="toefl_discussion">Write</button></div></div>
    <h3>Speaking <span class="muted small">· ~8 min</span></h3>
    <p class="muted small">7× Listen and Repeat (8–12 s each), then 4 interview questions (45 s each, no prep). Practised together with Claude on the laptop.</p>`;

  c.on('[data-write]', (_e, el) => c.write(el.dataset.write as 'toefl_email' | 'toefl_discussion'));
  c.on('[data-go], [data-redo]', (_e, el) => {
    const type = (el.dataset.go ?? el.dataset.redo) as TType;
    const pool = all.filter((i) => i.type === type);
    const per = typeOf(type).per;
    const rank = { easy: 0, medium: 1, hard: 2 };
    const list = el.dataset.redo
      ? shuffle(pool.filter((i) => (c.state.get(i.id)?.due ?? '9999') <= t)).slice(0, per)
      : shuffle(pool.filter((i) => !c.state.has(i.id)))
          .sort((a, b) => rank[a.diff] - rank[b.diff] + (Math.random() - 0.5) * 1.2)
          .slice(0, per);
    if (!list.length) return;
    run = { type, list, pos: 0, checked: false, t0: 0, played: false, picks: [], built: [], order: [], pieces: [], decoy: -1, end: '', results: [] };
    renderItem(c);
  });
}

// ═══════════════════════════════════════════ one item

function renderItem(c: Ctx) {
  const r = run!;
  const it = r.list[r.pos];
  if (!it) return finish(c);
  clearInterval(r.timer);
  stopAudio();
  r.checked = false;
  r.played = false;
  r.picks = (it.qs ?? []).map(() => -1);
  r.built = [];
  if (it.type === 'bas') {
    Object.assign(r, basPieces(it, c.items()));
    const n = r.pieces.length;
    do r.order = shuffle([...Array(n).keys()]);
    while (n > 1 && r.order.every((v, i) => v === i));
  }

  const info = typeOf(it.type);
  const listening = info.section === 'Listening';
  c.view.innerHTML = `
    <div class="bar"><span class="kicker">${c.esc(info.name)} · ${it.diff} · ${r.pos + 1} of ${r.list.length}</span><span class="clock" id="tclock">0:00</span></div>
    <div id="tbody">${listening ? listenIntro(c, it) : body(c, it)}</div>
    <div id="after" style="margin-top:1rem">${listening ? '' : checkBtn(it)}</div>
    <p><button class="btn link" data-quit>End set</button></p>`;

  r.t0 = performance.now();
  const clock = c.view.querySelector('#tclock') as HTMLElement;
  r.timer = window.setInterval(() => (clock.textContent = c.mmss((performance.now() - r.t0) / 1000)), 500);

  c.on('[data-quit]', () => finish(c));
  if (listening) {
    c.on('[data-play]', async (_e, el) => {
      if (r.played) return;
      r.played = true;
      (el as HTMLButtonElement).disabled = true;
      el.textContent = 'Playing…';
      await speak(it.audio ?? []);
      if (run !== r || r.list[r.pos] !== it) return; // left mid-audio
      (c.view.querySelector('#tbody') as HTMLElement).innerHTML = (it.context ? `<p class="muted small">${c.esc(it.context)}</p>` : '') + questions(c, it);
      (c.view.querySelector('#after') as HTMLElement).innerHTML = checkBtn(it);
      wire(c, it);
    });
  } else wire(c, it);
}

const checkBtn = (_it: TItem) => `<button class="btn primary wide" data-check disabled>Check</button>`;

function listenIntro(c: Ctx, it: TItem) {
  return `${it.context ? `<p>${c.esc(it.context)}</p>` : '<p>Listen. You will hear it once.</p>'}
    <button class="btn primary wide" data-play>▶ Play (once)</button>
    <p class="muted small">Questions appear when the audio ends.</p>`;
}

function body(c: Ctx, it: TItem) {
  if (it.type === 'ctw') return `<p class="muted small">Type the missing letters to complete the text.</p><p class="prompt tf-ctw">${ctwHtml(c, it.text!)}</p>`;
  if (it.type === 'bas')
    return `<p class="muted small">Make an appropriate sentence.</p>
      <p class="prompt">${c.esc(it.context)}</p>
      <div class="tf-built" id="built" aria-live="polite"></div>
      <div class="tf-chunks" id="chunks"></div>`;
  return `${it.title ? `<p class="kicker">${c.esc(it.title)}</p>` : ''}<div class="tf-text">${c.esc(it.text).replace(/\n/g, '<br>')}</div>${questions(c, it)}`;
}

function ctwHtml(c: Ctx, text: string) {
  let g = 0;
  return text
    .split(/([A-Za-z'’-]*\[[A-Za-z]+\])/)
    .map((part) => {
      const m = part.match(/^([A-Za-z'’-]*)\[([A-Za-z]+)\]$/);
      if (!m) return c.esc(part);
      const n = m[2].length;
      return `${c.esc(m[1])}<input class="tf-gap" data-gap="${g++}" maxlength="${n}" size="${n}" style="width:${n + 1.2}ch" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="missing letters, ${n}">`;
    })
    .join('');
}
const ctwGaps = (text: string) => [...text.matchAll(/\[([A-Za-z]+)\]/g)].map((m) => m[1]);

function questions(c: Ctx, it: TItem) {
  return (it.qs ?? [])
    .map(
      (q, qi) => `<div class="tf-q"><p><b>${qi + 1}.</b> ${c.esc(q.q)}</p><div class="opts">${q.choices
        .map((o, i) => `<button class="opt" data-q="${qi}" data-i="${i}"><span class="k">${String.fromCharCode(65 + i)}</span><span>${c.esc(o)}</span></button>`)
        .join('')}</div></div>`,
    )
    .join('');
}

function wire(c: Ctx, it: TItem) {
  const r = run!;
  const check = c.view.querySelector('[data-check]') as HTMLButtonElement;
  if (it.type === 'ctw') {
    const inputs = [...c.view.querySelectorAll<HTMLInputElement>('.tf-gap')];
    // Jump to the next gap once this one is full, like the real test.
    inputs.forEach((inp, i) =>
      inp.addEventListener('input', () => {
        if (inp.value.length >= inp.maxLength) inputs[i + 1]?.focus();
      }),
    );
    // A half-done paragraph can be checked too: empty gaps count as wrong.
    check.disabled = false;
  } else if (it.type === 'bas') {
    const draw = () => {
      const ch = r.pieces;
      (c.view.querySelector('#built') as HTMLElement).innerHTML = (r.built.length
        ? r.built.map((k, p) => `<button class="chip on" data-un="${p}">${c.esc(ch[k])}</button>`).join('')
        : '<span class="muted small">Tap the pieces below in order. One piece is not used.</span>') + `<b>${c.esc(r.end)}</b>`;
      (c.view.querySelector('#chunks') as HTMLElement).innerHTML = r.order
        .map((k) => `<button class="chip" data-k="${k}" ${r.built.includes(k) ? 'disabled' : ''}>${c.esc(ch[k])}</button>`)
        .join('');
      check.disabled = r.built.length !== ch.length - 1;
      if (r.checked) return;
      c.on('[data-k]', (_e, el) => { r.built.push(Number(el.dataset.k)); draw(); });
      c.on('[data-un]', (_e, el) => { r.built.splice(Number(el.dataset.un), 1); draw(); });
    };
    draw();
  } else {
    c.on('.opt[data-q]', (_e, el) => {
      if (r.checked) return;
      const qi = Number(el.dataset.q), i = Number(el.dataset.i);
      r.picks[qi] = i;
      c.view.querySelectorAll<HTMLButtonElement>(`.opt[data-q="${qi}"]`).forEach((b) => b.classList.toggle('sel', Number(b.dataset.i) === i));
      check.disabled = r.picks.includes(-1);
    });
  }
  check.addEventListener('click', () => grade(c, it));
}

function grade(c: Ctx, it: TItem) {
  const r = run!;
  if (r.checked) return;
  r.checked = true;
  clearInterval(r.timer);
  const ms = performance.now() - r.t0;
  const mode = `toefl-${it.type}`;
  let ok = 0, of = 0, clean = false;
  let detail = '';

  if (it.type === 'ctw') {
    const want = ctwGaps(it.text!);
    const inputs = [...c.view.querySelectorAll<HTMLInputElement>('.tf-gap')];
    want.forEach((w, i) => {
      const inp = inputs[i];
      const right = inp.value.trim().toLowerCase() === w.toLowerCase();
      inp.readOnly = true;
      inp.classList.add(right ? 'right' : 'wrong');
      if (!right) inp.insertAdjacentHTML('afterend', `<sup class="tf-fix">${c.esc(w)}</sup>`);
      c.record(`${it.id}#${i + 1}`, mode, right, ms / want.length);
      ok += +right;
      of++;
    });
    clean = of - ok <= 1; // one slip in ten still counts as a clean paragraph
    c.ladder(it.id, clean);
  } else if (it.type === 'bas') {
    const got = r.built.map((k) => r.pieces[k]).join(' ') + r.end;
    const right = norm(got) === norm(it.answer!);
    ok = +right;
    of = 1;
    c.record(it.id, mode, right, ms);
    clean = right;
    c.ladder(it.id, right);
    c.view.querySelectorAll<HTMLButtonElement>('.chip').forEach((b) => (b.disabled = true));
    detail = `<p><b>${right ? '' : 'Answer: '}</b>${c.esc(it.answer)}</p>${it.explain ? `<p class="muted small">${c.esc(it.explain)}</p>` : ''}`;
  } else {
    const qs = it.qs!;
    qs.forEach((q, qi) => {
      const right = r.picks[qi] === q.answer;
      c.record(`${it.id}#${qi + 1}`, mode, right, ms / qs.length);
      ok += +right;
      of++;
      c.view.querySelectorAll<HTMLButtonElement>(`.opt[data-q="${qi}"]`).forEach((b) => {
        const i = Number(b.dataset.i);
        b.disabled = true;
        b.classList.remove('sel');
        if (i === q.answer) b.classList.add('right');
        else if (i === r.picks[qi]) b.classList.add('wrong');
      });
    });
    clean = ok === of;
    c.ladder(it.id, clean);
    detail = qs.map((q, qi) => `<p class="small"><b>${qi + 1}.</b> ${c.esc(q.explain)}</p>`).join('');
    if (it.audio) {
      detail += `<details class="tf-script"><summary>Transcript</summary>${it.audio
        .map((l) => `<p class="small"><b>${l.s === 'f' ? 'W' : 'M'}:</b> ${c.esc(l.t)}</p>`)
        .join('')}<button class="btn link" data-replay>▶ Replay</button></details>`;
    }
  }
  r.results.push({ id: it.id, ok, of });

  const after = c.view.querySelector('#after') as HTMLElement;
  after.innerHTML = `
    <div class="verdict ${ok === of ? 'ok' : 'no'}">
      <strong>${ok} / ${of} right${clean ? '' : ' · back tomorrow'} (${c.mmss(ms / 1000)})</strong>
      ${detail}
    </div>
    <button class="btn primary wide" data-next>${r.pos + 1 < r.list.length ? 'Next' : 'See results'}</button>`;
  c.on('[data-replay]', () => speak(it.audio ?? []));
  c.on('[data-next]', () => {
    stopAudio();
    r.pos++;
    renderItem(c);
    window.scrollTo(0, 0);
  });
}

// Build a Sentence as the real test shows it: lowercase pieces, the end mark
// fixed in place, short pieces, and one decoy that fits nowhere.
const SWAP: Record<string, string> = {
  is: 'are', are: 'is', was: 'were', were: 'was', has: 'have', have: 'has', do: 'does', does: 'do',
  did: 'does', this: 'these', these: 'this', it: 'they', them: 'it', me: 'my', my: 'me', much: 'many',
  many: 'much', than: 'then', which: 'who', who: 'which', been: 'being', its: "it's",
};
function basPieces(it: TItem, all: TItem[]) {
  const m = it.answer!.trim().match(/[.?!]$/);
  const end = m ? m[0] : '';
  const pieces = it.chunks!.map((p) => p.trim().replace(/[.?!]$/, ''));
  if (!/^I\b/.test(pieces[0])) pieces[0] = pieces[0][0].toLowerCase() + pieces[0].slice(1);
  for (let min = 3; pieces.length < 6; ) {
    let at = -1;
    pieces.forEach((p, i) => { if (p.split(' ').length >= min && (at < 0 || p.length > pieces[at].length)) at = i; });
    if (at < 0) { if (--min < 2) break; continue; }
    const w = pieces[at].split(' '), h = Math.ceil(w.length / 2);
    pieces.splice(at, 1, w.slice(0, h).join(' '), w.slice(h).join(' '));
  }
  let decoy = '';
  for (const p of shuffle([...pieces])) {
    const w = p.split(' '), i = w.findIndex((x) => SWAP[x.toLowerCase()]);
    if (i < 0) continue;
    w[i] = SWAP[w[i].toLowerCase()];
    const v = w.join(' ');
    if (!pieces.includes(v)) { decoy = v; break; }
  }
  if (!decoy) {
    const pool = all.filter((x) => x.type === 'bas' && x.id !== it.id).flatMap((x) => x.chunks!);
    decoy = (shuffle(pool).find((p) => !/^I\b/.test(p)) ?? 'also').replace(/[.?!]$/, '').toLowerCase();
  }
  return { pieces: [...pieces, decoy], decoy: pieces.length, end };
}

const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([.,?!])/g, '$1').trim().toLowerCase();

function finish(c: Ctx) {
  const r = run;
  if (r) clearInterval(r.timer);
  stopAudio();
  run = null;
  c.done();
  if (!r || !r.results.length) return home(c);
  const ok = r.results.reduce((n, x) => n + x.ok, 0);
  const of = r.results.reduce((n, x) => n + x.of, 0);
  c.view.innerHTML = `
    <h2>Set done</h2>
    <p class="kicker">${c.esc(typeOf(r.type).name)}</p>
    <div class="stats"><div class="stat"><b>${ok} / ${of}</b><span>right</span></div>
      <div class="stat"><b>${Math.round((ok / of) * 100)}%</b><span>accuracy</span></div></div>
    <div class="row" style="margin-top:1.2rem"><button class="btn primary" data-home>Back to TOEFL</button></div>`;
  c.on('[data-home]', () => home(c));
}

// ═══════════════════════════════════════════ audio

let voiceF: SpeechSynthesisVoice | null = null;
let voiceM: SpeechSynthesisVoice | null = null;
function pickVoices() {
  const en = speechSynthesis.getVoices().filter((v) => /^en[-_]/i.test(v.lang));
  const find = (re: RegExp) => en.find((v) => re.test(v.name));
  voiceF = find(/Google US English|Samantha|Aria|Jenny|Zira|Female|Libby|Sonia/i) ?? en[0] ?? null;
  voiceM = find(/Google UK English Male|Daniel|Guy|Ryan|David|Male/i) ?? en.find((v) => v !== voiceF) ?? voiceF;
}
if ('speechSynthesis' in window) {
  pickVoices();
  speechSynthesis.addEventListener?.('voiceschanged', pickVoices);
}

let speaking = 0;
function stopAudio() {
  speaking++;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/** Speak the lines in order. Long lines are split into sentences, because
 * Chrome silently stops utterances that run past ~15 seconds. */
function speak(lines: Line[]): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  stopAudio();
  const token = speaking;
  if (!voiceF) pickVoices();
  const parts = lines.flatMap((l) => (l.t.match(/[^.!?]+[.!?]*["”’]?\s*/g) ?? [l.t]).map((t) => ({ s: l.s, t: t.trim() })).filter((p) => p.t));
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (token !== speaking || i >= parts.length) return resolve();
      const p = parts[i++];
      const u = new SpeechSynthesisUtterance(p.t);
      const v = p.s === 'm' ? voiceM : voiceF;
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = 0.95;
      u.onend = () => setTimeout(next, i < parts.length && parts[i].s !== p.s ? 350 : 120);
      u.onerror = () => next();
      speechSynthesis.speak(u);
    };
    next();
  });
}
