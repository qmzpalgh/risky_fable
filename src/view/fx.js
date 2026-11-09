// Battle effects: cannon volleys, sparks, shockwave rings, floating casualty numbers.
import * as THREE from 'three';
import { tween, ease, wait, clock } from './anim.js';
import { TOP } from './world.js';

const MAXP = 900;

export class Fx {
  constructor(world, layer) {
    this.world = world; this.layer = layer;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP); this.base = new Float32Array(MAXP * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d'), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.points.frustumCulled = false; this.points.renderOrder = 6;
    world.scene.add(this.points);
    this.next = 0;
    this.light = new THREE.PointLight('#ffb060', 0, 40, 1.6);
    world.scene.add(this.light);
    this.floats = [];
    world.tickers.push((dt) => this.update(dt));
  }

  spark(p, color, count = 24, speed = 5, up = 5, life = 0.7) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next; this.next = (this.next + 1) % MAXP;
      const a = Math.random() * Math.PI * 2, r = Math.random() * speed;
      this.pos.set([p.x, p.y, p.z], i * 3);
      this.vel.set([Math.cos(a) * r, up * (0.4 + Math.random()), Math.sin(a) * r], i * 3);
      const w = 0.6 + Math.random() * 0.4;
      this.base.set([c.r * w, c.g * w, c.b * w], i * 3);
      this.life[i] = this.max[i] = life * (0.5 + Math.random() * 0.7);
    }
  }

  update(dt) {
    const d = dt * Math.min(2, clock.speed);
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= d;
      const j = i * 3, f = Math.max(0, this.life[i] / this.max[i]);
      this.vel[j + 1] -= 16 * d;
      this.pos[j] += this.vel[j] * d; this.pos[j + 1] = Math.max(0.05, this.pos[j + 1] + this.vel[j + 1] * d); this.pos[j + 2] += this.vel[j + 2] * d;
      this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
      if (this.life[i] <= 0) this.pos[j + 1] = -50;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.light.intensity *= Math.max(0, 1 - dt * 7);
    for (const f of this.floats) {
      const s = this.world.toScreen(f.v);
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
    }
  }

  flash(p, intensity = 260, color = '#ffb060') { this.light.color.set(color); this.light.position.set(p.x, p.y + 3, p.z); this.light.intensity = intensity; }

  // "−2" rising from a territory
  floatText(i, text, cls = '') {
    const T = this.world.territories[i];
    const el = document.createElement('div');
    el.className = 'float-text ' + cls; el.textContent = text;
    this.layer.appendChild(el);
    const f = { el, v: T.center.clone().setY(TOP + 2.6) };
    this.floats.push(f);
    tween(1.25, (k) => { f.v.y = TOP + 2.6 + k * 2.4; el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3); }, ease.out, true).then(() => {
      el.remove(); this.floats.splice(this.floats.indexOf(f), 1);
    });
  }

  ring(i, color) {
    const T = this.world.territories[i];
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    mesh.rotation.x = -Math.PI / 2; mesh.position.copy(T.center).setY(TOP + 0.12); mesh.renderOrder = 5;
    this.world.scene.add(mesh);
    const R = Math.max(3.5, T.radius * 1.8);
    return tween(0.7, (k) => { mesh.scale.setScalar(0.4 + k * R); mesh.material.opacity = 0.85 * (1 - k); }, ease.out).then(() => { this.world.scene.remove(mesh); mesh.geometry.dispose(); });
  }

  // Shells arc from attacker to defender (and musket fire comes back).
  async volley(from, to, colorA, colorD, shots, onImpact) {
    const W = this.world, A = W.territories[from], B = W.territories[to];
    const wrap = Math.abs(A.center.x - B.center.x) > 90;
    const jobs = [];
    const fire = (S, E, color, delay, big) => wait(delay).then(() => {
      const start = S.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * S.pr, 0.9, (Math.random() - 0.5) * S.pr));
      const end = E.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * E.pr * 1.4, 0.3, (Math.random() - 0.5) * E.pr * 1.4));
      if (wrap) { // fire off the board edge; shells land from the other side
        const dirL = S.center.x < 0 ? -1 : 1;
        start.set(S.center.x, TOP + 0.9, S.center.z); const exit = start.clone(); exit.x += dirL * 6;
        const entry = end.clone(); entry.x -= dirL * 6;
        this.spark(start, '#ffd9a0', 8, 2.5, 3, 0.35);
        return wait(0.22).then(() => { this.spark(end, color, big ? 26 : 12, 4, 5, 0.6); this.spark(end, '#ffe7b0', 10, 2.5, 3, 0.4); onImpact?.(E.i, big); });
      }
      const dist = start.distanceTo(end), h = Math.min(7, 1.2 + dist * 0.22);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.16 : 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe2a8' }));
      W.scene.add(shell);
      this.spark(start, '#ffd9a0', big ? 10 : 4, 2.2, 3, 0.3);
      if (big) this.flash(start, 120);
      return tween(0.3 + dist * 0.012, (k) => {
        shell.position.lerpVectors(start, end, k); shell.position.y += Math.sin(Math.PI * k) * h;
        if (Math.random() < 0.6) this.spark(shell.position, '#ff9a40', 1, 0.3, 0.2, 0.25);
      }, ease.linear).then(() => {
        W.scene.remove(shell); shell.geometry.dispose();
        this.spark(end, color, big ? 26 : 10, big ? 4.5 : 2.5, big ? 6 : 3.5, 0.65);
        this.spark(end, '#ffe7b0', big ? 12 : 4, 2.5, 3, 0.4);
        if (big) this.flash(end, 240);
        onImpact?.(E.i, big);
      });
    });
    for (let k = 0; k < shots; k++) jobs.push(fire(A, B, colorD, k * 0.11, true));
    for (let k = 0; k < Math.max(1, shots - 1); k++) jobs.push(fire(B, A, colorA, 0.12 + k * 0.13, false));
    await Promise.all(jobs);
  }

  fireworks(center, colors) {
    for (let k = 0; k < 5; k++) {
      setTimeout(() => {
        const p = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 10 + Math.random() * 14, (Math.random() - 0.5) * 36));
        this.spark(p, colors[k % colors.length], 70, 9, 4, 1.5);
        this.flash(p, 300, colors[k % colors.length]);
      }, k * 260);
    }
  }
}
