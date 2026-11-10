// The tabletop: renderer, camera, lighting, ocean board and the 42 territory meshes.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import mapdata from '../data/mapdata.json';
import { TERRITORIES, CONTINENTS, CONT_OF, EDGE_LIST, N, project } from '../game/map.js';
import { updateTweens, tween, ease } from './anim.js';

export const TOP = 0.95; // height of the land surface above the ocean
const DT_CAP = location.search.includes('test') ? 1 : 0.05; // ?test lets slow software renderers keep real-time pace
const BOARD_W = 188, BOARD_D = 98;
const NEUTRAL = new THREE.Color('#6f6b61');

const RANGES = [
  [[-125, 58], [-118, 50], [-112, 44], [-107, 38], [-105, 33]], [[-106, 28], [-102, 22], [-98, 18]],
  [[-83, 35], [-78, 39], [-74, 43]], [[-152, 62.5], [-146, 63]],
  [[-76, 6], [-78, -2], [-76, -10], [-70, -16], [-68, -24], [-70, -33], [-71, -42], [-72, -49]],
  [[6, 45.5], [10, 46.8], [14, 47]], [[-1, 42.7], [1.5, 42.6]], [[7, 60], [12, 64], [17, 67.5]],
  [[20, 49], [24, 47.5], [26, 45.5]], [[40, 43.5], [46, 42]], [[59, 66], [59, 60], [58, 54], [58, 51]],
  [[-7, 31.5], [-1, 34], [6, 35.5]], [[37, 13], [39, 9], [38, 6]], [[28, -30], [30, -27]],
  [[46, 36], [50, 32], [54, 29]], [[67, 35.5], [71, 37], [74, 38.5]], [[75, 42], [80, 42.5], [86, 43]],
  [[75, 34], [80, 30.5], [85, 28.5], [90, 28], [95, 28.5]], [[86, 50], [90, 48], [95, 46]],
  [[98, 53], [106, 54], [112, 56]], [[128, 65], [132, 68]], [[150, 63], [160, 65]], [[158, 54], [161, 58]],
  [[137, 35.5], [139, 37]], [[146, -20], [149, -28], [149, -34]], [[138, -4.5], [143, -5.5]],
  [[100, 32], [103, 28]], [[15, 41], [13, 43.5]],
];

