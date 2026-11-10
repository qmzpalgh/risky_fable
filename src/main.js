// Controller: connects the rules engine, the AI, the 3D table and the interface.
import * as E from './game/engine.js';
import * as AI from './game/ai.js';
import { ADJ, CONTINENTS, CONT_OF, TERRITORIES, N } from './game/map.js';
import { World } from './view/world.js';
import { Armies } from './view/armies.js';
import { Fx } from './view/fx.js';
import { DiceTray } from './view/dice.js';
import { clock, wait } from './view/anim.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

const SAVE_KEY = 'risky-fable-save-v1';
const SPEEDS = [{ label: 'Normal', k: 1 }, { label: 'Fast', k: 1.9 }, { label: 'Fastest', k: 3.6 }];
const tn = (t) => TERRITORIES[t].name;
const does = (p, they, you) => (p.name === 'You' ? `You ${you}` : `${p.name} ${they}`);
const plural = (n, w) => `${n} ${n === 1 ? w : w === 'army' ? 'armies' : w + 's'}`;

class Game {
  constructor() {
    this.world = new World(document.getElementById('scene'));
    this.sound = new Sound();
    this.armies = new Armies(this.world);
    this.fx = new Fx(this.world, document.getElementById('fx-layer'));
    this.dice = new DiceTray(document.getElementById('dice'), this.sound);
    this.ui = new UI();
    this.s = null;
    this.sel = { from: -1, to: -1 };
    this.busy = false; this.running = false;
    this.placeAmount = 1; this.diceN = 3; this.moveN = 1; this.speedIdx = 0;
    this.shown = new Array(N).fill(null);
    this.autoPlace = new Set();
    this.turnKey = '';
    this.bindInput();
    this.toMenu();
  }

