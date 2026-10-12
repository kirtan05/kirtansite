import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  type Group,
  type Item,
  type Source,
  GROUP_LABELS,
  NARROW_LABELS,
  TABS,
  byline,
  fold,
  groupItems,
  languageName,
  matchesNarrow,
  matchesSearch,
  narrowOptions,
  reelCount,
  safeUrl,
} from './facets.ts';

let nextId = 1;

function item(type: string, title: string, extra: Partial<Item> = {}): Item {
  return {
    id: nextId++, type, title, creator: null, year: null, cover_url: null, status: 'want',
    needs_review: false, status_changed_at: 0, body: null, sources: [], ...extra,
  };
}

function reel(code: string, author: string | null = 'filmclub', list_title: string | null = null, note: string | null = null): Source {
  return { reel_url: `https://www.instagram.com/reel/${code}/`, reel_author: author, note, list_title };
}

const shape = (groups: Group[]) => groups.map((group) => [group.label, group.items.map((i) => i.title)]);
const film = (title: string, genres: unknown, extra: Partial<Item> = {}) => item('film', title, { body: { genres }, ...extra });

// --- the table ---

test('each tab offers the groupings and menus the design lists, default first', () => {
  assert.deepEqual(TABS, {
    book: { groupBy: ['series', 'genre', 'list', 'none'], narrowBy: ['genre'] },
    film: { groupBy: ['list', 'genre', 'decade', 'language', 'none'], narrowBy: ['genre', 'language'] },
    show: { groupBy: ['genre', 'list', 'length', 'none'], narrowBy: ['genre', 'language'] },
    recipe: { groupBy: ['none'], narrowBy: [] },
    music: { groupBy: ['list', 'kind', 'none'], narrowBy: ['kind'] },
    tool: { groupBy: ['verdict', 'kind', 'list'], narrowBy: ['kind'] },
    place: { groupBy: ['city', 'kind', 'list'], narrowBy: ['city', 'kind'] },
    other: { groupBy: ['kind', 'list', 'none'], narrowBy: ['kind'] },
  });
  for (const { groupBy, narrowBy } of Object.values(TABS)) {
    for (const id of groupBy) assert.ok(GROUP_LABELS[id], `no label for ${id}`);
    for (const id of narrowBy) assert.ok(NARROW_LABELS[id], `no label for ${id}`);
  }
  assert.equal(GROUP_LABELS.series, 'Series and author');
  assert.equal(GROUP_LABELS.none, 'Nothing');
});

// --- genre, and the ordering rules ---

test('genre: films go under their first genre, and what has none goes last under Unsorted', () => {
  const films = [
    film('Unknown', undefined, { body: null }),
    film('Lost', []),
    film('Odd', []),
    film('Up', ['Animation', 'Comedy']),
    film('Ronin', ['Crime']),
    film('Heat', ['Crime', 'Drama']),
  ];
  assert.deepEqual(shape(groupItems(films, 'film', 'genre')), [
    ['Crime', ['Heat', 'Ronin']],
    ['Animation', ['Up']],
    ['Unsorted', ['Lost', 'Odd', 'Unknown']],
  ]);
});

test('genre: a book goes under its shelf', () => {
  const books = [
    item('book', 'Dune', { body: { genre: 'science fiction' } }),
    item('book', 'Emma', { body: { genre: 'literary' } }),
    item('book', 'Hyperion', { body: { genre: 'science fiction' } }),
    item('book', 'Unshelved'),
  ];
  assert.deepEqual(shape(groupItems(books, 'book', 'genre')), [
    ['Science fiction', ['Dune', 'Hyperion']],
    ['Literary', ['Emma']],
    ['Unsorted', ['Unshelved']],
  ]);
});

test('groups of the same size go by name; inside a group, most recommended first, then title', () => {
  const twice = [reel('AAA'), reel('BBB')];
  const films = [
    film('Zodiac', ['Thriller']),
    film('Alien', ['Horror']),
    film('Se7en', ['Thriller'], { sources: twice }),
    film('Arrival', ['Thriller']),
  ];
  const groups = groupItems(films, 'film', 'genre');
  assert.deepEqual(shape(groups), [['Thriller', ['Se7en', 'Arrival', 'Zodiac']], ['Horror', ['Alien']]]);
  assert.deepEqual(shape(groupItems([film('B', ['Western']), film('A', ['Drama'])], 'film', 'genre')), [
    ['Drama', ['A']],
    ['Western', ['B']],
  ]);
});

