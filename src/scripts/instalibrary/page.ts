/**
 * The /instalibrary page: fetches the library and draws it.
 *
 * Every decision about grouping, order, search and narrowing is made in
 * `facets.ts`; this file builds the DOM around the answers. Nothing that comes
 * from the library is ever set as HTML: it goes in through `textContent` or as
 * an attribute.
 */
import {
  GROUP_LABELS,
  NARROW_LABELS,
  TABS,
  VERDICTS,
  bodyOf,
  byline,
  groupItems,
  matchesNarrow,
  matchesSearch,
  narrowOptions,
  safeUrl,
  sourcesOf,
  titleOf,
} from './facets.ts';
import type { Group, Item, Source } from './facets.ts';

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
  place: 'Map links are a Google Maps search for the name, so check the pin before setting out.',
};

/** Rows shown at a time in a flat list, and how many more "Show more" adds. */
const PAGE_SIZE = 60;
/** A search with this many matches or fewer opens every group. */
const OPEN_ALL_AT = 30;
/** Covers in a group heading. */
const HEADING_COVERS = 5;
/** How long typing must pause before the page searches. */
const SEARCH_DELAY = 150;

let items: Item[] = [];
/** Set once the library has arrived; until then the lists keep saying "Loading…" or "Unavailable.". */
let loaded = false;
let signedIn = false;
let active = 'book';
/** What is typed in the search box, once typing has paused. One for the whole page. */
let query = '';
let searchTimer: number | undefined;

/** The grouping and narrowing chosen in each tab, so switching away and back keeps them. */
const chosen: Record<string, { group: string; narrow: Record<string, string> }> = {};
/**
 * Groups the reader opened or closed by hand, per tab, as `section:key` to open.
 * A group not in here follows the search: open when few items match, else shut.
 */
const groupStates: Record<string, Map<string, boolean>> = {};
/** Rows that are open, by item id, so an edit does not collapse the others. */
const openRows = new Set<number>();
/** How many rows a flat list shows, per `tab:section`, once "Show more" was used. */
const extended: Record<string, number> = {};
/** Gives each row's detail panel an id of its own, as one item can sit in several lists. */
let rowSerial = 0;

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

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((line): line is string => str(line) !== '') : [];
}

/** A book spine has finished counts as done here even if nobody ticked it. */
function isDone(item: Item): boolean {
  return item.status === 'done' || (item.type === 'book' && finishedTitles.has(normalise(titleOf(item))));
}

function note(message: string) {
  document.getElementById('library-note')!.textContent = message;
}

