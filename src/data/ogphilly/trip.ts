// Everything /ogphilly says lives in this file. To update the plan, edit here
// and push; the page and the map both read from it.
//
// Public page, public repo: first names only, no PNRs, no ticket or passport
// numbers, no phone numbers.

export type Status = 'booked' | 'unverified' | 'open';
export type Mode = 'air' | 'sea' | 'road';

/** [lon, lat] */
export type LonLat = [number, number];

export const places = {
  del: { name: 'Delhi', at: [77.1, 28.556] as LonLat },
  hkg: { name: 'Hong Kong', at: [113.918, 22.308] as LonLat },
  icn: { name: 'Seoul', at: [126.451, 37.469] as LonLat },
  kix: { name: 'Osaka', at: [135.244, 34.427] as LonLat },
  mnl: { name: 'Manila', at: [121.019, 14.509] as LonLat },
  makati: { name: 'Makati', at: [121.024, 14.565] as LonLat },
  crk: { name: 'Clark', at: [120.56, 15.186] as LonLat },
  usu: { name: 'Busuanga airport', at: [120.1, 12.121] as LonLat },
  coron: { name: 'Coron', at: [120.204, 11.998] as LonLat },
  elnido: { name: 'El Nido', at: [119.391, 11.18] as LonLat },
  darocotan: { name: 'Darocotan', at: [119.535, 11.369] as LonLat },
  pps: { name: 'Puerto Princesa', at: [118.759, 9.742] as LonLat }
};
export type PlaceId = keyof typeof places;

/** When a label is worth showing, by camera distance (see views below). */
export const labelRange: Record<PlaceId, [number, number]> = {
  del: [25, 999],
  hkg: [12, 999],
  icn: [25, 999],
  kix: [25, 999],
  mnl: [0, 999],
  makati: [0, 0],
  crk: [0, 12],
  usu: [0, 2.2],
  coron: [0, 12],
  elnido: [0, 12],
  darocotan: [0, 2.2],
  pps: [2.2, 12]
};

export interface Leg {
  id: string;
  mode: Mode;
  /** Place ids, or raw [lon, lat] waypoints to keep a line off the land/sea it shouldn't cross. */
  via: (PlaceId | LonLat)[];
  status: Status;
}

export const legs: Leg[] = [
  { id: 'del-hkg', mode: 'air', via: ['del', 'hkg'], status: 'booked' },
  { id: 'hkg-mnl', mode: 'air', via: ['hkg', 'mnl'], status: 'booked' },
  { id: 'icn-mnl', mode: 'air', via: ['icn', 'mnl'], status: 'booked' },
  { id: 'mnl-makati', mode: 'road', via: ['mnl', 'makati'], status: 'open' },
  { id: 'makati-crk', mode: 'road', via: ['makati', [120.98, 14.78], [120.68, 15.03], 'crk'], status: 'open' },
  { id: 'crk-usu', mode: 'air', via: ['crk', 'usu'], status: 'booked' },
  { id: 'usu-coron', mode: 'road', via: ['usu', [120.17, 12.05], [120.195, 12.04], [120.21, 12.02], 'coron'], status: 'open' },
  { id: 'mnl-usu', mode: 'air', via: ['mnl', 'usu'], status: 'open' },
  {
    id: 'coron-elnido',
    mode: 'sea',
    // Found by a grid search over the coastline data, so it threads the Linapacan islands instead of crossing them.
    via: [
      [120.205, 11.985], [120.205, 11.965], [120.175, 11.95], [120.175, 11.915], [120.15, 11.89], [120.15, 11.8],
      [120.075, 11.745], [120.065, 11.66], [120.01, 11.605], [119.915, 11.605], [119.885, 11.575], [119.795, 11.565],
      [119.76, 11.53], [119.66, 11.53], [119.59, 11.46], [119.485, 11.46], [119.39, 11.375], [119.395, 11.21],
      [119.385, 11.185]
    ],
    status: 'open'
  },
  {
    id: 'elnido-teneguiban',
    mode: 'road',
    via: ['elnido', [119.41, 11.175], [119.435, 11.195], [119.44, 11.265], [119.48, 11.305], [119.49, 11.325], [119.49, 11.35], [119.505, 11.36]],
    status: 'open'
  },
  { id: 'teneguiban-darocotan', mode: 'sea', via: [[119.505, 11.36], 'darocotan'], status: 'open' },
  {
    id: 'elnido-pps',
    mode: 'road',
    via: [
      'elnido', [119.445, 11.155], [119.445, 10.89], [119.475, 10.845], [119.48, 10.71], [119.285, 10.515],
      [119.275, 10.47], [118.935, 10.13], [118.93, 10.11], [118.78, 9.96], [118.735, 9.945], [118.725, 9.815],
      [118.755, 9.79], 'pps'
    ],
    status: 'open'
  },
  { id: 'pps-mnl', mode: 'air', via: ['pps', 'mnl'], status: 'open' },
  { id: 'mnl-hkg', mode: 'air', via: ['mnl', 'hkg'], status: 'booked' },
  { id: 'hkg-del', mode: 'air', via: ['hkg', 'del'], status: 'booked' },
  { id: 'mnl-del', mode: 'air', via: ['mnl', 'del'], status: 'unverified' },
  { id: 'mnl-kix', mode: 'air', via: ['mnl', 'kix'], status: 'booked' }
];