test('group keys are unique and the same on every call', () => {
  const films = [film('Heat', ['Crime']), film('Up', ['Animation']), film('Lost', [])];
  const keys = groupItems(films, 'film', 'genre').map((group) => group.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(groupItems(films, 'film', 'genre').map((group) => group.key), keys);
});

// --- list ---

const cooking = reel('AAA', 'cinephile', 'Cooking films');
const heists = reel('BBB', 'filmclub', 'Heist films');
const listFilms = [
  item('film', 'Chef', { sources: [cooking] }),
  item('film', 'Burnt', { sources: [cooking] }),
  item('film', 'Big Night', { sources: [cooking, heists] }),
  item('film', 'Heat', { sources: [heists] }),
  item('film', 'Ronin', { sources: [heists] }),
  item('film', 'Thief', { sources: [heists] }),
  item('film', 'Solo', { sources: [reel('CCC', 'oneoff')] }),
  item('film', 'Orphan'),
];

test('list: an item sits under every list of three or more that names it; the rest go under Everything else', () => {
  const groups = groupItems(listFilms, 'film', 'list');
  assert.deepEqual(shape(groups), [
    ['Heist films', ['Big Night', 'Heat', 'Ronin', 'Thief']],
    ['Cooking films', ['Big Night', 'Burnt', 'Chef']],
    ['Everything else', ['Orphan', 'Solo']],
  ]);
  assert.equal(groups[0].account, '@filmclub');
  assert.equal(groups[0].href, heists.reel_url);
  assert.equal(groups[2].account, undefined);
  assert.equal(groups[2].href, undefined);
});

test('list: Everything else stays last even when it is the biggest', () => {
  const films = [...listFilms.slice(3, 6), ...['A', 'B', 'C', 'D', 'E'].map((title) => item('film', title))];
  assert.deepEqual(groupItems(films, 'film', 'list').map((group) => group.label), ['Heist films', 'Everything else']);
});

test('list: one with no title yet is headed by its account', () => {
  const untitled = reel('DDD', 'bookworm');
  const anonymous = reel('EEE', null);
  const books = [
    ...['A', 'B', 'C'].map((title) => item('book', title, { sources: [untitled] })),
    ...['D', 'E', 'F', 'G'].map((title) => item('book', title, { sources: [anonymous] })),
  ];
  const groups = groupItems(books, 'book', 'list');
  assert.deepEqual(groups.map((group) => [group.label, group.account]), [['Reel', undefined], ['@bookworm', undefined]]);
});

test('list: a title on any one source row of the reel names the list', () => {
  const films = [
    item('film', 'A', { sources: [reel('FFF', 'x', null)] }),
    item('film', 'B', { sources: [reel('FFF', 'x', 'Slow cinema')] }),
    item('film', 'C', { sources: [reel('FFF', 'x', null)] }),
  ];
  assert.equal(groupItems(films, 'film', 'list')[0].label, 'Slow cinema');
});

test('which groups exist is decided by the whole tab, not by what is shown', () => {
  const onlyChef = (i: Item) => i.title === 'Chef';
  assert.deepEqual(shape(groupItems(listFilms, 'film', 'list', onlyChef)), [['Cooking films', ['Chef']]]);
  assert.deepEqual(groupItems(listFilms, 'film', 'list', () => false), []);
});

test('groups are ordered by how many of their items are shown', () => {
  const notHeat = (i: Item) => !['Heat', 'Ronin'].includes(i.title);
  assert.deepEqual(groupItems(listFilms, 'film', 'list', notHeat).map((group) => group.label), [
    'Cooking films',
    'Heist films',
    'Everything else',
  ]);
});

// --- series and author ---

test('series: series of two or more in reading order, then authors of two or more, then Standalone', () => {
  const feist = 'Raymond E. Feist';
  const books = [
    item('book', 'Silverthorn', { creator: feist, year: 1985, body: { series: 'Riftwar Cycle' } }),
    item('book', "Magician's End", { creator: feist, year: 2013, body: { series: 'Riftwar Cycle', series_position: 30 } }),
    item('book', 'Magician', { creator: feist, year: 1982, body: { series: 'riftwar cycle', series_position: 1 } }),
    item('book', 'Faerie Tale', { creator: feist, year: 1988 }),
    item('book', 'Dune', { creator: 'Frank Herbert', body: { series: 'Dune', series_position: 1 } }),
    item('book', 'The Dosadi Experiment', { creator: 'Frank Herbert' }),
    item('book', 'Piranesi', { creator: 'Susanna Clarke' }),
    item('book', 'Anonymous'),
  ];
  assert.deepEqual(shape(groupItems(books, 'book', 'series')), [
    ['Riftwar Cycle', ['Magician', "Magician's End", 'Silverthorn']],
    ['Frank Herbert', ['Dune', 'The Dosadi Experiment']],
    ['Standalone', ['Anonymous', 'Faerie Tale', 'Piranesi']],
  ]);
});

test('series: books with the same place in a series go by year, and every series comes before any author', () => {
  const books = [
    item('book', 'Later', { creator: 'A', year: 1990, body: { series: 'Saga' } }),
    item('book', 'Earlier', { creator: 'A', year: 1980, body: { series: 'Saga' } }),
    ...['One', 'Two', 'Three'].map((title) => item('book', title, { creator: 'Gabriel García Márquez' })),
    item('book', 'Four', { creator: 'gabriel garcia marquez' }),
  ];
  assert.deepEqual(shape(groupItems(books, 'book', 'series')), [
    ['Saga', ['Earlier', 'Later']],
    ['Gabriel García Márquez', ['Four', 'One', 'Three', 'Two']],
  ]);
});

// --- the simpler groupings ---

test('length: miniseries, one season, two or three, four or more', () => {
  const show = (title: string, body: Record<string, unknown> | null) => item('show', title, { body });
  const shows = [
    show('Chernobyl', { miniseries: true, seasons: 1 }),
    show('Fleabag', { seasons: 2, miniseries: false }),
    show('Dark', { seasons: 3 }),
    show('The Wire', { seasons: 5 }),
    show('Firefly', { seasons: 1, miniseries: false }),
    show('Mystery', null),
  ];
  assert.deepEqual(shape(groupItems(shows, 'show', 'length')), [
    ['Two or three seasons', ['Dark', 'Fleabag']],
    ['Four or more seasons', ['The Wire']],
    ['Miniseries', ['Chernobyl']],
    ['One season', ['Firefly']],
    ['Unsorted', ['Mystery']],
  ]);
});

test('decade and language', () => {
  const films = [
    film('Heat', ['Crime'], { year: 1995, body: { language: 'en' } }),
    film('Se7en', ['Crime'], { year: 1999, body: { language: 'en' } }),
    film('Lagaan', ['Drama'], { year: 2001, body: { language: 'hi' } }),
    film('Undated', ['Drama']),
  ];
  assert.deepEqual(shape(groupItems(films, 'film', 'decade')), [
    ['1990s', ['Heat', 'Se7en']],
    ['2000s', ['Lagaan']],
    ['Unsorted', ['Undated']],
  ]);
  assert.deepEqual(shape(groupItems(films, 'film', 'language')), [
    ['English', ['Heat', 'Se7en']],
    ['Hindi', ['Lagaan']],
    ['Unsorted', ['Undated']],
  ]);
  assert.equal(languageName('cn'), 'Cantonese');
  assert.equal(languageName('xx'), 'No language');
});

test('city and kind', () => {
  const place = (title: string, body: Record<string, unknown>) => item('place', title, { body });
  const places = [
    place('Karim’s', { kind: 'restaurant', city: 'Delhi', country: 'India', area: 'Jama Masjid' }),
    place('Blue Tokai', { kind: 'cafe', city: 'Delhi', country: 'India' }),
    place('MTR', { kind: 'restaurant', city: 'Bengaluru' }),
    place('Somewhere', { kind: null }),
  ];
  assert.deepEqual(shape(groupItems(places, 'place', 'city')), [
    ['Delhi, India', ['Blue Tokai', 'Karim’s']],
    ['Bengaluru', ['MTR']],
    ['Unsorted', ['Somewhere']],
  ]);
  assert.deepEqual(shape(groupItems(places, 'place', 'kind')), [
    ['restaurant', ['Karim’s', 'MTR']],
    ['cafe', ['Blue Tokai']],
    ['Unsorted', ['Somewhere']],
  ]);
});

test('verdict: the fixed order holds whatever the sizes, and an unreviewed tool has its own last group', () => {
  const tool = (title: string, verdict?: string) => item('tool', title, { body: verdict ? { verdict } : { kind: 'cli' } });
  const tools = [tool('a', 'skip'), tool('b', 'skip'), tool('c', 'skip'), tool('d', 'try'), tool('e', 'use'), tool('f'), tool('g', 'nonsense'), tool('h', 'have')];
  assert.deepEqual(shape(groupItems(tools, 'tool', 'verdict')), [
    ['Worth using', ['e']],
    ['Worth a try', ['d']],
    ['Already have', ['h']],
    ['Skip', ['a', 'b', 'c']],
    ['Not reviewed yet', ['f', 'g']],
  ]);
});

test('nothing: one group holding everything, most recommended first then title', () => {
  const recipes = [item('recipe', 'Dal'), item('recipe', 'Aloo'), item('recipe', 'Chai', { sources: [reel('A'), reel('B')] })];
  const groups = groupItems(recipes, 'recipe', 'none');
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].key, groups[0].label], ['all', '']);
  assert.deepEqual(groups[0].items.map((i) => i.title), ['Chai', 'Aloo', 'Dal']);
  assert.deepEqual(groupItems([], 'recipe', 'none'), []);
});

