/**
 * How the library page groups, narrows and searches its items.
 *
 * The page asks the questions (which tab, which grouping, what was typed) and
 * this file answers them. It is kept free of the DOM and of imports so that
 * `node --test` can run it directly; the page only has to draw what comes back.
 *
 * Items come from a library that people also correct by hand, so every read is
 * defensive: `body` may be null and any field may be missing or the wrong type.
 * A wrong type counts as missing, which lands the item in "Unsorted" rather
 * than breaking the page.
 */

export interface Source {
  reel_url: string;
  reel_author: string | null;
  note: string | null;
  list_title?: string | null;
}

export interface Item {
  id: number;
  type: string;
  title: string;
  creator: string | null;
  year: number | null;
  cover_url: string | null;
  status: string;
  needs_review: boolean;
  status_changed_at: number;
  body: Record<string, unknown> | null;
  sources: Source[];
}

/** `account` and `href` are set for a list: who posted it, and the reel itself. */
export interface Group {
  key: string;
  label: string;
  items: Item[];
  account?: string;
  href?: string;
}

/** What a tab offers. The first grouping is the one the tab opens with. */
export const TABS: Record<string, { groupBy: string[]; narrowBy: string[] }> = {
  book: { groupBy: ['series', 'genre', 'list', 'none'], narrowBy: ['genre'] },
  film: { groupBy: ['list', 'genre', 'decade', 'language', 'none'], narrowBy: ['genre', 'language'] },
  show: { groupBy: ['genre', 'list', 'length', 'none'], narrowBy: ['genre', 'language'] },
  recipe: { groupBy: ['none'], narrowBy: [] },
  music: { groupBy: ['list', 'kind', 'none'], narrowBy: ['kind'] },
  tool: { groupBy: ['verdict', 'kind', 'list'], narrowBy: ['kind'] },
  place: { groupBy: ['city', 'kind', 'list'], narrowBy: ['city', 'kind'] },
  other: { groupBy: ['kind', 'list', 'none'], narrowBy: ['kind'] },
};

export const GROUP_LABELS: Record<string, string> = {
  series: 'Series and author',
  genre: 'Genre',
  list: 'List',
  decade: 'Decade',
  language: 'Language',
  length: 'Length',
  kind: 'Kind',
  city: 'City',
  verdict: 'Verdict',
  none: 'Nothing',
};

export const NARROW_LABELS: Record<string, string> = {
  genre: 'All genres',
  language: 'All languages',
  kind: 'All kinds',
  city: 'All cities',
};

/** In display order; the empty key is a tool nobody has reviewed yet. */
export const VERDICTS: Record<string, string> = {
  use: 'Worth using',
  try: 'Worth a try',
  have: 'Already have',
  skip: 'Skip',
  '': 'Not reviewed yet',
};

/** Smallest list that becomes a group, and smallest series or author that does. */
const MIN_LIST = 3;
const MIN_SERIES = 2;

// --- reading an item defensively ---

/** One value of a facet: `key` is what a menu or a group is matched on. */
interface Tag {
  key: string;
  label: string;
}

