/**
 * TOEFL Speaking inside the TOEFL tab: Listen and Repeat (auto-scored from the
 * browser transcript) and Take an Interview (transcripts saved as an essay of
 * task toefl_speaking so Claude can grade them). Audio is neural TTS made by
 * masters/03-toefl/speaking/gen.py and served from /gree/speak/.
 * The content is original, written to the 2026 ETS task specs.
 */
import DATA from '../../data/gree/toefl-speaking.json';

export interface SpeakCtx {
  view: HTMLElement;
  esc: (s: unknown) => string;
  on: (sel: string, fn: (e: Event, el: HTMLElement) => void) => void;
  record: (item: string, mode: string, correct: boolean, ms: number) => void;
  save: (prompt: string, body: string, seconds: number) => Promise<void>;
  back: () => void;
}

type SpeakSet = { kind: 'repeat'; id: string; scenario: string; lines: string[] } | { kind: 'interview'; id: string; intro: string; qs: string[] };
export const SPEAK_SETS: SpeakSet[] = [
  ...DATA.repeat.map((s) => ({ kind: 'repeat' as const, ...s })),
  ...DATA.interview.map((s) => ({ kind: 'interview' as const, ...s })),
];
export const NAMES: Record<string, string> = {
  lib: 'Library', zoo: 'Zoo', lab: 'Chemistry lab', dorm: 'Residence hall', learn: 'Learning & tech', city: 'City life', work: 'Careers',
};

let active = false;
let stream: MediaStream | null = null;
let actx: AudioContext | null = null;
let cancel: (() => void) | null = null;
export const speakBusy = () => active;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const click = (el: Element) => new Promise<void>((r) => el.addEventListener('click', () => r(), { once: true }));

function play(src: string) {
  return new Promise<void>((res, rej) => {
    const a = new Audio(src);
    a.onended = () => res();
    a.onerror = rej;
    cancel = () => { a.pause(); rej(new Error('cancel')); };
    a.play().catch(rej);
  });
}

function beep() {
  const o = actx!.createOscillator(), g = actx!.createGain();
  o.frequency.value = 880;
  g.gain.value = 0.15;
  o.connect(g).connect(actx!.destination);
  o.start();
  o.stop(actx!.currentTime + 0.25);
  return wait(350);
}

interface Ui { st: HTMLElement; timer: HTMLElement; stop: HTMLButtonElement; bar: HTMLElement; live: HTMLElement; out: HTMLElement }

function stage(c: SpeakCtx, title: string, sub: string): Ui {
  c.view.innerHTML = `
    <div class="bar"><span class="kicker">${c.esc(title)}</span><button class="btn link" data-quit>End</button></div>
    <div class="sp-stage">
      <div class="sp-status" id="sp-st">${sub}</div>
      <div class="sp-row"><div class="sp-timer" id="sp-tm"></div><button class="btn" id="sp-stop" disabled>Done speaking</button></div>
      <div class="sp-bar"><div id="sp-bar"></div></div>
      <div class="muted small" id="sp-live" style="min-height:1.5rem;margin-top:0.6rem"></div>
    </div>
    <div id="sp-out"></div>`;
  c.on('[data-quit]', () => quit(c));
  const q = <T extends HTMLElement>(s: string) => c.view.querySelector(s) as T;
  return { st: q('#sp-st'), timer: q('#sp-tm'), stop: q('#sp-stop'), bar: q('#sp-bar'), live: q('#sp-live'), out: q('#sp-out') };
}

function quit(c: SpeakCtx) {
  active = false;
  cancel?.();
  c.back();
}

/** Records until the timer runs out or Done is pressed. */
function listen(secs: number, ui: Ui) {
  return new Promise<{ text: string; url: string; secs: number }>((resolve, reject) => {
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream!);
    rec.ondataavailable = (e) => chunks.push(e.data);
    const finals: string[] = [];
    let interim = '', live = true;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    let sr: any = null;
    if (SR) {
      sr = new SR();
      sr.lang = 'en-US';
      sr.continuous = true;
      sr.interimResults = true;
      sr.onresult = (e: any) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) finals.push(e.results[i][0].transcript.trim());
          else interim += e.results[i][0].transcript;
        }
        ui.live.textContent = `${finals.join(' ')} ${interim}`.trim();
      };
      sr.onend = () => { if (live) try { sr.start(); } catch { /* already running */ } };
      sr.start();
    }
    rec.start();
    const t0 = Date.now();
    ui.stop.disabled = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(tick);
      live = false;
      rec.onstop = async () => {
        if (sr) { sr.stop(); await wait(900); }
        resolve({ text: `${finals.join(' ')} ${interim}`.trim(), url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType })), secs: (Date.now() - t0) / 1000 });
      };
      rec.stop();
    };
    const tick = setInterval(() => {
      if (!active) { clearInterval(tick); live = false; try { rec.stop(); sr?.stop(); } catch { /* gone */ } reject(new Error('cancel')); return; }
      const left = Math.max(0, secs - (Date.now() - t0) / 1000);
      ui.timer.textContent = String(Math.ceil(left));
      ui.bar.style.width = `${100 * (1 - left / secs)}%`;
      if (left <= 0) finish();
    }, 100);
    ui.stop.onclick = finish;
  });
}

