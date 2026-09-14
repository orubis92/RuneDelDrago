// Verifica: ogni livello si genera, la soluzione prevista (rot=0) vince,
// lo stato iniziale non vince, e i vincoli strutturali sono rispettati.
const E = require('../engine.js');
const MAX = parseInt(process.argv[2] || '300', 10);
let fails = 0, t0 = Date.now();
const stats = {};
for (let level = 1; level <= MAX; level++) {
  let lv;
  try { lv = E.generate(level); } catch (e) { console.log('L' + level, 'GEN FAIL', e.message); fails++; continue; }
  const n = lv.n;
  const start = E.simulate(lv.tiles, n);
  if (start.win) { console.log('L' + level, 'già risolto'); fails++; }
  const solved = lv.tiles.map(t => ({ ...t, rot: 0 }));
  const sim = E.simulate(solved, n);
  if (!sim.win) { console.log('L' + level, 'soluzione prevista NON vince', { door: sim.doorReached, zapped: sim.zapped }); fails++; }
  for (const ice of lv.iceCells) if (!sim.cracked[ice]) { console.log('L' + level, 'ghiaccio non spaccato', ice); fails++; }
  const p = E.paramsFor(level);
  if (lv.iceCells.length !== p.ice) { console.log('L' + level, 'numero ghiacci', lv.iceCells.length, '!=', p.ice); fails++; }
  const wrong = lv.tiles.filter(E.isMisrotated).length;
  const solTiles = lv.tiles.filter(t => t.sol && !t.fixed).length;
  const k = 'n' + n;
  stats[k] = stats[k] || { count: 0, attempts: 0, wrong: 0, sol: 0, path: 0 };
  stats[k].count++; stats[k].attempts += lv.attempt; stats[k].wrong += wrong; stats[k].sol += solTiles; stats[k].path += lv.pathLength;
}
console.log('Livelli:', MAX, 'errori:', fails, 'tempo ms:', Date.now() - t0);
for (const k in stats) { const s = stats[k]; console.log(k, 'livelli', s.count, 'tentativi medi', (s.attempts / s.count).toFixed(2), 'tessere sbagliate medie', (s.wrong / s.count).toFixed(1), 'tessere soluzione medie', (s.sol / s.count).toFixed(1), 'lunghezza percorso media', (s.path / s.count).toFixed(1)); }
process.exit(fails ? 1 : 0);