async function patch(item: Item, body: Record<string, unknown>, button?: HTMLButtonElement) {
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
      const updated: Item = (await response.json()).item;
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

function externalLink(className: string, href: string, label: string): HTMLAnchorElement {
  const link = el('a', className, label) as HTMLAnchorElement;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

/** What shows only when a row is open: what each reel said, the recipe, the buttons. */
function fillDetail(detail: HTMLElement, item: Item) {
  const body = bodyOf(item);

  // One line per reel: what it said, and who said it.
  for (const source of sourcesOf(item)) {
    const line = el('p', 'mt-2 text-sm leading-relaxed text-text-secondary');
    const words = str(source.note);
    if (words) line.appendChild(document.createTextNode(`${words} `));
    const label = str(source.reel_author) ? `@${str(source.reel_author)}` : 'reel';
    const href = safeUrl(source.reel_url);
    if (href) line.appendChild(externalLink('whitespace-nowrap font-mono text-xs text-accent hover:underline', href, label));
    else line.appendChild(el('span', 'whitespace-nowrap font-mono text-xs', label));
    detail.appendChild(line);
  }

  const ingredients = strings(body.ingredients);
  const steps = strings(body.steps);
  if (ingredients.length || steps.length) {
    const recipe = el('div', 'mt-3 text-sm text-text-secondary');
    if (ingredients.length) {
      recipe.appendChild(el('p', 'font-mono text-xs uppercase tracking-widest', 'Ingredients'));
      const list = el('ul', 'mt-2 list-disc space-y-1 pl-5');
      for (const line of ingredients) list.appendChild(el('li', '', line));
      recipe.appendChild(list);
    }
    if (steps.length) {
      recipe.appendChild(el('p', `${ingredients.length ? 'mt-3 ' : ''}font-mono text-xs uppercase tracking-widest`, 'Steps'));
      const list = el('ol', 'mt-2 list-decimal space-y-2 pl-5');
      for (const line of steps) list.appendChild(el('li', '', line));
      recipe.appendChild(list);
    }
    detail.appendChild(recipe);
  }

  if (signedIn) {
    const bar = el('div', 'mt-3 flex flex-wrap items-center gap-2 font-mono text-xs text-text-secondary');
    if (item.status === 'done') {
      bar.appendChild(action('Back to want', (b) => patch(item, { status: 'want' }, b)));
    } else {
      bar.appendChild(action(DONE_VERB[item.type] ?? 'Done', (b) => patch(item, { status: 'done' }, b)));
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
    detail.appendChild(bar);
  }
}

function row(item: Item): HTMLElement {
  const done = isDone(item);
  const body = bodyOf(item);
  const wrap = el('div', 'library-row flex gap-3 py-3 first:pt-0 last:pb-0');

  const coverUrl = safeUrl(item.cover_url);
  if (coverUrl) {
    const cover = el('img', 'library-cover') as HTMLImageElement;
    cover.src = coverUrl;
    cover.alt = '';
    cover.loading = 'lazy';
    wrap.appendChild(cover);
  } else if (item.type === 'book' || item.type === 'film' || item.type === 'show') {
    const blank = el('div', 'library-cover');
    blank.dataset.empty = 'true';
    wrap.appendChild(blank);
  }

  const main = el('div', 'min-w-0 flex-1');
  const head = el('div', 'flex items-baseline justify-between gap-3');
  const heading = el('h3', 'min-w-0 font-display text-base font-bold text-text');
  const title = el('button', 'library-title', item.title) as HTMLButtonElement;
  title.type = 'button';
  heading.appendChild(title);
  head.appendChild(heading);

  const flags: string[] = [];
  if (item.type === 'book' && !done && readingTitles.has(normalise(titleOf(item)))) flags.push('Reading now');
  else if (item.status === 'doing') flags.push('In progress');
  if (item.needs_review) flags.push('Check this');
  if (flags.length) head.appendChild(el('span', 'shrink-0 font-mono text-xs text-accent', flags.join(' · ')));
  main.appendChild(head);

  const links: [string, string][] = [];
  const map = item.type === 'place' ? safeUrl(body.maps_url) : null;
  if (map) links.push(['Map', map]);
  const open = item.type === 'tool' ? safeUrl(body.url) : null;
  if (open) links.push(['Open', open]);
  const about = byline(item);
  if (about || links.length) {
    const line = el('div', 'mt-1 break-words font-mono text-xs text-text-secondary', about);
    for (const [label, href] of links) {
      if (line.textContent) line.appendChild(document.createTextNode(' · '));
      line.appendChild(externalLink('text-accent hover:underline', href, label));
    }
    main.appendChild(line);
  }

  // My own read on a tool, kept apart from what the reel claimed for it.
  const verdict = item.type === 'tool' ? str(body.verdict) : '';
  if (verdict && Object.hasOwn(VERDICTS, verdict)) {
    const line = el('p', 'mt-2 text-sm leading-relaxed text-text');
    const badge = el('span', 'library-verdict mr-2 font-mono text-xs', VERDICTS[verdict]);
    badge.dataset.verdict = verdict;
    line.appendChild(badge);
    if (str(body.why)) line.appendChild(document.createTextNode(str(body.why)));
    main.appendChild(line);
  }

  const detail = el('div', 'library-detail');
  detail.id = `library-detail-${(rowSerial += 1)}`;
  title.setAttribute('aria-controls', detail.id);
  main.appendChild(detail);

  const setOpen = (value: boolean) => {
    if (value) {
      openRows.add(item.id);
      if (!detail.firstChild) fillDetail(detail, item);
    } else {
      openRows.delete(item.id);
    }
    detail.hidden = !value;
    title.setAttribute('aria-expanded', String(value));
  };
  setOpen(openRows.has(item.id));

  // The title is the keyboard way in; its click reaches here too. Links, menus
  // and buttons inside the row, and the open panel itself, leave the row alone.
  wrap.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a, select, input, label, .library-action, .library-detail')) return;
    setOpen(!openRows.has(item.id));
  });

  wrap.appendChild(main);
  return wrap;
}

/** One group: a heading that opens and closes, and rows that are built on first opening. */
function groupBox(group: Group, section: string, choice: string, autoOpen: boolean): HTMLElement {
  const states = (groupStates[active] ||= new Map());
  // The grouping is part of the key: "unsorted" and "else" recur under every grouping.
  const stateKey = `${section}:${choice}:${group.key}`;

  const box = el('details', 'library-groupbox') as HTMLDetailsElement;
  const summary = el('summary', 'library-summary');

  const text = el('div', 'library-headtext');
  text.appendChild(el('span', 'library-grouplabel', group.label));
  text.appendChild(el('span', 'library-groupcount', String(group.items.length)));
  if (group.account) text.appendChild(el('span', 'library-groupaccount', group.account));
  if (group.href) {
    // A link inside the heading must not open or close the group.
    const link = externalLink('library-grouplink', group.href, 'Open reel');
    link.addEventListener('click', (event) => event.stopPropagation());
    text.appendChild(link);
  }
  summary.appendChild(text);

  const covers = group.items
    .map((item) => safeUrl(item.cover_url))
    .filter((url): url is string => url !== null)
    .slice(0, HEADING_COVERS);
  if (covers.length) {
    const strip = el('div', 'library-strip');
    strip.setAttribute('aria-hidden', 'true');
    for (const url of covers) {
      const cover = el('img', 'library-thumb') as HTMLImageElement;
      cover.src = url;
      cover.alt = '';
      cover.loading = 'lazy';
      strip.appendChild(cover);
    }
    summary.appendChild(strip);
  }
  box.appendChild(summary);

  const rows = el('div', 'library-rows divide-y divide-border/50');
  box.appendChild(rows);
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    for (const item of group.items) rows.appendChild(row(item));
  };

  // Enter and Space on the summary arrive here as clicks, before the browser flips `open`.
  // While a short search holds every group open, a hand toggle is not remembered:
  // it would overwrite what the reader chose before searching.
  summary.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a') || autoOpen) return;
    states.set(stateKey, !box.open);
  });
  box.addEventListener('toggle', () => {
    if (box.open) build();
  });
  box.open = autoOpen || (states.get(stateKey) ?? false);
  if (box.open) build();
  return box;
}