  // ---------- lifecycle ----------
  toMenu() {
    this.world.setMenuMode(true);
    for (let t = 0; t < N; t++) this.world.setOwnerColor(t, CONTINENTS[CONT_OF[t]].color);
    let save = null;
    try { save = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { /* ignore */ }
    this.ui.showMenu({
      hasSave: !!(save && save.phase && save.phase !== 'over'),
      onStart: (cfg) => { this.sound.ensure(); this.sound.conquer(); this.begin(E.createGame(cfg)); },
      onContinue: () => { this.sound.ensure(); this.begin(save); },
    });
  }

  begin(state) {
    this.s = state; window.__game = this;
    this.sel = { from: -1, to: -1 }; this.turnKey = '';
    this.ui.hideMenu(); this.ui.clearLog();
    this.world.setMenuMode(false);
    this.renderTools();
    this.refresh(true);
    this.ui.log('The table is set. Good luck, commanders.', 'turn');
    setTimeout(() => this.advance(), 900);
  }

  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage unavailable */ } }

  renderTools() {
    this.ui.renderTools([
      { icon: 'cards', label: 'Cards', title: 'View your cards (C)', onClick: () => this.openCards() },
      { icon: `speed${this.speedIdx}`, label: SPEEDS[this.speedIdx].label, title: 'Change animation and AI speed', onClick: () => { this.speedIdx = (this.speedIdx + 1) % SPEEDS.length; clock.speed = SPEEDS[this.speedIdx].k; this.renderTools(); } },
      { icon: this.sound.enabled ? 'soundOn' : 'soundOff', label: this.sound.enabled ? 'Sound on' : 'Sound off', off: !this.sound.enabled, title: 'Turn sound on or off', onClick: () => { this.sound.enabled = !this.sound.enabled; this.renderTools(); } },
      { icon: 'rules', label: 'Rules', title: 'How to play', onClick: () => this.ui.showHelp() },
      { icon: 'quit', label: 'Quit', title: 'Back to the main menu (your game is saved)', onClick: () => this.ui.confirm('Leave the table?', 'The game is saved at the start of each turn, so you can resume it from the menu.', 'Quit to menu', () => location.reload()) },
    ]);
  }

  get me() { return E.current(this.s); }
  get auto() { const s = this.s; return this.me.isAI || (s.phase === 'deploy' && this.autoPlace.has(s.turn)); }
  get humanTurn() { return this.s && this.s.phase !== 'over' && !this.auto && !this.running; }
  get placing() { const s = this.s; return s.phase === 'reinforce' || (s.phase === 'attack' && s.pool > 0); }

  // ---------- rendering ----------
  refresh(instant = false) {
    const s = this.s;
    for (let t = 0; t < N; t++) {
      const c = s.owner[t] >= 0 ? s.players[s.owner[t]].color : null;
      if (c !== this.shown[t] || instant) { this.world.setOwnerColor(t, c, !instant && this.shown[t] !== null); this.shown[t] = c; }
    }
    this.armies.sync(s);
    this.ui.renderPlayers(s); this.ui.renderPhase(s); this.ui.renderContinents(s);
    this.highlight(); this.updateAction();
  }

  highlight() {
    const W = this.world, s = this.s;
    W.clearModes();
    if (!this.humanTurn || this.busy) return;
    const p = s.turn, { from, to } = this.sel;
    const only = (pred) => { for (let t = 0; t < N; t++) if (!pred(t)) W.setMode(t, 'dim'); };
    if (s.phase === 'draft') only((t) => s.owner[t] === -1);
    else if (s.phase === 'deploy' || this.placing) only((t) => s.owner[t] === p);
    else if (s.phase === 'attack' && s.pending) { only(() => false); W.setMode(s.pending.from, 'source'); W.setMode(s.pending.to, 'target'); }
    else if ((s.phase === 'attack' || s.phase === 'fortify') && from >= 0) {
      const targets = s.phase === 'attack' ? E.attackTargets(s, from) : E.fortifyTargets(s, from);
      only(() => false);
      W.setMode(from, 'source');
      for (const t of targets) W.setMode(t, t === to ? 'target' : 'option');
    }
  }

  updateAction() {
    const s = this.s, ui = this.ui, me = this.me;
    if (s.phase === 'over') return ui.setAction({ msg: `<strong>${does(me, 'rules', 'rule')} the world.</strong>`, controls: [{ label: 'Play again', kind: 'primary', primary: true, onClick: () => location.reload() }] });
    if (!this.humanTurn) return ui.setAction({ msg: `${ui.name(me)} is ${s.phase === 'draft' ? 'claiming land' : s.phase === 'deploy' ? 'placing armies' : s.phase === 'reinforce' ? 'mustering armies' : s.phase === 'attack' ? 'on the attack' : 'repositioning'}`, thinking: true });
    if (this.busy) return;
    const { from, to } = this.sel;
    const cardsBtn = { label: `Cards (${me.cards.length})`, onClick: () => this.openCards() };
    if (s.phase === 'draft') return ui.setAction({ msg: 'Claim an unclaimed territory', sub: `${s.owner.filter((o) => o < 0).length} still open` });
    if (s.phase === 'deploy') return ui.setAction({
      msg: `Place an army on one of your territories`, sub: `${plural(s.reserve[s.turn], 'army')} left in your reserve. Hold Shift to place 5`,
      controls: [{ label: 'Place the rest for me', onClick: () => this.autoDeploy() }],
    });
    if (this.placing) {
      if (E.mustTrade(s)) return ui.setAction({ msg: 'You hold too many cards', sub: 'Trade a set before doing anything else', controls: [{ label: 'Trade cards', kind: 'primary', primary: true, onClick: () => this.openCards() }] });
      const r = E.reinforcements(s, s.turn);
      return ui.setAction({
        msg: `Place <strong>${plural(s.pool, 'army')}</strong> on your territories`,
        sub: s.phase === 'reinforce' ? `${r.base} for territories${r.continents.map((c) => `, ${CONTINENTS[c].bonus} for ${CONTINENTS[c].name}`).join('')}` : 'Reinforcements from your trade',
        controls: [
          { type: 'seg', title: 'Armies per click', value: this.placeAmount, options: [{ label: '1', value: 1 }, { label: '5', value: 5 }, { label: 'All', value: 999 }], onChange: (v) => { this.placeAmount = v; this.updateAction(); } },
          ...(E.canTrade(s) ? [{ label: 'Trade cards', kind: 'primary', onClick: () => this.openCards() }] : me.cards.length ? [cardsBtn] : []),
        ],
      });
    }
    if (s.phase === 'attack') {
      if (s.pending) {
        const p = s.pending;
        this.moveN = Math.max(p.min, Math.min(this.moveN, p.max));
        return ui.setAction({
          msg: `<strong>${tn(p.to)}</strong> is yours`, sub: `Move in at least ${p.min}. ${tn(p.from)} keeps the rest`,
          controls: [{ type: 'slider', min: p.min, max: p.max, value: this.moveN, onChange: (v) => (this.moveN = v) }, { label: 'Move in', kind: 'primary', primary: true, onClick: () => this.doOccupy(this.moveN) }],
        });
      }
      const done = { label: 'Done attacking', onClick: () => this.endAttack() };
      if (from < 0) return ui.setAction({ msg: 'Choose a territory to attack from', sub: s.conquered ? 'You have earned a card this turn' : 'Conquer a territory this turn to earn a card', controls: [...(me.cards.length ? [cardsBtn] : []), { ...done, kind: 'primary', primary: true }] });
      if (to < 0) return ui.setAction({ msg: `Attacking from <strong>${tn(from)}</strong>. Choose a neighbouring enemy`, sub: `${plural(s.armies[from] - 1, 'army')} can attack. Double-click an enemy to blitz and move all in`, controls: [{ label: 'Cancel', kind: 'ghost', onClick: () => this.cancel() }, done] });
      const max = Math.min(3, s.armies[from] - 1);
      this.diceN = Math.max(1, Math.min(this.diceN, max));
      const odds = Math.max(1, Math.min(99, Math.round(AI.winChance(s.armies[from] - 1, s.armies[to]) * 100)));
      return ui.setAction({
        msg: `<strong>${tn(from)}</strong> (${s.armies[from]}) attacks <strong>${tn(to)}</strong> (${s.armies[to]})`, odds,
        controls: [
          { type: 'seg', title: 'Dice to roll', value: this.diceN, options: [1, 2, 3].map((v) => ({ label: `${v} ${v === 1 ? 'die' : 'dice'}`, value: v, disabled: v > max })), onChange: (v) => { this.diceN = v; this.updateAction(); } },
          { label: 'Roll', kind: 'danger', primary: true, onClick: () => this.humanRoll(false) },
          { label: 'Blitz', title: 'Keep rolling until the battle is decided', onClick: () => this.humanRoll(true) },
          { label: 'Cancel', kind: 'ghost', onClick: () => this.cancel() },
        ],
      });
    }
    if (s.phase === 'fortify') {
      const end = { label: 'End turn', onClick: () => this.endTurn() };
      const rule = s.options.fortify === 'adjacent' ? 'a neighbouring territory' : 'any connected territory';
      if (from < 0) return ui.setAction({ msg: 'Move armies once, or end your turn', sub: `Pick a territory, then ${rule} of yours`, controls: [{ ...end, kind: 'primary', primary: true }] });
      if (to < 0) return ui.setAction({ msg: `Moving from <strong>${tn(from)}</strong>. Choose where to send armies`, sub: `Up to ${s.armies[from] - 1} can move`, controls: [{ label: 'Cancel', kind: 'ghost', onClick: () => this.cancel() }, end] });
      const max = s.armies[from] - 1;
      this.moveN = Math.max(1, Math.min(this.moveN, max));
      return ui.setAction({
        msg: `Move from <strong>${tn(from)}</strong> to <strong>${tn(to)}</strong>`, sub: 'This ends your turn',
        controls: [{ type: 'slider', min: 1, max, value: this.moveN, onChange: (v) => (this.moveN = v) }, { label: 'Move and end turn', kind: 'primary', primary: true, onClick: () => this.doFortify() }, { label: 'Cancel', kind: 'ghost', onClick: () => this.cancel() }],
      });
    }
  }

  // ---------- input ----------
  bindInput() {
    const W = this.world;
    W.onClick = (t, e) => this.click(t, e);
    W.onDoubleClick = (t) => {
      const s = this.s;
      if (!s || !this.humanTurn || this.busy || this.ui.modalOpen || E.attackBlocked(s)) return;
      if (t === this.sel.to && s.owner[t] !== s.turn) return this.humanRoll(true, true);
    };
    W.onCancel = () => this.cancel();
    W.onHover = (t, e) => {
      W.canvas.style.cursor = t >= 0 ? 'pointer' : 'grab';
      this.ui.tooltip(t >= 0 && this.s ? this.ui.territoryTip(this.s, t) : null, e);
    };
    W.onHoverMove = (e) => this.ui.moveTooltip(e);
    window.addEventListener('keydown', (e) => {
      if (!this.s || e.target.matches('input, select')) return;
      if (e.key === 'Escape') { if (this.ui.modalOpen && !E.mustTrade(this.s)) this.ui.closeModal(); else this.cancel(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (this.ui.pressPrimary()) e.preventDefault(); }
      else if (e.key === 'c' || e.key === 'C') this.openCards();
      else if (e.key === 'h' || e.key === 'H') W.flyHome(0.8);
      else if ('123'.includes(e.key) && this.sel.to >= 0 && this.s.phase === 'attack') { this.diceN = +e.key; this.updateAction(); }
    });
    window.addEventListener('resize', () => this.dice.resize());
    // every cardboard button gives a little click
    document.addEventListener('click', (e) => { if (e.target.closest('.btn, .seg button, .card, .swatch')) this.sound.click(); });
  }

  cancel() {
    if (!this.humanTurn || this.busy || this.s.pending) return;
    if (this.sel.to >= 0) this.sel.to = -1; else this.sel.from = -1;
    this.ui.showTray(false);
    this.refresh();
  }

  click(t, e) {
    const s = this.s;
    if (!s || !this.humanTurn || this.busy || this.ui.modalOpen) return;
    if (t < 0) return this.cancel();
    const p = s.turn, mine = s.owner[t] === p;
    const nope = () => this.sound.error();
    if (s.phase === 'draft') {
      if (s.owner[t] !== -1) return nope();
      E.claim(s, t); this.sound.place(); this.refresh(); return this.advance();
    }
    if (s.phase === 'deploy') {
      if (!mine) return nope();
      const before = s.armies[t];
      E.deploy(s, t, e?.shiftKey ? 5 : 1); this.sound.place();
      this.fx.floatText(t, `+${s.armies[t] - before}`, 'gain');
      this.refresh(); return this.advance();
    }
    if (this.placing) {
      if (E.mustTrade(s)) return this.openCards();
      if (!mine) return nope();
      const n = E.place(s, t, e?.shiftKey ? 5 : this.placeAmount);
      this.sound.place(); this.fx.floatText(t, `+${n}`, 'gain');
      if (s.pool === 0 && s.phase === 'reinforce') { E.beginAttack(s); this.sel = { from: -1, to: -1 }; }
      return this.refresh();
    }
    if (s.phase === 'attack') {
      if (s.pending) return;
      if (mine) {
        if (s.armies[t] < 2 || !E.attackTargets(s, t).length) return nope();
        this.sel = { from: t, to: -1 }; this.sound.select(); this.ui.showTray(false);
      } else if (this.sel.from >= 0 && ADJ[this.sel.from].includes(t)) { this.sel.to = t; this.diceN = 3; this.sound.select(); }
      else {
        // clicked an enemy first: pick our strongest neighbour as the attacker
        const src = ADJ[t].filter((a) => s.owner[a] === p && s.armies[a] >= 2).sort((a, b) => s.armies[b] - s.armies[a])[0];
        if (src === undefined) return nope();
        this.sel = { from: src, to: t }; this.diceN = 3; this.sound.select();
      }
      return this.refresh();
    }
    if (s.phase === 'fortify') {
      if (!mine) return nope();
      if (this.sel.from >= 0 && t !== this.sel.from && E.fortifyTargets(s, this.sel.from).includes(t)) { this.sel.to = t; this.moveN = s.armies[this.sel.from] - 1; this.sound.select(); }
      else if (s.armies[t] >= 2 && E.fortifyTargets(s, t).length) { this.sel = { from: t, to: -1 }; this.sound.select(); }
      else return nope();
      return this.refresh();
    }
  }

  openCards() {
    const s = this.s;
    if (!s || s.phase === 'over' || this.busy) return;
    if (!this.humanTurn) return;
    if (s.pending) return; // finish moving into the conquered territory first
    const must = E.mustTrade(s);
    this.ui.showCards(s, {
      must, canTrade: E.canTrade(s),
      onTrade: (idx) => {
        const r = E.trade(s, idx);
        this.sound.cards();
        this.ui.log(`${this.ui.name(this.me)} trades cards for ${r.armies} armies.`);
        if (r.bonusTerritory >= 0) this.fx.floatText(r.bonusTerritory, '+2', 'gain');
        this.refresh();
        if (E.mustTrade(s)) this.openCards();
      },
    });
  }

  autoDeploy() {
    const s = this.s, p = s.turn;
    if (this.busy || s.phase !== 'deploy') return;
    this.autoPlace.add(p); // keep placing for this player whenever their setup turn comes round
    this.sound.place(); this.advance();
  }

  // ---------- battles ----------
  // One roll of the dice, with full presentation or a quick skirmish flash.
  async battle(from, to, dice, quick) {
    const s = this.s, att = this.me, defId = s.owner[to], def = s.players[defId];
    const res = E.attack(s, from, to, dice);
    const impact = (i, big) => { this.sound.cannon(big); this.world.shake(i, big ? 1 : 0.4); };
    if (!quick) {
      this.world.focus([from, to], { dist: 64, raise: 0.2 });
      this.ui.showTray(true); this.ui.rollResult(att, def, null);
      await Promise.all([this.dice.roll(res.a, res.d, att.color, def.color), this.fx.volley(from, to, att.color, def.color, res.a.length, impact)]);
      this.ui.rollResult(att, def, res);
    } else if (clock.speed < 3 || !att.isAI) {
      await this.fx.volley(from, to, att.color, def.color, 1, impact);
    }
    if (res.aLoss) this.fx.floatText(from, `−${res.aLoss}`, 'loss');
    if (res.dLoss) this.fx.floatText(to, `−${res.dLoss}`, 'loss');
    if (res.conquered) {
      this.shown[to] = att.color;
      this.world.setOwnerColor(to, att.color, true); this.fx.ring(to, att.color);
      def.isAI || att.isAI ? (att.isAI && !def.isAI ? this.sound.lose() : this.sound.conquer()) : this.sound.conquer();
      this.ui.log(`${this.ui.name(att)} takes <em>${tn(to)}</em> from ${this.ui.name(def)}.`);
    }
    this.armies.sync(s);
    this.ui.renderPlayers(s); this.ui.renderContinents(s);
    if (res.eliminated >= 0) {
      this.sound.eliminated();
      this.ui.banner(does(def, 'is defeated', 'are defeated'), res.cardsTaken ? `${does(att, 'seizes', 'seize')} ${plural(res.cardsTaken, 'card')}` : att.name === 'You' ? 'You wipe them from the map' : `${att.name} wipes the map clean`, def.color);
      this.ui.log(`${this.ui.name(def)} has been eliminated by ${this.ui.name(att)}.`, 'turn');
      await wait(1.2, true);
    }
    if (!quick) await wait(0.5);
    return res;
  }

  async moveArmies(from, to, n, color) {
    this.armies.slots[to].hidden = n;
    this.armies.sync(this.s);
    this.sound.march();
    await this.armies.march(from, to, color, n, clock.speed > 3 ? 0.5 : 0.75);
    this.armies.slots[to].hidden = 0;
    this.armies.sync(this.s);
  }

  async humanRoll(blitz, moveAll = false) {
    const s = this.s, { from, to } = this.sel;
    if (this.busy || from < 0 || to < 0 || E.attackBlocked(s)) return;
    this.busy = true; this.world.clearModes();
    this.world.setMode(from, 'source'); this.world.setMode(to, 'target');
    this.ui.setAction({ msg: blitz ? 'Blitz!' : 'The dice are cast', thinking: true });
    let res;
    try {
      if (blitz) { this.ui.showTray(false); do { res = await this.battle(from, to, 3, true); } while (!res.conquered && s.armies[from] >= 2); }
      else res = await this.battle(from, to, this.diceN, false);
    } finally { this.busy = false; }
    if (s.phase === 'over') return this.finish();
    if (res.conquered) {
      this.moveN = s.pending.max;
      if (moveAll || s.pending.min >= s.pending.max) return this.doOccupy(s.pending.max);
    } else if (s.armies[from] < 2) { this.sel = { from: -1, to: -1 }; }
    this.refresh();
  }

  async doOccupy(n) {
    const s = this.s;
    if (this.busy || !s.pending) return;
    this.busy = true;
    const { from, to } = s.pending;
    n = E.occupy(s, n);
    this.ui.showTray(false);
    await this.moveArmies(from, to, n, this.me.color);
    this.busy = false;
    this.sel = { from: s.armies[to] >= 2 && E.attackTargets(s, to).length ? to : -1, to: -1 };
    this.refresh();
    if (E.mustTrade(s)) { this.ui.banner('Spoils of war', 'You captured enough cards that you must trade now'); this.openCards(); }
  }

  endAttack() {
    if (this.busy || this.s.pending) return;
    E.endAttack(this.s); this.sel = { from: -1, to: -1 }; this.ui.showTray(false); this.sound.click();
    this.refresh();
  }

  async doFortify() {
    const s = this.s, { from, to } = this.sel;
    if (this.busy || from < 0 || to < 0) return;
    this.busy = true; this.world.clearModes();
    const n = E.fortify(s, from, to, this.moveN);
    await this.moveArmies(from, to, n, this.me.color);
    this.busy = false;
    this.endTurn();
  }

  endTurn() {
    const s = this.s;
    if (this.busy) return;
    const who = this.me;
    const { card } = E.endTurn(s);
    if (card) { this.ui.log(`${this.ui.name(who)} earns a card.`); if (!who.isAI) this.sound.cards(); }
    this.sel = { from: -1, to: -1 }; this.ui.showTray(false);
    this.refresh();
    this.advance();
  }

  // ---------- turn driver ----------
  async advance() {
    if (this.running) return;
    const s = this.s;
    this.running = true;
    try {
      while (s.phase !== 'over' && this.auto && this.s === s) await this.aiStep();
    } catch (err) { console.error(err); }
    this.running = false;
    if (s.phase === 'over') return this.finish();
    this.beginHumanTurn();
  }

  announceTurn() {
    const s = this.s, me = this.me, key = `${s.round}:${s.turn}`;
    if (s.phase !== 'reinforce' || key === this.turnKey) return false;
    this.turnKey = key;
    this.save();
    this.ui.log(`Round ${s.round}: ${this.ui.name(me)}`, 'turn');
    return true;
  }

  beginHumanTurn() {
    const s = this.s, me = this.me;
    if (this.announceTurn()) {
      const r = E.reinforcements(s, s.turn);
      const humans = s.players.filter((p) => !p.isAI).length;
      this.ui.banner(humans > 1 ? `${me.name}, your turn` : 'Your turn', `${plural(r.total, 'army')} to place${r.bonus ? `, including ${r.bonus} for ${r.continents.map((c) => CONTINENTS[c].name).join(' and ')}` : ''}`, me.color);
      this.sound.turn();
      this.placeAmount = 1;
      if (s.players.some((p) => p.isAI)) this.world.flyHome(0.9); // AI battles may have left the camera far away
    }
    this.refresh();
    if (s.phase === 'reinforce' && E.mustTrade(s)) this.openCards();
  }

  async aiStep() {
    const s = this.s, me = this.me, p = s.turn, fast = clock.speed > 3;
    const pause = (t) => wait(t);
    if (s.phase === 'draft') {
      const t = AI.aiDraftPick(s); E.claim(s, t); this.sound.place(); this.refresh(); return pause(0.16);
    }
    if (s.phase === 'deploy') {
      // place in small bursts so setup does not drag
      let k = 0;
      do { E.deploy(s, AI.aiPlacement(s)); k++; } while (s.phase === 'deploy' && this.auto && k < 12);
      this.sound.place(); this.refresh(); return pause(0.12);
    }
    this.announceTurn();
    this.refresh();
    await pause(0.35);
    // reinforce
    let set;
    while ((set = AI.aiTrade(s))) {
      const r = E.trade(s, set);
      this.sound.cards();
      this.ui.log(`${this.ui.name(me)} trades cards for ${r.armies} armies.`);
      this.ui.banner(`${me.name} trades cards`, `${r.armies} extra armies take the field`, me.color);
      this.refresh(); await pause(0.9);
    }
    await this.aiPlaceAll();
    E.beginAttack(s); this.refresh();
    // attack
    let guard = 0;
    while (s.phase === 'attack' && guard++ < 400) {
      if (s.pending) {
        const { from, to } = s.pending, n = E.occupy(s, AI.aiOccupy(s));
        if (fast) this.armies.sync(s); else await this.moveArmies(from, to, n, me.color);
        this.refresh();
        continue;
      }
      if (E.mustTrade(s) || (s.forcedTrade && E.canTrade(s))) { const r = E.trade(s, AI.aiTrade(s)); this.ui.log(`${this.ui.name(me)} trades captured cards for ${r.armies} armies.`); this.refresh(); continue; }
      if (s.pool > 0) { await this.aiPlaceAll(); continue; }
      const a = AI.aiAttack(s);
      if (!a) break;
      const def = s.players[s.owner[a.to]];
      const full = !def.isAI && !fast; // a human is being attacked: show the dice
      if (!fast) this.world.focus([a.from, a.to], { dist: 72, dur: 0.55, raise: full ? 0.2 : 0 });
      this.world.clearModes(); this.world.setMode(a.from, 'source'); this.world.setMode(a.to, 'target');
      if (!fast) await pause(full ? 0.5 : 0.22);
      let res;
      do { res = await this.battle(a.from, a.to, Math.min(3, s.armies[a.from] - 1), !full); }
      while (!res.conquered && s.armies[a.from] >= 2 && AI.winChance(s.armies[a.from] - 1, s.armies[a.to]) > 0.5 && s.phase === 'attack');
      this.ui.showTray(false);
      this.world.clearModes();
      if (fast) await wait(0.03, true);
      if (s.phase === 'over') return;
    }
    if (s.phase === 'over') return;
    E.endAttack(s); this.refresh();
    const f = AI.aiFortify(s);
    if (f) {
      const n = E.fortify(s, f.from, f.to, f.n);
      if (fast) this.armies.sync(s); else await this.moveArmies(f.from, f.to, n, me.color);
    }
    const { card } = E.endTurn(s);
    if (card) this.ui.log(`${this.ui.name(me)} earns a card.`);
    this.refresh();
    await wait(fast ? 0.05 : 0.25, fast);
    void p;
  }

  async aiPlaceAll() {
    const s = this.s;
    while (s.pool > 0) {
      const t = AI.aiPlacement(s), n = E.place(s, t, Math.max(1, Math.ceil(s.pool / 2)));
      this.fx.floatText(t, `+${n}`, 'gain'); this.sound.place();
      this.armies.sync(s); this.ui.renderPlayers(s);
      await wait(0.3);
    }
  }

  finish() {
    const s = this.s, w = s.players[s.winner];
    if (this.finished) return; this.finished = true;
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.sel = { from: -1, to: -1 }; this.ui.showTray(false);
    this.refresh();
    this.world.flyHome(1.6);
    this.sound.victory();
    this.fx.fireworks(this.world.controls.target.clone(), [w.color, '#ffe9a8', '#ffffff']);
    this.ui.banner(`${does(w, 'conquers', 'conquer')} the world`, '', w.color);
    this.ui.log(`${this.ui.name(w)} conquers the world.`, 'turn');
    setTimeout(() => this.ui.showVictory(s, () => location.reload()), 2300);
  }
}

async function boot() {
  const fonts = Promise.all([document.fonts.load('58px Marcellus'), document.fonts.load('800 62px "Bricolage Grotesque"'), document.fonts.load('40px "Rammetto One"')]).catch(() => {});
  await Promise.race([fonts, new Promise((r) => setTimeout(r, 2500))]);
  try {
    new Game();
  } catch (err) {
    console.error(err);
    document.querySelector('#loading p').textContent = 'This game needs WebGL, which your browser could not start.';
    return;
  }
  const l = document.getElementById('loading');
  l.classList.add('gone'); setTimeout(() => l.remove(), 700);
}
boot();