export interface View {
  center: LonLat;
  /** Camera distance in map units (1 unit = 1 degree of latitude, about 111 km). */
  dist: number;
}

const wide: View = { center: [108, 21], dist: 78 };

export interface Day {
  id: string;
  date: string;
  weekday: string;
  where: string;
  at: PlaceId;
  view: View;
  /** Legs travelled that day, in order. Add `!` to draw one in reverse. */
  legs: string[];
  status: Status;
  statusText: string;
  lines: string[];
  quote?: { text: string; by: string };
}

export const days: Day[] = [
  {
    id: 'd23',
    date: '23 Dec',
    weekday: 'Wed',
    where: 'Land in Manila',
    at: 'mnl',
    view: { center: [117.5, 18.5], dist: 24 },
    legs: ['del-hkg', 'hkg-mnl', 'mnl-makati'],
    status: 'open',
    statusText: 'Stay not booked',
    lines: [
      'KJ, Sid and Martin leave Delhi 01:40 on CX694, sit in Hong Kong for 4 h 55 min, and land at NAIA Terminal 3 at 16:35 on CX919.',
      'Parth, Ankur and Dabad: inbound flights not in the Drive folder yet. All three are on the Coron flight on the 25th, so they are in Manila by the 24th at the latest.',
      'Terminal 3 to Poblacion is under 10 km by road. Grab, not a white taxi. Out of the airport by six, at the flat by seven.',
      'This is the night out, not tomorrow. Tomorrow is Christmas Eve and the city shuts early; tonight is an ordinary Wednesday and the bars are 200 metres from the door.'
    ],
    quote: { text: 'Bahar jane layak to nahi hai 7 hr.', by: 'KJ, on the Hong Kong layover. Sid disagrees.' }
  },
  {
    id: 'd24',
    date: '24 Dec',
    weekday: 'Thu',
    where: 'Manila',
    at: 'makati',
    view: { center: [120.72, 14.78], dist: 3.3 },
    legs: [],
    status: 'open',
    statusText: 'Stay not booked',
    lines: [
      'The one full day in the city. Old Manila in the morning before the heat: Fort Santiago, San Agustin Church, the walls of Intramuros. Then Binondo, the oldest Chinatown anywhere, for lunch on foot.',
      'It is Christmas Eve in the most Christmas country on earth. In past years the Makati malls shut at 20:00 and most kitchens with them, for Noche Buena. Book dinner, or eat by seven.',
      'After that it is the plunge pool on the balcony and whatever was bought before the shops closed. The van is at 08:30.'
    ],
    quote: {
      text: 'Many travelers find Manila congested, polluted, and not very charming.',
      by: 'Tushar, pasting an AI into the group, 26 Jul. He is not coming.'
    }
  },
  {
    id: 'd25',
    date: '25 Dec',
    weekday: 'Fri',
    where: 'Clark to Coron',
    at: 'usu',
    view: { center: [120.45, 13.55], dist: 7.2 },
    legs: ['makati-crk', 'crk-usu', 'usu-coron'],
    status: 'booked',
    statusText: 'Flight booked for six',
    lines: [
      'The flight leaves from Clark, not NAIA. Clark is about 100 km north: 1 h 20 min with empty roads, two hours to be safe. Van leaves at 08:30. The van is not booked.',
      'Cebgo DG6039, Clark 13:15 to Busuanga 14:40. Six seats: Ankur, Dabad, KJ, Martin, Parth, Sid. 20 kg checked, 7 kg cabin.',
      'Busuanga airport to Coron town is another 40 minutes by van. Coron stay for the next three nights is not booked.'
    ]
  },
  {
    id: 'd26',
    date: '26 Dec',
    weekday: 'Sat',
    where: 'Coron',
    at: 'coron',
    view: { center: [120.45, 13.4], dist: 6.4 },
    legs: ['mnl-usu'],
    status: 'open',
    statusText: 'DJ has no way here yet',
    lines: [
      "DJ's ticket in the Drive says he lands in Manila from Seoul at 10:00 today. DJ in the chat says the 27th. One of them is out of date.",
      'Either way he lands in Manila after everyone has left it, and needs his own Manila to Busuanga flight. Not booked.',
      'For the six already here: Kayangan Lake, Twin Lagoon, the reef at Siete Pecados. Private boat, split six ways.'
    ]
  },
  {
    id: 'd27',
    date: '27 Dec',
    weekday: 'Sun',
    where: 'Coron',
    at: 'coron',
    view: { center: [120.17, 12.03], dist: 0.95 },
    legs: [],
    status: 'open',
    statusText: 'Stay not booked',
    lines: [
      'First day with all seven, if DJ has sorted his flight.',
      'Barracuda Lake, where the water changes temperature as you go down. The Japanese supply ships sunk in 1944 are shallow enough to snorkel.',
      'Maquinit hot springs at sunset. Salt water, 40 degrees.'
    ]
  },
  {
    id: 'd28',
    date: '28 Dec',
    weekday: 'Mon',
    where: 'Coron to Darocotan',
    at: 'darocotan',
    view: { center: [119.8, 11.62], dist: 2.9 },
    legs: ['coron-elnido', 'elnido-teneguiban', 'teneguiban-darocotan'],
    status: 'unverified',
    statusText: 'Island booked, ferry not',
    lines: [
      'Fast ferry, Coron to El Nido, four to five hours across the Linapacan Strait. One or two sailings a day and this is the busiest week of the year. Seven seats, not booked.',
      'Then an hour by road across the top of Palawan to Teneguiban, and a ten-minute boat to Darocotan Island.',
      'Backpackers Island, 28 Dec to 1 Jan, booked for seven. DJ did it on 10 Oct.'
    ],
    quote: { text: 'Maritime accidents are common in the Philippines.', by: 'BBC, forwarded by KJ, 12 Sep' }
  },
  {
    id: 'd29',
    date: '29 Dec',
    weekday: 'Tue',
    where: 'Darocotan',
    at: 'darocotan',
    view: { center: [119.525, 11.36], dist: 0.42 },
    legs: [],
    status: 'unverified',
    statusText: 'Booked, no confirmation seen',
    lines: [
      'A small island with a beach camp on it. No town, no cars, patchy signal.',
      'Kayaks, a reef off the beach, a hammock each.'
    ],
    quote: { text: "Too wild (but it's part of experience).", by: 'Booking.com review, 1 Jan 2026' }
  },
  {
    id: 'd30',
    date: '30 Dec',
    weekday: 'Wed',
    where: 'Darocotan',
    at: 'darocotan',
    view: { center: [119.44, 11.26], dist: 1.0 },
    legs: [],
    status: 'unverified',
    statusText: 'Booked, no confirmation seen',
    lines: [
      "Day trip into Bacuit Bay if anyone wants the famous El Nido lagoons: the island-hopping tours leave from town, an hour's drive away.",
      'Or do nothing. This is the only day in the plan with nothing in it.'
    ]
  },
  {
    id: 'd31',
    date: '31 Dec',
    weekday: 'Thu',
    where: "New Year's Eve",
    at: 'elnido',
    view: { center: [119.46, 11.27], dist: 0.8 },
    legs: ['teneguiban-darocotan!', 'elnido-teneguiban!'],
    status: 'open',
    statusText: 'Where we sleep is undecided',
    lines: [
      'The doc says: back to El Nido town today, New Year there.',
      'The booking says: Darocotan until 1 Jan. So the island night is paid for, and a room in town is not booked.',
      'Pick one. Town has the party and puts us an hour closer to tomorrow. The island has seven people and a beach.'
    ]
  },
  {
    id: 'd01',
    date: '1 Jan',
    weekday: 'Fri',
    where: 'El Nido to Manila',
    at: 'pps',
    view: { center: [120.1, 12.1], dist: 10.5 },
    legs: ['elnido-pps', 'pps-mnl'],
    status: 'open',
    statusText: 'Nothing booked',
    lines: [
      'The tight day. El Nido to Puerto Princesa is five to six hours by van, then a flight to Manila. Neither is booked.',
      'Parth and Ankur leave Manila at 22:55 on Air India, direct to Delhi. The doc says Dabad too. That means a Puerto Princesa flight by mid-afternoon, which means leaving El Nido by 07:00. On New Year morning.',
      'The way out: AirSwift flies El Nido to Manila direct. It costs more and removes the van. Worth pricing before anything else on this page.'
    ]
  },
  {
    id: 'd02',
    date: '2 Jan',
    weekday: 'Sat',
    where: 'Home',
    at: 'mnl',
    view: wide,
    legs: ['mnl-del', 'mnl-kix', 'mnl-hkg', 'hkg-del'],
    status: 'booked',
    statusText: 'Flights booked',
    lines: [
      'DJ, 02:40, Jetstar to Osaka. He goes straight from the domestic arrival to departures.',
      'KJ, Sid and Martin, 08:00, CX912 to Hong Kong, 7 h 20 min there, then CX695 into Delhi at 21:30.',
      'Those three need somewhere to sleep near Terminal 3 on the night of the 1st. Not booked.'
    ],
    quote: { text: 'Milne aa raha mainly sabse, ghoomte toh rahenge hi.', by: 'DJ, 3 Sep' }
  }
];

