// Headless AI-vs-AI games: checks the rules engine for invariant violations
// and that games reliably reach a winner.
import * as E from '../src/game/engine.js';
import * as AI from '../src/game/ai.js';
import { EDGE_LIST, N, ADJ } from '../src/game/map.js';

if (N !== 42 || EDGE_LIST.length !== 83 || ADJ.some((a) => !a.length)) throw new Error('map graph is wrong');

export function playTurnStep(s) {
  if (s.phase === 'draft') return E.claim(s, AI.aiDraftPick(s));
  if (s.phase === 'deploy') return E.deploy(s, AI.aiPlacement(s));
  if (s.phase === 'reinforce') {
    let set;
    while ((set = AI.aiTrade(s))) E.trade(s, set);
    while (s.pool > 0) E.place(s, AI.aiPlacement(s), Math.ceil(s.pool / 3));
    return E.beginAttack(s);
  }
  if (s.phase === 'attack') {
    if (s.pending) return E.occupy(s, AI.aiOccupy(s));
    if (E.mustTrade(s) || (s.forcedTrade && E.canTrade(s))) return E.trade(s, AI.aiTrade(s));
    if (s.pool > 0) return E.place(s, AI.aiPlacement(s), s.pool);
    const a = AI.aiAttack(s);
    if (a) return E.attack(s, a.from, a.to, a.dice);
    return E.endAttack(s);
  }
  if (s.phase === 'fortify') {
    const f = AI.aiFortify(s);
    if (f) E.fortify(s, f.from, f.to, f.n);
    return E.endTurn(s);
  }
}

const games = +process.argv[2] || 300;
let rounds = 0, unfinished = 0;
const wins = {};
const setups = ['quick', 'deal', 'draft'], levels = ['easy', 'normal', 'hard'];
for (let g = 0; g < games; g++) {
  const n = 2 + (g % 5);
  const s = E.createGame({
    seed: g + 1, setup: setups[g % 3], fortify: g % 2 ? 'adjacent' : 'connected',
    players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, color: '#fff', isAI: true, level: levels[(i + g) % 3] })),
  });
  let steps = 0;
  while (s.phase !== 'over' && steps++ < 60000) {
    playTurnStep(s);
    const errs = E.validate(s);
    if (errs.length) throw new Error(`game ${g} step ${steps}: ${errs.join(', ')}`);
  }
  if (s.phase !== 'over') { unfinished++; console.log('unfinished game', g, 'round', s.round, 'phase', s.phase, 'alive', s.players.filter((p) => p.alive).map((p) => p.level + ':' + E.armiesOf(s, p.id)).join(' ')); }
  else { rounds += s.round; const l = s.players[s.winner].level; wins[l] = (wins[l] || 0) + 1; }
}
console.log(`${games} games ok, ${unfinished} unfinished, avg rounds ${(rounds / (games - unfinished)).toFixed(1)}, wins by level`, wins);
