# /ogphilly

A standalone trip-plan page for a Philippines trip, 23 Dec 2026 to 2 Jan 2027.
It shares nothing with the rest of the site: no `BaseLayout`, no Tailwind, its
own fonts and styles.

Live at https://kirtanjain.com/ogphilly. Pushing `main` deploys it.

## Files

| Path | What |
|---|---|
| `src/pages/ogphilly/index.astro` | Markup, all styles, and the page script (scroll tracking, card rails, countdown) |
| `src/scripts/ogphilly/map.ts` | The three.js route map |
| `src/data/ogphilly/trip.ts` | Places, legs, days, people, to-do list, Manila plan, area comparison, facts |
| `src/data/ogphilly/stays.ts` | The stay cards (generated, but safe to edit by hand) |
| `src/data/ogphilly/geo.json` | Coastlines for the map (generated) |
| `scripts/ogphilly/build-geo.py` | Builds `geo.json` |

## Changing the plan

Edit `trip.ts`. Each entry in `days` drives one scroll step:

- `view` is where the camera goes: `center` as `[lon, lat]`, `dist` in degrees
  of latitude (1 is about 111 km).
- `legs` lists the leg ids travelled that day, in order. Suffix an id with `!`
  to draw it in reverse. The marker travels them once when the day comes on
  screen.
- `status` is `booked`, `unverified` or `open` and sets the colour of the
  status line.

A leg's `via` is a list of place ids or raw `[lon, lat]` waypoints. Flights are
drawn as arcs between the first and last point; road and boat legs follow the
waypoints. The ferry and road waypoints were found with a grid search over the
coastline so the lines stay on water and land.

`labelRange` in `trip.ts` controls at which camera distances each place label
shows.

## The map

- Projection is equirectangular around 120°E, 12°N. One unit is one degree of
  latitude.
- Land is `ShapeGeometry` from `geo.json`; routes are `Line2` so they have real
  pixel width; labels are HTML positioned from projected points.
- It only renders while the camera or marker is moving.
- `prefers-reduced-motion`, or `?still` on the URL, turns off camera travel and
  the moving marker. `?still` is useful for screenshots.
- No WebGL: the canvas is hidden, a one-line note is shown, and the rest of the
  page works.

### Rebuilding the coastline

```bash
curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson
curl -LO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson
curl -A 'your-app/1.0' -o osm.json --data-urlencode \
  'data=[out:json][timeout:240];way["natural"="coastline"](7.4,116.8,12.55,120.75);out geom;' \
  https://overpass-api.de/api/interpreter
python3 scripts/ogphilly/build-geo.py ne_10m_admin_0_countries.geojson ne_50m_land.geojson osm.json src/data/ogphilly/geo.json
```

Natural Earth covers the Philippines and the surrounding region. Palawan and
the Calamian islands come from OpenStreetMap because the camera gets close
enough there for Natural Earth to look blocky. Overpass rejects requests
without a user agent.

## The stay cards

`stays.ts` holds one object per card: photos, price, beds, distances, reviews,
cancellation terms, and `good` / `bad` lists. Photos are hot-linked from
Airbnb's image CDN with `?im_w=720`; if a host replaces a photo, that slot
breaks and the URL needs replacing.

The photo reel inside a card is `.reel`, not `.strip`. `.strip` is the date
strip on the map and its styles are global.

## Privacy

The page is public but unlisted: `noindex` meta tag, `Disallow` in
`public/robots.txt`, and filtered out of the sitemap in `astro.config.mjs`.
This repo is public too, so the data files use first names only and carry no
booking references, ticket numbers or phone numbers. Keep it that way.