export interface Person {
  name: string;
  from: string;
  arrive: string;
  arriveNote?: string;
  leave: string;
  leaveNote?: string;
  proof: Status;
  proofText: string;
}

const cxIn = '23 Dec, 16:35';
const cxInNote = 'CX694 + CX919 via Hong Kong, Terminal 3';
const cxOut = '2 Jan, 08:00';
const cxOutNote = 'CX912 + CX695, Delhi 21:30';

export const people: Person[] = [
  { name: 'KJ', from: 'Delhi', arrive: cxIn, arriveNote: cxInNote, leave: cxOut, leaveNote: cxOutNote, proof: 'booked', proofText: 'Ticket in Drive' },
  { name: 'Sid', from: 'Delhi', arrive: cxIn, arriveNote: cxInNote, leave: cxOut, leaveNote: cxOutNote, proof: 'booked', proofText: 'Ticket in Drive' },
  { name: 'Martin', from: 'Delhi', arrive: cxIn, arriveNote: 'Same flights, by his account', leave: cxOut, leaveNote: 'Same flights', proof: 'unverified', proofText: 'Booked 3 Sep, ticket not in Drive' },
  { name: 'Parth', from: 'Delhi', arrive: 'Not known', arriveNote: 'Said he would match the group', leave: '1 Jan, 22:55', leaveNote: 'Air India direct', proof: 'unverified', proofText: 'Chat only' },
  { name: 'Ankur', from: 'Delhi', arrive: 'Not known', arriveNote: 'Booked on 29 Aug, never said which', leave: '1 Jan, 22:55', leaveNote: 'Air India direct', proof: 'unverified', proofText: 'Chat only' },
  { name: 'Dabad', from: 'Not known', arrive: 'Not known', arriveNote: '“Chill, mil jaunga main Philippines mein.”', leave: '1 Jan, about 22:00', leaveNote: 'According to the doc', proof: 'open', proofText: 'Nothing seen' },
  { name: 'DJ', from: 'Seoul', arrive: '26 Dec, 10:00', arriveNote: 'Cebu Pacific 5J185. He has since said the 27th.', leave: '2 Jan, 02:40', leaveNote: 'Jetstar GK082 to Osaka', proof: 'booked', proofText: 'Ticket in Drive, possibly stale' }
];

