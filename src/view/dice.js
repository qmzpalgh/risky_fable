// Physical dice. The rules engine decides the numbers; here a rigid-body
// simulation is run ahead of time, we see which face each die lands on, and
// orient the die's faces so the settled top face shows the real result.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clock } from './anim.js';

// BoxGeometry material order: +x, -x, +y, -y, +z, -z
const FACE_VALUES = [2, 5, 1, 6, 3, 4];
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((n) => new THREE.Vector3(...n));
const normalOf = (v) => NORMALS[FACE_VALUES.indexOf(v)];
const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
const HX = 4.3, HZ = 1.95, SIZE = 1;

export class DiceTray {
  constructor(canvas, audio) {
    this.canvas = canvas; this.audio = audio;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(30, 2, 1, 100);
    this.camera.position.set(0, 12.2, 5.2); this.camera.lookAt(0, 0, 0.2);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#40342a', 0.9));
    const key = new THREE.DirectionalLight('#fff0d8', 2.4);
    key.position.set(-4, 12, 5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -8, right: 8, top: 6, bottom: -6, near: 1, far: 30 });
    key.shadow.radius = 4;
    this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.ShadowMaterial({ opacity: 0.45 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    this.geo = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 4, 0.13);
    this.texCache = new Map();
    this.dice = [];
    this.active = false;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 480, h = this.canvas.clientHeight || 220;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  faceTexture(color, v) {
    const key = color + v;
    if (this.texCache.has(key)) return this.texCache.get(key);
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const col = new THREE.Color(color), lum = 0.299 * col.r + 0.587 * col.g + 0.114 * col.b;
    ctx.fillStyle = color; ctx.fillRect(0, 0, 128, 128);
    const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 92); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    for (const [px, py] of PIPS[v]) {
      ctx.beginPath(); ctx.arc(64 + px * 30, 64 + py * 30, 12.5, 0, 7);
      ctx.fillStyle = lum > 0.62 ? '#1c1a18' : '#fff7e2'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    this.texCache.set(key, tex);
    return tex;
  }

  clear() {
    for (const d of this.dice) { this.scene.remove(d.mesh); d.mesh.material.forEach((m) => m.dispose()); }
    this.dice = [];
    this.renderer.render(this.scene, this.camera);
  }

  // Run the throw to rest, off-screen. Returns recorded frames, or null if a die ended up cocked.
  simulate(n, nAtt) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -42, 0) });
    world.allowSleep = true;
    const mat = new CANNON.Material('m');
    world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.28, restitution: 0.42 }));
    const plane = (q, p) => { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: mat }); b.quaternion.setFromEuler(...q); b.position.set(...p); world.addBody(b); };
    plane([-Math.PI / 2, 0, 0], [0, 0, 0]);
    plane([0, Math.PI / 2, 0], [-HX, 0, 0]); plane([0, -Math.PI / 2, 0], [HX, 0, 0]);
    plane([0, 0, 0], [0, 0, -HZ]); plane([0, Math.PI, 0], [0, 0, HZ]);
    const bodies = [], hits = [];
    let frame = 0;
    for (let i = 0; i < n; i++) {
      const att = i < nAtt, k = att ? i : i - nAtt, side = att ? -1 : 1;
      const b = new CANNON.Body({ mass: 1, shape: new CANNON.Box(new CANNON.Vec3(SIZE / 2, SIZE / 2, SIZE / 2)), material: mat, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.25 });
      b.position.set(side * (2.6 + Math.random() * 0.7), 1.6 + k * 1.25, (k - 1) * 1.05 + (Math.random() - 0.5) * 0.4);
      b.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.velocity.set(-side * (5 + Math.random() * 4), 1 + Math.random() * 2, (Math.random() - 0.5) * 5);
      b.angularVelocity.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      b.angularDamping = 0.12; b.linearDamping = 0.05;
      b.addEventListener('collide', (e) => { const v = Math.abs(e.contact.getImpactVelocityAlongNormal()); if (v > 1.2) hits.push({ frame, v }); });
      world.addBody(b); bodies.push(b);
    }
    const frames = [];
    const STEP = 1 / 120;
    for (frame = 0; frame < 120 * 5; frame++) {
      world.step(STEP);
      if (frame % 2 === 0) frames.push(bodies.map((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
      if (frame > 60 && bodies.every((b) => b.sleepState === CANNON.Body.SLEEPING)) break;
    }
    const ups = [];
    for (const b of bodies) {
      const q = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      let best = 0, bd = -2;
      NORMALS.forEach((nm, f) => { const y = nm.clone().applyQuaternion(q).y; if (y > bd) { bd = y; best = f; } });
      if (bd < 0.97 || b.position.y > SIZE * 0.6) return null; // leaning or stacked
      ups.push(best);
    }
    return { frames, ups, hits: hits.map((h) => ({ frame: h.frame / 2, v: h.v })) };
  }

  // attackRolls / defendRolls: arrays of face values (sorted high→low by the engine)
  async roll(attackRolls, defendRolls, colorA, colorD) {
    this.clear();
    this.resize();
    const values = [...attackRolls, ...defendRolls], nAtt = attackRolls.length;
    let sim = null;
    for (let tries = 0; tries < 30 && !sim; tries++) sim = this.simulate(values.length, nAtt);
    if (!sim) return; // extremely unlikely; results are still shown in the panel
    values.forEach((v, i) => {
      const color = i < nAtt ? colorA : colorD;
      const mats = FACE_VALUES.map((fv) => new THREE.MeshPhysicalMaterial({ map: this.faceTexture(color, fv), roughness: 0.3, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2 }));
      const mesh = new THREE.Mesh(this.geo, mats);
      mesh.castShadow = true;
      // turn the die so the face that physically lands up carries the rolled value
      const fix = new THREE.Quaternion().setFromUnitVectors(normalOf(v), NORMALS[sim.ups[i]]);
      this.scene.add(mesh);
      this.dice.push({ mesh, fix, value: v, att: i < nAtt });
    });
    const q = new THREE.Quaternion();
    const total = sim.frames.length;
    let t = 0, last = null, hitIdx = 0;
    const cap = location.search.includes('test') ? 1 : 0.05;
    sim.hits.sort((a, b) => a.frame - b.frame);
    await new Promise((resolve) => {
      const step = (now) => {
        const dt = last === null ? 0 : Math.max(0, Math.min(cap, (now - last) / 1000)); last = now;
        t += dt * 60 * (0.95 + 0.45 * clock.speed);
        const f = Math.min(total - 1, Math.floor(t));
        const fr = sim.frames[f];
        this.dice.forEach((d, i) => {
          const s = fr[i];
          d.mesh.position.set(s[0], s[1], s[2]);
          d.mesh.quaternion.copy(q.set(s[3], s[4], s[5], s[6])).multiply(d.fix);
        });
        while (hitIdx < sim.hits.length && sim.hits[hitIdx].frame <= f) { this.audio?.dice(Math.min(1, sim.hits[hitIdx].v / 14)); hitIdx++; }
        this.renderer.render(this.scene, this.camera);
        if (f >= total - 1) resolve(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    // dim the dice that lost their comparison
    const A = this.dice.filter((d) => d.att), D = this.dice.filter((d) => !d.att);
    const byVal = (a, b) => b.value - a.value;
    A.sort(byVal); D.sort(byVal);
    for (let i = 0; i < Math.max(A.length, D.length); i++) {
      const a = A[i], d = D[i];
      const lose = (x) => x.mesh.material.forEach((m) => { m.color.setScalar(0.38); });
      if (a && d) lose(a.value > d.value ? d : a);
      else (a || d).mesh.material.forEach((m) => m.color.setScalar(0.72)); // not compared
    }
    this.renderer.render(this.scene, this.camera);
  }
}