// --- search ---

test('search ignores case and accents and looks across title, creator, series, list, notes, kind, city and area', () => {
  const amelie = item('film', 'Amélie', {
    creator: 'Jean-Pierre Jeunet',
    sources: [reel('AAA', 'cinephile', 'French comfort films', 'A whimsical Paris romance')],
  });
  for (const query of ['amelie', 'AMÉLIE', 'jeunet', 'comfort', 'whimsical', '  paris   romance ']) {
    assert.ok(matchesSearch(amelie, query), query);
  }
  assert.ok(!matchesSearch(amelie, 'amelie tokyo'), 'every word must be found');

  const book = item('book', 'Magician', { body: { series: 'Riftwar Cycle' } });
  assert.ok(matchesSearch(book, 'riftwar'));

  const place = item('place', 'Karim’s', { body: { kind: 'restaurant', city: 'Delhi', area: 'Jama Masjid' } });
  for (const query of ['restaurant', 'delhi', 'jama']) assert.ok(matchesSearch(place, query), query);
  assert.ok(!matchesSearch(place, 'mumbai'));
});

test('search with nothing typed matches everything, and punctuation is taken literally', () => {
  const whatIf = item('show', 'What If...? (2021)');
  assert.ok(matchesSearch(whatIf, ''));
  assert.ok(matchesSearch(whatIf, '   '));
  assert.ok(matchesSearch(whatIf, '...? (2021)'));
  assert.ok(!matchesSearch(whatIf, '.*'));
  assert.ok(matchesSearch(item('film', '[REC]'), '[rec'));
  assert.equal(fold('  Amélie Ünïcode '), '  amelie unicode ');
});