export interface Todo {
  what: string;
  when: string;
  why: string;
  link?: { href: string; text: string };
}

/** Ordered by what runs out first. */
export const todos: Todo[] = [
  {
    what: 'Flight out of Palawan',
    when: '1 Jan',
    why: 'Puerto Princesa to Manila, or El Nido to Manila direct on AirSwift. New Year’s Day seats go first, and three people have a 22:55 international flight hanging off this.'
  },
  {
    what: 'Coron to El Nido ferry',
    when: '28 Dec',
    why: 'Seven seats on a fast ferry in peak week. If this sells out, the fallback is a much slower boat or a flight back through Manila.'
  },
  {
    what: 'Coron stay',
    when: '25 to 28 Dec, three nights',
    why: 'Six people on the 25th, seven once DJ lands. Pick it around where the island-hopping boats leave from.'
  },
  {
    what: 'Manila stay',
    when: '23 to 25 Dec, two nights',
    why: 'Six people. Five options that were open on 11 Oct are further down this page, with photos.'
  },
  {
    what: 'DJ: Manila to Busuanga',
    when: '26 or 27 Dec',
    why: 'He lands after the group has flown out of Clark. Also: update the ticket in the Drive to whichever date is real.'
  },
  {
    what: 'New Year’s Eve',
    when: '31 Dec',
    why: 'Stay on Darocotan, which is paid for, or book a room in El Nido town. Decide before town fills up.'
  },
  {
    what: 'Van, Makati to Clark',
    when: '25 Dec, 08:30',
    why: 'Christmas morning, six people with bags. One van.',
    link: { href: 'https://www.klook.com/en-IN/activity/163551-manila-to-clark-airport-private-transfer/', text: 'Klook private transfer' }
  },
  {
    what: 'Van, El Nido to Puerto Princesa',
    when: '1 Jan',
    why: 'Only if we do not fly out of El Nido directly.'
  },
  {
    what: 'A bed near the airport',
    when: '1 Jan',
    why: 'KJ, Sid and Martin fly at 08:00 on the 2nd.'
  },
  {
    what: 'Put your ticket in the Drive',
    when: 'Now',
    why: 'Martin, Parth, Ankur, Dabad. The folder has three of seven.'
  },
  {
    what: 'eTravel form',
    when: 'Within 72 hours before landing',
    why: 'The Philippines wants it from every arriving passenger. Free, online, five minutes. You show the QR code at check-in and again on arrival.'
  }
];