function rng(seed) { let a = seed | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// tileable fbm noise rendered to a canvas (used for land grain and table wood)
function noiseCanvas(size, period, octaves, map) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  const h = (x, y, p, s) => { x = ((x % p) + p) % p; y = ((y % p) + p) % p; let n = (x * 374761393 + y * 668265263 + s * 982451653) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, p = period;
    for (let o = 0; o < octaves; o++) {
      const fx = (x / size) * p, fy = (y / size) * p, xi = Math.floor(fx), yi = Math.floor(fy);
      const u = fx - xi, w = fy - yi, su = u * u * (3 - 2 * u), sw = w * w * (3 - 2 * w);
      const a = h(xi, yi, p, o), b = h(xi + 1, yi, p, o), cc = h(xi, yi + 1, p, o), d = h(xi + 1, yi + 1, p, o);
      v += amp * (a + (b - a) * su + (cc - a) * sw + (a - b - cc + d) * su * sw);
      amp *= 0.5; p *= 2;
    }
    const [r, g, bl] = map(v, x, y), i = (y * size + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = bl; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class World {
  constructor(canvas) {
    this.canvas = canvas;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color('#0b1016');
    scene.fog = new THREE.Fog('#0b1016', 220, 520);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const camera = (this.camera = new THREE.PerspectiveCamera(38, 1, 1, 900));
    camera.position.set(0, 118, 92);
    const controls = (this.controls = new MapControls(camera, canvas));
    controls.target.set(0, 0, 6);
    controls.enableDamping = true; controls.dampingFactor = 0.09;
    controls.minDistance = 16; controls.maxDistance = 330;
    controls.minPolarAngle = 0.12; controls.maxPolarAngle = 1.22;
    controls.zoomSpeed = 1.1; controls.rotateSpeed = 0.6; controls.panSpeed = 1.1;
    controls.zoomToCursor = true;
    controls.update();

    // lighting: warm key lamp over the table, cool fill, soft ambient
    scene.add(new THREE.HemisphereLight('#cfe0ff', '#3a2a1c', 0.55));
    const key = (this.key = new THREE.DirectionalLight('#ffe2b8', 2.6));
    key.position.set(-70, 130, 60);
    key.castShadow = true;
    key.shadow.mapSize.set(4096, 4096);
    Object.assign(key.shadow.camera, { left: -110, right: 110, top: 70, bottom: -70, near: 20, far: 320 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.05; key.shadow.radius = 3;
    scene.add(key);
    const rim = new THREE.DirectionalLight('#7fa8ff', 0.7);
    rim.position.set(80, 60, -90);
    scene.add(rim);

    this.territories = [];
    this.pickables = [];
    this.tickers = [];
    this.hovered = -1;
    this.idleOrbit = false;
    this._flyId = 0;

    this.buildBoard();
    this.buildTerritories();
    this.buildMountains();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindPointer();

    let last = performance.now();
    renderer.setAnimationLoop((now) => {
      const dt = Math.min(DT_CAP, (now - last) / 1000); last = now;
      this.time = now / 1000;
      this.adaptQuality(now - (this._lastNow ?? now)); this._lastNow = now;
      updateTweens(dt);
      this.update(dt);
      for (const f of this.tickers) f(dt, this.time);
      renderer.render(scene, camera);
    });
  }

  // Step rendering cost down on machines that cannot hold a playable frame rate.
  adaptQuality(ms) {
    if (document.hidden || ms > 1000) return;
    this._q = this._q || { t: 0, n: 0, level: 0 };
    const q = this._q;
    if (this.time < 5) return; // ignore start-up shader compilation
    q.t += ms; q.n++;
    if (q.t < 2500) return;
    const fps = (q.n * 1000) / q.t; q.t = 0; q.n = 0;
    q.bad = fps < 24 ? (q.bad || 0) + 1 : 0;
    if (q.bad < 2 || q.level >= 3) return; // two slow windows in a row before stepping down
    q.bad = 0; q.level++;
    if (q.level === 1) this.renderer.setPixelRatio(1);
    else if (q.level === 2) { this.key.shadow.mapSize.set(2048, 2048); this.key.shadow.map?.dispose(); this.key.shadow.map = null; this.key.shadow.normalBias = 0.12; this.renderer.setPixelRatio(0.8); }
    else { this.renderer.shadowMap.enabled = false; this.key.castShadow = false; this.renderer.setPixelRatio(0.6); this.scene.traverse((o) => o.material && [].concat(o.material).forEach((m) => (m.needsUpdate = true))); }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole board in view on narrow screens
    this.camera.fov = w / h < 1 ? 58 : 38;
    this.camera.updateProjectionMatrix();
  }

  // ---------- board ----------
  buildBoard() {
    const scene = this.scene;
    // table top
    const wood = noiseCanvas(512, 4, 5, (v, x) => { const g = 0.5 + 0.5 * Math.sin((x / 512) * Math.PI * 2 * 14 + v * 22); const k = 26 + g * 20 + v * 22; return [k * 1.25, k * 0.82, k * 0.55]; });
    wood.repeat.set(5, 3); wood.colorSpace = THREE.SRGBColorSpace;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(900, 700), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0.05 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -2.2; table.receiveShadow = true;
    scene.add(table);

    // ocean chart
    const cw = 4096, ch = Math.round((4096 * BOARD_D) / BOARD_W);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d');
    const sx = (x) => ((x + BOARD_W / 2) / BOARD_W) * cw, sz = (z) => ((z + BOARD_D / 2) / BOARD_D) * ch, k = cw / BOARD_W;
    const g = ctx.createRadialGradient(cw * 0.5, ch * 0.45, 100, cw * 0.5, ch * 0.5, cw * 0.62);
    g.addColorStop(0, '#1d5871'); g.addColorStop(0.6, '#14405a'); g.addColorStop(1, '#0c2a40');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    // graticule
    ctx.strokeStyle = 'rgba(190,225,235,0.09)'; ctx.lineWidth = 1.5;
    for (let lon = -160; lon <= 190; lon += 20) { const x = sx(project(lon, 0)[0]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
    for (let lat = -40; lat <= 80; lat += 20) { const z = sz(project(0, lat)[1]); ctx.beginPath(); ctx.moveTo(0, z); ctx.lineTo(cw, z); ctx.stroke(); }
    // shallow-water glow hugging every coast
    const landPath = new Path2D();
    for (const t of mapdata.territories) for (const poly of t.polys) for (const ring of poly) {
      ring.forEach(([x, z], i) => (i ? landPath.lineTo(sx(x), sz(z)) : landPath.moveTo(sx(x), sz(z))));
      landPath.closePath();
    }
    ctx.save(); ctx.shadowColor = 'rgba(120,215,225,0.55)'; ctx.shadowBlur = 46; ctx.fillStyle = '#2a7890'; ctx.fill(landPath, 'evenodd');
    ctx.shadowBlur = 16; ctx.shadowColor = 'rgba(190,245,240,0.6)'; ctx.fill(landPath, 'evenodd'); ctx.restore();
    // sea routes
    ctx.setLineDash([3, 15]); ctx.lineCap = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(245,232,200,0.78)';
    const C = mapdata.territories.map((t) => t.center);
    for (const [a, b] of mapdata.seaLinks) {
      const [ax, az] = C[a], [bx, bz] = C[b];
      ctx.beginPath();
      if (Math.abs(ax - bx) > BOARD_W / 2) { // wraps around the board edge
        const [l, r] = ax < bx ? [C[a], C[b]] : [C[b], C[a]];
        ctx.moveTo(sx(l[0]), sz(l[1])); ctx.lineTo(0, sz((l[1] + r[1]) / 2));
        ctx.moveTo(sx(r[0]), sz(r[1])); ctx.lineTo(cw, sz((l[1] + r[1]) / 2));
      } else {
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, d = Math.hypot(bx - ax, bz - az), bend = d * 0.12;
        ctx.moveTo(sx(ax), sz(az)); ctx.quadraticCurveTo(sx(mx + ((bz - az) / d) * bend), sz(mz - ((bx - ax) / d) * bend), sx(bx), sz(bz));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // compass rose in the South Pacific
    const rx = sx(-58), rz = sz(31), R = 7.2 * k;
    ctx.save(); ctx.translate(rx, rz); ctx.strokeStyle = 'rgba(232,214,170,0.55)'; ctx.fillStyle = 'rgba(232,214,170,0.5)'; ctx.lineWidth = 2.5;
    for (const r of [R, R * 0.82, R * 0.3]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); }
    for (let i = 0; i < 16; i++) {
      const len = i % 4 === 0 ? R * 1.25 : i % 2 === 0 ? R * 0.8 : R * 0.5, w = len * 0.11;
      ctx.save(); ctx.rotate((i * Math.PI) / 8); ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(w, 0); ctx.lineTo(-w, 0); ctx.closePath();
      i % 2 ? ctx.stroke() : ctx.fill(); ctx.restore();
    }
    ctx.font = `${R * 0.42}px Marcellus, serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(240,226,190,0.8)'; ctx.fillText('N', 0, -R * 1.36);
    ctx.restore();
    // chart border
    ctx.strokeStyle = 'rgba(232,214,170,0.45)'; ctx.lineWidth = 5; ctx.strokeRect(22, 22, cw - 44, ch - 44);
    ctx.lineWidth = 1.5; ctx.strokeRect(34, 34, cw - 68, ch - 68);

    const oceanTex = new THREE.CanvasTexture(c);
    oceanTex.colorSpace = THREE.SRGBColorSpace; oceanTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const ripple = noiseCanvas(256, 6, 4, (v) => { const q = v * 255; return [q, q, q]; });
    ripple.repeat.set(26, 13);
    this.ripple = ripple;
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D),
      new THREE.MeshPhysicalMaterial({ map: oceanTex, roughness: 0.28, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.25, bumpMap: ripple, bumpScale: 0.6 }));
    ocean.rotation.x = -Math.PI / 2; ocean.receiveShadow = true;
    scene.add(ocean);

    // brass-edged walnut frame
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.5, metalness: 0.1 });
    const brass = new THREE.MeshStandardMaterial({ color: '#b8904a', roughness: 0.3, metalness: 0.9 });
    const fw = 3.4, fh = 2.6;
    const bars = [[BOARD_W + fw * 2, fw, 0, -(BOARD_D + fw) / 2], [BOARD_W + fw * 2, fw, 0, (BOARD_D + fw) / 2], [fw, BOARD_D, -(BOARD_W + fw) / 2, 0], [fw, BOARD_D, (BOARD_W + fw) / 2, 0]];
    for (const [w, d, x, z] of bars) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, fh, d), frameMat);
      m.position.set(x, fh / 2 - 2.2 + 0.9, z); m.castShadow = m.receiveShadow = true; scene.add(m);
      const inlay = new THREE.Mesh(new THREE.BoxGeometry(w - (w > d ? 1.6 : 2.4), 0.12, d - (w > d ? 2.4 : 1.6)), brass);
      inlay.position.set(x, fh - 2.2 + 0.9 + 0.02, z); scene.add(inlay);
    }
    // Keep the backing below the chart: a nearly coplanar top loses depth
    // precision at maximum zoom-out and bleeds through the ocean.
    const slabHeight = 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD_W, slabHeight, BOARD_D), frameMat);
    slab.position.y = -2.2 + slabHeight / 2; scene.add(slab);
  }

  // ---------- land ----------
  buildTerritories() {
    const grain = noiseCanvas(512, 5, 5, (v) => { const q = 150 + v * 105; return [q, q, q]; });
    const bump = noiseCanvas(512, 7, 5, (v) => { const q = v * 255; return [q, q, q]; });
    for (const t of [grain, bump]) t.repeat.set(0.07, 0.07);
    grain.colorSpace = THREE.SRGBColorSpace;
    const sideMats = CONTINENTS.map((c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c.color).multiplyScalar(0.62), roughness: 0.7 }));

    mapdata.territories.forEach((d, i) => {
      const shapes = d.polys.map((poly) => {
        const s = new THREE.Shape(poly[0].map(([x, z]) => new THREE.Vector2(x, -z)));
        for (const hole of poly.slice(1)) s.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, -z))));
        return s;
      });
      const geo = new THREE.ExtrudeGeometry(shapes, { depth: TOP - 0.16, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.13, bevelOffset: -0.13, bevelSegments: 2, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      const top = new THREE.MeshStandardMaterial({ color: NEUTRAL.clone(), map: grain, bumpMap: bump, bumpScale: 1.4, roughness: 0.82, metalness: 0.02 });
      const mesh = new THREE.Mesh(geo, [top, sideMats[CONT_OF[i]]]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.t = i;
      this.scene.add(mesh);
      this.pickables.push(mesh);

      const pr = THREE.MathUtils.clamp(d.radius * 0.55, 0.62, 1.55); // radius of the army cluster
      const T = {
        i, mesh, top, center: new THREE.Vector3(d.center[0], TOP, d.center[1]), radius: d.radius, pr, polys: d.polys,
        color: NEUTRAL.clone(), lift: 0, liftTarget: 0, glow: 0, mode: 'none', flash: 0,
      };
      this.territories.push(T);
      mesh.add(this.makeLabel(TERRITORIES[i].name, T));
    });
  }

  makeLabel(name, T) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const ctx = c.getContext('2d');
    const words = name.split(' ');
    const lines = words.length >= 3 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : words.length === 2 && name.length > 13 ? words : [name];
    if (lines.length === 2 && lines[0].length > 14) { lines[0] = words[0]; lines[1] = words.slice(1).join(' '); }
    ctx.font = '600 58px Marcellus, Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(12,18,24,0.72)'; ctx.fillStyle = '#fbf3dc';
    lines.forEach((l, k) => { const y = 80 + (k - (lines.length - 1) / 2) * 64; ctx.strokeText(l, 256, y); ctx.fillText(l, 256, y); });
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const longest = Math.max(...lines.map((l) => l.length));
    const w = THREE.MathUtils.clamp(T.radius * 3, 4.4, 10.5) * (longest > 9 ? 1.15 : 0.95);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, (w * 160) / 512), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95, toneMapped: false }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(T.center.x, TOP + 0.03, T.center.z + T.pr + (w * 160) / 512 / 2 + 0.25);
    plane.renderOrder = 2;
    T.label = plane;
    return plane;
  }

  territoryAt(x, z) {
    for (const T of this.territories) for (const poly of T.polys) {
      if (pointInRing(x, z, poly[0]) && !poly.slice(1).some((h) => pointInRing(x, z, h))) return T;
    }
    return null;
  }

  buildMountains() {
    const r = rng(7);
    const buckets = this.territories.map(() => []);
    const rock = new THREE.Color('#6f6a60'), snow = new THREE.Color('#f4f2ea');
    for (const range of RANGES) {
      const pts = range.map(([lo, la]) => project(lo, la));
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.75));
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n + (r() - 0.5) * 0.9, z = az + ((bz - az) * k) / n + (r() - 0.5) * 0.9;
          const T = this.territoryAt(x, z);
          if (!T || Math.hypot(x - T.center.x, z - T.center.z) < T.pr + 0.75) continue;
          if (Math.abs(x - T.label.position.x) < 2.2 && Math.abs(z - T.label.position.z) < 0.8) continue;
          const h = 0.5 + r() * 0.85, rad = 0.34 + r() * 0.3 + h * 0.18;
          const g = new THREE.ConeGeometry(rad, h, 5 + Math.floor(r() * 2), 2).toNonIndexed();
          g.rotateY(r() * 6); g.translate(x, TOP + h / 2 - 0.02, z);
          const col = new Float32Array(g.attributes.position.count * 3), pos = g.attributes.position;
          for (let v = 0; v < pos.count; v++) {
            const f = (pos.getY(v) - TOP) / h, cc = f > 0.55 && h > 0.8 ? snow : rock.clone().multiplyScalar(0.8 + f * 0.5);
            col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          g.computeVertexNormals();
          buckets[T.i].push(g);
        }
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    buckets.forEach((list, i) => {
      if (!list.length) return;
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.castShadow = true; m.receiveShadow = true;
      this.territories[i].mesh.add(m);
    });
  }

  // ---------- state & highlights ----------
  setOwnerColor(i, hex, animate = false) {
    const T = this.territories[i];
    const target = hex ? new THREE.Color(hex).lerp(new THREE.Color('#efe2c4'), 0.3).multiplyScalar(0.9) : NEUTRAL.clone();
    if (!animate) { T.color.copy(target); return; }
    const from = T.color.clone();
    T.flash = 1;
    tween(0.55, (k) => T.color.copy(from).lerp(target, k), ease.out);
  }
  // mode: none | source | target | option | dim
  setMode(i, mode) { const T = this.territories[i]; T.mode = mode; T.liftTarget = mode === 'source' ? 0.55 : mode === 'target' ? 0.35 : 0; }
  clearModes() { for (const T of this.territories) this.setMode(T.i, 'none'); }
  shake(i, amount = 1) { this.territories[i].shakeT = amount; }
  topOf(i) { const T = this.territories[i]; return TOP + T.lift; }

  update(dt) {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4.2);
    const white = World._white || (World._white = new THREE.Color('#fff6d8'));
    for (const T of this.territories) {
      T.lift += (T.liftTarget - T.lift) * Math.min(1, dt * 12);
      let ox = 0;
      if (T.shakeT > 0) { T.shakeT = Math.max(0, T.shakeT - dt * 3.2); ox = Math.sin(this.time * 70) * 0.09 * T.shakeT; }
      T.mesh.position.set(ox, T.lift, 0);
      T.flash = Math.max(0, T.flash - dt * 1.8);
      const hov = this.hovered === T.i ? 0.1 : 0;
      let glow = 0, dim = 1;
      if (T.mode === 'source') glow = 0.3;
      else if (T.mode === 'target') glow = 0.34 + 0.12 * pulse;
      else if (T.mode === 'option') glow = 0.1 + 0.2 * pulse;
      else if (T.mode === 'dim') dim = 0.5;
      T.glow += (glow + hov + T.flash * 0.6 - T.glow) * Math.min(1, dt * 14);
      T.dimNow = (T.dimNow ?? 1) + (dim - (T.dimNow ?? 1)) * Math.min(1, dt * 10);
      T.top.color.copy(T.color).multiplyScalar(T.dimNow).lerp(white, Math.min(0.8, T.glow));
      T.top.emissive.copy(T.color).multiplyScalar(T.glow * 0.5);
    }
    this.ripple.offset.x = this.time * 0.004; this.ripple.offset.y = this.time * 0.0025;
    if (this.idleOrbit) {
      const a = this.time * 0.05;
      this.camera.position.set(Math.sin(a) * 40, 70 + Math.sin(a * 0.7) * 6, 86 + Math.cos(a) * 14);
      this.controls.target.set(Math.sin(a * 0.6) * 18, 0, 2);
    }
    // keep the camera over the table
    const tg = this.controls.target;
    tg.x = THREE.MathUtils.clamp(tg.x, -100, 100); tg.z = THREE.MathUtils.clamp(tg.z, -58, 62); tg.y = 0;
    this.controls.update();
  }

  // ---------- camera ----------
  setMenuMode(on) {
    this.idleOrbit = on; this.controls.enabled = !on;
    if (!on) this.flyHome(1.6);
  }
  homeView() {
    // back off until the whole board fits the viewport
    const cam = this.camera, vf = (cam.fov * Math.PI) / 360, hf = Math.atan(Math.tan(vf) * cam.aspect);
    let dist = Math.max((BOARD_W / 2 + 4) / Math.tan(hf), (BOARD_D / 2 + 16) / Math.tan(vf) * 0.86);
    if (cam.aspect < 0.9) dist *= 0.6; // portrait: start closer and let the player pan
    const target = new THREE.Vector3(0, 0, 5);
    return { target, pos: target.clone().add(new THREE.Vector3(0, 0.8, 0.6).normalize().multiplyScalar(dist)) };
  }
  flyHome(dur = 1) { const h = this.homeView(); return this.flyTo(h.target, h.pos, dur); }
  flyTo(target, pos, dur = 0.8) {
    const id = ++this._flyId;
    const t0 = this.controls.target.clone(), p0 = this.camera.position.clone();
    return tween(dur, (k) => {
      if (id !== this._flyId) return;
      this.controls.target.lerpVectors(t0, target, k);
      this.camera.position.lerpVectors(p0, pos, k);
    }, ease.inOut, true);
  }
  // Bring some territories comfortably into view without disorienting the player.
  focus(ids, { dist = 62, dur = 0.7, force = false, raise = 0 } = {}) {
    const c = new THREE.Vector3();
    let wrap = false;
    for (const i of ids) c.add(this.territories[i].center);
    c.multiplyScalar(1 / ids.length); c.y = 0;
    if (ids.length === 2 && Math.abs(this.territories[ids[0]].center.x - this.territories[ids[1]].center.x) > 90) wrap = true;
    if (wrap) return this.flyHome(dur);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const cur = offset.length();
    const ndc = c.clone().setY(TOP).project(this.camera);
    const centered = Math.abs(ndc.x) < 0.45 && (raise ? ndc.y > 0.05 && ndc.y < 0.6 : Math.abs(ndc.y) < 0.4);
    if (!force && centered && cur <= dist * 1.35) return Promise.resolve();
    const d = force ? dist : Math.min(cur, dist * 1.25);
    offset.setLength(Math.max(d, 30));
    // `raise` aims a little toward the viewer so the subject sits above screen centre (clear of the dice tray)
    if (raise) c.add(offset.clone().setY(0).normalize().multiplyScalar(offset.length() * raise));
    return this.flyTo(c, c.clone().add(offset), dur);
  }
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight, visible: p.z < 1 };
  }

  // ---------- input ----------
  bindPointer() {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const pick = (e) => {
      const r = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.pickables, false)[0];
      return hit ? hit.object.userData.t : -1;
    };
    let down = null;
    const clicks = [];
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, b: e.button, t: e.timeStamp }; });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const h = e.buttons ? -1 : pick(e);
      if (h !== this.hovered) { this.hovered = h; this.onHover?.(h, e); }
      else if (h >= 0) this.onHoverMove?.(e);
    });
    this.canvas.addEventListener('pointerleave', () => { this.hovered = -1; this.onHover?.(-1); });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = e.timeStamp - down.t < 600;
      const b = down.b; down = null;
      if (moved > 6 || !quick || b !== 0) {
        clicks.length = 0;
        if (b === 2 && moved <= 6 && quick) this.onCancel?.();
        return;
      }
      const t = pick(e);
      clicks.push(t);
      if (clicks.length > 2) clicks.shift();
      this.onClick?.(t, e);
    });
    this.canvas.addEventListener('pointercancel', () => { down = null; clicks.length = 0; });
    this.canvas.addEventListener('dblclick', (e) => {
      const t = pick(e);
      // Native double-click timing, with both taps passing the drag filter on the same territory.
      const valid = e.button === 0 && t >= 0 && clicks.length === 2 && clicks.every((c) => c === t);
      clicks.length = 0;
      if (valid) this.onDoubleClick?.(t, e);
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