// --- narrowing ---

test('the genre menu matches any of an item’s genres, and menus combine', () => {
  const heat = film('Heat', ['Crime', 'Drama'], { body: { genres: ['Crime', 'Drama'], language: 'en' } });
  assert.ok(matchesNarrow(heat, {}));
  assert.ok(matchesNarrow(heat, { genre: '', language: '' }));
  assert.ok(matchesNarrow(heat, { genre: 'drama' }));
  assert.ok(!matchesNarrow(heat, { genre: 'comedy' }));
  assert.ok(matchesNarrow(heat, { genre: 'crime', language: 'en' }));
  assert.ok(!matchesNarrow(heat, { genre: 'crime', language: 'hi' }));

  const book = item('book', 'Dune', { body: { genre: 'science fiction' } });
  assert.ok(matchesNarrow(book, { genre: 'science fiction' }));
  const place = item('place', 'MTR', { body: { kind: 'restaurant', city: 'Bengaluru', country: 'India' } });
  assert.ok(matchesNarrow(place, { city: 'Bengaluru, India', kind: 'restaurant' }));
  assert.ok(!matchesNarrow(place, { city: 'Delhi, India' }));
});

test('menu options are what the tab holds, most common first, each with its count', () => {
  const films = [
    film('Heat', ['Crime', 'Drama'], { body: { genres: ['Crime', 'Drama'], language: 'en' } }),
    film('Ronin', ['Crime'], { body: { genres: ['Crime'], language: 'en' } }),
    film('Lagaan', ['Drama', 'Sport'], { body: { genres: ['Drama', 'Sport'], language: 'hi' } }),
    film('Bare', []),
  ];
  assert.deepEqual(narrowOptions(films, 'genre'), [
    { value: 'crime', label: 'Crime', count: 2 },
    { value: 'drama', label: 'Drama', count: 2 },
    { value: 'sport', label: 'Sport', count: 1 },
  ]);
  assert.deepEqual(narrowOptions(films, 'language'), [
    { value: 'en', label: 'English', count: 2 },
    { value: 'hi', label: 'Hindi', count: 1 },
  ]);
  assert.deepEqual(narrowOptions(films, 'kind'), []);
});