export interface Idea {
  when: string;
  what: string;
  detail: string;
}

/** Manila, in the order the two days actually run. */
export const manila: Idea[] = [
  {
    when: 'Wed 23, from 19:00',
    what: 'Poblacion on foot',
    detail: 'Makati’s old red-light district, now the bar district. Rooftops, holes in the wall, and speakeasies behind unmarked doors. Eat first: Filipino food at one of the pubs, then follow the noise.'
  },
  {
    when: 'Thu 24, 08:30 to 11:30',
    what: 'Intramuros',
    detail: 'The Spanish walled city. Fort Santiago, San Agustin Church (1607, the oldest stone church in the country), Casa Manila. Walk it or rent bamboo bikes. 25 minutes by Grab. Fort Santiago has stayed open through past Christmas seasons, but check the Intramuros Administration page that week.'
  },
  {
    when: 'Thu 24, 12:00 to 14:30',
    what: 'Binondo food crawl',
    detail: 'Ten minutes from Intramuros, founded 1594. Dumplings, lumpia, hopia, fried siopao, all within a few streets of Ongpin. No booking, just walk and eat.'
  },
  {
    when: 'Thu 24, afternoon',
    what: 'Pick one',
    detail: 'From the original doc: an indoor shooting range with a range officer, or a massage. Or BGC for coffee and a walk, 3 km east of the flat. Or the pool.'
  },
  {
    when: 'Thu 24, by 19:00',
    what: 'Dinner, booked',
    detail: 'The doc named Toyo Eatery and Metiz for modern Filipino tasting menus. Both need a reservation in a normal week, and whether either opens on Christmas Eve is the first thing to ask. Have a fallback in Poblacion.'
  },
  {
    when: 'Either evening, 18:00 to 22:00',
    what: 'The Ayala Triangle lights',
    detail: 'Makati’s Christmas light-and-sound show in the park, 1.2 km from Poblacion. In past years it ran every half hour from six to ten, November into January. This year’s schedule is not out yet.'
  },
  {
    when: 'Thu 24, night',
    what: 'Christmas Eve, the local way',
    detail: 'The last of the nine Simbang Gabi masses is at dawn on the 24th, and churches fill again in the evening before families go home for Noche Buena at midnight. San Agustin and Manila Cathedral are the two to see. Outside every church: bibingka and puto bumbong off a charcoal stove. After midnight the streets are empty.'
  },
  {
    when: 'Before the 25th',
    what: 'Pesos and supplies',
    detail: 'Withdraw cash for a week of islands, and buy anything the group wants on Darocotan. There is no shop there.'
  }
];