// ── scoring Listen and Repeat against the transcript

const NUM: Record<string, string> = { '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six', '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve' };
const FUNC = new Set('a an the to of in on at for and or but is are was were be by with your our my it this that if so as from'.split(' '));
const words = (s: string) =>
  s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\batleast\b/g, 'at least')
    .split(/\s+/).filter(Boolean).map((w) => NUM[w] ?? w);

export function scoreRepeat(target: string, said: string) {
  const t = words(target), s = words(said), m = t.length, n = s.length;
  const d = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) d[i][j] = t[i] === s[j] ? d[i + 1][j + 1] + 1 : Math.max(d[i + 1][j], d[i][j + 1]);
  const hit = new Array<boolean>(m).fill(false);
  for (let i = 0, j = 0; i < m && j < n; ) {
    if (t[i] === s[j]) { hit[i] = true; i++; j++; } else if (d[i + 1][j] >= d[i][j + 1]) i++; else j++;
  }
  const len = d[0][0], missed = t.filter((_, i) => !hit[i]), extra = Math.max(0, n - len);
  const contentMissed = missed.filter((w) => !FUNC.has(w)).length;
  const score = !n ? 0 : !missed.length && !extra ? 5 : contentMissed <= 1 && missed.length + extra <= 2 ? 4 : len / m >= 0.75 ? 3 : len / m >= 0.45 ? 2 : 1;
  return { score, t, hit };
}

// ── runs

async function start(c: SpeakCtx, set: SpeakSet) {
  try {
    stream ??= await navigator.mediaDevices.getUserMedia({ audio: true });
    actx ??= new AudioContext();
  } catch {
    c.view.innerHTML = `<p class="err">The microphone isn't available. Allow mic access for kirtanjain.com in the browser and try again.</p><p><button class="btn" data-quit>Back</button></p>`;
    c.on('[data-quit]', () => quit(c));
    return;
  }
  active = true;
  try {
    if (set.kind === 'repeat') await runRepeat(c, set);
    else await runInterview(c, set);
  } catch (e) {
    if ((e as Error).message !== 'cancel') throw e;
  }
}

const secsFor = (n: number) => (n < 3 ? 8 : n < 5 ? 10 : 12);

async function runRepeat(c: SpeakCtx, set: Extract<SpeakSet, { kind: 'repeat' }>) {
  let ui = stage(c, `Listen and Repeat · ${NAMES[set.id]}`, c.esc(set.scenario));
  ui.out.innerHTML = `<p class="muted small">Each sentence plays once. Wait for the beep, then repeat it exactly.</p><button class="btn primary" id="sp-go">Start</button>`;
  await click(c.view.querySelector('#sp-go')!);
  const rows: string[] = [];
  let total = 0;
  for (let n = 0; n < set.lines.length; n++) {
    ui = stage(c, `Listen and Repeat · ${n + 1} of ${set.lines.length}`, 'Listen…');
    await wait(600);
    await play(`/gree/speak/${set.id}-${n}.mp3`);
    await beep();
    ui.st.innerHTML = '<span class="sp-rec">● Repeat now</span>';
    const t0 = performance.now();
    const r = await listen(secsFor(n), ui);
    const sc = scoreRepeat(set.lines[n], r.text);
    total += sc.score;
    c.record(`lar-${set.id}-${n}`, 'toefl-lar', sc.score >= 4, performance.now() - t0);
    const marked = sc.t.map((w, i) => (sc.hit[i] ? `<span class="sp-ok">${c.esc(w)}</span>` : `<span class="sp-miss">${c.esc(w)}</span>`)).join(' ');
    rows.push(`${n + 1}. [${sc.score}] target: ${set.lines[n]}\n   said:   ${r.text}`);
    ui.st.textContent = 'Recorded';
    ui.timer.textContent = '';
    ui.stop.disabled = true;
    ui.out.innerHTML = `
      <div class="verdict ${sc.score >= 4 ? 'ok' : 'no'}"><strong>${sc.score}/5</strong>${marked}
        <p class="small" style="margin:0.5rem 0 0">Heard: ${c.esc(r.text) || '<i>nothing</i>'}</p></div>
      <audio controls src="${r.url}"></audio>
      <p class="muted small">Auto-score from the browser's transcript. If a "wrong" word was right, the recognizer misheard: play it back.</p>
      <p><button class="btn primary" id="sp-next">${n + 1 < set.lines.length ? 'Next sentence' : 'Finish'}</button></p>`;
    await click(c.view.querySelector('#sp-next')!);
  }
  const body = `LISTEN AND REPEAT · ${NAMES[set.id]} · auto ${total}/35\n${rows.join('\n')}`;
  await c.save(`Listen and Repeat: ${NAMES[set.id]}`, body, 0).catch(() => {});
  done(c, `${total}/35`, body);
}

