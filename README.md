# Risky Fable

A 3D tabletop strategy game of world conquest for the browser, in the tradition of the classic board game: 42 territories, six continents, dice, cards and miniature armies on a lamp-lit table.

## Play

- **Solo or hot-seat** — 2–6 players, any mix of humans and AI generals (cautious, seasoned or ruthless).
- **Full classic rules** — reinforcements from territories and continents, escalating card sets (with the +2 territory bonus and forced trades), 3-vs-2 dice combat, conquest moves, eliminations that hand over cards, one fortifying move per turn, and victory by total conquest.
- **Three openings** — quick start, dealt territories with manual placement, or a full territory draft.
- **The table** — pan, zoom, tilt and rotate a raised 3D map built from real coastlines. Armies are infantry, cavalry and artillery miniatures; battles fire cannon volleys while physically simulated dice tumble in the tray and land on the real result.

Controls: drag to pan, scroll/pinch to zoom, right-drag (two fingers) to tilt and rotate. `Enter` confirms, `Esc` cancels, `C` opens your cards, `H` recentres the camera, `Shift`-click places 5 armies.

Double-click an enemy territory to blitz until the battle is decided and move all surviving armies into the conquered territory, leaving one behind. Select an attacker first, or let the game choose your strongest neighbouring territory.

The game autosaves at the start of every turn and can be resumed from the menu.

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
npm test         # 300 headless AI-vs-AI games that check the rules engine
npm run map      # regenerate territory shapes from Natural Earth coastlines
```

## How it is put together

| Path | What it does |
| --- | --- |
| `src/game/map.js` | Territories, continents and the 83 classic connections |
| `src/game/engine.js` | Pure, serialisable rules engine (no rendering) |
| `src/game/ai.js` | Heuristic AI with exact battle-odds tables |
| `src/view/` | Three.js table, miniatures, effects and cannon-es dice |
| `src/ui.js`, `src/main.js` | Interface and turn controller |
| `scripts/build-map.mjs` | Carves the 42 territories out of real coastline data |

Built with [Vite](https://vite.dev), [three.js](https://threejs.org) and [cannon-es](https://github.com/pmndrs/cannon-es). Deployed on Vercel; every push builds automatically.
