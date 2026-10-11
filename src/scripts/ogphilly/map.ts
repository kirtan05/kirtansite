// The /ogphilly route map: real coastlines, the trip's legs, and a camera that
// follows whichever day is on screen.

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import geo from '../../data/ogphilly/geo.json';
import { at, days, labelRange, legs, places, type LonLat, type PlaceId, type View } from '../../data/ogphilly/trip';

const SEA = 0x0b4a5a;
const FAR_LAND = 0x14606d;
const LAND = 0xead9a8;
const REEF = 0x8fe0d8;
const MODE_COLOR = { air: 0xf6f1e1, sea: 0xffb703, road: 0x0a3340 } as const;
const MARKER = 0xff5c7a;

// Equirectangular around the middle of the trip. 1 unit = 1 degree of latitude.
const LON0 = 120;
const LAT0 = 12;
const K = Math.cos((LAT0 * Math.PI) / 180);
const xy = ([lon, lat]: LonLat): [number, number] => [(lon - LON0) * K, lat - LAT0];

const HOME: View = { center: [108, 21], dist: 78 };

export interface RouteMap {
  /** Index into `days`, or -1 for the whole trip. */
  show(day: number): void;
}

export function initMap(canvas: HTMLCanvasElement, labelLayer: HTMLElement): RouteMap | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  // `?still` does the same as the OS setting: no camera travel, no moving marker.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('still');
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SEA);
  scene.fog = new THREE.Fog(SEA, 10, 100);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 2000);
  camera.up.set(0, 0, 1);

  // ── graticule ─────────────────────────────────────────────────────────────
  const grid = (lon: [number, number], lat: [number, number], step: number, opacity: number) => {
    const pts: number[] = [];
    for (let l = lon[0]; l <= lon[1]; l += step) pts.push(...xy([l, lat[0]]), 0, ...xy([l, lat[1]]), 0);
    for (let l = lat[0]; l <= lat[1]; l += step) pts.push(...xy([lon[0], l]), 0, ...xy([lon[1], l]), 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity })));
  };
  grid([20, 180], [-20, 80], 10, 0.06);
  grid([114, 128], [4, 22], 1, 0.035);

  // ── land ──────────────────────────────────────────────────────────────────
  const landMesh = (rings: number[][][], color: number, z: number) => {
    const shapes = rings.map((ring) => new THREE.Shape(ring.map((p) => new THREE.Vector2(...xy(p as LonLat)))));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shapes), new THREE.MeshBasicMaterial({ color }));
    mesh.position.z = z;
    scene.add(mesh);
  };
  landMesh(geo.region, FAR_LAND, 0);
  landMesh(geo.ph, LAND, 0.0005);
  for (const ring of geo.ph) {
    const g = new THREE.BufferGeometry().setFromPoints(ring.map((p) => new THREE.Vector3(...xy(p as LonLat), 0.001)));
    scene.add(new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: REEF, transparent: true, opacity: 0.55 })));
  }

  // ── legs ──────────────────────────────────────────────────────────────────
  const legPath = new Map<string, THREE.Vector3[]>();
  const legLine = new Map<string, { line: Line2; mat: LineMaterial }>();
  const materials: LineMaterial[] = [];

  for (const leg of legs) {
    const pts = leg.via.map((v) => new THREE.Vector3(...xy(at(v)), 0));
    let path: THREE.Vector3[];
    if (leg.mode === 'air') {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      const peak = Math.min(a.distanceTo(b) * 0.16, 6);
      path = Array.from({ length: 65 }, (_, i) => {
        const t = i / 64;
        return new THREE.Vector3().lerpVectors(a, b, t).setZ(Math.sin(Math.PI * t) * peak);
      });
    } else {
      path = pts.length > 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5).getPoints(pts.length * 10) : pts;
      path.forEach((p) => p.setZ(0.002));
    }
    legPath.set(leg.id, path);

    const g = new LineGeometry();
    g.setPositions(path.flatMap((p) => [p.x, p.y, p.z]));
    const mat = new LineMaterial({
      color: MODE_COLOR[leg.mode],
      linewidth: 2,
      transparent: true,
      dashed: leg.mode === 'sea',
      dashSize: 1,
      gapSize: 0.45,
      depthTest: false
    });
    const line = new Line2(g, mat);
    line.computeLineDistances();
    line.renderOrder = 2;
    scene.add(line);
    materials.push(mat);
    legLine.set(leg.id, { line, mat });
  }

  // ── stops and the marker ──────────────────────────────────────────────────
  const dotGeo = new THREE.CircleGeometry(1, 24);
  const stops = (Object.keys(places) as PlaceId[]).map((id) => {
    const dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color: 0xf6f1e1, depthTest: false }));
    dot.position.set(...xy(places[id].at), 0.003);
    dot.renderOrder = 3;
    scene.add(dot);
    const label = document.createElement('span');
    label.className = 'map-label';
    label.textContent = places[id].name;
    labelLayer.append(label);
    return { id, dot, label };
  });

  const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: MARKER, depthTest: false }));
  marker.renderOrder = 4;
  scene.add(marker);

  // ── state ─────────────────────────────────────────────────────────────────
  const cam = { x: 0, y: 0, d: 0 };
  let goal = { x: 0, y: 0, d: 0 };
  let aspect = 1;
  let route: THREE.Vector3[] = [];
  let routeStart = 0;
  let dirty = true;
  const ROUTE_MS = 2200;

  const fit = (v: View) => {
    const [x, y] = xy(v.center);
    // A portrait canvas sees less width at the same distance, so back off.
    return { x, y, d: v.dist * Math.max(1, 1.3 / aspect) };
  };

  let current = -2;
  function show(day: number) {
    if (day === current) return;
    current = day;
    const d = days[day];
    goal = fit(d ? d.view : HOME);
    const active = new Set(d ? d.legs.map((l) => l.replace('!', '')) : []);
    for (const leg of legs) {
      const { mat } = legLine.get(leg.id)!;
      const on = !d || active.has(leg.id);
      mat.opacity = on ? (d ? 1 : 0.75) : 0.16;
      mat.linewidth = on && d ? 3.2 : 1.6;
    }
    route = d
      ? d.legs.flatMap((l) => {
          const p = legPath.get(l.replace('!', ''))!;
          return l.endsWith('!') ? [...p].reverse() : p;
        })
      : [];
    if (d && !route.length) route = [new THREE.Vector3(...xy(places[d.at].at), 0.004)];
    marker.visible = !!d;
    routeStart = performance.now();
    dirty = true;
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement!;
    if (!w || !h) return;
    aspect = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    materials.forEach((m) => m.resolution.set(w, h));
    const d = days[current];
    goal = fit(d ? d.view : HOME);
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas.parentElement!);
  resize();
  Object.assign(cam, goal);

  const v = new THREE.Vector3();
  let last = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    // Generous clamp: a throttled background tab should still arrive, not crawl.
    const dt = Math.min(now - last, 1000) / 1000;
    last = now;

    const k = still ? 1 : 1 - Math.exp(-dt * 2.6);
    const moving = Math.abs(goal.d - cam.d) > cam.d * 0.0005 || Math.hypot(goal.x - cam.x, goal.y - cam.y) > cam.d * 0.0005;
    if (moving) {
      cam.x += (goal.x - cam.x) * k;
      cam.y += (goal.y - cam.y) * k;
      // Zoom in log space so a 78-to-0.6 move does not spend all its time far out.
      cam.d = Math.exp(Math.log(cam.d) + (Math.log(goal.d) - Math.log(cam.d)) * k);
    }
    const t = route.length > 1 ? Math.min((now - routeStart) / ROUTE_MS, 1) : 1;
    if (!moving && !dirty && t >= 1 && now - routeStart > ROUTE_MS + 100) return;
    dirty = false;

    // Look straight down from far away, lean in as we get close.
    const tilt = THREE.MathUtils.clamp(0.95 - Math.log10(cam.d) * 0.36, 0.3, 0.95);
    camera.position.set(cam.x, cam.y - cam.d * Math.sin(tilt), cam.d * Math.cos(tilt));
    camera.lookAt(cam.x, cam.y, 0);
    const fog = scene.fog as THREE.Fog;
    fog.near = cam.d * 1.4;
    fog.far = cam.d * 6;

    for (const m of materials) m.dashScale = 22 / cam.d;

    if (marker.visible && route.length) {
      const e = still ? 1 : t * t * (3 - 2 * t);
      const f = e * (route.length - 1);
      const i = Math.min(Math.floor(f), route.length - 2);
      if (route.length > 1) marker.position.lerpVectors(route[i], route[i + 1], f - i);
      else marker.position.copy(route[0]);
      marker.scale.setScalar(cam.d * 0.009);
    }

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const s of stops) {
      const [min, max] = labelRange[s.id];
      const inRange = goal.d >= min * Math.max(1, 1.3 / aspect) && goal.d < max * Math.max(1, 1.3 / aspect);
      s.dot.visible = inRange;
      s.dot.scale.setScalar(cam.d * 0.0065);
      v.copy(s.dot.position).project(camera);
      const on = inRange && v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.96;
      s.label.style.opacity = on ? '1' : '0';
      if (on) s.label.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }

    renderer.render(scene, camera);
  }
  show(-1);
  requestAnimationFrame(frame);

  return { show };
}