async function runInterview(c: SpeakCtx, set: Extract<SpeakSet, { kind: 'interview' }>) {
  let ui = stage(c, `Take an Interview · ${NAMES[set.id]}`, '4 questions, 45 seconds each, no preparation time.');
  ui.out.innerHTML = `
    <p><label><input type="checkbox" id="sp-showq"> Show the question text (the real test doesn't)</label></p>
    <p class="muted small">Answer → reason → your own example → wrap up at about 40 s.</p>
    <button class="btn primary" id="sp-go">Start</button>`;
  await click(c.view.querySelector('#sp-go')!);
  const showQ = (c.view.querySelector('#sp-showq') as HTMLInputElement).checked;
  stage(c, `Take an Interview · ${NAMES[set.id]}`, 'Listen…');
  await play(`/gree/speak/${set.id}-intro.mp3`);
  const parts: string[] = [];
  const cards: string[] = [];
  let spoke = 0;
  for (let n = 0; n < set.qs.length; n++) {
    ui = stage(c, `Take an Interview · question ${n + 1} of ${set.qs.length}`, showQ ? c.esc(set.qs[n]) : 'Listen…');
    await wait(500);
    await play(`/gree/speak/${set.id}-${n}.mp3`);
    await beep();
    ui.st.innerHTML = `<span class="sp-rec">● Answer now</span>${showQ ? `<div class="muted small">${c.esc(set.qs[n])}</div>` : ''}`;
    const r = await listen(45, ui);
    spoke += r.secs;
    const wc = words(r.text).length;
    parts.push(`Q${n + 1}: ${set.qs[n]}\n(${Math.round(r.secs)} s, ${wc} words)\nA: ${r.text || '(nothing transcribed)'}`);
    cards.push(`<div class="sp-ans"><b>Q${n + 1}. ${c.esc(set.qs[n])}</b><p>${c.esc(r.text) || '<i>nothing transcribed</i>'}</p>
      <p class="muted small">${Math.round(r.secs)} s · ${wc} words${r.secs < 40 ? ' · <b>stopped early: use the full 45 s</b>' : ''}</p><audio controls src="${r.url}"></audio></div>`);
    if (n + 1 < set.qs.length) { ui.st.textContent = 'Next question…'; await wait(1200); }
  }
  const body = `INTERVIEW · ${NAMES[set.id]}\n${parts.join('\n\n')}`;
  await c.save(`Interview: ${NAMES[set.id]}\n${set.qs.map((q, i) => `${i + 1}. ${q}`).join('\n')}`, body, Math.round(spoke)).catch(() => {});
  done(c, 'Saved for Claude', body, cards.join(''));
}

function done(c: SpeakCtx, head: string, body: string, extra = '') {
  active = false;
  c.view.innerHTML = `
    <h2>${c.esc(head)}</h2>
    <p class="muted">Saved to Writing as a speaking transcript. Tell Claude "grade my gree speaking" to get feedback, or copy it below.</p>
    ${extra}
    <textarea class="sp-copy" readonly>${c.esc(body)}</textarea>
    <p><button class="btn" id="sp-copy">Copy</button> <button class="btn primary" data-quit>Back to TOEFL</button></p>`;
  c.on('[data-quit]', () => quit(c));
  c.on('#sp-copy', async (_e, el) => { await navigator.clipboard.writeText(body); el.textContent = 'Copied'; });
}

export function speakStart(c: SpeakCtx, id: string) {
  const set = SPEAK_SETS.find((s) => s.id === id);
  if (set) void start(c, set);
}