/** Draw one section: headings and their groups, or a flat list that grows by sixties. */
function fillSection(node: HTMLElement, groups: Group[], section: string, choice: string, autoOpen: boolean) {
  node.textContent = '';
  if (choice !== 'none') {
    for (const group of groups) node.appendChild(groupBox(group, section, choice, autoOpen));
    return;
  }

  const list = groups[0]?.items ?? [];
  const key = `${active}:${section}`;
  const limit = extended[key] ?? PAGE_SIZE;
  for (const item of list.slice(0, limit)) node.appendChild(row(item));
  if (list.length > limit) {
    const more = action('Show more', () => {
      extended[key] = limit + PAGE_SIZE;
      render();
      // The button is gone after the redraw; land on the first row it added.
      document.getElementById(section)?.querySelectorAll<HTMLElement>('.library-title')[limit]?.focus();
    });
    more.classList.add('mt-3', 'font-mono', 'text-xs');
    node.appendChild(more);
  }
}

/** Fill one narrowing menu; the first option is "All genres" and the like. */
function fillNarrow(select: HTMLSelectElement, facet: string, all: Item[]) {
  const options = TABS[active].narrowBy.includes(facet) ? narrowOptions(all, facet) : [];
  const picks = chosen[active].narrow;
  select.textContent = '';
  select.hidden = options.length < 2;
  const first = el('option', '', NARROW_LABELS[facet] ?? 'All') as HTMLOptionElement;
  first.value = '';
  select.appendChild(first);
  for (const { value, label, count } of options) {
    const option = el('option', '', `${label} (${count})`) as HTMLOptionElement;
    option.value = value;
    select.appendChild(option);
  }
  // A hidden menu cannot be seen narrowing, so it must not be.
  if (select.hidden || !options.some((option) => option.value === picks[facet])) delete picks[facet];
  select.value = picks[facet] ?? '';
}