// --- the row's one line ---

test('byline: creator, year, up to two genres, runtime or seasons, and the reel count when over one', () => {
  const heat = item('film', 'Heat', {
    creator: 'Michael Mann', year: 1995,
    body: { genres: ['Crime', 'Drama', 'Thriller'], language: 'en', runtime: 170 },
    sources: [reel('A'), reel('B'), reel('C')],
  });
  assert.equal(byline(heat), 'Michael Mann · 1995 · Crime, Drama · 170 min · 3 reels');

  const show = (body: Record<string, unknown>) => byline(item('show', 'X', { year: 2019, body, sources: [reel('A')] }));
  assert.equal(show({ genres: ['Drama'], seasons: 4, miniseries: false }), '2019 · Drama · 4 seasons');
  assert.equal(show({ genres: [], seasons: 1, miniseries: false }), '2019 · 1 season');
  assert.equal(show({ genres: ['Drama'], seasons: 1, miniseries: true }), '2019 · Drama · Miniseries');

  const dune = item('book', 'Dune', { creator: 'Frank Herbert', year: 1965, body: { genre: 'science fiction', series: 'Dune', series_position: 1 } });
  assert.equal(byline(dune), 'Frank Herbert · 1965 · Science fiction · Dune #1');
  assert.equal(byline(item('book', 'X', { body: { genre: 'fantasy', series: 'Discworld' } })), 'Fantasy · Discworld');

  const place = item('place', 'Karim’s', { body: { kind: 'restaurant', area: 'Jama Masjid', city: 'Delhi' } });
  assert.equal(byline(place), 'restaurant · Jama Masjid, Delhi');
  assert.equal(byline(item('recipe', 'Dal')), '');
});

test('reelCount counts each reel once', () => {
  assert.equal(reelCount(item('film', 'X', { sources: [reel('A'), reel('A'), reel('B')] })), 2);
  assert.equal(reelCount(item('film', 'X')), 0);
});

// --- what the data might really hold ---

test('a body that is odd or was corrected by hand never throws: the item is Unsorted', () => {
  const odd = [
    item('film', 'Genres as text', { body: { genres: 'Crime', language: 7, runtime: 'long' } }),
    item('film', 'Genres of the wrong kind', { body: { genres: [null, 5, { name: 'Crime' }] } }),
    item('film', 'No sources at all', { sources: undefined as unknown as Source[] }),
    item('film', 'Year as text', { year: 'nineteen' as unknown as number }),
  ];
  for (const choice of TABS.film.groupBy) {
    const groups = groupItems(odd, 'film', choice);
    assert.equal(groups.flatMap((group) => group.items).length, 4, choice);
  }
  assert.deepEqual(groupItems(odd, 'film', 'genre').map((group) => group.label), ['Unsorted']);
  assert.deepEqual(groupItems(odd, 'film', 'decade').map((group) => group.label), ['Unsorted']);

  const book = item('book', 'Odd', { creator: 5 as unknown as string, body: { genre: 12, series: ['x'], series_position: 'third' } });
  for (const choice of TABS.book.groupBy) assert.equal(groupItems([book], 'book', choice).length, 1, choice);
  assert.equal(byline(book), '');
  assert.equal(byline(odd[0]), '');
  assert.ok(matchesSearch(odd[2], 'sources'));
  assert.ok(matchesNarrow(odd[0], { genre: '' }));
  assert.deepEqual(narrowOptions(odd, 'genre'), []);
});

test('an unknown tab or grouping falls back to one flat group', () => {
  const things = [item('podcast', 'B'), item('podcast', 'A')];
  assert.deepEqual(shape(groupItems(things, 'podcast', 'genre')), [['Unsorted', ['A', 'B']]]);
  assert.deepEqual(shape(groupItems(things, 'podcast', 'nonsense')), [['', ['A', 'B']]]);
});

test('only a web address becomes a link', () => {
  assert.equal(safeUrl('https://github.com/jqlang/jq'), 'https://github.com/jqlang/jq');
  assert.equal(safeUrl('  HTTP://example.com '), 'HTTP://example.com');
  for (const bad of ['javascript:alert(1)', ' javascript:alert(1)', 'data:text/html,x', 'github.com/jqlang/jq', '', null, undefined, 5, {}]) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
  const group = groupItems(
    ['A', 'B', 'C'].map((title) => item('film', title, { sources: [{ reel_url: 'javascript:alert(1)', reel_author: 'x', note: null }] })),
    'film',
    'list',
  )[0];
  assert.equal(group.href, undefined);
});
