// Miniature armies: instanced infantry / cavalry / artillery pieces, strength
// badges, and the little columns that march between territories.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import mapdata from '../data/mapdata.json';
import { N } from '../game/map.js';
import { tween, ease, wait } from './anim.js';

const seaSet = new Set(mapdata.seaLinks.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
export const isSeaLink = (a, b) => seaSet.has(`${Math.min(a, b)}-${Math.max(a, b)}`);

function infantryGeo() {
  const pts = [[0.36, 0], [0.36, 0.07], [0.27, 0.12], [0.19, 0.2], [0.23, 0.48], [0.26, 0.62], [0.1, 0.7], [0.16, 0.76], [0.2, 0.87], [0.17, 0.97], [0.21, 0.99], [0.1, 1.1], [0, 1.12]];
  const body = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14);
  const rifle = new THREE.CylinderGeometry(0.03, 0.035, 0.95, 6);
  rifle.rotateZ(-0.16); rifle.translate(0.3, 0.62, 0.05);
  return mergeGeometries([body.toNonIndexed(), rifle.toNonIndexed()]);
}
function cavalryGeo() {
  const o = [[-0.3, 0.1], [0.3, 0.1], [0.24, 0.28], [0.1, 0.5], [0.14, 0.72], [0.36, 0.76], [0.44, 0.9], [0.32, 1.1], [0.16, 1.24], [0.12, 1.4], [0.0, 1.24], [-0.16, 1.06], [-0.27, 0.76], [-0.24, 0.46], [-0.3, 0.28]];
  const horse = new THREE.ExtrudeGeometry(new THREE.Shape(o.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.2, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
  horse.translate(0, 0, -0.1);
  const base = new THREE.CylinderGeometry(0.42, 0.44, 0.12, 18); base.translate(0, 0.06, 0);
  return mergeGeometries([horse, base.toNonIndexed()].map((g) => { g.deleteAttribute('uv'); return g; }));
}
function artilleryGeo() {
  const parts = [];
  const base = new THREE.CylinderGeometry(0.52, 0.54, 0.08, 20); base.translate(0, 0.04, 0); parts.push(base);
  const barrel = new THREE.CylinderGeometry(0.085, 0.14, 0.95, 12); barrel.rotateZ(-Math.PI / 2 + 0.32); barrel.translate(0.14, 0.52, 0); parts.push(barrel);
  const muzzle = new THREE.CylinderGeometry(0.115, 0.115, 0.09, 12); muzzle.rotateZ(-Math.PI / 2 + 0.32); muzzle.translate(0.56, 0.66, 0); parts.push(muzzle);
  for (const z of [-0.27, 0.27]) {
    const wheel = new THREE.TorusGeometry(0.27, 0.055, 8, 18); wheel.translate(0, 0.38, z); parts.push(wheel);
    const hub = new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8); hub.rotateX(Math.PI / 2); hub.translate(0, 0.38, z); parts.push(hub);
    for (let k = 0; k < 3; k++) { const sp = new THREE.BoxGeometry(0.5, 0.035, 0.03); sp.rotateZ((k * Math.PI) / 3); sp.translate(0, 0.38, z); parts.push(sp); }
  }
  const axle = new THREE.CylinderGeometry(0.04, 0.04, 0.56, 6); axle.rotateX(Math.PI / 2); axle.translate(0, 0.38, 0); parts.push(axle);
  const trail = new THREE.BoxGeometry(0.62, 0.07, 0.12); trail.rotateZ(0.42); trail.translate(-0.3, 0.26, 0); parts.push(trail);
  return mergeGeometries(parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; }));
}

export function composition(n) {
  let art = Math.floor(n / 10), rem = n - art * 10;
  if (art > 5) { art = 5; rem = 0; }
  let cav = Math.floor(rem / 5), inf = rem % 5;
  while (art + cav + inf > 7 && inf > 0) inf--;
  return { art, cav, inf };
}

