"""Build the coastline data for /ogphilly from Natural Earth.

  python3 build-geo.py ne_10m_admin_0_countries.geojson ne_50m_land.geojson osm.json out.json

`ph` is the Philippines: Natural Earth 10m everywhere except Palawan and the
Calamian islands, where the trip happens and the camera gets close, which come
from OpenStreetMap coastline ways. `region` is the surrounding coastline at
50m, only there to give the inbound flights something to fly over.

osm.json is the Overpass result of:
  [out:json];way["natural"="coastline"](7.4,116.8,12.55,120.75);out geom;
"""
import json
import sys


def area(ring):
    return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))) / 2


def simplify(pts, tol):
    # Douglas-Peucker, iterative
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = pts[i], pts[j]
        dx, dy = x2 - x1, y2 - y1
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
        best, idx = 0, -1
        for k in range(i + 1, j):
            d = abs(dy * (pts[k][0] - x1) - dx * (pts[k][1] - y1)) / norm
            if d > best:
                best, idx = d, k
        if best > tol:
            keep[idx] = True
            stack += [(i, idx), (idx, j)]
    return [p for p, k in zip(pts, keep) if k]


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [[p[:2] for p in poly[0]] for poly in polys]


def bbox(ring):
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    return min(xs), min(ys), max(xs), max(ys)


countries, land, osm, out = sys.argv[1:5]
TRIP = (116.8, 7.4, 120.75, 12.55)

ph = []
for f in json.load(open(countries))['features']:
    if f['properties'].get('ADM0_A3') != 'PHL':
        continue
    for ring in rings(f['geometry']):
        x0, y0, x1, y1 = bbox(ring)
        if TRIP[0] < x0 and x1 < TRIP[2] and TRIP[1] < y0 and y1 < TRIP[3]:
            continue  # replaced by the OpenStreetMap rings below
        if area(ring) < 0.004:
            continue
        s = simplify(ring[:-1], 0.012)
        if len(s) >= 4:
            ph.append([[round(x, 3), round(y, 3)] for x, y in s])

# Coastline ways are directed and share end nodes; chain them into closed rings.
ways = {w['nodes'][0]: w for w in json.load(open(osm))['elements'] if w['type'] == 'way'}
while ways:
    start, way = ways.popitem()
    pts, end = list(way['geometry']), way['nodes'][-1]
    while end != start and end in ways:
        nxt = ways.pop(end)
        pts += nxt['geometry'][1:]
        end = nxt['nodes'][-1]
    if end != start:
        continue  # runs off the edge of the box (Mindoro, Borneo)
    ring = [[p['lon'], p['lat']] for p in pts[:-1]]
    if area(ring) < 0.00004:
        continue
    s = simplify(ring, 0.0011)
    if len(s) >= 4:
        ph.append([[round(x, 4), round(y, 4)] for x, y in s])

region = []
for f in json.load(open(land))['features']:
    for ring in rings(f['geometry']):
        x0, y0, x1, y1 = bbox(ring)
        if x1 < 40 or x0 > 160 or y1 < -12 or y0 > 60:
            continue
        if 116.8 < x0 and x1 < 127 and 4.5 < y0 and y1 < 21.2:
            continue  # the Philippines, already covered in detail
        if area(ring) < 0.3:
            continue
        s = [p for p in simplify(ring[:-1], 0.12) if 15 < p[0] < 185 and -25 < p[1] < 82]
        if len(s) >= 4:
            region.append([[round(x, 2), round(y, 2)] for x, y in s])

json.dump({'ph': ph, 'region': region}, open(out, 'w'), separators=(',', ':'))
print('ph', len(ph), sum(map(len, ph)), 'region', len(region), sum(map(len, region)))