function bodyOf(item: Item): Record<string, unknown> {
  const body: unknown = item.body;
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function sourcesOf(item: Item): Source[] {
  const sources: unknown = item.sources;
  return Array.isArray(sources)
    ? sources.filter((source) => source !== null && typeof source === 'object')
    : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Lower case, accents and other combining marks removed, so "Amélie" meets "amelie". */
export function fold(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

/** How many different reels recommended this item. */
export function reelCount(item: Item): number {
  const urls = new Set<string>();
  for (const source of sourcesOf(item)) {
    const url = text(source.reel_url);
    if (url) urls.add(url);
  }
  return urls.size;
}

/** A web address worth linking to; anything else (`javascript:`, bare text) is not. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

let displayNames: Intl.DisplayNames | undefined;

/** "en" becomes "English". TMDB's two non-standard codes are named by hand. */
export function languageName(code: string): string {
  if (code === 'cn') return 'Cantonese';
  if (code === 'xx') return 'No language';
  try {
    displayNames ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return displayNames.of(code) ?? code;
  } catch {
    return code;
  }
}

// --- one small reader per facet ---

/** Every genre an item has, once each. A book has one, a "shelf", shown capitalised. */
function genreTags(item: Item): Tag[] {
  const body = bodyOf(item);
  const tags = new Map<string, Tag>();
  if (item.type === 'book') {
    const shelf = text(body.genre);
    if (shelf) tags.set(fold(shelf), { key: fold(shelf), label: shelf[0].toUpperCase() + shelf.slice(1) });
  } else if ((item.type === 'film' || item.type === 'show') && Array.isArray(body.genres)) {
    for (const genre of body.genres) {
      const name = text(genre);
      if (name && !tags.has(fold(name))) tags.set(fold(name), { key: fold(name), label: name });
    }
  }
  return [...tags.values()];
}

function languageTag(item: Item): Tag | null {
  const code = text(bodyOf(item).language);
  return code ? { key: code, label: languageName(code) } : null;
}

function decadeTag(item: Item): Tag | null {
  const year = num(item.year);
  if (year === null) return null;
  const decade = Math.floor(year / 10) * 10;
  return { key: String(decade), label: `${decade}s` };
}

function lengthTag(item: Item): Tag | null {
  const body = bodyOf(item);
  if (body.miniseries === true) return { key: 'miniseries', label: 'Miniseries' };
  const seasons = num(body.seasons);
  if (seasons === 1) return { key: 'one', label: 'One season' };
  if (seasons === 2 || seasons === 3) return { key: 'few', label: 'Two or three seasons' };
  if (seasons !== null && seasons >= 4) return { key: 'many', label: 'Four or more seasons' };
  return null;
}

function kindTag(item: Item): Tag | null {
  const kind = text(bodyOf(item).kind);
  return kind ? { key: kind, label: kind } : null;
}

function cityTag(item: Item): Tag | null {
  const body = bodyOf(item);
  const city = text(body.city);
  if (!city) return null;
  const country = text(body.country);
  const label = country ? `${city}, ${country}` : city;
  return { key: label, label };
}

/** Every tool lands in one of the five; a missing or unknown verdict is "not reviewed". */
function verdictTag(item: Item): Tag {
  const verdict = bodyOf(item).verdict;
  const key = typeof verdict === 'string' && Object.hasOwn(VERDICTS, verdict) ? verdict : '';
  return { key, label: VERDICTS[key] };
}

/** What a group heading is built from. Genre groups use only an item's first genre. */
const GROUP_READERS: Record<string, (item: Item) => Tag | null> = {
  genre: (item) => genreTags(item)[0] ?? null,
  decade: decadeTag,
  language: languageTag,
  length: lengthTag,
  kind: kindTag,
  city: cityTag,
  verdict: verdictTag,
};

const one = (tag: Tag | null): Tag[] => (tag ? [tag] : []);

/** What a menu offers. A film can have several genres, so a menu reads them all. */
const NARROW_READERS: Record<string, (item: Item) => Tag[]> = {
  genre: genreTags,
  language: (item) => one(languageTag(item)),
  kind: (item) => one(kindTag(item)),
  city: (item) => one(cityTag(item)),
};

// --- ordering ---

/** Most recommended first, then by title. */
function byRecommendation(a: Item, b: Item): number {
  return reelCount(b) - reelCount(a) || a.title.localeCompare(b.title);
}

/** Largest first by what is shown, ties by name. */
function bySize(a: Group, b: Group): number {
  return b.items.length - a.items.length || a.label.localeCompare(b.label);
}

/** Smaller first, and a missing number after every present one. */
function ascending(a: number | null, b: number | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return a - b;
}

/** Reading order: position in the series, then year, then title. */
function bySeriesOrder(a: Item, b: Item): number {
  return (
    ascending(num(bodyOf(a).series_position), num(bodyOf(b).series_position)) ||
    ascending(num(a.year), num(b.year)) ||
    a.title.localeCompare(b.title)
  );
}

/**
 * Keep only the items that are shown, order them, and drop a group left empty.
 * Groups are drawn up from the whole tab first, so a search that matches one
 * film of a list of twenty still shows that list rather than losing it.
 */
function settle(drafts: Group[], shown: (item: Item) => boolean, order = byRecommendation): Group[] {
  const groups: Group[] = [];
  for (const draft of drafts) {
    const items = draft.items.filter(shown).sort(order);
    if (items.length > 0) groups.push({ ...draft, items });
  }
  return groups;
}

// --- grouping ---

/** One group per value the reader finds; items without a value go last under "Unsorted". */
function groupByValue(
  items: Item[],
  facet: string,
  read: (item: Item) => Tag | null,
  shown: (item: Item) => boolean,
  rank?: (group: Group) => number,
): Group[] {
  const drafts = new Map<string, Group>();
  const unsorted: Group = { key: 'unsorted', label: 'Unsorted', items: [] };
  for (const item of items) {
    const tag = read(item);
    if (!tag) {
      unsorted.items.push(item);
      continue;
    }
    const key = `${facet}:${tag.key}`;
    let draft = drafts.get(key);
    if (!draft) {
      draft = { key, label: tag.label, items: [] };
      drafts.set(key, draft);
    }
    draft.items.push(item);
  }
  const groups = settle([...drafts.values()], shown).sort(rank ? (a, b) => rank(a) - rank(b) : bySize);
  return [...groups, ...settle([unsorted], shown)];
}

/** Every reel that is behind enough items in the tab becomes a list; the rest go under "Everything else". */
function groupByList(items: Item[], shown: (item: Item) => boolean): Group[] {
  const reels = new Map<string, { title: string | null; author: string | null; count: number }>();
  const reelsOf = new Map<Item, string[]>();
  for (const item of items) {
    const urls = new Set<string>();
    for (const source of sourcesOf(item)) {
      const url = text(source.reel_url);
      if (!url) continue;
      let reel = reels.get(url);
      if (!reel) {
        reel = { title: null, author: null, count: 0 };
        reels.set(url, reel);
      }
      reel.title ??= text(source.list_title);
      reel.author ??= text(source.reel_author);
      if (!urls.has(url)) reel.count += 1;
      urls.add(url);
    }
    reelsOf.set(item, [...urls]);
  }

  const drafts = new Map<string, Group>();
  for (const [url, reel] of reels) {
    if (reel.count < MIN_LIST) continue;
    const account = reel.author ? `@${reel.author}` : undefined;
    const draft: Group = { key: `list:${url}`, label: reel.title ?? account ?? 'Reel', items: [] };
    if (reel.title && account) draft.account = account;
    const href = safeUrl(url);
    if (href) draft.href = href;
    drafts.set(url, draft);
  }

  const rest: Group = { key: 'else', label: 'Everything else', items: [] };
  for (const item of items) {
    const lists = (reelsOf.get(item) ?? []).filter((url) => drafts.has(url));
    if (lists.length === 0) rest.items.push(item);
    for (const url of lists) drafts.get(url)!.items.push(item);
  }
  return [...settle([...drafts.values()], shown).sort(bySize), ...settle([rest], shown)];
}

/**
 * Books: first a group for each series of two or more, then, from the books
 * still unplaced, a group for each author of two or more, then "Standalone".
 */
function groupBySeries(items: Item[], shown: (item: Item) => boolean): Group[] {
  const gather = (books: Item[], prefix: string, nameOf: (book: Item) => string | null): Group[] => {
    const found = new Map<string, Group>();
    for (const book of books) {
      const name = nameOf(book);
      if (!name) continue;
      const key = `${prefix}:${fold(name)}`;
      const group = found.get(key) ?? { key, label: name, items: [] };
      group.items.push(book);
      found.set(key, group);
    }
    return [...found.values()].filter((group) => group.items.length >= MIN_SERIES);
  };

  const series = gather(items, 'series', (book) => text(bodyOf(book).series));
  const placed = new Set(series.flatMap((group) => group.items));
  const authors = gather(
    items.filter((book) => !placed.has(book)),
    'author',
    (book) => text(book.creator),
  );
  for (const group of authors) for (const book of group.items) placed.add(book);

  const standalone: Group = { key: 'standalone', label: 'Standalone', items: items.filter((book) => !placed.has(book)) };
  return [
    ...settle(series, shown, bySeriesOrder).sort(bySize),
    ...settle(authors, shown).sort(bySize),
    ...settle([standalone], shown),
  ];
}

/**
 * Split a whole tab into the groups the page draws.
 *
 * `items` is the whole tab: which groups exist is decided from all of it, and
 * only then does each group keep the items `shown` accepts. `_tab` is the tab the
 * items belong to. It is accepted because the page passes it, but each item is
 * read by its own type, so an unknown tab simply has nothing to group by. A grouping this file does not know gives one flat group.
 */
export function groupItems(
  items: Item[],
  _tab: string,
  choice: string,
  shown: (item: Item) => boolean = () => true,
): Group[] {
  if (choice === 'list') return groupByList(items, shown);
  if (choice === 'series') return groupBySeries(items, shown);
  if (choice === 'verdict') {
    const order = Object.keys(VERDICTS).map((verdict) => `verdict:${verdict}`);
    return groupByValue(items, choice, verdictTag, shown, (group) => order.indexOf(group.key));
  }
  if (Object.hasOwn(GROUP_READERS, choice)) return groupByValue(items, choice, GROUP_READERS[choice], shown);
  return settle([{ key: 'all', label: '', items }], shown);
}

// --- search and menus ---

/** Everything a search looks through, folded, with a line break between fields. */
function searchText(item: Item): string {
  const body = bodyOf(item);
  const fields: unknown[] = [item.title, item.creator, body.series, body.kind, body.city, body.area];
  for (const source of sourcesOf(item)) fields.push(source.list_title, source.note);
  return fold(fields.filter((field): field is string => typeof field === 'string').join('\n'));
}

/** Every word typed must be found somewhere in the item. Plain text, never a pattern. */
export function matchesSearch(item: Item, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = searchText(item);
  return words.every((word) => haystack.includes(word));
}

/** `picks` maps a menu to the value chosen; an empty or missing choice narrows nothing. */
export function matchesNarrow(item: Item, picks: Record<string, string>): boolean {
  for (const [facet, pick] of Object.entries(picks)) {
    if (!pick || !Object.hasOwn(NARROW_READERS, facet)) continue;
    if (!NARROW_READERS[facet](item).some((tag) => tag.key === pick)) return false;
  }
  return true;
}

/** What a menu lists: each value the items hold, most common first, ties by name. */
export function narrowOptions(items: Item[], facet: string): { value: string; label: string; count: number }[] {
  if (!Object.hasOwn(NARROW_READERS, facet)) return [];
  const options = new Map<string, { value: string; label: string; count: number }>();
  for (const item of items) {
    for (const tag of NARROW_READERS[facet](item)) {
      const option = options.get(tag.key) ?? { value: tag.key, label: tag.label, count: 0 };
      option.count += 1;
      options.set(tag.key, option);
    }
  }
  return [...options.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// --- the line under a title ---

/** The one line under a title; parts that are missing are skipped. */
export function byline(item: Item): string {
  const body = bodyOf(item);
  const parts: (string | null)[] = [text(item.creator), num(item.year) === null ? null : String(item.year), text(body.kind)];

  if (item.type === 'place') {
    parts.push([text(body.area), text(body.city)].filter(Boolean).join(', ') || null);
  }

  parts.push(
    genreTags(item)
      .slice(0, 2)
      .map((tag) => tag.label)
      .join(', ') || null,
  );

  const series = item.type === 'book' ? text(body.series) : null;
  const position = num(body.series_position);
  parts.push(series ? (position === null ? series : `${series} #${position}`) : null);

  const runtime = num(body.runtime);
  parts.push(runtime === null ? null : `${runtime} min`);

  if (item.type === 'show') {
    const seasons = num(body.seasons);
    if (body.miniseries === true) parts.push('Miniseries');
    else if (seasons !== null) parts.push(seasons === 1 ? '1 season' : `${seasons} seasons`);
  }

  const reels = reelCount(item);
  parts.push(reels > 1 ? `${reels} reels` : null);

  return parts.filter(Boolean).join(' · ');
}