export class Armies {
  constructor(world) {
    this.world = world;
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0.12 });
    const geos = [infantryGeo(), cavalryGeo(), artilleryGeo()];
    for (const g of geos) { g.deleteAttribute('uv'); g.computeVertexNormals(); }
    this.geos = geos;
    this.inst = geos.map((g) => {
      const m = new THREE.InstancedMesh(g, mat(), N * 7);
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color()); // allocate instanceColor
      world.scene.add(m);
      return m;
    });
    this.slots = Array.from({ length: N }, (_, i) => ({ owner: -2, armies: -1, pieces: [], pop: 0, hidden: 0 }));
    this.badges = [];
    this.texCache = new Map();
    for (let i = 0; i < N; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true, toneMapped: false }));
      sp.renderOrder = 10; sp.visible = false;
      world.scene.add(sp); this.badges.push(sp);
    }
    this.marchers = [];
    this.colors = [];
    world.tickers.push((dt) => this.update(dt));
  }

  pieceColor(hex) { const c = new THREE.Color(hex); const l = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; return c.multiplyScalar(l > 0.5 ? 0.92 : 0.8); }

  badgeTexture(color, n) {
    const key = color + '|' + n;
    let tex = this.texCache.get(key);
    if (tex) return tex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 56, 0, 7); ctx.fillStyle = 'rgba(14,18,24,0.92)'; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = color; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(64, 64, 61, 0, 7); ctx.stroke();
    ctx.fillStyle = '#fff8e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${n > 99 ? 50 : n > 9 ? 62 : 72}px "Bricolage Grotesque", system-ui, sans-serif`;
    ctx.fillText(String(n), 64, 69);
    tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, tex);
    return tex;
  }

  // Mirror the game state. `hide` temporarily subtracts armies that are mid-march.
  sync(s) {
    this.colors = s.players.map((p) => p.color);
    for (let i = 0; i < N; i++) {
      const slot = this.slots[i], owner = s.owner[i], armies = Math.max(0, s.armies[i] - slot.hidden);
      if (slot.owner === owner && slot.armies === armies) continue;
      const grew = armies > slot.armies || slot.owner !== owner;
      slot.owner = owner; slot.armies = armies;
      const T = this.world.territories[i];
      const { art, cav, inf } = composition(armies);
      const kinds = [...Array(art).fill(2), ...Array(cav).fill(1), ...Array(inf).fill(0)];
      const sc = THREE.MathUtils.clamp(T.pr / 0.82, 0.9, 1.75);
      slot.scale = sc;
      slot.pieces = kinds.map((kind, k) => {
        const n = kinds.length;
        let x = 0, z = 0;
        if (n > 1) {
          const ring = n > 6 ? n - 1 : n, idx = n > 6 ? k - 1 : k;
          if (!(n > 6 && k === 0)) { const a = (idx / ring) * Math.PI * 2 + i * 0.7; const r = Math.max(T.pr * (n === 2 ? 0.5 : 0.8), sc * (n === 2 ? 0.4 : n < 5 ? 0.55 : 0.8)); x = Math.cos(a) * r; z = Math.sin(a) * r; }
        }
        return { kind, x, z, rot: -0.5 + ((i * 7 + k * 3) % 10) * 0.1 };
      });
      if (grew) slot.pop = 1;
      const b = this.badges[i];
      b.visible = owner >= 0 && armies > 0;
      if (b.visible) { b.material.map = this.badgeTexture(s.players[owner].color, armies); b.material.needsUpdate = true; }
    }
  }

  update(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const counts = [0, 0, 0];
    const cam = this.world.camera.position;
    for (let i = 0; i < N; i++) {
      const slot = this.slots[i], T = this.world.territories[i];
      slot.pop = Math.max(0, slot.pop - dt * 3.5);
      const top = this.world.topOf(i);
      const col = slot.owner >= 0 ? this.pieceColor(this.colors[slot.owner]) : null;
      for (const pc of slot.pieces) {
        const s = slot.scale * (pc.kind === 0 ? 1 : pc.kind === 1 ? 1.02 : 1.08) * (1 + Math.sin(slot.pop * Math.PI) * 0.28);
        p.set(T.center.x + pc.x + T.mesh.position.x, top + Math.sin(slot.pop * Math.PI) * 0.3, T.center.z + pc.z);
        q.setFromAxisAngle(up, pc.rot); sv.setScalar(s);
        m.compose(p, q, sv);
        const im = this.inst[pc.kind], k = counts[pc.kind]++;
        im.setMatrixAt(k, m); im.setColorAt(k, col);
      }
      const b = this.badges[i];
      if (b.visible) {
        const d = cam.distanceTo(T.center);
        const size = THREE.MathUtils.clamp(d * 0.025, 1.3, 4) * (1 + Math.sin(slot.pop * Math.PI) * 0.3);
        b.scale.setScalar(size);
        b.position.set(T.center.x, top + 1.45 * slot.scale + size * 0.5 + 0.1, T.center.z);
      }
    }
    this.inst.forEach((im, k) => { im.count = counts[k]; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
  }

  // A column of miniatures hops from one territory to another.
  async march(from, to, color, amount, dur = 0.75) {
    const W = this.world, A = W.territories[from], B = W.territories[to];
    const count = Math.min(6, Math.max(1, amount));
    const mat = new THREE.MeshStandardMaterial({ color: this.pieceColor(color), roughness: 0.42, metalness: 0.12 });
    const sea = isSeaLink(from, to), wrap = Math.abs(A.center.x - B.center.x) > 90;
    const sc = Math.min(this.slots[from].scale || 1, this.slots[to].scale || 1);
    const jobs = [];
    for (let k = 0; k < count; k++) {
      const mesh = new THREE.Mesh(this.geos[0], mat);
      mesh.castShadow = true; mesh.scale.setScalar(sc); mesh.visible = false;
      W.scene.add(mesh);
      const side = ((k % 3) - 1) * 0.42 * sc;
      const dir = new THREE.Vector3().subVectors(B.center, A.center).setY(0).normalize();
      const off = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
      mesh.rotation.y = Math.atan2(-dir.z, dir.x) * (wrap ? -1 : 1);
      jobs.push(wait(k * 0.07).then(() => {
        mesh.visible = true;
        return tween(dur, (e, t) => {
          let x, z;
          if (wrap) {
            const leftFirst = A.center.x < 0, edge = 94;
            if (t < 0.5) { const u = t * 2; x = A.center.x + ((leftFirst ? -edge : edge) - A.center.x) * u; z = A.center.z; }
            else { const u = (t - 0.5) * 2; x = (leftFirst ? edge : -edge) + (B.center.x - (leftFirst ? edge : -edge)) * u; z = B.center.z; }
          } else { x = A.center.x + (B.center.x - A.center.x) * e; z = A.center.z + (B.center.z - A.center.z) * e; }
          const base = W.topOf(from) + (W.topOf(to) - W.topOf(from)) * t;
          const hop = sea && !wrap ? Math.sin(Math.PI * t) * 2.4 : Math.abs(Math.sin(t * Math.PI * 5)) * 0.42;
          mesh.position.set(x + off.x, base + hop, z + off.z);
        }, ease.inOut).then(() => { W.scene.remove(mesh); });
      }));
    }
    await Promise.all(jobs);
    mat.dispose();
  }
}
