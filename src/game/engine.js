// Pure rules engine for classic world-conquest. No rendering, no timers:
// every function mutates the plain-object state and returns what happened.
import { N, ADJ, CONTINENTS, CONT_MEMBERS, CONT_OF, TERRITORIES } from './map.js';

export const INITIAL_ARMIES = { 2: 40, 3: 35, 4: 30, 5: 25, 6: 20 };
export const CARD_NAMES = ['Infantry', 'Cavalry', 'Artillery', 'Wild'];

function rand(s) {
  // mulberry32, state kept in s.rng so games are reproducible and serialisable
  s.rng = (s.rng + 0x6d2b79f5) | 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (s, n) => Math.floor(rand(s) * n);
function shuffle(s, a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const fail = (msg) => { throw new Error(msg); };

export function createGame(config) {
  const n = config.players.length;
  if (n < 2 || n > 6) fail('2–6 players');
  const s = {
    rng: (config.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    options: { setup: config.setup || 'quick', fortify: config.fortify || 'adjacent' },
    players: config.players.map((p, i) => ({
      id: i, name: p.name, color: p.color, isAI: !!p.isAI, level: p.level || 'normal',
      alive: true, cards: [], stats: { conquered: 0, lost: 0, killed: 0, casualties: 0, trades: 0 },
    })),
    owner: new Array(N).fill(-1),
    armies: new Array(N).fill(0),
    reserve: new Array(n).fill(INITIAL_ARMIES[n]), // armies still to place during setup
    turn: 0, round: 1, phase: 'draft',
    pool: 0, // armies to place this turn
    deck: [], discard: [], trades: 0,
    conquered: false, pending: null, forcedTrade: false, fortified: false,
    winner: -1,
  };
  const deck = TERRITORIES.map((_, t) => ({ t, type: t % 3 }));
  deck.push({ t: -1, type: 3 }, { t: -1, type: 3 });
  s.deck = shuffle(s, deck);
  s.turn = randInt(s, n);

  if (s.options.setup !== 'draft') {
    // deal territories at random, one army on each
    const order = shuffle(s, [...Array(N).keys()]);
    order.forEach((t, i) => {
      const p = (s.turn + i) % n;
      s.owner[t] = p; s.armies[t] = 1; s.reserve[p]--;
    });
    s.phase = 'deploy';
    if (s.options.setup === 'quick') {
      // scatter remaining armies, favouring borders
      for (let p = 0; p < n; p++) {
        const mine = territoriesOf(s, p);
        const border = mine.filter((t) => ADJ[t].some((a) => s.owner[a] !== p));
        while (s.reserve[p] > 0) {
          const pick = border.length && rand(s) < 0.8 ? border : mine;
          s.armies[pick[randInt(s, pick.length)]]++; s.reserve[p]--;
        }
      }
      beginTurn(s);
    }
  }
  return s;
}

// ---------- queries ----------
export const territoriesOf = (s, p) => { const r = []; for (let t = 0; t < N; t++) if (s.owner[t] === p) r.push(t); return r; };
export const armiesOf = (s, p) => { let a = 0; for (let t = 0; t < N; t++) if (s.owner[t] === p) a += s.armies[t]; return a; };
export const continentsOf = (s, p) => CONTINENTS.map((_, c) => c).filter((c) => CONT_MEMBERS[c].every((t) => s.owner[t] === p));
export const current = (s) => s.players[s.turn];

export function reinforcements(s, p) {
  const count = territoriesOf(s, p).length;
  const base = Math.max(3, Math.floor(count / 3));
  const conts = continentsOf(s, p);
  const bonus = conts.reduce((a, c) => a + CONTINENTS[c].bonus, 0);
  return { base, bonus, continents: conts, total: base + bonus };
}

export function tradeValue(n) { // n = number of sets already traded
  return n < 5 ? 4 + 2 * n : 15 + 5 * (n - 5);
}
export function isSet(cards) {
  if (cards.length !== 3) return false;
  const types = cards.map((c) => c.type);
  const wild = types.filter((t) => t === 3).length;
  if (wild) return true;
  const u = new Set(types).size;
  return u === 1 || u === 3;
}
// Best set in a hand (prefers cards whose territory the player owns, keeps wilds). Returns indices or null.
export function findSet(s, p) {
  const cards = s.players[p].cards;
  let best = null, bestScore = -Infinity;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) for (let k = j + 1; k < cards.length; k++) {
    const set = [cards[i], cards[j], cards[k]];
    if (!isSet(set)) continue;
    let score = 0;
    if (set.some((c) => c.t >= 0 && s.owner[c.t] === p)) score += 2;
    score -= set.filter((c) => c.type === 3).length * 3;
    if (score > bestScore) { bestScore = score; best = [i, j, k]; }
  }
  return best;
}
export const mustTrade = (s) => (s.phase === 'reinforce' && current(s).cards.length >= 5) || (s.forcedTrade && current(s).cards.length >= 5);
export const canTrade = (s) => (s.phase === 'reinforce' || s.forcedTrade) && !s.pending && !!findSet(s, s.turn);

export function attackTargets(s, from) {
  if (s.owner[from] !== s.turn || s.armies[from] < 2) return [];
  return ADJ[from].filter((t) => s.owner[t] !== s.turn);
}
export function fortifyTargets(s, from) {
  const p = s.owner[from];
  if (p !== s.turn || s.armies[from] < 2) return [];
  if (s.options.fortify === 'adjacent') return ADJ[from].filter((t) => s.owner[t] === p);
  const seen = new Set([from]), q = [from];
  while (q.length) for (const a of ADJ[q.pop()]) if (s.owner[a] === p && !seen.has(a)) { seen.add(a); q.push(a); }
  seen.delete(from);
  return [...seen];
}

// ---------- setup ----------
export function claim(s, t) {
  if (s.phase !== 'draft') fail('Not drafting');
  if (s.owner[t] !== -1) fail('Already claimed');
  const p = s.turn;
  s.owner[t] = p; s.armies[t] = 1; s.reserve[p]--;
  s.turn = (s.turn + 1) % s.players.length;
  if (s.owner.every((o) => o !== -1)) s.phase = 'deploy';
  if (s.phase === 'deploy') advanceDeploy(s, true);
}
function advanceDeploy(s, stay) {
  const n = s.players.length;
  if (s.reserve.every((r) => r <= 0)) return beginTurn(s);
  if (!stay) s.turn = (s.turn + 1) % n;
  while (s.reserve[s.turn] <= 0) s.turn = (s.turn + 1) % n;
}
export function deploy(s, t, n = 1) {
  if (s.phase !== 'deploy') fail('Not deploying');
  const p = s.turn;
  if (s.owner[t] !== p) fail('Not your territory');
  n = Math.min(n, s.reserve[p]);
  s.armies[t] += n; s.reserve[p] -= n;
  advanceDeploy(s, false);
}

// ---------- turn flow ----------
function beginTurn(s) {
  s.phase = 'reinforce';
  s.pool = reinforcements(s, s.turn).total;
  s.conquered = false; s.pending = null; s.forcedTrade = false; s.fortified = false;
}

export function trade(s, idx) {
  if (!(s.phase === 'reinforce' || s.forcedTrade)) fail('Cannot trade now');
  if (s.pending) fail('Move armies first');
  const pl = current(s);
  const set = idx.map((i) => pl.cards[i]);
  if (new Set(idx).size !== 3 || set.some((c) => !c) || !isSet(set)) fail('Not a valid set');
  const armies = tradeValue(s.trades++);
  pl.cards = pl.cards.filter((_, i) => !idx.includes(i));
  s.discard.push(...set);
  s.pool += armies;
  pl.stats.trades++;
  // +2 on one traded territory you hold
  const match = set.find((c) => c.t >= 0 && s.owner[c.t] === s.turn);
  if (match) s.armies[match.t] += 2;
  if (s.forcedTrade && pl.cards.length <= 4) s.forcedTrade = false;
  return { armies, bonusTerritory: match ? match.t : -1, set };
}

export function place(s, t, n = 1) {
  if (!(s.phase === 'reinforce' || (s.phase === 'attack' && s.pool > 0))) fail('Cannot place now');
  if (mustTrade(s)) fail('Trade cards first');
  if (s.owner[t] !== s.turn) fail('Not your territory');
  n = Math.max(1, Math.min(n, s.pool));
  if (s.pool <= 0) fail('No armies left');
  s.armies[t] += n; s.pool -= n;
  return n;
}

export function beginAttack(s) {
  if (s.phase !== 'reinforce') fail('Not reinforcing');
  if (s.pool > 0) fail('Place all armies first');
  if (mustTrade(s)) fail('Trade cards first');
  s.phase = 'attack';
}

export const attackBlocked = (s) => s.phase !== 'attack' || !!s.pending || s.pool > 0 || mustTrade(s);

export function attack(s, from, to, dice) {
  if (attackBlocked(s)) fail('Cannot attack now');
  if (s.owner[from] !== s.turn || s.owner[to] === s.turn) fail('Bad attack');
  if (!ADJ[from].includes(to)) fail('Not adjacent');
  const maxA = Math.min(3, s.armies[from] - 1);
  if (maxA < 1) fail('Need at least 2 armies');
  dice = Math.max(1, Math.min(dice || 3, maxA));
  const dDice = Math.min(2, s.armies[to]);
  const roll = (k) => Array.from({ length: k }, () => 1 + randInt(s, 6)).sort((a, b) => b - a);
  const a = roll(dice), d = roll(dDice);
  let aLoss = 0, dLoss = 0;
  for (let i = 0; i < Math.min(dice, dDice); i++) (a[i] > d[i] ? dLoss++ : aLoss++);
  const att = current(s), defId = s.owner[to], def = s.players[defId];
  s.armies[from] -= aLoss; s.armies[to] -= dLoss;
  att.stats.casualties += aLoss; def.stats.casualties += dLoss; att.stats.killed += dLoss;
  const res = { from, to, attacker: s.turn, defender: defId, a, d, aLoss, dLoss, conquered: false, eliminated: -1, cardsTaken: 0 };
  if (s.armies[to] === 0) {
    res.conquered = true;
    s.owner[to] = s.turn; s.conquered = true;
    att.stats.conquered++; def.stats.lost++;
    s.pending = { from, to, min: dice, max: s.armies[from] - 1 };
    if (!s.owner.includes(defId)) {
      def.alive = false; res.eliminated = defId;
      res.cardsTaken = def.cards.length;
      att.cards.push(...def.cards); def.cards = [];
      if (s.players.filter((p) => p.alive).length === 1) {
        // final conquest: move in and finish
        occupy(s, s.pending.max);
        s.phase = 'over'; s.winner = s.turn;
      } else if (att.cards.length >= 6) s.forcedTrade = true;
    }
  }
  return res;
}

export function occupy(s, n) {
  const p = s.pending;
  if (!p) fail('Nothing to occupy');
  n = Math.max(p.min, Math.min(n, p.max));
  s.armies[p.from] -= n; s.armies[p.to] = n;
  s.pending = null;
  return n;
}

export function endAttack(s) {
  if (s.phase !== 'attack' || s.pending || s.pool > 0 || mustTrade(s)) fail('Finish current action first');
  s.phase = 'fortify';
}

export function fortify(s, from, to, n) {
  if (s.phase !== 'fortify' || s.fortified) fail('Cannot fortify now');
  if (!fortifyTargets(s, from).includes(to)) fail('Not reachable');
  n = Math.max(1, Math.min(n, s.armies[from] - 1));
  s.armies[from] -= n; s.armies[to] += n;
  s.fortified = true;
  return n;
}

export function endTurn(s) {
  if (s.phase === 'attack') endAttack(s);
  if (s.phase !== 'fortify') fail('Cannot end turn now');
  let card = null;
  if (s.conquered) {
    if (!s.deck.length) { s.deck = shuffle(s, s.discard); s.discard = []; }
    if (s.deck.length) { card = s.deck.pop(); current(s).cards.push(card); }
  }
  const n = s.players.length, prev = s.turn;
  do { s.turn = (s.turn + 1) % n; } while (!s.players[s.turn].alive);
  if (s.turn <= prev) s.round++;
  beginTurn(s);
  return { card };
}

// ---------- sanity checks used by the simulator ----------
export function validate(s) {
  const errs = [];
  for (let t = 0; t < N; t++) {
    if (s.phase !== 'draft' && s.owner[t] < 0) errs.push(`unowned ${t}`);
    if (s.owner[t] >= 0 && s.armies[t] < 1 && !(s.pending && s.pending.to === t)) errs.push(`empty ${t}`);
    if (s.owner[t] >= 0 && !s.players[s.owner[t]].alive) errs.push(`dead owner ${t}`);
  }
  const cards = s.deck.length + s.discard.length + s.players.reduce((a, p) => a + p.cards.length, 0);
  if (cards !== 44) errs.push(`card count ${cards}`);
  if (CONT_OF.length !== N) errs.push('map');
  return errs;
}
