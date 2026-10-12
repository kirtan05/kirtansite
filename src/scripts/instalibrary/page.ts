const ENDPOINT = '/api/library';
const READING = '/api/reading';
const TYPES = ['book', 'film', 'show', 'recipe', 'music', 'tool', 'place', 'other'];
/** What "done" is called for each kind of thing. */
const DONE_VERB: Record<string, string> = {
  book: 'Read',
  film: 'Seen',
  show: 'Seen',
  recipe: 'Cooked',
  music: 'Heard',
  tool: 'Tried',
  place: 'Been',
  other: 'Done',
};
/** A line under the tabs for the kinds that need explaining. */
const TAB_NOTE: Record<string, string> = {
  tool: 'The verdicts are Claude’s, written for me after looking up each project and checking what my laptop already has. The grey line under each is what the reel claimed.',
  place: 'Grouped by city. Map links are a Google Maps search for the name, so check the pin before setting out.',
};
/** How a tool was judged, in the order the groups are shown. */
const VERDICTS: Record<string, string> = {
  use: 'Worth using',
  try: 'Worth a try',
  have: 'Already have',
  skip: 'Skip',
  '': 'Not reviewed yet',
};

let items: any[] = [];
let signedIn = false;
let active = 'book';
/** The narrowing chosen in each tab, so switching away and back keeps it. */
const chosen: Record<string, { group: string; kind: string }> = {};
/** Normalised titles from spine: books finished, and books open right now. */
let finishedTitles = new Set<string>();
let readingTitles = new Set<string>();

/** Mirrors the Worker's normaliseTitle closely enough to match spine's titles. */
function normalise(title: string): string {
  const words = title
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length > 1 && ['the', 'a', 'an'].includes(words[0])) words.shift();
  return words.join(' ');
}

