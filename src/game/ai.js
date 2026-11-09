// Heuristic AI. It only reads the state and proposes actions; the controller
// (or the headless simulator) applies them through the engine.
import { N, ADJ, CONTINENTS, CONT_MEMBERS, CONT_OF } from './map.js';
import { territoriesOf, armiesOf, findSet, mustTrade, fortifyTargets } from './engine.js';

// ---- exact battle odds: WIN[a][d] = P(attacker with `a` attacking armies beats `d` defenders)
const MAXN = 40;
const OUT = { // [P(def loses all compared), P(split), P(att loses all compared)]
  '3-2': [0.3717, 0.3358, 0.2926], '2-2': [0.2276, 0.3241, 0.4483], '1-2': [0.2546, 0, 0.7454],
  '3-1': [0.6597, 0, 0.3403], '2-1': [0.5787, 0, 0.4213], '1-1': [0.4167, 0, 0.5833],
};
const WIN = Array.from({ length: MAXN + 1 }, () => new Float64Array(MAXN + 1));
for (let a = 0; a <= MAXN; a++) for (let d = 0; d <= MAXN; d++) {
  if (d === 0) { WIN[a][d] = 1; continue; }
  if (a === 0) { WIN[a][d] = 0; continue; }
  const ad = Math.min(3, a), dd = Math.min(2, d), k = Math.min(ad, dd);
  const [w, sp, l] = OUT[`${ad}-${dd}`];
  WIN[a][d] = w * WIN[a][d - k] + l * WIN[a - k][d] + (sp ? sp * WIN[a - 1][d - 1] : 0);
}
export function winChance(a, d) {
  if (a > MAXN || d > MAXN) { const f = MAXN / Math.max(a, d); a = Math.round(a * f); d = Math.round(d * f); }
  return WIN[Math.max(0, a)][Math.max(0, d)];
}

const LEVELS = {
  easy: { risk: -0.12, noise: 1.2, greed: 0.7 },
  normal: { risk: 0, noise: 0.15, greed: 1 },
  hard: { risk: -0.03, noise: 0.03, greed: 1.25 },
};
const lvl = (s, p) => LEVELS[s.players[p].level] || LEVELS.normal;
const enemyAdj = (s, t, p) => ADJ[t].filter((a) => s.owner[a] !== p);
const threat = (s, t, p) => enemyAdj(s, t, p).reduce((a, n) => a + s.armies[n] - 1, 0);
const isBorder = (s, t, p) => ADJ[t].some((a) => s.owner[a] !== p);

// How attractive each continent is as a goal for player p (higher = focus here).
function continentPlan(s, p) {
  return CONTINENTS.map((c, ci) => {
    const mem = CONT_MEMBERS[ci];
    const mine = mem.filter((t) => s.owner[t] === p);
    const enemyArmies = mem.reduce((a, t) => a + (s.owner[t] !== p && s.owner[t] >= 0 ? s.armies[t] : 0), 0);
    const myArmies = mine.reduce((a, t) => a + s.armies[t], 0);
    const share = mine.length / mem.length;
    const entry = new Set();
    for (const t of mem) for (const a of ADJ[t]) if (CONT_OF[a] !== ci) entry.add(t);
    const score = share * 2.2 + (myArmies - enemyArmies) / (mem.length * 3) + c.bonus / mem.length - entry.size * 0.06;
    return { ci, share, score, owned: share === 1, mine, enemyArmies };
  });
}

// ---------- setup ----------
export function aiDraftPick(s) {
  const p = s.turn;
  let best = -1, bs = -Infinity;
  for (let t = 0; t < N; t++) {
    if (s.owner[t] !== -1) continue;
    const ci = CONT_OF[t], mem = CONT_MEMBERS[ci];
    const mine = mem.filter((m) => s.owner[m] === p).length;
    const theirs = mem.filter((m) => s.owner[m] >= 0 && s.owner[m] !== p).length;
    let sc = (mine * 2 - theirs) / mem.length * 3 + CONTINENTS[ci].bonus / mem.length;
    sc += ADJ[t].filter((a) => s.owner[a] === p).length * 0.5;
    sc += Math.random() * (0.3 + lvl(s, p).noise * 2);
    if (sc > bs) { bs = sc; best = t; }
  }
  return best;
}

// Where should the next army go? Shared by setup deployment and reinforcement.
export function aiPlacement(s, p = s.turn) {
  const mine = territoriesOf(s, p);
  const plan = continentPlan(s, p);
  const L = lvl(s, p);
  const target = plan.filter((c) => !c.owned).sort((a, b) => b.score - a.score)[0];
  let best = mine[0], bs = -Infinity;
  for (const t of mine) {
    const enemies = enemyAdj(s, t, p);
    if (!enemies.length) continue;
    const th = threat(s, t, p);
    const ci = CONT_OF[t];
    let sc = 0;
    // hold what we own: under-defended gates of completed continents
    if (plan[ci].owned) sc += Math.max(0, th * 0.7 - s.armies[t]) * 1.6 + CONTINENTS[ci].bonus * 0.3;
    // push where we are building a continent
    if (target && (ci === target.ci || enemies.some((e) => CONT_OF[e] === target.ci))) {
      sc += 4 + target.share * 3;
      const weakest = Math.min(...enemies.filter((e) => CONT_OF[e] === target.ci).map((e) => s.armies[e]), 99);
      if (weakest < 99) sc += 2 / weakest;
    }
    // generally prefer stacking over spreading, but not into hopeless spots
    sc += Math.min(s.armies[t], 12) * 0.25 - Math.max(0, th - s.armies[t] * 2) * 0.05;
    // an enemy continent we could break
    for (const e of enemies) {
      const o = s.owner[e];
      if (o >= 0 && CONT_MEMBERS[CONT_OF[e]].every((m) => s.owner[m] === o)) sc += CONTINENTS[CONT_OF[e]].bonus * 0.6;
    }
    sc += Math.random() * L.noise * 6;
    if (sc > bs) { bs = sc; best = t; }
  }
  return best;
}

