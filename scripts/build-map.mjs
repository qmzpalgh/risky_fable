// Carves the 42 classic territories out of real coastline data and writes
// src/data/mapdata.json (polygons in world coordinates) plus a debug PNG.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { contours } from 'd3-contour';
import { TERRITORIES, EDGE_LIST, N, project, WORLD_SCALE, miller, LON_CUT } from '../src/game/map.js';

const require = createRequire(import.meta.url);
const topo = require('world-atlas/land-50m.json');
const land = feature(topo, topo.objects.land);

const CELL = 0.25 * WORLD_SCALE; // world units per cell
const X0 = project(LON_CUT, 0)[0];
const Z0 = project(0, 84)[1];
const W = Math.round(360 * WORLD_SCALE / CELL);
const H = Math.round((miller(84) - miller(-58)) * WORLD_SCALE / CELL);
const toGrid = (lon, lat) => {
  const [x, z] = project(lon, lat);
  return [(x - X0) / CELL, (z - Z0) / CELL];
};

// ---------- rasterise land ----------
const landMask = new Uint8Array(W * H);
function fillPolygon(rings) {
  const edges = [];
  for (const ring of rings) {
    const pts = ring.map(([lo, la]) => toGrid(lo, Math.max(-89, Math.min(89, la))));
    for (let i = 0; i < pts.length - 1; i++) {
      if (Math.abs(pts[i][0] - pts[i + 1][0]) > W / 2) return; // straddles the seam: skip
    }
    for (let i = 0; i < pts.length - 1; i++) edges.push([pts[i], pts[i + 1]]);
  }
  let minY = Infinity, maxY = -Infinity;
  for (const [a, b] of edges) { minY = Math.min(minY, a[1], b[1]); maxY = Math.max(maxY, a[1], b[1]); }
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H - 1, Math.ceil(maxY)); y++) {
    const yc = y + 0.5, xs = [];
    for (const [a, b] of edges) {
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.max(0, Math.ceil(xs[i] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[i + 1] - 0.5)); x++) landMask[y * W + x] = 1;
    }
  }
}
const landPolys = (land.features || [land]).flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
for (const poly of landPolys) {
  if (poly[0].some(([, la]) => la < -60)) continue; // Antarctica
  fillPolygon(poly);
}

// ---------- connected land components ----------
const comp = new Int32Array(W * H).fill(-1);
const compCells = [];
{
  const stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!landMask[i] || comp[i] >= 0) continue;
    const id = compCells.length, cells = [];
    comp[i] = id; stack.push(i);
    while (stack.length) {
      const c = stack.pop(); cells.push(c);
      const x = c % W, y = (c / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (landMask[n] && comp[n] < 0) { comp[n] = id; stack.push(n); }
      }
    }
    compCells.push(cells);
  }
}

// ---------- seeds ----------
const seeds = [];
TERRITORIES.forEach((t, ti) => {
  for (const [lon, lat] of t.seeds) {
    let [gx, gy] = toGrid(lon, lat);
    gx = Math.round(gx); gy = Math.round(gy);
    let best = -1, bd = 1e9; // snap to nearest land
    for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
      const x = gx + dx, y = gy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H || !landMask[y * W + x]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = y * W + x; }
    }
    if (best < 0) { console.warn('seed off land', t.id, lon, lat); continue; }
    seeds.push({ t: ti, x: best % W, y: (best / W) | 0, comp: comp[best] });
  }
});
const seedsByComp = new Map();
for (const s of seeds) { if (!seedsByComp.has(s.comp)) seedsByComp.set(s.comp, []); seedsByComp.get(s.comp).push(s); }

// smooth value noise for organic borders
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v - 0.5;
}
const warp = (x, y, s) => 9 * noise(x / 26, y / 26, s) + 4 * noise(x / 9, y / 9, s + 7);