function el(tag: string, className = '', text = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * The heading an item sits under: its city for a place, its verdict for a tool.
 * `key` sorts and filters; `label` is what is shown. Other kinds are not grouped.
 */
function groupOf(item: any): { key: string; label: string } | null {
  const body = item.body || {};
  if (item.type === 'place') {
    if (!body.city) return { key: '~', label: 'City not known' };
    const label = [body.city, body.country].filter(Boolean).join(', ');
    return { key: label, label };
  }
  if (item.type === 'tool') {
    const verdict = body.verdict in VERDICTS ? body.verdict : '';
    return { key: String(Object.keys(VERDICTS).indexOf(verdict)), label: VERDICTS[verdict] };
  }
  return null;
}

function kindOf(item: any): string {
  return (item.body && typeof item.body.kind === 'string' && item.body.kind) || '';
}

/** A book spine has finished counts as done here even if nobody ticked it. */
function isDone(item: any): boolean {
  return item.status === 'done' || (item.type === 'book' && finishedTitles.has(normalise(item.title)));
}

function note(message: string) {
  document.getElementById('library-note')!.textContent = message;
}

async function patch(item: any, body: Record<string, unknown>, button?: HTMLButtonElement) {
  if (button) button.disabled = true;
  try {
    const response = await fetch(`${ENDPOINT}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 401) {
      signedIn = false;
      note('Signed out. Sign in again to edit.');
    } else if (response.status === 409) {
      note('Another entry already has that title under that kind.');
    } else if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    } else {
      const updated = (await response.json()).item;
      items = updated.status === 'dismissed'
        ? items.filter((other) => other.id !== item.id)
        : items.map((other) => (other.id === item.id ? updated : other));
      note('');
    }
  } catch {
    note('That change did not save. Try again in a moment.');
  }
  render();
}

function action(label: string, onClick: (button: HTMLButtonElement) => void): HTMLButtonElement {
  const button = el('button', 'library-action', label) as HTMLButtonElement;
  button.type = 'button';
  button.addEventListener('click', () => onClick(button));
  return button;
}

function row(item: any): HTMLElement {
  const done = isDone(item);
  const wrap = el('div', 'flex gap-4 py-4 first:pt-0 last:pb-0');

  if (item.cover_url) {
    const cover = el('img', 'library-cover') as HTMLImageElement;
    cover.src = item.cover_url;
    cover.alt = '';
    cover.loading = 'lazy';
    wrap.appendChild(cover);
  } else if (item.type === 'book' || item.type === 'film' || item.type === 'show') {
    const blank = el('div', 'library-cover');
    blank.dataset.empty = 'true';
    wrap.appendChild(blank);
  }

  const main = el('div', 'min-w-0 flex-1');
  const head = el('div', 'flex items-baseline justify-between gap-4');
  head.appendChild(el('h3', 'font-display text-lg font-bold text-text', item.title));

  const flags: string[] = [];
  if (item.type === 'book' && !done && readingTitles.has(normalise(item.title))) flags.push('Reading now');
  else if (item.status === 'doing') flags.push('In progress');
  if (item.needs_review) flags.push('Check this');
  if (flags.length) head.appendChild(el('span', 'shrink-0 font-mono text-xs text-accent', flags.join(' · ')));
  main.appendChild(head);

  const body = item.body || {};
  const where = item.type === 'place' ? [body.area, body.city].filter(Boolean).join(', ') : '';
  const byline = [item.creator, item.year, kindOf(item), where].filter(Boolean).join(' · ');
  const links: [string, string][] = [];
  if (item.type === 'place' && body.maps_url) links.push(['Map', body.maps_url]);
  if (item.type === 'tool' && body.url) links.push(['Open', body.url]);
  if (byline || links.length) {
    const line = el('div', 'mt-1 font-mono text-xs text-text-secondary', byline);
    for (const [label, href] of links) {
      if (line.textContent) line.appendChild(document.createTextNode(' · '));
      const link = el('a', 'text-accent hover:underline', label) as HTMLAnchorElement;
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      line.appendChild(link);
    }
    main.appendChild(line);
  }

  // My own read on a tool, kept apart from what the reel claimed for it.
  if (item.type === 'tool' && body.verdict in VERDICTS && body.verdict) {
    const line = el('p', 'mt-2 text-sm leading-relaxed text-text');
    const badge = el('span', 'library-verdict mr-2 font-mono text-xs', VERDICTS[body.verdict]);
    badge.dataset.verdict = body.verdict;
    line.appendChild(badge);
    if (body.why) line.appendChild(document.createTextNode(body.why));
    main.appendChild(line);
  }

  // One line per reel: what it said, and who said it.
  for (const source of item.sources || []) {
    const line = el('p', 'mt-2 text-sm leading-relaxed text-text-secondary');
    if (source.note) line.appendChild(document.createTextNode(`${source.note} `));
    const link = el('a', 'whitespace-nowrap font-mono text-xs text-accent hover:underline') as HTMLAnchorElement;
    link.href = source.reel_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = source.reel_author ? `@${source.reel_author}` : 'reel';
    line.appendChild(link);
    main.appendChild(line);
  }

  if (item.body && (item.body.ingredients?.length || item.body.steps?.length)) {
    const details = el('details', 'mt-3 text-sm text-text-secondary');
    details.appendChild(el('summary', 'cursor-pointer font-mono text-xs uppercase tracking-widest', 'Recipe'));
    if (item.body.ingredients?.length) {
      const list = el('ul', 'mt-3 list-disc space-y-1 pl-5');
      for (const line of item.body.ingredients) list.appendChild(el('li', '', line));
      details.appendChild(list);
    }
    if (item.body.steps?.length) {
      const list = el('ol', 'mt-3 list-decimal space-y-2 pl-5');
      for (const line of item.body.steps) list.appendChild(el('li', '', line));
      details.appendChild(list);
    }
    main.appendChild(details);
  }

  if (signedIn) {
    const bar = el('div', 'mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-text-secondary');
    if (item.status === 'done') {
      bar.appendChild(action('Back to want', (b) => patch(item, { status: 'want' }, b)));
    } else {
      bar.appendChild(action(DONE_VERB[item.type], (b) => patch(item, { status: 'done' }, b)));
    }
    bar.appendChild(action('Dismiss', (b) => patch(item, { status: 'dismissed' }, b)));

    const select = el('select', 'library-select') as HTMLSelectElement;
    select.setAttribute('aria-label', `Kind for ${item.title}`);
    for (const type of TYPES) {
      const option = el('option', '', type) as HTMLOptionElement;
      option.value = type;
      option.selected = type === item.type;
      select.appendChild(option);
    }
    select.addEventListener('change', () => patch(item, { type: select.value, needs_review: false }));
    bar.appendChild(select);

    if (item.needs_review) bar.appendChild(action('Looks right', (b) => patch(item, { needs_review: false }, b)));
    main.appendChild(bar);
  }

  wrap.appendChild(main);
  return wrap;
}

function fill(id: string, list: any[], emptyMessage: string) {
  const node = document.getElementById(id)!;
  node.textContent = '';
  if (!list.length) {
    node.appendChild(el('p', 'font-mono text-sm text-text-secondary', emptyMessage));
    return;
  }
  // Biggest city first, verdicts in their fixed order; ungrouped kinds stay as they came.
  const size = new Map<string, number>();
  for (const item of list) {
    const key = groupOf(item)?.key ?? '';
    size.set(key, (size.get(key) || 0) + 1);
  }
  const byGroup = (a: any, b: any) => {
    const [ga, gb] = [groupOf(a), groupOf(b)];
    if (!ga || !gb || ga.key === gb.key) return 0;
    if (a.type === 'tool') return ga.key < gb.key ? -1 : 1;
    if (ga.key === '~' || gb.key === '~') return ga.key === '~' ? 1 : -1;
    return size.get(gb.key)! - size.get(ga.key)! || (ga.key < gb.key ? -1 : 1);
  };
  const byKind = (a: any, b: any) =>
    a.type === 'place' ? kindOf(a).localeCompare(kindOf(b)) || a.title.localeCompare(b.title) : 0;

  let heading = '';
  for (const item of [...list].sort((a, b) => byGroup(a, b) || byKind(a, b))) {
    const group = groupOf(item);
    if (group && group.label !== heading) {
      heading = group.label;
      node.appendChild(el('h3', 'library-group', `${heading} · ${size.get(group.key)}`));
    }
    node.appendChild(row(item));
  }
}

/** Fill one narrowing menu from what the tab holds; hide it when there is no choice. */
function menu(id: string, all: string, options: [string, string][], value: string): string {
  const select = document.getElementById(id) as HTMLSelectElement;
  select.textContent = '';
  select.hidden = options.length < 2;
  for (const [key, label] of [['', all] as [string, string], ...options]) {
    const option = el('option', '', label) as HTMLOptionElement;
    option.value = key;
    select.appendChild(option);
  }
  select.value = options.some(([key]) => key === value) ? value : '';
  return select.value;
}

function tally(list: any[], pick: (item: any) => [string, string] | null): [string, string][] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const item of list) {
    const found = pick(item);
    if (!found) continue;
    const entry = seen.get(found[0]) || { label: found[1], count: 0 };
    entry.count += 1;
    seen.set(found[0], entry);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, { label, count }]) => [key, `${label} (${count})`]);
}

function render() {
  for (const tab of document.querySelectorAll<HTMLElement>('.library-tab')) {
    const type = tab.dataset.type!;
    tab.setAttribute('aria-selected', String(type === active));
    const count = items.filter((item) => item.type === type && !isDone(item)).length;
    tab.querySelector('.library-count')!.textContent = count ? String(count) : '';
  }

  const all = items.filter((item) => item.type === active);
  const picked = (chosen[active] ||= { group: '', kind: '' });
  picked.group = menu(
    'filter-group',
    active === 'place' ? 'All cities' : 'All verdicts',
    tally(all, (item) => {
      const group = groupOf(item);
      return group ? [group.key, group.label] : null;
    }),
    picked.group,
  );
  picked.kind = menu(
    'filter-kind',
    'All kinds',
    tally(all, (item) => (kindOf(item) ? [kindOf(item), kindOf(item)] : null)),
    picked.kind,
  );
  const filters = document.getElementById('library-filters')!;
  filters.hidden = [...filters.querySelectorAll('select')].every((select) => select.hidden);

  const tabNote = document.getElementById('library-tabnote')!;
  tabNote.textContent = TAB_NOTE[active] || '';
  tabNote.hidden = !TAB_NOTE[active];

  const mine = all.filter(
    (item) =>
      (!picked.group || groupOf(item)?.key === picked.group) &&
      (!picked.kind || kindOf(item) === picked.kind),
  );
  const want = mine.filter((item) => !isDone(item));
  const done = mine
    .filter(isDone)
    .sort((a, b) => b.status_changed_at - a.status_changed_at);

  document.getElementById('want-count')!.textContent = want.length ? String(want.length) : '';
  document.getElementById('done-count')!.textContent = done.length ? String(done.length) : '';
  fill('want', want, 'Nothing waiting here.');
  fill('done', done, 'Nothing finished yet.');

  document.getElementById('signin-toggle')!.hidden = signedIn;
  if (signedIn) document.getElementById('signin-form')!.hidden = true;
}

function unavailable() {
  for (const id of ['want', 'done']) {
    const node = document.getElementById(id)!;
    node.textContent = '';
    node.appendChild(el('p', 'font-mono text-sm text-text-secondary', 'Unavailable.'));
  }
  note('The library did not load. It will be back when its server is reachable.');
}

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function selectTab(type: string, updateHash = true) {
  if (!TYPES.includes(type)) return;
  active = type;
  if (updateHash) history.replaceState(null, '', `#${type}`);
  render();
}

async function load() {
  // Bail if this is not the library page — astro:page-load fires on every route.
  if (!document.getElementById('library')) return;

  const fromHash = location.hash.slice(1);
  if (TYPES.includes(fromHash)) active = fromHash;

  for (const tab of document.querySelectorAll<HTMLElement>('.library-tab')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.type!));
  }

  for (const [id, field] of [['filter-group', 'group'], ['filter-kind', 'kind']] as const) {
    document.getElementById(id)!.addEventListener('change', (event) => {
      (chosen[active] ||= { group: '', kind: '' })[field] = (event.target as HTMLSelectElement).value;
      render();
    });
  }

  const toggle = document.getElementById('signin-toggle')!;
  const form = document.getElementById('signin-form') as HTMLFormElement;
  const password = document.getElementById('signin-password') as HTMLInputElement;
  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) password.focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const response = await fetch(`${ENDPOINT}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    }).catch(() => null);
    password.value = '';
    if (response?.ok) {
      signedIn = true;
      note('');
      render();
    } else {
      note(response ? 'That password was not right.' : 'Could not reach the server.');
    }
  });

  try {
    items = (await getJson(ENDPOINT)).items || [];
  } catch {
    unavailable();
    return;
  }
  render();

  // Both of these only add to what is already on screen, so neither blocks it
  // and neither failing is worth a message.
  getJson(`${ENDPOINT}/me`)
    .then((me) => {
      signedIn = Boolean(me.signedIn);
      render();
    })
    .catch(() => {});
  getJson(READING)
    .then((reading) => {
      const titles = (books: any[]) =>
        new Set((books || []).map((book) => normalise(book.title || '')).filter(Boolean));
      finishedTitles = titles(reading.recently_finished);
      readingTitles = titles(reading.currently_reading);
      render();
    })
    .catch(() => {});
}

// ClientRouter is enabled in BaseLayout, so a client-side navigation to this
// page never fires DOMContentLoaded. astro:page-load covers both cases.
document.addEventListener('astro:page-load', load);
// A link to /instalibrary#film followed while already here changes only the hash.
window.addEventListener('hashchange', () => {
  if (document.getElementById('library')) selectTab(location.hash.slice(1), false);
});