/** The "Group by" menu and the narrowing menus, for the tab that is open. */
function fillControls(all: Item[]) {
  const choice = (chosen[active] ||= { group: '', narrow: {} });
  const groupBy = TABS[active].groupBy;
  if (!groupBy.includes(choice.group)) choice.group = groupBy[0];

  const group = document.getElementById('filter-group') as HTMLSelectElement;
  group.textContent = '';
  for (const key of groupBy) {
    const option = el('option', '', GROUP_LABELS[key] ?? key) as HTMLOptionElement;
    option.value = key;
    group.appendChild(option);
  }
  group.value = choice.group;
  document.getElementById('filter-group-wrap')!.hidden = groupBy.length < 2;

  const menus = [...document.querySelectorAll<HTMLSelectElement>('[data-facet]')];
  for (const select of menus) fillNarrow(select, select.dataset.facet!, all);
  document.getElementById('library-menus')!.hidden =
    groupBy.length < 2 && menus.every((select) => select.hidden);
}

function render() {
  // A late fetch or a pending search can land after the reader has left the page.
  if (!document.getElementById('library')) return;
  for (const tab of document.querySelectorAll<HTMLElement>('.library-tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.type === active));
  }
  // The tab highlight follows a click at once; the rest waits for the library, so a
  // keystroke or click cannot replace "Loading…" or "Unavailable." with "Nothing matches.".
  if (!loaded) return;
  const searching = query.trim() !== '';

  for (const tab of document.querySelectorAll<HTMLElement>('.library-tab')) {
    const type = tab.dataset.type!;
    // While searching, a hit in another tab shows up here, finished or not.
    const count = items.filter((item) =>
      item.type === type && (searching ? matchesSearch(item, query) : !isDone(item)),
    ).length;
    tab.querySelector('.library-count')!.textContent = count ? String(count) : '';
  }

  const all = items.filter((item) => item.type === active);
  fillControls(all);
  const { group: choice, narrow } = chosen[active];

  const tabNote = document.getElementById('library-tabnote')!;
  tabNote.textContent = TAB_NOTE[active] || '';
  tabNote.hidden = !TAB_NOTE[active];

  const passes = (item: Item) => matchesNarrow(item, narrow) && matchesSearch(item, query);
  const wanted = (item: Item) => !isDone(item) && passes(item);
  const finished = (item: Item) => isDone(item) && passes(item);
  const wantCount = all.filter(wanted).length;
  const doneCount = all.filter(finished).length;
  // Few enough hits and every group is open, so nothing a search found stays hidden.
  const autoOpen = searching && wantCount + doneCount <= OPEN_ALL_AT;

  document.getElementById('want-count')!.textContent = wantCount ? String(wantCount) : '';
  document.getElementById('done-count')!.textContent = doneCount ? String(doneCount) : '';

  const want = document.getElementById('want')!;
  if (wantCount) {
    fillSection(want, groupItems(all, active, choice, wanted), 'want', choice, autoOpen);
  } else {
    const narrowing = searching || Object.values(narrow).some(Boolean);
    want.textContent = '';
    want.appendChild(el('p', 'font-mono text-sm text-text-secondary', narrowing ? 'Nothing matches.' : 'Nothing waiting here.'));
  }

  document.getElementById('done-section')!.hidden = doneCount === 0;
  if (doneCount) {
    fillSection(document.getElementById('done')!, groupItems(all, active, choice, finished), 'done', choice, autoOpen);
  }

  document.getElementById('signin-toggle')!.hidden = signedIn;
  if (signedIn) document.getElementById('signin-form')!.hidden = true;
}

function unavailable() {
  document.getElementById('done-section')!.hidden = false;
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
  loaded = false;

  const fromHash = location.hash.slice(1);
  if (TYPES.includes(fromHash)) active = fromHash;

  for (const tab of document.querySelectorAll<HTMLElement>('.library-tab')) {
    tab.addEventListener('click', () => selectTab(tab.dataset.type!));
  }

  const search = document.getElementById('library-search') as HTMLInputElement;
  search.value = query;
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = search.value;
      render();
    }, SEARCH_DELAY);
  });

  document.getElementById('filter-group')!.addEventListener('change', (event) => {
    chosen[active].group = (event.target as HTMLSelectElement).value;
    render();
  });
  for (const select of document.querySelectorAll<HTMLSelectElement>('[data-facet]')) {
    select.addEventListener('change', () => {
      chosen[active].narrow[select.dataset.facet!] = select.value;
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
  loaded = true;
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
      const titles = (books: { title?: string }[]) =>
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