const terr = new Int16Array(W * H).fill(-1);
const nearest = (list, x, y) => {
  let best = null, bd = Infinity;
  for (const s of list) { const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
  return [best, Math.sqrt(bd)];
};
compCells.forEach((cells, id) => {
  const own = seedsByComp.get(id);
  if (own) {
    for (const c of cells) {
      const x = c % W, y = (c / W) | 0;
      terr[c] = nearest(own, x + warp(x, y, 1), y + warp(x, y, 2))[0].t;
    }
  } else if (cells.length >= 10) {
    let cx = 0, cy = 0;
    for (const c of cells) { cx += c % W; cy += (c / W) | 0; }
    const [s, d] = nearest(seeds, cx / cells.length, cy / cells.length);
    if (d * 0.25 < 13) for (const c of cells) terr[c] = s.t;
  }
});

// ---------- per-territory cleanup, contours, centres ----------
function components(mask) {
  const lab = new Int32Array(W * H).fill(-1), out = [], stack = [];
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || lab[i] >= 0) continue;
    const cells = []; lab[i] = out.length; stack.push(i);
    while (stack.length) {
      const c = stack.pop(); cells.push(c);
      const x = c % W, y = (c / W) | 0;
      if (x > 0 && mask[c - 1] && lab[c - 1] < 0) { lab[c - 1] = out.length; stack.push(c - 1); }
      if (x < W - 1 && mask[c + 1] && lab[c + 1] < 0) { lab[c + 1] = out.length; stack.push(c + 1); }
      if (y > 0 && mask[c - W] && lab[c - W] < 0) { lab[c - W] = out.length; stack.push(c - W); }
      if (y < H - 1 && mask[c + W] && lab[c + W] < 0) { lab[c + W] = out.length; stack.push(c + W); }
    }
    out.push(cells);
  }
  return out.sort((a, b) => b.length - a.length);
}
// orphaned slivers (cut off from their territory by a neighbour) join whoever surrounds them
for (let pass = 0; pass < 2; pass++) {
  for (let ti = 0; ti < N; ti++) {
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = terr[i] === ti ? 1 : 0;
    const comps = components(mask);
    for (const cells of comps.slice(1)) {
      const votes = new Map();
      for (const c of cells) for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n >= 0 && n < W * H && terr[n] >= 0 && terr[n] !== ti) votes.set(terr[n], (votes.get(terr[n]) || 0) + 1);
      }
      if (votes.size) { const to = [...votes].sort((a, b) => b[1] - a[1])[0][0]; for (const c of cells) terr[c] = to; }
      else if (cells.length < 14) for (const c of cells) terr[c] = -1;
    }
  }
}

function simplify(pts, eps) { // Douglas-Peucker on a closed ring
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = len < 1e-6 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };

const out = [];
const touch = Array.from({ length: N }, () => new Set());
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = terr[y * W + x]; if (a < 0) continue;
  for (const n of [x + 1 < W ? y * W + x + 1 : -1, y + 1 < H ? (y + 1) * W + x : -1]) {
    if (n < 0) continue; const b = terr[n];
    if (b >= 0 && b !== a) { touch[a].add(b); touch[b].add(a); }
  }
}
const gen = contours().size([W, H]).thresholds([0.5]);
for (let ti = 0; ti < N; ti++) {
  const mask = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = terr[i] === ti ? 1 : 0;
  // light blur for rounder coasts (borders stay symmetric between neighbours)
  const tmp = new Float32Array(W * H), blur = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) tmp[y * W + x] = (mask[y * W + Math.max(0, x - 1)] + 2 * mask[y * W + x] + mask[y * W + Math.min(W - 1, x + 1)]) / 4;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) blur[y * W + x] = (tmp[Math.max(0, y - 1) * W + x] + 2 * tmp[y * W + x] + tmp[Math.min(H - 1, y + 1) * W + x]) / 4;
  const mp = gen(blur)[0];
  const polys = [];
  for (const poly of mp.coordinates) {
    const rings = poly.map((r) => simplify(r, 0.33)).filter((r, i) => r.length >= 4 && Math.abs(ringArea(r)) > (i === 0 ? 10 : 30));
    if (!rings.length || Math.abs(ringArea(poly[0])) < 10) continue;
    polys.push(rings.map((r) => r.map(([gx, gy]) => [+(X0 + gx * CELL).toFixed(2), +(Z0 + gy * CELL).toFixed(2)])));
  }
  polys.sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
  // centre = deepest interior point (chamfer distance transform)
  const dist = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? 1e6 : 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - W] + 1, dist[i - W - 1] + 1.414, dist[i - W + 1] + 1.414); }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) { const i = y * W + x; if (dist[i]) dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + W] + 1, dist[i + W + 1] + 1.414, dist[i + W - 1] + 1.414); }
  let bi = 0, bd = -1, sx = 0, sy = 0, cnt = 0;
  for (let i = 0; i < W * H; i++) if (mask[i]) { sx += i % W; sy += (i / W) | 0; cnt++; }
  sx /= cnt; sy /= cnt;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    // prefer deep points, gently biased toward the centroid
    const score = Math.min(dist[i], 14) - 0.02 * Math.hypot((i % W) - sx, ((i / W) | 0) - sy);
    if (score > bd) { bd = score; bi = i; }
  }
  out.push({
    id: TERRITORIES[ti].id,
    center: [+(X0 + (bi % W + 0.5) * CELL).toFixed(2), +(Z0 + (((bi / W) | 0) + 0.5) * CELL).toFixed(2)],
    radius: +(dist[bi] * CELL).toFixed(2),
    cells: cnt,
    polys,
  });
}