export interface Area {
  name: string;
  airport: string;
  clark: string;
  what: string;
  verdict: string;
  pick?: boolean;
}

/** Road distances from OpenStreetMap routing; times are with empty roads, so double them at 6 pm. */
export const areas: Area[] = [
  {
    name: 'Poblacion, Makati',
    airport: '7.5 km',
    clark: '97 km',
    what: 'Bars, late food and hostels packed into a few streets. Loud, scruffy, walkable.',
    verdict: 'Two nights, six men, one of them a night out. Everything is on foot and the flats are cheap.',
    pick: true
  },
  {
    name: 'BGC, Taguig',
    airport: '6.4 km',
    clark: '101 km',
    what: 'New, clean, planned. Malls, rooftop bars, wide pavements.',
    verdict: 'Nicer streets, but for these dates the cheapest well-reviewed flat for six was about ₹58,000, more than double.'
  },
  {
    name: 'Makati CBD, Greenbelt',
    airport: '6.4 km',
    clark: '102 km',
    what: 'Office towers and malls. Quiet after nine.',
    verdict: 'Closest to the Ayala Triangle lights, 2 km from the bars. Fine, just nothing to walk out into.'
  },
  {
    name: 'Newport, beside Terminal 3',
    airport: '2.2 km',
    clark: '105 km',
    what: 'A casino resort and hotels across the road from the airport.',
    verdict: 'Right for the night of 1 January before the 08:00 flight. Wrong for seeing Manila.'
  },
  {
    name: 'Clark or San Fernando',
    airport: '100 km',
    clark: '7 to 21 km',
    what: 'Next to the airport you fly out of. San Fernando is the giant-lantern town.',
    verdict: 'Tempting for the 24th, but it costs the whole Manila day, and in the one year with a published schedule the lantern show skipped Christmas Eve.'
  }
];

export const newYears = [
  { year: '2022', what: 'Drunk on the sports complex', where: 'Patna' },
  { year: '2023', what: 'Drunk on the streets', where: 'Darjeeling' },
  { year: '2024', what: 'Disco', where: 'Patna' },
  { year: '2025', what: 'Keys lost', where: 'Japan' },
  { year: '2026', what: '??', where: 'Palawan' }
];

export const facts = [
  { q: 'Visa', a: 'None needed. Indian passports get 14 days visa-free; the trip is ten. Carry the return ticket and six months of passport validity.' },
  { q: 'Bags', a: 'Cathay gives 23 kg checked. Cebgo to Coron gives 20 kg checked and 7 kg cabin, so pack for the smaller number.' },
  { q: 'Cash', a: 'Coron and El Nido have a few ATMs that run dry in peak week. Darocotan has none. Withdraw pesos in Manila.' },
  { q: 'Signal', a: 'Fine in Manila and Coron town, weak in El Nido, close to nothing on Darocotan. Tell your parents before the 28th.' }
];

// ── geometry helpers shared by the page and the map ─────────────────────────

export const at = (p: PlaceId | LonLat): LonLat => (typeof p === 'string' ? places[p].at : p);

export function km(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function legKm(leg: Leg): number {
  const pts = leg.via.map(at);
  return pts.slice(1).reduce((sum, p, i) => sum + km(pts[i], p), 0);
}

export const legById = (id: string): Leg => legs.find((l) => l.id === id.replace('!', ''))!;