// ---------- turn ----------
export function aiTrade(s) {
  const p = s.turn;
  const set = findSet(s, p);
  if (!set) return null;
  if (mustTrade(s) || s.forcedTrade) return set;
  // hard AI sits on 3 cards a little longer hoping for a territory match
  const cards = s.players[p].cards;
  if (s.players[p].level === 'hard' && cards.length === 3 && !set.some((i) => cards[i].t >= 0 && s.owner[cards[i].t] === p) && Math.random() < 0.5) return null;
  return set;
}

export function aiAttack(s) {
  const p = s.turn, L = lvl(s, p);
  const plan = continentPlan(s, p);
  const target = plan.filter((c) => !c.owned).sort((a, b) => b.score - a.score)[0];
  const totals = s.players.map((pl, i) => (pl.alive ? armiesOf(s, i) : 0));
  const counts = s.players.map((pl, i) => (pl.alive ? territoriesOf(s, i).length : 0));
  let best = null, bs = -Infinity;
  for (const from of territoriesOf(s, p)) {
    const a = s.armies[from] - 1;
    if (a < 1) continue;
    for (const to of enemyAdj(s, from, p)) {
      const d = s.armies[to], o = s.owner[to], ci = CONT_OF[to];
      const pw = winChance(a, d);
      let value = 1;
      if (!s.conquered) value += 1.5; // earn this turn's card
      const need = CONT_MEMBERS[ci].filter((m) => s.owner[m] !== p);
      if (need.length === 1) value += CONTINENTS[ci].bonus * 1.5; // completes a continent
      else if (target && ci === target.ci) value += 1.5 + target.share * 2;
      if (CONT_MEMBERS[ci].every((m) => s.owner[m] === o)) value += CONTINENTS[ci].bonus * 1.2; // breaks theirs
      if (counts[o] === 1) value += 3 + s.players[o].cards.length * 2.5; // elimination
      else if (totals[o] <= a * 0.6) value += 1 + s.players[o].cards.length;
      if (d === 1 && a >= 3) value += 0.8;
      // do not strip an important gate bare
      const exposure = threat(s, from, p) - s.armies[to] + 1;
      const penalty = plan[CONT_OF[from]].owned ? Math.max(0, exposure - a * pw) * 0.15 : 0;
      let need_p = 0.56 + L.risk - Math.min(0.14, (value - 2) * 0.02 * L.greed);
      if (s.conquered && value < 3) need_p += 0.1; // already have the card: only good fights
      if (pw < need_p) continue;
      const sc = pw * value * L.greed - penalty + Math.random() * L.noise * 3;
      if (sc > bs) { bs = sc; best = { from, to, dice: Math.min(3, a) }; }
    }
  }
  return best;
}

export function aiOccupy(s) {
  const { from, to, min, max } = s.pending;
  const p = s.turn;
  const thFrom = threat(s, from, p), thTo = enemyAdj(s, to, p).reduce((a, n) => a + s.armies[n], 0);
  if (thFrom === 0 && !ADJ[from].some((a) => a !== to && s.owner[a] !== p)) return max;
  if (thTo === 0) return min;
  const share = thTo / (thTo + thFrom + 0.01);
  return Math.max(min, Math.min(max, Math.round((max + 1) * Math.max(share, 0.5))));
}

export function aiFortify(s) {
  const p = s.turn;
  const mine = territoriesOf(s, p);
  // distance of each owned territory to the nearest front line
  const dist = new Array(N).fill(99), q = [];
  for (const t of mine) if (isBorder(s, t, p)) { dist[t] = 0; q.push(t); }
  for (let i = 0; i < q.length; i++) for (const a of ADJ[q[i]]) if (s.owner[a] === p && dist[a] > dist[q[i]] + 1) { dist[a] = dist[q[i]] + 1; q.push(a); }
  let best = null, bs = 0;
  for (const from of mine) {
    const spare = s.armies[from] - 1;
    if (spare < 1) continue;
    for (const to of fortifyTargets(s, from)) {
      let sc;
      if (dist[from] > 0) sc = (dist[from] - dist[to]) * spare + (dist[to] === 0 ? threat(s, to, p) * 0.05 : 0); // bring the rear forward
      else if (dist[to] === 0) { // shift between fronts toward the larger threat
        const gap = (threat(s, to, p) - s.armies[to]) - (threat(s, from, p) - s.armies[from]);
        sc = gap > 3 ? gap * 0.3 : 0;
      } else sc = 0;
      if (sc > bs) {
        bs = sc;
        const n = dist[from] > 0 ? spare : Math.max(1, Math.floor(spare / 2));
        best = { from, to, n };
      }
    }
  }
  return best;
}