// report mismatches between the drawn map and the rules graph
const want = Array.from({ length: N }, () => new Set());
for (const [a, b] of EDGE_LIST) { want[a].add(b); want[b].add(a); }
const sea = [];
for (const [a, b] of EDGE_LIST) if (!touch[a].has(b)) sea.push([a, b]);
const extra = [];
for (let a = 0; a < N; a++) for (const b of touch[a]) if (a < b && !want[a].has(b)) {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W - 1; x++) { const p = terr[y * W + x], q = terr[y * W + x + 1]; if ((p === a && q === b) || (p === b && q === a)) n++; }
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) { const p = terr[y * W + x], q = terr[(y + 1) * W + x]; if ((p === a && q === b) || (p === b && q === a)) n++; }
  extra.push(`${TERRITORIES[a].id}~${TERRITORIES[b].id}(${n})`);
}
console.log('sea links:', sea.map(([a, b]) => `${TERRITORIES[a].id}-${TERRITORIES[b].id}`).join(' '));
console.log('touching but NOT adjacent:', extra.join(' ') || 'none');
console.log('radii:', out.map((o) => `${o.id}:${o.radius}`).join(' '));

fs.mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
const json = JSON.stringify({ territories: out.map(({ cells, ...o }) => o), seaLinks: sea });
fs.writeFileSync(new URL('../src/data/mapdata.json', import.meta.url), json);
console.log('points:', out.reduce((s, o) => s + o.polys.reduce((q, p) => q + p.reduce((r, g) => r + g.length, 0), 0), 0), 'bytes:', json.length);

// ---------- debug PNG ----------
if (process.argv[2]) {
  const rgb = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    rgb[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const t = terr[y * W + x], o = y * (W * 3 + 1) + 1 + x * 3;
      let c = landMask[y * W + x] ? [70, 70, 70] : [16, 28, 44];
      if (t >= 0) { const h = t * 2654435761 >>> 0; c = [90 + (h & 127), 90 + ((h >> 8) & 127), 90 + ((h >> 16) & 127)]; }
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  }
  for (const o of out) { // centres
    const gx = Math.round((o.center[0] - X0) / CELL), gy = Math.round((o.center[1] - Z0) / CELL);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const p = (gy + dy) * (W * 3 + 1) + 1 + (gx + dx) * 3; rgb[p] = 255; rgb[p + 1] = 0; rgb[p + 2] = 0; }
  }
  for (const s of seeds) { const p = s.y * (W * 3 + 1) + 1 + s.x * 3; rgb[p] = rgb[p + 1] = rgb[p + 2] = 0; }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b) => { let c = -1; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(process.argv[2], Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rgb)), chunk('IEND', Buffer.alloc(0))]));
}
